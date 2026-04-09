<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { createWsClient } from '../../shared/ws-client.js';
  import Lobby from './screens/Lobby.svelte';
  import Match from './screens/Match.svelte';
  import Celebration from './screens/Celebration.svelte';
  import MatchRecap from './screens/MatchRecap.svelte';

  let ws;
  let connected = false;
  let matchState = null;
  let turnState  = null;
  let celebration = null; // { kind, playerName, playerPhoto, value }
  let celebTimer  = null;
  let matchRecap = null;
  let matchSetup = null;
  let liveMatchStats = [];
  let generalAvgSnapshot = {};
  let recapPending = false;
  let statsRefreshToken = 0;

  function showCelebration(c) {
    celebration = c;
    clearTimeout(celebTimer);
    celebTimer = setTimeout(() => { celebration = null; }, 3500);
  }

  function clearCelebration() {
    celebration = null;
    clearTimeout(celebTimer);
  }

  function clearRecap() {
    matchRecap = null;
    recapPending = false;
  }

  function applyPlayerAwards(playerAwards = null) {
    if (!playerAwards) return;

    const nextStats = [...liveMatchStats];
    const indexByPlayerId = new Map(nextStats.map((entry, index) => [String(entry.player_id), index]));
    const knownPlayerIds = new Set([
      ...nextStats.map((entry) => String(entry.player_id)),
      ...(matchState?.players ?? []).map((player) => String(player.id)),
    ]);

    for (const playerId of knownPlayerIds) {
      const index = indexByPlayerId.get(playerId);
      const normalizedAwards = Array.isArray(playerAwards[playerId]) ? playerAwards[playerId] : [];

      if (index == null) {
        nextStats.push({
          player_id: Number(playerId),
          avg_3dart: 0,
          s180: 0,
          legs_won: 0,
          awards: normalizedAwards,
        });
        continue;
      }

      nextStats[index] = {
        ...nextStats[index],
        awards: normalizedAwards,
      };
    }

    for (const [playerId, awards] of Object.entries(playerAwards)) {
      const index = indexByPlayerId.get(String(playerId));
      const normalizedAwards = Array.isArray(awards) ? awards : [];

      if (index == null && !knownPlayerIds.has(String(playerId))) {
        nextStats.push({
          player_id: Number(playerId),
          avg_3dart: 0,
          s180: 0,
          legs_won: 0,
          awards: normalizedAwards,
        });
      }
    }

    liveMatchStats = nextStats;
  }

  function resetLiveView() {
    matchState = null;
    turnState = null;
    liveMatchStats = [];
    generalAvgSnapshot = {};
    statsRefreshToken += 1;
  }

  function applyGeneralAvgSnapshot(players = []) {
    generalAvgSnapshot = Object.fromEntries(
      players.map((player) => [
        player.id,
        { avg_3dart: player.general_avg_start ?? 0 },
      ])
    );
  }

  async function showMatchRecap(matchId) {
    recapPending = true;
    try {
      const res = await fetch(`/api/stats/matches/${matchId}/tv-recap`);
      if (!res.ok) throw new Error(`failed to fetch tv recap for match ${matchId}`);
      matchRecap = await res.json();
      recapPending = false;
    } catch (e) {
      console.error('tv recap failed', e);
      recapPending = false;
      resetLiveView();
    }
  }

  async function fetchLiveMatch() {
    try {
      const res = await fetch('/api/matches?status=live');
      const list = await res.json();
      const activeInController = list.find((match) => match.controller_opened_at);
      if (activeInController) {
        clearRecap();
        const res2 = await fetch(`/api/matches/${activeInController.id}`);
        const full = await res2.json();
        matchState = full;
        turnState  = full.turnState ?? null;
        applyGeneralAvgSnapshot(full.players ?? []);
        ws.join(full.id, 'tv');
        await refreshStats(full.id, full.players ?? []);
      } else {
        resetLiveView();
      }
    } catch (e) { console.error(e); }
  }

  async function refreshMatchStats(matchId) {
    const token = ++statsRefreshToken;
    try {
      const matchStatsRes = await fetch(`/api/stats/matches/${matchId}`);
      if (matchStatsRes.ok) {
        const stats = await matchStatsRes.json();
        if (token === statsRefreshToken && matchState?.id === matchId) {
          liveMatchStats = stats;
        }
      }
    } catch (e) {
      console.error('match stats refresh failed', e);
    }
  }

  async function refreshStats(matchId) {
    await refreshMatchStats(matchId);
  }

  onMount(() => {
    ws = createWsClient();

    ws.socket.on('connect', async () => {
      connected = true;
      await fetchLiveMatch();
    });
    ws.socket.on('disconnect', () => { connected = false; });

    ws.onMatchStarted(async () => {
      matchSetup = null;
      clearRecap();
      clearCelebration();
      await fetchLiveMatch();
    });

    ws.onMatchState((state) => {
      if (state.status !== 'live' || !state.controller_opened_at) {
        resetLiveView();
      } else {
        matchSetup = null;
        clearRecap();
        matchState = state;
        turnState  = state.turnState ?? null;
        applyGeneralAvgSnapshot(state.players ?? []);
        applyPlayerAwards(state.playerAwards);
        refreshStats(state.id);
      }
    });

    ws.onDartAdded((_, ts, playerAwards) => {
      clearCelebration();
      turnState = ts;
      applyPlayerAwards(playerAwards);
      if (matchState?.id) refreshStats(matchState.id);
    });
    ws.onTurnEnded((ts)     => {
      turnState = ts;
      if (matchState?.id) refreshStats(matchState.id);
    });

    ws.onLegWon(({ matchState: ms }) => {
      matchState = ms;
      turnState  = ms.turnState ?? null;
      applyGeneralAvgSnapshot(ms.players ?? []);
      refreshStats(ms.id);
      if (ms.status === 'live') {
        const winner = ms.players?.find((p) => p.id === ms.winner_id || p.id === ms.legs?.find((leg) => leg.winner_id)?.winner_id)
          ?? ms.players?.find((p) => p.id === ms.legs?.[ms.legs.length - 1]?.winner_id);
        if (winner) {
          clearCelebration();
          showCelebration({
            kind: 'legWon',
            playerName: winner.name ?? '',
            playerPhoto: winner.photo ?? null,
            value: winner.legs_won ?? 1,
          });
        }
      }
    });

    ws.onMatchWon(({ matchId, winnerId }) => {
      clearCelebration();
      showMatchRecap(matchId);
    });

    ws.onCelebration(({ kind, playerId, value }) => {
      if (matchRecap || recapPending) return;
      const player = matchState?.players?.find((p) => p.id === playerId);
      showCelebration({ kind, playerName: player?.name ?? '', playerPhoto: player?.photo ?? null, value });
    });

    ws.onMatchPaused(() => {
      clearRecap();
      resetLiveView();
      clearCelebration();
    });

    ws.onMatchSetup((setup) => {
      matchSetup = setup ?? null;
    });
  });

  onDestroy(() => {
    clearTimeout(celebTimer);
    ws?.disconnect();
  });
</script>

{#if celebration}
  <Celebration kind={celebration.kind} playerName={celebration.playerName} playerPhoto={celebration.playerPhoto} value={celebration.value} />
{/if}

{#if matchRecap}
  <MatchRecap recap={matchRecap} />
{:else if matchState}
  <Match {matchState} {turnState} {liveMatchStats} lifetimeStats={generalAvgSnapshot} />
{:else}
  <Lobby {connected} {matchSetup} />
{/if}

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html, body) { height: 100%; overflow: hidden; background: #0d0d1a; color: #fff; }
</style>

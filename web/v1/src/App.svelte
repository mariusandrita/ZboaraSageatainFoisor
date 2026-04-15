<script>
  import { onMount, onDestroy } from 'svelte';
  import { crossfade, fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import BadgeToken from '../../shared/BadgeToken.svelte';
  import { createWsClient } from '../../shared/ws-client.js';
  import Match from './screens/Match.svelte';
  import Celebration from './screens/Celebration.svelte';
  import MatchRecap from './screens/MatchRecap.svelte';

  let data = null;
  let clock = '';
  let spotlightIdx = 0;
  let liveCount = 0;
  let unfinishedMatches = [];
  let clockTimer, spotlightTimer, refreshTimer, setupPreviewTimer;

  // Auto-scroll
  let lbTrackEl;
  let lbOffset = 0;
  let lbFrame = null;
  let lbLastTs = 0;

  let recTrackEl;
  let recOffset = 0;
  let recFrame = null;
  let recLastTs = 0;
  let selectedPlayerId = null;
  let playerDetail = null;
  let playerDetailLoading = false;
  let playerDetailError = '';

  // ── Live match (websocket) ─────────────────────────────────
  let ws;
  let connected = false;
  let matchState = null;
  let turnState = null;
  let celebration = null;
  let celebTimer = null;
  let matchRecap = null;
  let matchSetup = null;
  let allPlayersById = new Map();
  let liveMatchStats = [];
  let playerAwards = {};
  let generalAvgSnapshot = {};
  let recapPending = false;
  let statsRefreshToken = 0;

  function autoScrollTrack(el, state, deltaMs, speed = 0.014) {
    if (!el) return state;
    const loopDistance = el.scrollHeight / 2;
    if (!Number.isFinite(loopDistance) || loopDistance <= 1) {
      el.style.transform = 'translate3d(0,0,0)';
      return 0;
    }
    let next = state + deltaMs * speed;
    if (next >= loopDistance) next -= loopDistance;
    el.style.transform = `translate3d(0,${-next}px,0)`;
    return next;
  }

  function tickLb(ts) {
    if (!lbLastTs) lbLastTs = ts;
    const delta = Math.min(ts - lbLastTs, 48);
    lbLastTs = ts;
    lbOffset = autoScrollTrack(lbTrackEl, lbOffset, delta);
    lbFrame = requestAnimationFrame(tickLb);
  }

  function startLbScroll() {
    if (lbFrame) cancelAnimationFrame(lbFrame);
    lbOffset = 0; lbLastTs = 0;
    if (lbTrackEl) lbTrackEl.style.transform = 'translate3d(0,0,0)';
    lbFrame = requestAnimationFrame(tickLb);
  }

  function stopLbScroll() {
    if (lbFrame) { cancelAnimationFrame(lbFrame); lbFrame = null; }
  }

  function tickRec(ts) {
    if (!recLastTs) recLastTs = ts;
    const delta = Math.min(ts - recLastTs, 48);
    recLastTs = ts;
    recOffset = autoScrollTrack(recTrackEl, recOffset, delta, 0.010);
    recFrame = requestAnimationFrame(tickRec);
  }

  function startRecScroll() {
    if (recFrame) cancelAnimationFrame(recFrame);
    recOffset = 0; recLastTs = 0;
    if (recTrackEl) recTrackEl.style.transform = 'translate3d(0,0,0)';
    recFrame = requestAnimationFrame(tickRec);
  }

  function stopRecScroll() {
    if (recFrame) { cancelAnimationFrame(recFrame); recFrame = null; }
  }

  // Right panel carousel
  let recSceneIdx = 0;
  let recSceneTimer = null;

  $: recScenes = buildRecScenes(data);

  function buildRecScenes(d) {
    if (!d) return [];
    const t20 = (d.triplesBySegment ?? []).find(s => s.segment === 20);
    const t19 = (d.triplesBySegment ?? []).find(s => s.segment === 19);
    return [
      { type: 'overview' },
      { type: 'finishes' },
      { type: 'rounds' },
      { type: 'tons' },
      { type: 'triples', leaders20: t20?.leaders ?? [], leaders19: t19?.leaders ?? [] },
    ];
  }

  function nextRecScene() {
    recSceneIdx = (recSceneIdx + 1) % (recScenes.length || 1);
  }

  function startRecCarousel() {
    if (recSceneTimer) clearInterval(recSceneTimer);
    recSceneTimer = setInterval(nextRecScene, 9500);
  }

  function stopRecCarousel() {
    if (recSceneTimer) { clearInterval(recSceneTimer); recSceneTimer = null; }
  }

  onMount(async () => {
    await loadData();
    await loadSetupPreview();
    fetch('/api/players').then(r => r.json()).then(list => {
      allPlayersById = new Map(list.map(p => [p.id, p]));
    }).catch(() => {});
    updateClock();
    clockTimer    = setInterval(updateClock, 1000);
    spotlightTimer = setInterval(nextSpotlight, 13000);
    refreshTimer  = setInterval(loadData, 60_000);
    setupPreviewTimer = setInterval(loadSetupPreview, 1500);
    startLbScroll();
    startRecCarousel();
    initWebsocket();
  });

  onDestroy(() => {
    clearInterval(clockTimer);
    clearInterval(spotlightTimer);
    clearInterval(refreshTimer);
    clearInterval(setupPreviewTimer);
    clearTimeout(celebTimer);
    stopLbScroll();
    stopRecCarousel();
    ws?.disconnect();
  });

  async function loadData() {
    try {
      const res = await fetch('/api/stats/lobby');
      if (res.ok) data = await res.json();
    } catch (e) {}
  }

  async function loadSetupPreview() {
    if (matchState || matchRecap || recapPending) return;
    try {
      const res = await fetch('/api/matches/setup-preview');
      if (res.ok) {
        matchSetup = await res.json();
      }
    } catch (e) {
      console.error('Failed to load setup preview', e);
    }
  }


  function updateClock() {
    const now = new Date();
    clock = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  }

  function nextSpotlight() {
    const count = data?.playerSpotlights?.length ?? 0;
    if (count > 0) spotlightIdx = (spotlightIdx + 1) % count;
  }

  $: spotlight = data?.playerSpotlights?.[spotlightIdx] ?? null;
  $: spotlightRanks = buildSpotlightRanks(data?.playerSpotlights ?? []);

  $: leaderboard = buildLeaderboard(data);
  $: lbRows = leaderboard.length > 1 ? [...leaderboard, ...leaderboard] : leaderboard;

  function buildLeaderboard(d) {
    if (!d?.top) return [];
    const wrMap = new Map((d.playerWinRates ?? []).map(p => [p.id, p]));
    return d.top.map((p, i) => ({
      ...p,
      rank: i + 1,
      win_pct: wrMap.get(p.id)?.pct ?? 0,
      played:  wrMap.get(p.id)?.played ?? 0,
      wins:    wrMap.get(p.id)?.wins ?? 0,
    }));
  }

  function fmt(val, decimals = 2) {
    if (val == null) return '—';
    const n = Number(val);
    return isNaN(n) ? '—' : n.toFixed(decimals).replace('.', ',');
  }

  function pctStr(num, den) {
    if (!den) return '0,00 %';
    return ((num / den) * 100).toFixed(2).replace('.', ',') + ' %';
  }

  function initial(name) {
    return name?.[0]?.toUpperCase() ?? '?';
  }

  function rankColor(rank) {
    if (rank === 1) return '#ffd700';
    if (rank === 2) return '#c0c0c0';
    if (rank === 3) return '#cd7f32';
    return '#475569';
  }

  function buildSpotlightRanks(players = []) {
    const metrics = ['avg_3dart', 'high_checkout', 'high_round', 'wins', 'legs_won'];
    const ranks = {};

    for (const metric of metrics) {
      const sorted = [...players]
        .map((player) => ({ id: player.id, value: Number(player?.[metric] ?? 0) }))
        .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
        .sort((a, b) => b.value - a.value || a.id - b.id);

      const metricRanks = new Map();
      let lastValue = null;
      let currentRank = 0;

      for (let index = 0; index < sorted.length; index += 1) {
        const entry = sorted[index];
        if (entry.value !== lastValue) {
          currentRank = index + 1;
          lastValue = entry.value;
        }
        metricRanks.set(entry.id, currentRank);
      }

      ranks[metric] = metricRanks;
    }

    return ranks;
  }

  function spotlightRank(metric, playerId) {
    return spotlightRanks?.[metric]?.get(playerId) ?? null;
  }

  function spotlightRankTone(rank) {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return '';
  }

  function spotlightRankIcon(rank) {
    if (rank === 1) return '🏆';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  }

  $: spotlightAvgRank = spotlight ? spotlightRank('avg_3dart', spotlight.id) : null;
  $: spotlightFinishRank = spotlight ? spotlightRank('high_checkout', spotlight.id) : null;
  $: spotlightRoundRank = spotlight ? spotlightRank('high_round', spotlight.id) : null;
  $: spotlightWinsRank = spotlight ? spotlightRank('wins', spotlight.id) : null;
  $: spotlightLegsRank = spotlight ? spotlightRank('legs_won', spotlight.id) : null;
  $: spotlightLatestMatch = spotlight?.recent_matches?.[0] ?? null;

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function playerNames(match) {
    const names = match?.participants?.map((p) => p.name)
      ?? match?.players?.map((p) => p.name)
      ?? [];
    return names.length ? names.join(' vs ') : '—';
  }

  function recentMatchParticipants(match) {
    return match?.participants ?? match?.players ?? [];
  }

  function recentMatchLabel(match) {
    const value = match?.ended_at ?? match?.started_at ?? match?.created_at ?? null;
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ro-RO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function recentMatchShortLabel(match) {
    const value = match?.ended_at ?? match?.started_at ?? match?.created_at ?? null;
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ro-RO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function recentMatchScore(match) {
    const scores = (match?.players ?? [])
      .map((player) => player.legs_won)
      .sort((a, b) => b - a)
      .slice(0, 2);
    return scores.length ? scores.join(' - ') : '—';
  }

  function recentMatchFormat(match) {
    if (!match) return '—';
    const score = match?.starting_score ? `${match.starting_score}` : 'X01';
    return `${score} · ${match?.participants?.length ?? match?.players?.length ?? 0} jucători`;
  }

  function recentMatchWinner(match) {
    const participants = recentMatchParticipants(match);
    return participants.find((player) => player.id === match?.winner_id) ?? null;
  }

  function recentMatchLosersRemaining(match) {
    const winner = recentMatchWinner(match);
    return recentMatchParticipants(match)
      .filter((player) => player.id !== winner?.id)
      .map((player) => ({
        name: player.name,
        remaining: player.checkout_remaining,
      }))
      .filter((player) => player.remaining != null && Number.isFinite(Number(player.remaining)));
  }

  function recentMatchLosersRemainingLabel(match) {
    const rows = recentMatchLosersRemaining(match);
    if (!rows.length) return '';
    return rows.map((player) => `${player.name} ${player.remaining}`).join(' · ');
  }

  function recentMatchOpponentSummary(match) {
    const winner = recentMatchWinner(match);
    const opponents = recentMatchParticipants(match).filter((player) => player.id !== winner?.id);
    const names = opponents.map((player) => player.name).filter(Boolean);

    if (!names.length) return 'fără adversari înregistrați';
    if (names.length === 1) return `contra lui ${names[0]}`;
    if (names.length === 2) return `contra lui ${names[0]} și ${names[1]}`;
    return `contra lui ${names[0]}, ${names[1]} și încă ${names.length - 2}`;
  }

  function recentMatchScoreSummary(match) {
    const players = match?.players ?? [];
    if (!players.length) return 'Scor indisponibil';
    if (players.length <= 2) return `Scor ${recentMatchScore(match)}`;

    const winner = recentMatchWinner(match);
    const winnerLegs = Number(winner?.legs_won ?? 0);
    if (winnerLegs > 0) {
      return `${winnerLegs} ${winnerLegs === 1 ? 'leg câștigat' : 'leguri câștigate'}`;
    }
    return `${players.length} jucători`;
  }

  function initialsForMatchPlayer(player) {
    return player?.name?.[0]?.toUpperCase() ?? '?';
  }

  function tvMatchInfo(match) {
    return `${match?.starting_score ?? '—'} · Leg ${match?.activeLeg?.leg_number ?? (match?.status === 'pending' ? 'Pregătit' : '?')}`;
  }

  async function openPlayer(playerId) {
    if (!playerId) return;
    selectedPlayerId = playerId;
    playerDetailLoading = true;
    playerDetailError = '';

    try {
      const res = await fetch(`/api/players/${playerId}/detail`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      playerDetail = await res.json();
    } catch (err) {
      playerDetail = null;
      playerDetailError = 'Nu am putut încărca profilul jucătorului.';
    } finally {
      playerDetailLoading = false;
    }
  }

  function closePlayer() {
    selectedPlayerId = null;
    playerDetail = null;
    playerDetailLoading = false;
    playerDetailError = '';
  }

  // ── Websocket helpers ──────────────────────────────────────
  function showCelebration(c) {
    celebration = c;
    clearTimeout(celebTimer);
    celebTimer = setTimeout(() => { celebration = null; }, 6000);
  }

  function clearCelebration() {
    celebration = null;
    clearTimeout(celebTimer);
  }

  function clearRecap() {
    matchRecap = null;
    recapPending = false;
  }

  function applyPlayerAwards(awardsByPlayer = null) {
    if (!awardsByPlayer) return;
    playerAwards = awardsByPlayer;
    const nextStats = [...liveMatchStats];
    const indexByPlayerId = new Map(nextStats.map((entry, index) => [String(entry.player_id), index]));
    const knownPlayerIds = new Set([
      ...nextStats.map((entry) => String(entry.player_id)),
      ...(matchState?.players ?? []).map((player) => String(player.id)),
    ]);
    for (const playerId of knownPlayerIds) {
      const index = indexByPlayerId.get(playerId);
      const normalizedAwards = Array.isArray(awardsByPlayer[playerId]) ? awardsByPlayer[playerId] : [];
      if (index == null) {
        nextStats.push({ player_id: Number(playerId), avg_3dart: 0, s180: 0, legs_won: 0, awards: normalizedAwards });
        continue;
      }
      nextStats[index] = { ...nextStats[index], awards: normalizedAwards };
    }
    for (const [playerId, awards] of Object.entries(awardsByPlayer)) {
      const index = indexByPlayerId.get(String(playerId));
      const normalizedAwards = Array.isArray(awards) ? awards : [];
      if (index == null && !knownPlayerIds.has(String(playerId))) {
        nextStats.push({ player_id: Number(playerId), avg_3dart: 0, s180: 0, legs_won: 0, awards: normalizedAwards });
      }
    }
    liveMatchStats = nextStats;
  }

  function resetLiveView() {
    matchState = null;
    turnState = null;
    liveMatchStats = [];
    playerAwards = {};
    generalAvgSnapshot = {};
    statsRefreshToken += 1;
  }

  function applyGeneralAvgSnapshot(players = []) {
    generalAvgSnapshot = Object.fromEntries(
      players.map((player) => [player.id, { avg_3dart: player.general_avg_start ?? 0 }])
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
      liveCount = list.length;
      unfinishedMatches = await Promise.all(
        list.map((match) => fetch(`/api/matches/${match.id}`).then((response) => response.json()))
      );
      const activeInController = unfinishedMatches.find((match) => match.controller_opened_at);
      if (activeInController) {
        clearRecap();
        matchState = activeInController;
        turnState = activeInController.turnState ?? null;
        applyGeneralAvgSnapshot(activeInController.players ?? []);
        ws.join(activeInController.id, 'tv');
        await refreshStats(activeInController.id, activeInController.players ?? []);
      } else {
        resetLiveView();
      }
    } catch (e) {
      unfinishedMatches = [];
      console.error(e);
    }
  }

  async function refreshMatchStats(matchId) {
    const token = ++statsRefreshToken;
    try {
      const matchStatsRes = await fetch(`/api/stats/matches/${matchId}`);
      if (matchStatsRes.ok) {
        const stats = await matchStatsRes.json();
        if (token === statsRefreshToken && matchState?.id === matchId) {
          liveMatchStats = stats;
          playerAwards = Object.fromEntries(
            (stats ?? []).map((entry) => [entry.player_id, entry.awards ?? []])
          );
        }
      }
    } catch (e) { console.error('match stats refresh failed', e); }
  }

  async function refreshStats(matchId) {
    await refreshMatchStats(matchId);
  }

  function initWebsocket() {
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
        turnState = state.turnState ?? null;
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

    ws.onTurnEnded((ts) => {
      turnState = ts;
      if (matchState?.id) refreshStats(matchState.id);
    });

    ws.onLegWon(({ matchState: ms, playerAwards }) => {
      matchState = ms;
      turnState = ms.turnState ?? null;
      applyGeneralAvgSnapshot(ms.players ?? []);
      applyPlayerAwards(playerAwards);
      refreshStats(ms.id);
      if (ms.status === 'live') {
        const winner = ms.players?.find((p) => p.id === ms.winner_id || p.id === ms.legs?.find((leg) => leg.winner_id)?.winner_id)
          ?? ms.players?.find((p) => p.id === ms.legs?.[ms.legs.length - 1]?.winner_id);
        if (winner) {
          clearCelebration();
          showCelebration({ kind: 'legWon', playerName: winner.name ?? '', playerPhoto: winner.photo ?? null, value: winner.legs_won ?? 1 });
        }
      }
    });

    ws.onMatchWon(({ matchId }) => {
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
  }

  $: tickerParts = buildTickerParts(data);

  // ── Match setup overlay ───────────────────────────────────
  $: setupPlayers = buildSetupPlayers(matchSetup, data?.playerSpotlights ?? [], allPlayersById);
  $: selectedPlayerIds = new Set(matchSetup?.selectedIds ?? []);
  $: selectedPlayerCount = matchSetup?.selectedIds?.length ?? 0;
  $: setupLegLabel = setupLegsLabel(matchSetup?.legsToWin);

  function buildSetupPlayers(setup, statsPlayers, playersById = allPlayersById) {
    if (!setup?.availablePlayers?.length) return [];
    const statsById = new Map(statsPlayers.map((p) => [p.id, p]));
    return setup.availablePlayers.map((player) => {
      const stats = statsById.get(player.id) ?? {};
      const fullPlayer = allPlayersById.get(player.id) ?? {};
      const selectionIdx = setup.selectedIds?.indexOf(player.id) ?? -1;
      return {
        ...player,
        photo: fullPlayer.photo ?? player.photo ?? null,
        avg_3dart: stats.avg_3dart ?? 0,
        high_finish: stats.high_checkout ?? 0,
        s100plus: stats.s100plus ?? 0,
        wins: stats.wins ?? 0,
        played_matches: stats.played_matches ?? 0,
        selectionIdx,
      };
    });
  }

  $: selectedSetupPlayers = setupPlayers
    .filter((player) => player.selectionIdx >= 0)
    .sort((a, b) => a.selectionIdx - b.selectionIdx);

  $: availableSetupPlayers = setupPlayers
    .filter((player) => player.selectionIdx < 0)
    .sort((a, b) => (b.played_matches ?? 0) - (a.played_matches ?? 0) || a.name.localeCompare(b.name));

  const [sendSetupCard, receiveSetupCard] = crossfade({
    duration: 320,
    fallback(node, params) {
      return fly(node, {
        y: params?.key != null ? 20 : 0,
        x: 0,
        duration: 260,
        opacity: 0.28,
      });
    },
  });

  function setupLegsLabel(value) {
    const totalLegs = Math.max(((value ?? 1) * 2) - 1, 1);
    return `Best of ${totalLegs}`;
  }

  function buildTickerParts(d) {
    if (!d?.badgeCatalog?.length) {
      return [{ kind: null, label: 'Badge Guide', description: 'Încărcăm catalogul de badge-uri…' }];
    }
    return d.badgeCatalog.map((badge) => ({
      kind: badge.kind,
      label: badge.label,
      description: badge.description,
    }));
  }

</script>

{#if celebration}
  <Celebration kind={celebration.kind} playerName={celebration.playerName} playerPhoto={celebration.playerPhoto} value={celebration.value} />
{/if}

{#if matchRecap}
  <MatchRecap recap={matchRecap} />
{:else if matchState}
  <Match {matchState} {turnState} {liveMatchStats} {playerAwards} lifetimeStats={generalAvgSnapshot} />
{:else}
<div class="shell">

  <!-- ── Header ──────────────────────────────────────────── -->
  <header class="topbar">
    <div class="brand">
      <span class="brand-dart">🎯</span>
      <span class="brand-name">ZboaraSageata</span>
    </div>

    <div class="topbar-center">
      {#if unfinishedMatches.length > 0}
        {@const topbarMatch = unfinishedMatches[0]}
        <div class="topbar-match">
          <div class="topbar-match-accent" style="background: linear-gradient(180deg,{topbarMatch.players?.[0]?.color ?? '#e63946'},{topbarMatch.players?.[1]?.color ?? '#4caf50'})"></div>
          <div class="topbar-match-players">
            {#each (topbarMatch.players ?? []).slice(0, 4) as player}
              <div class="topbar-match-player">
                <div class="topbar-match-avatar" style="--player-color:{player.color ?? '#475569'}">
                  {#if player.photo}
                    <img src={player.photo} alt={player.name} />
                  {:else}
                    <span>{initialsForMatchPlayer(player)}</span>
                  {/if}
                </div>
                <span>{player.name}</span>
              </div>
            {/each}
            {#if (topbarMatch.players?.length ?? 0) > 4}
              <span class="topbar-match-more">+{topbarMatch.players.length - 4}</span>
            {/if}
          </div>
          <div class="topbar-match-meta">
            <span>{tvMatchInfo(topbarMatch)}</span>
            <span class:topbar-match-status-waiting={topbarMatch.status !== 'live'}>
              {topbarMatch.status === 'live' ? 'LIVE' : 'PREGĂTIT'}
            </span>
          </div>
        </div>
      {:else if liveCount > 0}
        <div class="live-pill">
          <span class="live-dot"></span>
          {liveCount} meci{liveCount === 1 ? '' : 'uri'} în curs
        </div>
      {:else}
        <div class="idle-pill">Așteptăm meciul următor</div>
      {/if}
    </div>

    <div class="clock">{clock}</div>
  </header>

  <!-- ── Body ───────────────────────────────────────────── -->
  {#if matchSetup}
    <div class="setup-shell">
      <section class="setup-stage">
        <div class="setup-header">
          <div>
            <div class="setup-kicker">Creare meci</div>
            <h1>Controller-ul alege jucătorii</h1>
          </div>
          <div class="setup-summary">
            <span>{selectedPlayerCount} selectați</span>
            <span>{matchSetup?.startingScore ?? 501}</span>
            <span>{setupLegLabel}</span>
            <span>{matchSetup?.doubleOut ? 'Double Out' : 'Straight Out'}</span>
            <span>{matchSetup?.playerOrderMode === 'random' ? 'Ordine aleatorie' : 'Ordinea selecției'}</span>
          </div>
        </div>
        <div class="setup-board">
          <section class="setup-zone setup-zone-selected" class:setup-zone-empty={selectedSetupPlayers.length === 0}>
            <div class="setup-zone-head">
              <div>
                <div class="setup-zone-kicker">Joacă acum</div>
                <div class="setup-zone-title">Jucători selectați</div>
              </div>
              <div class="setup-zone-count">{selectedPlayerCount}</div>
            </div>

            {#if selectedSetupPlayers.length > 0}
              <div class="setup-selected-strip">
                {#each selectedSetupPlayers as player (player.id)}
                  <article
                    class="setup-card setup-card-selected"
                    style="--player-color:{player.color}"
                    in:receiveSetupCard={{ key: player.id }}
                    out:sendSetupCard={{ key: player.id }}
                    animate:flip={{ duration: 320 }}
                  >
                    <div class="setup-selected-chip">Selectat</div>
                    <div class="setup-card-top">
                      <div class="setup-avatar">
                        {#if player.photo}
                          <img src={player.photo} alt={player.name} />
                        {:else}
                          <span>{player.name[0].toUpperCase()}</span>
                        {/if}
                      </div>
                      <div class="setup-ident">
                        <div class="setup-name">{player.name}</div>
                        <div class="setup-meta">{player.wins} victorii din {player.played_matches} meciuri</div>
                      </div>
                      <div class="setup-order">{player.selectionIdx + 1}</div>
                    </div>
                    <div class="setup-stats">
                      <div class="setup-stat"><span>Medie 3</span><strong>{player.avg_3dart}</strong></div>
                      <div class="setup-stat"><span>Cel mai bun finish</span><strong>{player.high_finish}</strong></div>
                      <div class="setup-stat"><span>100+</span><strong>{player.s100plus}</strong></div>
                    </div>
                  </article>
                {/each}
              </div>
            {:else}
              <div class="setup-empty-state" aria-hidden="true"></div>
            {/if}
          </section>

          <section class="setup-zone setup-zone-available">
            <div class="setup-zone-head">
              <div>
                <div class="setup-zone-kicker">Disponibili</div>
                <div class="setup-zone-title">Jucători disponibili</div>
              </div>
              <div class="setup-zone-count">{availableSetupPlayers.length}</div>
            </div>

            <div class="setup-grid" class:has-selection={selectedPlayerCount > 0}>
              {#each availableSetupPlayers as player (player.id)}
                <article
                  class="setup-card setup-card-compact"
                  style="--player-color:{player.color}"
                  in:receiveSetupCard={{ key: player.id }}
                  out:sendSetupCard={{ key: player.id }}
                  animate:flip={{ duration: 320 }}
                >
                  <div class="setup-avatar setup-avatar-compact">
                    {#if player.photo}
                      <img src={player.photo} alt={player.name} />
                    {:else}
                      <span>{player.name[0].toUpperCase()}</span>
                    {/if}
                  </div>
                </article>
              {/each}
            </div>
          </section>
        </div>
      </section>
    </div>
  {:else if !data}
    <div class="loading">
      <span class="loading-dot"></span>
      <span class="loading-dot"></span>
      <span class="loading-dot"></span>
      <span style="margin-left:0.8rem;color:#475569">Se încarcă statisticile…</span>
    </div>
  {:else}
    <main class="main">
      <!-- ── LEFT: Leaderboard ─────────────────────────── -->
      <section class="panel panel-left">
        <div class="panel-title">
          <span class="panel-title-icon">📊</span>
          CLASAMENT
        </div>

        <div class="leaderboard">
          <div class="lb-scroll-track" bind:this={lbTrackEl}>
          {#each lbRows as player, i}
            {@const rank = (i % leaderboard.length) + 1}
            <button class="lb-row" type="button" style="--pc:{player.color}" on:click={() => openPlayer(player.id)}>
              <div class="lb-rank" style="color:{rankColor(rank)}">{rank}</div>
              <div class="lb-avatar">
                {#if player.photo}
                  <img src={player.photo} alt={player.name} />
                {:else}
                  {initial(player.name)}
                {/if}
              </div>
              <div class="lb-body">
                <div class="lb-name">{player.name}</div>
                <div class="lb-chips">
                  <span class="chip chip-legs">{player.legs_won} manșe</span>
                  {#if player.s180 > 0}
                    <span class="chip chip-180">180×{player.s180}</span>
                  {/if}
                </div>
              </div>
              <div class="lb-big-avg">{fmt(player.avg_3dart)}</div>
            </button>
            {#if (i + 1) % leaderboard.length === 0}
              <div class="lb-loop-gap"></div>
            {/if}
          {/each}
          </div>

          {#if leaderboard.length === 0}
            <div class="empty-state">Nicio statistică disponibilă</div>
          {/if}
        </div>

        <!-- Win rate mini board -->
        {#if data.playerWinRates?.length}
          <div class="sub-board">
            <div class="sub-board-title">RATA VICTORII</div>
            {#each data.playerWinRates.slice(0, 6) as p, i}
              <div class="sub-row">
                <span class="sub-rank">{i + 1}</span>
                <span class="sub-bar-wrap">
                  <span class="sub-name" style="color:{p.color}">{p.name}</span>
                  <span class="sub-bar-bg">
                    <span class="sub-bar-fill" style="width:{p.pct}%;background:{p.color}"></span>
                  </span>
                </span>
                <span class="sub-pct">{p.pct}%</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- ── CENTER: Player Spotlight ─────────────────── -->
      <section class="panel panel-center">
        <div class="panel-title">
          <span class="panel-title-icon">⚡</span>
          SPOTLIGHT JUCĂTOR
          {#if data.playerSpotlights?.length > 1}
            <span class="spotlight-counter">
              {spotlightIdx + 1} / {data.playerSpotlights.length}
            </span>
          {/if}
        </div>

        {#if spotlight}
          {#key spotlightIdx}
            <div class="spotlight" in:fade={{ duration: 350 }} style="--pc:{spotlight.color}">

              <!-- Player hero header -->
              <button class="sp-hero" type="button" on:click={() => openPlayer(spotlight.id)}>
                <div class="sp-avatar-wrap">
                  {#if spotlight.photo}
                    <img class="sp-avatar" src={spotlight.photo} alt={spotlight.name} />
                  {:else}
                    <div class="sp-avatar sp-avatar-fb">{initial(spotlight.name)}</div>
                  {/if}
                  <div class="sp-ring"></div>
                </div>
                <div class="sp-identity">
                  <div class="sp-name">{spotlight.name}</div>
                  {#if spotlight.nickname}
                    <div class="sp-nickname">"{spotlight.nickname}"</div>
                  {/if}
                  <div class="sp-period">X01 · jucător spotlight</div>
                  {#if spotlight.awards?.length}
                    <div class="sp-hero-badges">
                      {#each spotlight.awards.slice(0, 5) as award}
                        <BadgeToken kind={award.kind} count={award.count} compact />
                      {/each}
                    </div>
                  {/if}
                </div>
              </button>

              <div class="sp-headline-stats">
                <div class="sp-highlight-card">
                  <span class="sp-highlight-label">Avg 3</span>
                  <strong class:sp-rank-gold={spotlightAvgRank === 1} class:sp-rank-silver={spotlightAvgRank === 2} class:sp-rank-bronze={spotlightAvgRank === 3}>
                    {fmt(spotlight.avg_3dart)}
                  </strong>
                  {#if spotlightAvgRank && spotlightAvgRank <= 3}
                    <span class={`sp-rank-chip ${spotlightRankTone(spotlightAvgRank)}`}>{spotlightRankIcon(spotlightAvgRank)} #{spotlightAvgRank}</span>
                  {/if}
                </div>
                <div class="sp-highlight-card">
                  <span class="sp-highlight-label">Cel mai bun finish</span>
                  <strong class:sp-rank-gold={spotlightFinishRank === 1} class:sp-rank-silver={spotlightFinishRank === 2} class:sp-rank-bronze={spotlightFinishRank === 3}>
                    {spotlight.high_checkout || '—'}
                  </strong>
                  {#if spotlightFinishRank && spotlightFinishRank <= 3}
                    <span class={`sp-rank-chip ${spotlightRankTone(spotlightFinishRank)}`}>{spotlightRankIcon(spotlightFinishRank)} #{spotlightFinishRank}</span>
                  {/if}
                </div>
                <div class="sp-highlight-card">
                  <span class="sp-highlight-label">Cea mai bună tură</span>
                  <strong class:sp-rank-gold={spotlightRoundRank === 1} class:sp-rank-silver={spotlightRoundRank === 2} class:sp-rank-bronze={spotlightRoundRank === 3}>
                    {spotlight.high_round || '—'}
                  </strong>
                  {#if spotlightRoundRank && spotlightRoundRank <= 3}
                    <span class={`sp-rank-chip ${spotlightRankTone(spotlightRoundRank)}`}>{spotlightRankIcon(spotlightRoundRank)} #{spotlightRoundRank}</span>
                  {/if}
                </div>
                <div class="sp-highlight-card">
                  <span class="sp-highlight-label">Meciuri câștigate</span>
                  <strong class:sp-rank-gold={spotlightWinsRank === 1} class:sp-rank-silver={spotlightWinsRank === 2} class:sp-rank-bronze={spotlightWinsRank === 3}>
                    {spotlight.wins ?? 0}
                  </strong>
                  {#if spotlightWinsRank && spotlightWinsRank <= 3}
                    <span class={`sp-rank-chip ${spotlightRankTone(spotlightWinsRank)}`}>{spotlightRankIcon(spotlightWinsRank)} #{spotlightWinsRank}</span>
                  {/if}
                </div>
                <div class="sp-highlight-card">
                  <span class="sp-highlight-label">Manșe câștigate</span>
                  <strong class:sp-rank-gold={spotlightLegsRank === 1} class:sp-rank-silver={spotlightLegsRank === 2} class:sp-rank-bronze={spotlightLegsRank === 3}>
                    {spotlight.legs_won ?? 0}
                  </strong>
                  {#if spotlightLegsRank && spotlightLegsRank <= 3}
                    <span class={`sp-rank-chip ${spotlightRankTone(spotlightLegsRank)}`}>{spotlightRankIcon(spotlightLegsRank)} #{spotlightLegsRank}</span>
                  {/if}
                </div>
              </div>

              <div class="sp-type-bars">
                <div class="sp-type-bar-row">
                  <span class="sp-type-label single">Simplă</span>
                  <div class="sp-type-track">
                    <div class="sp-type-fill single" style="width:{spotlight.pct_single ?? 0}%"></div>
                  </div>
                  <span class="sp-type-pct">{fmt(spotlight.pct_single ?? 0, 1)}%</span>
                </div>
                <div class="sp-type-bar-row">
                  <span class="sp-type-label double">Dublă</span>
                  <div class="sp-type-track">
                    <div class="sp-type-fill double" style="width:{spotlight.pct_double ?? 0}%"></div>
                  </div>
                  <span class="sp-type-pct">{fmt(spotlight.pct_double ?? 0, 1)}%</span>
                </div>
                <div class="sp-type-bar-row">
                  <span class="sp-type-label triple">Triplă</span>
                  <div class="sp-type-track">
                    <div class="sp-type-fill triple" style="width:{spotlight.pct_triple ?? 0}%"></div>
                  </div>
                  <span class="sp-type-pct">{fmt(spotlight.pct_triple ?? 0, 1)}%</span>
                </div>
              </div>

              <!-- Recent matches -->
              {#if spotlight.recent_matches?.length}
                <div class="sp-segments">
                  <div class="sp-seg-label">ULTIMUL MECI</div>
                  <div class="sp-recent-card sp-recent-card-featured" class:sp-recent-win={spotlightLatestMatch?.result === 'win'} class:sp-recent-loss={spotlightLatestMatch?.result !== 'win'}>
                    <span class="sp-recent-result">{spotlightLatestMatch?.result === 'win' ? 'Victorie' : 'Înfrângere'}</span>
                    <span class="sp-recent-opponents">{playerNames(spotlightLatestMatch)}</span>
                    <span class="sp-recent-winner-line">
                      Câștigător:
                      <strong class="sp-recent-winner-name">{recentMatchWinner(spotlightLatestMatch)?.name ?? '—'}</strong>
                    </span>
                    <span class="sp-recent-score">Scor final: {recentMatchScore(spotlightLatestMatch)} · {recentMatchFormat(spotlightLatestMatch)}</span>
                    {#if recentMatchLosersRemaining(spotlightLatestMatch).length}
                      <span class="sp-recent-leftovers">Rămași la checkout: {recentMatchLosersRemainingLabel(spotlightLatestMatch)}</span>
                    {/if}
                    <span class="sp-recent-meta">{fmtDate(spotlightLatestMatch?.ended_at ?? spotlightLatestMatch?.started_at ?? spotlightLatestMatch?.created_at)}</span>
                  </div>
                </div>
              {/if}

              <!-- Player nav dots -->
              {#if data.playerSpotlights?.length > 1}
                <div class="sp-dots">
                  {#each data.playerSpotlights as _, i}
                    <button
                      class="sp-dot"
                      class:sp-dot-active={i === spotlightIdx}
                      on:click={() => spotlightIdx = i}
                      aria-label="Player {i + 1}"
                    ></button>
                  {/each}
                </div>
              {/if}

            </div>
          {/key}
        {:else}
          <div class="empty-state">Nicio statistică disponibilă</div>
        {/if}
      </section>

      <!-- ── RIGHT: Records ────────────────────────────── -->
      <section class="panel panel-right">
        <div class="panel-title">
          <span class="panel-title-icon">🏆</span>
          MOMENTE
        </div>

        <div class="rec-carousel">
          {#if recScenes.length}
            {@const scene = recScenes[recSceneIdx]}
            {#key recSceneIdx}
              <div class="rec-scene" in:fly={{ x: 80, duration: 350 }} out:fly={{ x: -80, duration: 350 }}>

                {#if scene.type === 'overview'}
                  <div class="rec-scene-title">Panou de onoare</div>
                  <div class="totals-card">
                    <div class="totals-row"><span class="totals-label">Meciuri jucate</span><span class="totals-val">{data.totalMatches}</span></div>
                    <div class="totals-row"><span class="totals-label">Săgeți aruncate</span><span class="totals-val">{data.totalDarts.toLocaleString()}</span></div>
                  </div>
                  {#if data.bestMatchAvg?.avg}<div class="rec-card hero"><div class="rec-icon">⭐</div><div class="rec-body"><div class="rec-label">Cel mai bun meci ca medie</div><div class="rec-value">{fmt(data.bestMatchAvg.avg)}</div><div class="rec-player" style="color:{data.bestMatchAvg.color}">{data.bestMatchAvg.name}</div></div></div>{/if}
                  {#if data.longestStreak?.count > 1}<div class="rec-card"><div class="rec-icon">🔥</div><div class="rec-body"><div class="rec-label">Cea mai lungă serie</div><div class="rec-value">{data.longestStreak.count} manșe</div><div class="rec-player" style="color:{data.longestStreak.color}">{data.longestStreak.name}</div></div></div>{/if}
                  {#if !data.bestMatchAvg?.avg && !(data.longestStreak?.count > 1)}
                    <div class="rec-card empty">
                      <div class="rec-icon">🏁</div>
                      <div class="rec-body">
                        <div class="rec-label">Se adună istoric</div>
                        <div class="rec-player">Mai avem nevoie de câteva meciuri finalizate pentru recorduri solide.</div>
                      </div>
                    </div>
                  {/if}

                {:else if scene.type === 'finishes'}
                  <div class="rec-scene-title">Finish-uri și sânge rece</div>
                  {#if data.highCheckout?.value}<div class="rec-card hero"><div class="rec-icon">🏆</div><div class="rec-body"><div class="rec-label">Cel mai bun finish</div><div class="rec-value">{data.highCheckout.value}</div><div class="rec-player" style="color:{data.highCheckout.color}">{data.highCheckout.name}</div></div></div>{/if}
                  {#if data.bestMatchAvg?.avg}<div class="rec-card"><div class="rec-icon">📊</div><div class="rec-body"><div class="rec-label">Cea mai bună medie</div><div class="rec-value">{fmt(data.bestMatchAvg.avg)}</div><div class="rec-player" style="color:{data.bestMatchAvg.color}">{data.bestMatchAvg.name}</div></div></div>{/if}
                  {#if data.longestStreak?.count > 1}<div class="rec-card"><div class="rec-icon">🔥</div><div class="rec-body"><div class="rec-label">Cea mai lungă serie</div><div class="rec-value">{data.longestStreak.count} manșe</div><div class="rec-player" style="color:{data.longestStreak.color}">{data.longestStreak.name}</div></div></div>{/if}
                  {#if data.recentMatches?.length}
                    <div class="rec-mini-head">Ultimele finale</div>
                    <div class="rec-match-list">
                      {#each data.recentMatches.slice(0, 5) as match}
                        {@const winner = recentMatchWinner(match)}
                        <div class="rec-match-row" style="--winner-color:{winner?.color ?? '#475569'}">
                          <div class="rec-match-main">
                            <div class="rec-match-winner">
                              <span class="rec-match-winner-label">Câștigător</span>
                              <div class="rec-match-winner-ident">
                                {#if winner?.photo}
                                  <img class="winner-avatar" src={winner.photo} alt={winner?.name} />
                                {/if}
                                <span class="rec-match-winner-name">{winner?.name ?? '—'}</span>
                              </div>
                            </div>
                            <div class="rec-match-players">{recentMatchOpponentSummary(match)}</div>
                          </div>
                          <div class="rec-match-side">
                            <div class="rec-match-side-label">Scor final</div>
                            <div class="rec-match-score">{recentMatchScore(match)}</div>
                            <div class="rec-match-side-date">{recentMatchShortLabel(match)}</div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <div class="rec-card empty">
                      <div class="rec-icon">🗂</div>
                      <div class="rec-body">
                        <div class="rec-label">Ultimele finale</div>
                        <div class="rec-player">Când se termină câteva meciuri, aici apare cine a jucat și scorul final.</div>
                      </div>
                    </div>
                  {/if}

                {:else if scene.type === 'rounds'}
                  <div class="rec-scene-title">Ture memorabile</div>
                  {#if data.highRound?.value}<div class="rec-card hero"><div class="rec-icon">🎯</div><div class="rec-body"><div class="rec-label">Cea mai înaltă tură</div><div class="rec-value">{data.highRound.value}</div><div class="rec-player" style="color:{data.highRound.color}">{data.highRound.name}</div></div></div>{/if}
                  {#if data.highRoundLeaderboard?.length}
                    <div class="triple-lb">
                      {#each data.highRoundLeaderboard.slice(0, 6) as p, i}
                        <div class="triple-row">
                          <span class="triple-rank" style="color:{i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'#475569'}">{i+1}</span>
                          <div class="triple-avatar" style="background:{p.color}">
                            {#if p.photo}
                              <img src={p.photo} alt={p.name} />
                            {:else}
                              {p.name[0].toUpperCase()}
                            {/if}
                          </div>
                          <span class="triple-name">{p.name}</span>
                          <span class="triple-count" style="color:#ffd700">{p.value}</span>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <div class="rec-card empty">
                      <div class="rec-icon">🎯</div>
                      <div class="rec-body">
                        <div class="rec-label">Ture memorabile</div>
                        <div class="rec-player">Panoul se umple după ce strângem suficiente ture înregistrate.</div>
                      </div>
                    </div>
                  {/if}

                {:else if scene.type === 'tons'}
                  <div class="rec-scene-title">Clubul 100+</div>
                  {#if data.most100plus?.count}<div class="rec-card hero"><div class="rec-icon">💯</div><div class="rec-body"><div class="rec-label">Cele mai multe 100+</div><div class="rec-value">{data.most100plus.count}</div><div class="rec-player" style="color:{data.most100plus.color}">{data.most100plus.name}</div></div></div>{/if}
                  {#if data.hundredPlusLeaderboard?.length}
                    <div class="triple-lb">
                      {#each data.hundredPlusLeaderboard.slice(0, 6) as p, i}
                        <div class="triple-row">
                          <span class="triple-rank" style="color:{i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'#475569'}">{i+1}</span>
                          <div class="triple-avatar" style="background:{p.color}">
                            {#if p.photo}
                              <img src={p.photo} alt={p.name} />
                            {:else}
                              {p.name[0].toUpperCase()}
                            {/if}
                          </div>
                          <span class="triple-name">{p.name}</span>
                          <span class="triple-count" style="color:{p.color}">{p.count}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                  {#if data.most180?.count}
                    <div class="rec-card">
                      <div class="rec-icon">⚡</div>
                      <div class="rec-body">
                        <div class="rec-label">Cei mai mulți 180-uri</div>
                        <div class="rec-value">{data.most180.count}</div>
                        <div class="rec-player" style="color:{data.most180.color}">{data.most180.name}</div>
                      </div>
                    </div>
                  {:else if !data.hundredPlusLeaderboard?.length}
                    <div class="rec-card empty">
                      <div class="rec-icon">💯</div>
                      <div class="rec-body">
                        <div class="rec-label">Clubul 100+</div>
                        <div class="rec-player">Încă nu avem suficiente vizite de peste 100 pentru clasamentul complet.</div>
                      </div>
                    </div>
                  {/if}

                {:else if scene.type === 'triples'}
                  <div class="rec-scene-title">Triple grele</div>
                  {#if scene.leaders20?.length}
                    <div class="rec-mini-head">T20 leaders</div>
                    <div class="triple-lb">
                      {#each scene.leaders20.slice(0, 3) as p, i}
                        <div class="triple-row">
                          <span class="triple-rank" style="color:{i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'#475569'}">{i+1}</span>
                          <div class="triple-avatar" style="background:{p.color}">
                            {#if p.photo}
                              <img src={p.photo} alt={p.name} />
                            {:else}
                              {p.name[0].toUpperCase()}
                            {/if}
                          </div>
                          <span class="triple-name">{p.name}</span>
                          <span class="triple-count" style="color:{p.color}">{p.count}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                  {#if scene.leaders19?.length}
                    <div class="rec-mini-head">T19 leaders</div>
                    <div class="triple-lb">
                      {#each scene.leaders19.slice(0, 3) as p, i}
                        <div class="triple-row">
                          <span class="triple-rank" style="color:{i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'#475569'}">{i+1}</span>
                          <div class="triple-avatar" style="background:{p.color}">
                            {#if p.photo}
                              <img src={p.photo} alt={p.name} />
                            {:else}
                              {p.name[0].toUpperCase()}
                            {/if}
                          </div>
                          <span class="triple-name">{p.name}</span>
                          <span class="triple-count" style="color:{p.color}">{p.count}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                  {#if !scene.leaders20?.length && !scene.leaders19?.length}
                    <div class="rec-card empty">
                      <div class="rec-icon">🎯</div>
                      <div class="rec-body">
                        <div class="rec-label">Triple grele</div>
                        <div class="rec-player">Pe măsură ce apar mai multe T20 și T19, pagina asta va prinde viață.</div>
                      </div>
                    </div>
                  {/if}
                {/if}

              </div>
            {/key}

            <!-- scene dots -->
            <div class="rec-dots">
              {#each recScenes as _, i}
                <button class="rec-dot" class:rec-dot-active={i === recSceneIdx} on:click={() => { recSceneIdx = i; startRecCarousel(); }} aria-label="Scene {i+1}"></button>
              {/each}
            </div>
          {/if}
        </div>
      </section>

    </main>
  {/if}

  {#if selectedPlayerId}
    <button class="player-overlay" type="button" on:click={closePlayer} aria-label="Închide profilul"></button>
    <aside class="player-drawer" transition:fly={{ x: 120, duration: 220 }}>
      <div class="player-drawer-head">
        <div>
          <div class="player-drawer-eyebrow">Profil Jucător</div>
          <div class="player-drawer-title">{playerDetail?.player?.name ?? 'Se încarcă…'}</div>
        </div>
        <button class="player-close" type="button" on:click={closePlayer} aria-label="Închide">✕</button>
      </div>

      {#if playerDetailLoading}
        <div class="player-loading">Se încarcă istoricul și statisticile…</div>
      {:else if playerDetailError}
        <div class="player-error">{playerDetailError}</div>
      {:else if playerDetail}
        <div class="player-drawer-body">
          <div class="player-card" style="--pc:{playerDetail.player.color}">
            <div class="player-card-top">
              <div class="player-card-avatar">
                {#if playerDetail.player.photo}
                  <img src={playerDetail.player.photo} alt={playerDetail.player.name} />
                {:else}
                  <span>{initial(playerDetail.player.name)}</span>
                {/if}
              </div>
              <div class="player-card-id">
                <div class="player-card-name">{playerDetail.player.name}</div>
                {#if playerDetail.player.nickname}
                  <div class="player-card-nick">"{playerDetail.player.nickname}"</div>
                {/if}
                <div class="player-card-meta">
                  Ultimul meci: {fmtDate(playerDetail.summary.latest_match_at)}
                </div>
              </div>
            </div>

            <div class="player-stat-grid">
              <div class="player-stat"><span>Meciuri</span><strong>{playerDetail.summary.matches}</strong></div>
              <div class="player-stat"><span>Victorii</span><strong>{playerDetail.summary.wins}</strong></div>
              <div class="player-stat"><span>Înfrângeri</span><strong>{playerDetail.summary.losses}</strong></div>
              <div class="player-stat"><span>Rata victorii</span><strong>{pctStr(playerDetail.summary.wins, playerDetail.summary.matches)}</strong></div>
              <div class="player-stat"><span>Medie 3 săgeți</span><strong>{fmt(playerDetail.stats.avg_3dart)}</strong></div>
              <div class="player-stat"><span>Primele 9 Ø</span><strong>{fmt(playerDetail.stats.avg_first9)}</strong></div>
              <div class="player-stat"><span>Finalizare %</span><strong>{fmt(playerDetail.stats.checkout_pct)}%</strong></div>
              <div class="player-stat"><span>Cel mai bun finish</span><strong>{playerDetail.summary.best_finish || '—'}</strong></div>
              <div class="player-stat"><span>Cea mai înaltă tură</span><strong>{playerDetail.stats.high_round || '—'}</strong></div>
              <div class="player-stat"><span>100+</span><strong>{playerDetail.stats.s100plus}</strong></div>
              <div class="player-stat"><span>140+</span><strong>{playerDetail.stats.s140plus}</strong></div>
              <div class="player-stat"><span>180</span><strong>{playerDetail.stats.s180}</strong></div>
            </div>
          </div>

          {#if playerDetail.stats.awards?.length}
            <div class="player-section">
              <div class="player-section-title">Badge-uri</div>
              <div class="player-awards">
                {#each playerDetail.stats.awards.slice(0, 10) as award}
                  <BadgeToken kind={award.kind} count={award.count} compact />
                {/each}
              </div>
            </div>
          {/if}

          <div class="player-section">
            <div class="player-section-title">Istoric meciuri</div>
            <div class="player-history">
              {#if playerDetail.history?.length}
                {#each playerDetail.history as match}
                  <article class="history-card" class:history-win={match.result === 'win'}>
                    <div class="history-top">
                      <div>
                        <div class="history-code">{match.public_code ?? `Match #${match.match_id}`}</div>
                        <div class="history-opponents">{playerNames(match)}</div>
                      </div>
                      <div class="history-result">{match.result === 'win' ? 'CÂȘTIG' : 'ÎNFRÂNGERE'}</div>
                    </div>
                    <div class="history-meta">
                      <span>{fmtDate(match.ended_at ?? match.started_at ?? match.created_at)}</span>
                      <span>{match.starting_score} · {match.double_out ? 'Double Out' : 'Single Out'}</span>
                      <span>Primul la {match.legs_to_win}</span>
                    </div>
                    <div class="history-stats">
                      <div><span>Scor</span><strong>{match.participants?.map((p) => p.legs_won).sort((a,b)=>b-a).slice(0,2).join(' - ')}</strong></div>
                      <div><span>Medie</span><strong>{fmt(match.match_avg)}</strong></div>
                      <div><span>Cel mai bun finish</span><strong>{match.best_finish || '—'}</strong></div>
                    </div>
                    {#if match.awards?.length}
                      <div class="history-awards">
                        {#each match.awards.slice(0, 6) as award}
                          <BadgeToken kind={award.kind} count={award.count} compact />
                        {/each}
                      </div>
                    {/if}
                  </article>
                {/each}
              {:else}
                <div class="player-empty">Nu există meciuri finalizate pentru acest jucător.</div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </aside>
  {/if}

  {#if !matchSetup}
    <!-- ── Ticker ──────────────────────────────────────────── -->
    <footer class="ticker-bar">
      <div class="ticker-label">GHID INSIGNE</div>
      <div class="ticker-track">
        <div class="ticker-inner">
          <span class="ticker-text">
            {#each tickerParts as part, i}
              <span class="ticker-part">
                {#if part.kind}
                  <BadgeToken kind={part.kind} iconOnly />
                {/if}
                <span class="ticker-copy">
                  <span class="ticker-badge-name">{part.label}</span>
                  <span class="ticker-badge-desc">{part.description}</span>
                </span>
              </span>{#if i < tickerParts.length - 1}<span class="ticker-sep">·</span>{/if}
            {/each}
            &nbsp;&nbsp;&nbsp;
            {#each tickerParts as part, i}
              <span class="ticker-part">
                {#if part.kind}
                  <BadgeToken kind={part.kind} iconOnly />
                {/if}
                <span class="ticker-copy">
                  <span class="ticker-badge-name">{part.label}</span>
                  <span class="ticker-badge-desc">{part.description}</span>
                </span>
              </span>{#if i < tickerParts.length - 1}<span class="ticker-sep">·</span>{/if}
            {/each}
          </span>
        </div>
      </div>
    </footer>
  {/if}

</div>
{/if}

<style>
  /* ── Shell ─────────────────────────────────────────────── */
  :global(html) { font-size: 120%; }

  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: linear-gradient(160deg, #06060f 0%, #0a0a1c 60%, #06060f 100%);
  }

  /* ── Topbar ────────────────────────────────────────────── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    height: 52px;
    background: rgba(0, 0, 0, 0.5);
    border-bottom: 1px solid rgba(0, 212, 170, 0.18);
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .brand-dart { font-size: 1.3rem; }
  .brand-name {
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #fff;
  }
  .topbar-center {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: min(56vw, 860px);
    display: flex;
    justify-content: center;
  }

  .topbar-match {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
    width: 100%;
    height: 36px;
    padding: 0 0.7rem 0 0;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.2);
  }
  .topbar-match-accent {
    width: 4px;
    align-self: stretch;
    flex: 0 0 4px;
  }
  .topbar-match-players {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    overflow: hidden;
  }
  .topbar-match-player {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    min-width: 0;
    flex: 0 1 auto;
    color: #e2e8f0;
    font-size: 0.58rem;
    font-weight: 800;
  }
  .topbar-match-player span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .topbar-match-avatar {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 999px;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--player-color, #475569) 68%, #0f172a 32%);
    color: white;
    font-size: 0.58rem;
    font-weight: 800;
    flex: 0 0 auto;
  }
  .topbar-match-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .topbar-match-more {
    color: #94a3b8;
    font-size: 0.56rem;
    font-weight: 900;
    letter-spacing: 0.06em;
  }
  .topbar-match-meta {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex: 0 0 auto;
    color: #94a3b8;
    font-size: 0.56rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .topbar-match-meta span:last-child {
    padding: 0.16rem 0.38rem;
    border-radius: 999px;
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(239, 68, 68, 0.28);
    color: #f87171;
  }
  .topbar-match-meta span.topbar-match-status-waiting {
    background: rgba(245, 158, 11, 0.14);
    border-color: rgba(245, 158, 11, 0.26);
    color: #fbbf24;
  }

  .live-pill {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 0.25rem 0.7rem;
    border-radius: 20px;
    text-transform: uppercase;
  }
  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ef4444;
    animation: pulse-dot 1.2s ease infinite;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .idle-pill {
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: #475569;
    text-transform: uppercase;
  }

  .clock {
    font-size: 1.5rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #00d4aa;
    letter-spacing: 0.05em;
  }

  /* ── Loading ───────────────────────────────────────────── */
  .loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
  }
  .loading-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00d4aa;
    margin: 0 3px;
    animation: bounce 1.2s ease infinite;
  }
  .loading-dot:nth-child(2) { animation-delay: 0.2s; }
  .loading-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  /* ── Main 3-col grid ───────────────────────────────────── */
  .main {
    display: grid;
    grid-template-columns: 340px 1fr 340px;
    flex: 1;
    overflow: hidden;
    gap: 1px;
    background: rgba(255, 255, 255, 0.04);
  }

  /* ── Panels ────────────────────────────────────────────── */
  .panel {
    background: #06060f;
    padding: 0.9rem 0.8rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel-left {
    min-height: 0;
  }
  .panel-center {
    background: #07071a;
    padding: 0.9rem 1rem;
  }
  .panel-right {
    background: #06060f;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    color: #00d4aa;
    text-transform: uppercase;
    padding-bottom: 0.55rem;
    border-bottom: 1px solid rgba(0, 212, 170, 0.15);
    margin-bottom: 0.7rem;
    flex-shrink: 0;
  }
  .panel-title-icon { font-size: 0.9rem; }

  .spotlight-counter {
    margin-left: auto;
    font-size: 0.55rem;
    color: #475569;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    color: #334155;
    font-style: italic;
  }

  /* ── Leaderboard ───────────────────────────────────────── */
  .leaderboard {
    flex: 1 1 auto;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  .lb-scroll-track {
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
    will-change: transform;
  }

  .lb-loop-gap {
    height: 0;
    flex-shrink: 0;
  }

  .lb-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.28rem 0.5rem;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.055);
    width: 100%;
    color: inherit;
    text-align: left;
    cursor: pointer;
    appearance: none;
    font: inherit;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }
  .lb-row:hover {
    transform: translateX(4px);
    border-color: rgba(0, 212, 170, 0.22);
    background: rgba(0, 212, 170, 0.05);
  }
  .lb-row:focus-visible {
    outline: 2px solid rgba(0, 212, 170, 0.4);
    outline-offset: 2px;
  }

  .lb-rank {
    font-size: 0.92rem;
    font-weight: 900;
    min-width: 20px;
    text-align: center;
    flex-shrink: 0;
  }

  .lb-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: var(--pc, #334155);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 800;
    color: #fff;
  }
  .lb-avatar img { width: 100%; height: 100%; object-fit: cover; }

  .lb-body {
    flex: 1;
    min-width: 0;
  }

  .lb-name {
    font-size: 0.92rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 0.05rem;
  }

  .lb-chips {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .chip {
    font-size: 0.62rem;
    font-weight: 800;
    padding: 0.07rem 0.28rem;
    border-radius: 3px;
    letter-spacing: 0.03em;
  }
  .chip-legs{ background: rgba(248,180,0,0.12);  color: #f8b400; }
  .chip-180 { background: rgba(139,92,246,0.12); color: #a78bfa; }

  .lb-big-avg {
    font-size: 1.04rem;
    font-weight: 900;
    color: #00d4aa;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    min-width: 54px;
    text-align: right;
  }

  /* Win-rate sub-board */
  .sub-board {
    margin-top: auto;
    padding-top: 0.75rem;
    flex: 0 0 auto;
    overflow: hidden;
    border-top: 1px solid rgba(255,255,255,0.05);
  }

  .sub-board-title {
    font-size: 0.52rem;
    font-weight: 900;
    letter-spacing: 0.2em;
    color: #f59e0b;
    text-transform: uppercase;
    margin-bottom: 0.42rem;
  }

  .sub-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.24rem;
  }

  .sub-rank {
    font-size: 0.55rem;
    font-weight: 700;
    color: #475569;
    width: 12px;
    text-align: center;
    flex-shrink: 0;
  }

  .sub-bar-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .sub-name {
    font-size: 0.6rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub-bar-bg {
    height: 3px;
    background: rgba(255,255,255,0.08);
    border-radius: 2px;
    overflow: hidden;
  }

  .sub-bar-fill {
    display: block;
    height: 100%;
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  .sub-pct {
    font-size: 0.6rem;
    font-weight: 800;
    color: #f59e0b;
    min-width: 28px;
    text-align: right;
    flex-shrink: 0;
  }

  /* ── Spotlight ─────────────────────────────────────────── */
  .spotlight {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    overflow: hidden;
  }

  .sp-hero {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 0.9rem;
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.07);
    border-left: 4px solid var(--pc, #00d4aa);
    border-radius: 0 8px 8px 0;
    flex-shrink: 0;
    width: 100%;
    text-align: left;
    color: inherit;
    appearance: none;
    cursor: pointer;
    font: inherit;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }
  .sp-hero:hover {
    transform: translateY(-2px);
    background: rgba(255,255,255,0.05);
    border-color: rgba(0, 212, 170, 0.2);
  }
  .sp-hero:focus-visible {
    outline: 2px solid rgba(0, 212, 170, 0.42);
    outline-offset: 2px;
  }

  .sp-avatar-wrap { position: relative; flex-shrink: 0; }

  .sp-avatar {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }

  .sp-avatar-fb {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--pc, #334155);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    font-weight: 900;
    color: #fff;
  }

  .sp-ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 3px solid var(--pc, #475569);
    pointer-events: none;
  }

  .sp-identity { flex: 1; min-width: 0; }

  .sp-name {
    font-size: 1.35rem;
    font-weight: 900;
    letter-spacing: 0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sp-nickname {
    font-size: 0.75rem;
    color: #00d4aa;
    font-style: italic;
    margin-top: 0.1rem;
  }

  .sp-period {
    font-size: 0.55rem;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-top: 0.3rem;
  }

  .sp-hero {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.9rem;
    padding: 1.2rem 1rem 1rem;
    border-left: none;
    border-top: 4px solid var(--pc, #00d4aa);
    border-radius: 18px;
    background:
      radial-gradient(circle at top center, color-mix(in srgb, var(--pc, #00d4aa) 14%, transparent), transparent 45%),
      rgba(255,255,255,0.035);
    text-align: center;
  }
  .sp-avatar-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .sp-avatar,
  .sp-avatar-fb {
    width: 168px;
    height: 168px;
    border-radius: 50%;
  }
  .sp-avatar {
    object-fit: cover;
    display: block;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
  }
  .sp-avatar-fb {
    background: var(--pc, #334155);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3.4rem;
    font-weight: 900;
    color: #fff;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
  }
  .sp-ring {
    inset: -6px;
    border-width: 4px;
  }
  .sp-identity {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .sp-name {
    font-size: 1.8rem;
    line-height: 1.05;
    text-align: center;
  }
  .sp-nickname {
    font-size: 0.92rem;
    margin-top: 0.18rem;
  }
  .sp-period {
    font-size: 0.58rem;
    margin-top: 0.38rem;
  }
  .sp-hero-badges {
    margin-top: 1.05rem;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.62rem;
  }
  .sp-hero-badges :global(.badge-token) {
    min-height: 0;
    padding: 0;
    gap: 0.55rem;
    background: transparent;
    border: none;
  }
  .sp-hero-badges :global(.badge-art-shell) {
    width: 3.2rem;
    height: 3.2rem;
  }
  .sp-hero-badges :global(.badge-label),
  .sp-hero-badges :global(.badge-count) {
    font-size: 0.9rem;
  }
  .sp-headline-stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.58rem;
    flex-shrink: 0;
  }
  .sp-highlight-card {
    display: grid;
    gap: 0.34rem;
    padding: 0.8rem 0.85rem;
    border-radius: 16px;
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
  }
  .sp-highlight-label {
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #7c8aa5;
  }
  .sp-highlight-card strong {
    font-size: 1.45rem;
    line-height: 1;
    font-weight: 900;
    color: #f8fbff;
    font-variant-numeric: tabular-nums;
  }
  .sp-rank-gold { color: #f6d365; }
  .sp-rank-silver { color: #d6deea; }
  .sp-rank-bronze { color: #d79a6a; }
  .sp-rank-chip {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    padding: 0.2rem 0.45rem;
    border-radius: 999px;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: 1px solid transparent;
  }
  .sp-rank-chip.gold {
    color: #f6d365;
    background: rgba(246, 211, 101, 0.1);
    border-color: rgba(246, 211, 101, 0.22);
  }
  .sp-rank-chip.silver {
    color: #d6deea;
    background: rgba(214, 222, 234, 0.1);
    border-color: rgba(214, 222, 234, 0.2);
  }
  .sp-rank-chip.bronze {
    color: #d79a6a;
    background: rgba(215, 154, 106, 0.1);
    border-color: rgba(215, 154, 106, 0.2);
  }
  .sp-type-bars {
    display: grid;
    gap: 0.45rem;
    padding: 0.9rem 1rem;
    border-radius: 16px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    flex-shrink: 0;
  }
  .sp-type-bar-row {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) 48px;
    align-items: center;
    gap: 0.55rem;
  }
  .sp-type-label {
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .sp-type-label.single { color: #38bdf8; }
  .sp-type-label.double { color: #34d399; }
  .sp-type-label.triple { color: #fbbf24; }
  .sp-type-track {
    height: 10px;
    border-radius: 999px;
    background: rgba(255,255,255,0.07);
    overflow: hidden;
  }
  .sp-type-fill {
    height: 100%;
    border-radius: inherit;
    transition: width 0.4s ease;
  }
  .sp-type-fill.single { background: linear-gradient(90deg, #0ea5e9, #38bdf8); }
  .sp-type-fill.double { background: linear-gradient(90deg, #10b981, #34d399); }
  .sp-type-fill.triple { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
  .sp-type-pct {
    font-size: 0.72rem;
    font-weight: 900;
    color: #e2e8f0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* Segments */
  .sp-segments {
    flex-shrink: 0;
  }

  .sp-seg-label {
    font-size: 0.52rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    color: #475569;
    text-transform: uppercase;
    margin-bottom: 0.4rem;
  }

  .sp-recent-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.45rem;
  }

  .player-awards,
  .history-awards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .sp-recent-card {
    display: grid;
    gap: 0.18rem;
    padding: 0.62rem 0.7rem;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.035);
  }
  .sp-recent-card-featured {
    padding: 0.82rem 0.9rem;
  }
  .sp-recent-win {
    border-color: rgba(34, 197, 94, 0.24);
    background: rgba(34, 197, 94, 0.08);
  }
  .sp-recent-loss {
    border-color: rgba(239, 68, 68, 0.2);
    background: rgba(239, 68, 68, 0.07);
  }
  .sp-recent-result {
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #f8fbff;
  }
  .sp-recent-opponents {
    font-size: 0.78rem;
    font-weight: 700;
    color: #dbe7f5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sp-recent-score {
    font-size: 0.62rem;
    font-weight: 700;
    color: #c8d4e5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sp-recent-meta {
    font-size: 0.58rem;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sp-recent-winner-line,
  .sp-recent-leftovers {
    font-size: 0.62rem;
    font-weight: 800;
    color: #dbe7f5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sp-recent-winner-name {
    color: #f6d365;
    font-weight: 900;
    margin-left: 0.24rem;
    text-shadow: 0 0 12px rgba(246, 211, 101, 0.18);
  }
  .sp-recent-leftovers {
    color: #c8d4e5;
  }

  /* Spotlight dots */
  .sp-dots {
    display: flex;
    justify-content: center;
    gap: 0.35rem;
    margin-top: auto;
    padding-top: 0.2rem;
    flex-shrink: 0;
  }

  .sp-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255,255,255,0.18);
    border: none;
    cursor: pointer;
    padding: 0;
    transition: background 0.2s, width 0.2s, border-radius 0.2s;
  }
  .sp-dot-active {
    background: #00d4aa;
    width: 18px;
    border-radius: 3px;
  }

  /* ── Right panel carousel ──────────────────────────────── */
  .rec-carousel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  .rec-scene {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    overflow: hidden;
    padding-right: 2px;
    position: absolute;
    inset: 0;
    padding-bottom: 1.2rem;
  }

  .rec-scene-title {
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: #00d4aa;
    text-transform: uppercase;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid rgba(0,212,170,0.15);
    flex-shrink: 0;
  }
  .rec-mini-head {
    margin-top: 0.2rem;
    font-size: 0.52rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #64748b;
  }
  .rec-match-list {
    display: grid;
    gap: 0.38rem;
  }
  .rec-match-row {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.58rem 0.68rem;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--winner-color, #475569) 14%, rgba(255,255,255,0.03)), rgba(255,255,255,0.02)),
      radial-gradient(circle at top left, color-mix(in srgb, var(--winner-color, #475569) 20%, transparent) 0%, transparent 56%);
    border: 1px solid color-mix(in srgb, var(--winner-color, #475569) 34%, rgba(255,255,255,0.08));
    border-radius: 14px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .rec-match-main {
    min-width: 0;
    display: grid;
    gap: 0.14rem;
  }
  .rec-match-winner {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.28rem 0.42rem;
    min-width: 0;
  }
  .rec-match-winner-label {
    font-size: 0.5rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--winner-color, #475569) 82%, white);
  }
  .rec-match-winner-name {
    font-size: 0.9rem;
    font-weight: 900;
    color: #f8fbff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rec-match-players {
    font-size: 0.58rem;
    font-weight: 800;
    color: #d4deec;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rec-match-side {
    flex-shrink: 0;
    display: grid;
    justify-items: end;
    align-content: center;
    gap: 0.08rem;
    min-width: 6.3rem;
    padding-left: 0.45rem;
    border-left: 1px solid rgba(255,255,255,0.06);
  }
  .rec-match-side-label {
    font-size: 0.5rem;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #64748b;
  }
  .rec-match-score {
    flex-shrink: 0;
    font-size: 0.82rem;
    font-weight: 900;
    color: #e2e8f0;
    font-variant-numeric: tabular-nums;
    text-align: right;
    line-height: 1.2;
  }
  .rec-match-side-date {
    font-size: 0.54rem;
    color: #94a3b8;
    text-align: right;
    white-space: nowrap;
  }

  /* Triple leaderboard rows */
  .triple-lb { display: flex; flex-direction: column; gap: 0.25rem; }
  .triple-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: rgba(255,255,255,0.025);
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.05);
  }
  .triple-rank { font-size: 0.82rem; font-weight: 900; min-width: 18px; text-align: center; flex-shrink: 0; }
  .triple-avatar {
    width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.7rem; font-weight: 800; color: #fff;
    overflow: hidden;
  }
  .triple-avatar img {
    width: 100%; height: 100%; object-fit: cover;
  }
  .rec-match-winner-ident {
    display: flex; align-items: center; gap: 0.4rem;
  }
  .winner-avatar {
    width: 22px; height: 22px; border-radius: 50%; object-fit: cover;
  }
  .triple-name { flex: 1; font-size: 0.82rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .triple-count { font-size: 1rem; font-weight: 900; font-variant-numeric: tabular-nums; flex-shrink: 0; }

  /* Scene indicator dots */
  .rec-dots {
    position: absolute;
    bottom: 0.35rem;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 0.3rem;
    flex-shrink: 0;
  }
  .rec-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: rgba(255,255,255,0.15);
    border: none; padding: 0; cursor: pointer;
    transition: background 0.2s;
  }
  .rec-dot-active { background: #00d4aa; }

  .totals-card {
    padding: 0.55rem 0.7rem;
    background: rgba(0,212,170,0.06);
    border: 1px solid rgba(0,212,170,0.14);
    border-radius: 7px;
    flex-shrink: 0;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.12rem 0;
  }
  .totals-label { font-size: 0.58rem; color: #94a3b8; }
  .totals-val { font-size: 0.82rem; font-weight: 800; color: #00d4aa; font-variant-numeric: tabular-nums; }

  .rec-card {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.65rem;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.065);
    border-radius: 7px;
    flex-shrink: 0;
  }
  .rec-card.hero {
    padding: 0.95rem 0.95rem;
    background: linear-gradient(135deg, rgba(0,212,170,0.08), rgba(255,255,255,0.03));
    border-color: rgba(0,212,170,0.18);
  }
  .rec-icon { font-size: 1.2rem; flex-shrink: 0; }
  .rec-body { flex: 1; min-width: 0; }
  .rec-label {
    font-size: 0.52rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #475569;
    margin-bottom: 0.05rem;
  }
  .rec-value {
    font-size: 1.05rem;
    font-weight: 900;
    color: #f59e0b;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .rec-player {
    font-size: 0.62rem;
    font-weight: 700;
    margin-top: 0.08rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .player-overlay {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.68);
    backdrop-filter: blur(6px);
    z-index: 30;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .player-drawer {
    position: fixed;
    top: 0;
    right: 0;
    width: min(560px, 92vw);
    height: 100vh;
    background: linear-gradient(180deg, #07111f 0%, #050b14 100%);
    border-left: 1px solid rgba(0, 212, 170, 0.18);
    box-shadow: -24px 0 60px rgba(0, 0, 0, 0.4);
    z-index: 31;
    display: flex;
    flex-direction: column;
  }

  .player-drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem 0.9rem;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .player-drawer-eyebrow {
    font-size: 0.56rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #00d4aa;
    font-weight: 900;
  }

  .player-drawer-title {
    margin-top: 0.25rem;
    font-size: 1.2rem;
    font-weight: 900;
    color: #f8fafc;
  }

  .player-close {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.04);
    color: #e2e8f0;
    cursor: pointer;
    font: inherit;
  }

  .player-loading,
  .player-error,
  .player-empty {
    padding: 1rem 1.1rem;
    color: #94a3b8;
    font-size: 0.78rem;
  }

  .player-error {
    color: #fca5a5;
  }

  .player-drawer-body {
    flex: 1;
    overflow: auto;
    padding: 1rem 1.1rem 1.2rem;
    display: grid;
    gap: 1rem;
  }

  .player-card,
  .player-section {
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
  }

  .player-card {
    padding: 0.95rem;
    border-top: 3px solid var(--pc, #00d4aa);
  }

  .player-card-top {
    display: flex;
    gap: 0.9rem;
    align-items: center;
    margin-bottom: 0.9rem;
  }

  .player-card-avatar {
    width: 62px;
    height: 62px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--pc, #334155);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 1.3rem;
    font-weight: 900;
    flex-shrink: 0;
  }

  .player-card-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .player-card-name {
    font-size: 1.05rem;
    font-weight: 900;
    color: #f8fafc;
  }

  .player-card-nick {
    margin-top: 0.2rem;
    color: #67e8f9;
    font-size: 0.72rem;
    font-style: italic;
  }

  .player-card-meta {
    margin-top: 0.35rem;
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #64748b;
  }

  .player-stat-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .player-stat {
    padding: 0.6rem 0.65rem;
    border-radius: 10px;
    background: rgba(255,255,255,0.035);
    display: grid;
    gap: 0.2rem;
  }

  .player-stat span {
    font-size: 0.56rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 800;
  }

  .player-stat strong {
    color: #f8fafc;
    font-size: 0.88rem;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .player-section {
    padding: 0.95rem;
  }

  .player-section-title {
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #00d4aa;
    margin-bottom: 0.7rem;
  }

  .player-history {
    display: grid;
    gap: 0.7rem;
  }

  .history-card {
    padding: 0.8rem;
    border-radius: 12px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
  }

  .history-win {
    border-color: rgba(16, 185, 129, 0.25);
    background: rgba(16, 185, 129, 0.05);
  }

  .history-top,
  .history-meta,
  .history-stats {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .history-top {
    align-items: center;
    margin-bottom: 0.35rem;
  }

  .history-code {
    font-size: 0.8rem;
    font-weight: 900;
    color: #f8fafc;
  }

  .history-opponents {
    margin-top: 0.15rem;
    color: #94a3b8;
    font-size: 0.66rem;
  }

  .history-result {
    font-size: 0.58rem;
    padding: 0.28rem 0.48rem;
    border-radius: 999px;
    font-weight: 900;
    letter-spacing: 0.14em;
    color: #f8fafc;
    background: rgba(239, 68, 68, 0.16);
  }

  .history-win .history-result {
    background: rgba(16, 185, 129, 0.18);
    color: #bbf7d0;
  }

  .history-meta {
    color: #64748b;
    font-size: 0.6rem;
    margin-bottom: 0.65rem;
  }

  .history-stats > div {
    min-width: 90px;
    display: grid;
    gap: 0.15rem;
  }

  .history-stats span {
    font-size: 0.54rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 800;
  }

  .history-stats strong {
    color: #f8fafc;
    font-size: 0.82rem;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .history-awards {
    margin-top: 0.6rem;
  }


  /* ── Ticker ────────────────────────────────────────────── */
  .ticker-bar {
    display: flex;
    align-items: stretch;
    height: 64px;
    background: rgba(0, 212, 170, 0.06);
    border-top: 1px solid rgba(0, 212, 170, 0.16);
    overflow: hidden;
    flex-shrink: 0;
  }

  .ticker-label {
    background: #00d4aa;
    color: #000;
    font-size: 0.5rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    padding: 0 0.9rem;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ticker-track {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .ticker-inner {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
  }

  .ticker-text {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    animation: ticker-scroll 360s linear infinite;
    font-size: 0.62rem;
    color: #94a3b8;
  }

  .ticker-part {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    color: #cbd5e1;
  }

  /* icoana BadgeToken umple bara (64px - 2×6px padding) */
  .ticker-part :global(.badge-token) {
    height: 52px;
    gap: 0;
  }
  .ticker-part :global(.badge-art-shell) {
    width: 52px;
    height: 52px;
  }

  .ticker-copy {
    display: inline-flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .ticker-badge-name {
    color: #f8fafc;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.02em;
    line-height: 1;
    white-space: nowrap;
  }

  .ticker-badge-desc {
    color: #94a3b8;
    font-size: 0.58rem;
    line-height: 1;
    white-space: nowrap;
  }

  .ticker-sep { color: #00d4aa; margin: 0 0.6rem; font-weight: 700; }

  @keyframes ticker-scroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }

  /* ── Match setup overlay ────────────────────────────────── */
  .setup-shell {
    flex: 1;
    min-height: 0;
    padding: 1.5rem 2rem 1.5rem;
    background:
      radial-gradient(circle at top left, rgba(91, 213, 252, 0.15), transparent 30%),
      radial-gradient(circle at top right, rgba(255, 179, 177, 0.15), transparent 26%),
      linear-gradient(180deg, #0f1124 0%, #090b17 100%);
  }
  .setup-stage { height: 100%; display: flex; flex-direction: column; gap: 1.25rem; min-height: 0; }
  .setup-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
  .setup-kicker { color: #5bd5fc; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; margin-bottom: 0.45rem; }
  .setup-header h1 { font-size: 2.25rem; line-height: 1; color: #fff; font-weight: 800; }
  .setup-summary { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.65rem; }
  .setup-summary span { padding: 0.5rem 0.8rem; border-radius: 999px; border: 1px solid rgba(91, 213, 252, 0.18); background: rgba(25, 28, 52, 0.9); color: #dfe7ff; font-size: 0.78rem; font-weight: 700; }
  .setup-board { flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 1rem; }
  .setup-zone {
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(10, 13, 28, 0.68);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .setup-zone-selected {
    background:
      radial-gradient(circle at top left, rgba(91, 213, 252, 0.16), transparent 45%),
      linear-gradient(160deg, rgba(18, 24, 46, 0.98), rgba(10, 12, 26, 0.96));
  }
  .setup-zone-available {
    background: rgba(8, 11, 24, 0.82);
    flex: 0 0 auto;
  }
  .setup-zone-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.74rem 0.95rem 0.62rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .setup-zone-kicker {
    color: #5bd5fc;
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .setup-zone-title {
    margin-top: 0.16rem;
    color: #f8fbff;
    font-size: 0.88rem;
    font-weight: 800;
  }
  .setup-zone-count {
    min-width: 2.4rem;
    height: 2.4rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: rgba(91, 213, 252, 0.12);
    border: 1px solid rgba(91, 213, 252, 0.22);
    color: #dff6ff;
    font-size: 0.95rem;
    font-weight: 900;
  }
  .setup-selected-strip {
    padding: 0.72rem 0.95rem 0.8rem;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: 0.62rem;
    overflow: hidden;
    min-height: 0;
  }
  .setup-empty-state {
    min-height: 1.5rem;
  }
  .setup-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.56rem;
    overflow: hidden;
    padding: 0.62rem 0.95rem 0.72rem;
  }
  .setup-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.58rem;
    padding: 0.7rem 0.75rem 0.72rem;
    border-radius: 18px;
    background: rgba(23, 26, 48, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease, filter 0.18s ease;
    will-change: transform;
    min-height: 0;
  }
  .setup-grid.has-selection .setup-card { opacity: 0.72; filter: saturate(0.8); }
  .setup-card-selected {
    border-color: color-mix(in srgb, var(--player-color, #5bd5fc) 82%, white);
    box-shadow: 0 12px 28px rgba(0,0,0,0.2), 0 0 0 2px color-mix(in srgb, var(--player-color, #5bd5fc) 45%, transparent), 0 0 26px color-mix(in srgb, var(--player-color, #5bd5fc) 18%, transparent);
    transform: translateY(-1px);
    background: linear-gradient(160deg, rgba(23,26,48,0.98), color-mix(in srgb, var(--player-color, #5bd5fc) 24%, rgba(23,26,48,0.98)));
    opacity: 1;
    filter: none;
  }
  .setup-selected-chip { position: absolute; top: 0.42rem; right: 2.5rem; padding: 0.18rem 0.38rem; border-radius: 999px; background: color-mix(in srgb, var(--player-color, #5bd5fc) 88%, #0d1020); color: #fff; font-size: 0.48rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; z-index: 1; }
  .setup-card-top { display: flex; align-items: center; gap: 0.56rem; min-width: 0; padding-top: 0.62rem; }
  .setup-avatar {
    width: 54px;
    height: 54px;
    border-radius: 999px;
    background: var(--player-color, #5bd5fc);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color: #fff;
    font-size: 1.3rem;
    font-weight: 800;
    flex-shrink: 0;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.24), 0 6px 16px rgba(0,0,0,0.22);
  }
  .setup-card-compact {
    width: 58px;
    min-width: 58px;
    height: 58px;
    padding: 0;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: transparent;
    border: none;
    box-shadow: none;
    opacity: 0.92;
    filter: none;
  }
  .setup-avatar-compact {
    width: 58px;
    height: 58px;
    font-size: 1.3rem;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 5px 12px rgba(0,0,0,0.18);
  }
  .setup-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .setup-ident { min-width: 0; flex: 1; }
  .setup-name { font-size: 0.86rem; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .setup-meta { margin-top: 0.12rem; color: #8f97c5; font-size: 0.56rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .setup-order { width: 26px; height: 26px; border-radius: 50%; background: color-mix(in srgb, var(--player-color, #5bd5fc) 80%, #10132a); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 0.78rem; flex-shrink: 0; }
  .setup-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem; }
  .setup-stat { border-radius: 11px; background: rgba(8, 11, 22, 0.58); border: 1px solid rgba(255, 255, 255, 0.06); padding: 0.42rem 0.46rem; min-width: 0; }
  .setup-stat span { display: block; color: #7882b8; font-size: 0.43rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; margin-bottom: 0.14rem; }
  .setup-stat strong { font-size: 0.76rem; font-weight: 800; color: #eef4ff; line-height: 1.05; }
</style>

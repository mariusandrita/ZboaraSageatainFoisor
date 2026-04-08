<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { createWsClient } from '../../shared/ws-client.js';
  import Lobby from './screens/Lobby.svelte';
  import Match from './screens/Match.svelte';
  import Celebration from './screens/Celebration.svelte';

  let ws;
  let connected = false;
  let matchState = null;
  let turnState  = null;
  let celebration = null; // { kind, playerName, value }
  let celebTimer  = null;

  // Instant dart flash
  let dartFlash = null;
  let dartTimer = null;

  function showCelebration(c) {
    celebration = c;
    clearTimeout(celebTimer);
    celebTimer = setTimeout(() => { celebration = null; }, 3500);
  }

  function showDartFlash(dart, players) {
    if (!dart || dart.busted) return;
    const player = players?.find(p => p.id === dart.player_id) ?? null;
    let label = null;
    let color = '#fff';

    if (dart.segment === 25 && dart.multiplier === 2) {
      label = 'BULL! 🎯'; color = '#4caf50';
    } else if (dart.segment === 25) {
      label = '25'; color = '#4caf50';
    } else if (dart.multiplier === 3) {
      label = `T${dart.segment}`; color = '#ffd700';
    } else if (dart.multiplier === 2) {
      label = `D${dart.segment}`; color = '#5bd5fc';
    }

    if (!label) return;
    clearTimeout(dartTimer);
    dartFlash = { label, color, score: dart.score_value, player: player?.name };
    dartTimer = setTimeout(() => { dartFlash = null; }, 1800);
  }

  async function fetchLiveMatch() {
    try {
      const res = await fetch('/api/matches?status=live');
      const list = await res.json();
      if (list.length > 0) {
        const res2 = await fetch(`/api/matches/${list[0].id}`);
        const full = await res2.json();
        matchState = full;
        turnState  = full.turnState ?? null;
        ws.join(full.id, 'tv');
      }
    } catch (e) { console.error(e); }
  }

  onMount(() => {
    ws = createWsClient();

    ws.socket.on('connect', async () => {
      connected = true;
      await fetchLiveMatch();
    });
    ws.socket.on('disconnect', () => { connected = false; });

    ws.onMatchStarted(async () => {
      await fetchLiveMatch();
    });

    ws.onMatchState((state) => {
      if (state.status !== 'live') {
        matchState = null;
        turnState  = null;
      } else {
        matchState = state;
        turnState  = state.turnState ?? null;
      }
    });

    ws.onDartAdded((dart, ts) => {
      turnState = ts;
      showDartFlash(dart, matchState?.players);
    });
    ws.onTurnEnded((ts)     => { turnState = ts; });

    ws.onLegWon(({ matchState: ms }) => {
      matchState = ms;
      turnState  = ms.turnState ?? null;
    });

    ws.onMatchWon(({ matchId, winnerId }) => {
      const winner = matchState?.players?.find((p) => p.id === winnerId);
      showCelebration({ kind: 'highFinish', playerName: winner?.name ?? '', value: '🏆' });
      setTimeout(() => {
        matchState = null;
        turnState  = null;
      }, 5000);
    });

    ws.onCelebration(({ kind, playerId, value }) => {
      const player = matchState?.players?.find((p) => p.id === playerId);
      showCelebration({ kind, playerName: player?.name ?? '', value });
    });

    ws.onMatchPaused(() => {
      matchState = null;
      turnState  = null;
      celebration = null;
      dartFlash   = null;
    });
  });

  onDestroy(() => {
    clearTimeout(celebTimer);
    clearTimeout(dartTimer);
    ws?.disconnect();
  });
</script>

{#if celebration}
  <Celebration kind={celebration.kind} playerName={celebration.playerName} value={celebration.value} />
{/if}

{#if dartFlash}
  <div
    class="dart-flash"
    style="--fc:{dartFlash.color}"
    in:fly={{ x: 40, duration: 200 }}
    out:fade={{ duration: 400 }}
  >
    <span class="df-label">{dartFlash.label}</span>
    <span class="df-score">= {dartFlash.score}</span>
    {#if dartFlash.player}<span class="df-player">{dartFlash.player}</span>{/if}
  </div>
{/if}

{#if matchState}
  <Match {matchState} {turnState} />
{:else}
  <Lobby {connected} />
{/if}

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html, body) { height: 100%; overflow: hidden; background: #0d0d1a; color: #fff; }

  .dart-flash {
    position: fixed; top: 3.5rem; right: 1.5rem; z-index: 50;
    background: color-mix(in srgb, var(--fc) 15%, #0d0d1a);
    border: 2px solid var(--fc);
    border-radius: 16px; padding: 0.75rem 1.25rem;
    display: flex; flex-direction: column; align-items: center; gap: 0.1rem;
    min-width: 100px; text-align: center;
    box-shadow: 0 0 20px color-mix(in srgb, var(--fc) 40%, transparent);
  }
  .df-label {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.8rem; font-weight: 900; color: var(--fc);
    line-height: 1;
  }
  .df-score {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1rem; font-weight: 700; color: #fff; opacity: 0.8;
  }
  .df-player {
    font-size: 0.7rem; color: #888; margin-top: 0.15rem;
  }
</style>

<script>
  import { onMount, onDestroy, setContext } from 'svelte';
  import { screen, match, turnState, players, connected, resetMatch } from './stores/match.js';
  import { createWsClient } from '../../shared/ws-client.js';
  import Home from './screens/Home.svelte';
  import NewMatch from './screens/NewMatch.svelte';
  import ScoreEntry from './screens/ScoreEntry.svelte';
  import Players from './screens/Players.svelte';
  import MatchSummary from './screens/MatchSummary.svelte';

  let summaryMatchId = null;

  let ws = null;

  // Context is set at init time; ws is accessed via closure so it's always current
  setContext('ws', { get: () => ws });

  function applyMatchState(full) {
    match.set(full);
    turnState.set(full?.turnState ?? null);
  }

  async function loadPlayers() {
    try {
      const res = await fetch('/api/players');
      players.set(await res.json());
    } catch (e) { console.error('Failed to load players', e); }
  }

  async function handleResume(full) {
    try {
      const res = await fetch(`/api/matches/${full.id}/resume`, { method: 'POST' });
      if (res.ok) {
        full = await res.json();
      }
    } catch (e) {
      console.error('Failed to resume match on TV', e);
    }

    applyMatchState(full);
    ws?.join(full.id, 'controller');
    screen.set('score');
  }

  async function refreshMatch(matchId) {
    if (!matchId) return null;

    try {
      const res = await fetch(`/api/matches/${matchId}`);
      if (!res.ok) throw new Error(`failed to refresh match ${matchId}`);
      const full = await res.json();
      applyMatchState(full);
      return full;
    } catch (e) {
      console.error('Failed to refresh match state', e);
      return null;
    }
  }

  onMount(async () => {
    ws = createWsClient();

    ws.socket.on('connect',    () => connected.set(true));
    ws.socket.on('disconnect', () => connected.set(false));

    ws.onMatchState((state) => {
      applyMatchState(state);
    });

    ws.onDartAdded((_, ts)       => turnState.set(ts));
    ws.onTurnEnded((ts)          => turnState.set(ts));
    ws.onLegWon(({ matchState }) => {
      applyMatchState(matchState);
    });
    ws.onMatchWon(async ({ matchId }) => {
      summaryMatchId = matchId ?? $match?.id ?? null;
      await refreshMatch(summaryMatchId);
      screen.set('summary');
    });

    await loadPlayers();
  });

  onDestroy(() => ws?.disconnect());

  function handleStarted(e) {
    const full = e.detail;
    applyMatchState(full);
    ws?.join(full.id, 'controller');
    screen.set('score');
  }

  async function exitMatchView() {
    const matchId = summaryMatchId ?? $match?.id ?? null;
    if (matchId) {
      try {
        await fetch(`/api/matches/${matchId}/exit`, { method: 'POST' });
      } catch (e) {
        console.error('Failed to notify TV about exit', e);
      }
    }
  }
</script>

<main>
  {#if $screen === 'home'}
    <Home
      on:newmatch={() => screen.set('newMatch')}
      on:players={() => screen.set('players')}
      on:resume={(e) => handleResume(e.detail)}
    />
  {:else if $screen === 'players'}
    <Players on:back={() => screen.set('home')} on:refresh={loadPlayers} />
  {:else if $screen === 'newMatch'}
    <NewMatch {ws} on:back={() => screen.set('home')} on:started={handleStarted} />
  {:else if $screen === 'score'}
    <ScoreEntry
      on:exit={() => { screen.set('home'); resetMatch(); }}
      on:finish={() => { summaryMatchId = $match?.id ?? null; screen.set('summary'); }}
    />
  {:else if $screen === 'summary'}
    <MatchSummary
      matchId={summaryMatchId}
      on:home={async () => { await exitMatchView(); screen.set('home'); resetMatch(); }}
      on:newmatch={async () => { await exitMatchView(); resetMatch(); screen.set('newMatch'); }}
    />
  {/if}
</main>

<style>
  main { min-height: 100vh; background: #1a1a2e; color: #fff; }
</style>

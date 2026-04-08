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

  async function loadPlayers() {
    try {
      const res = await fetch('/api/players');
      players.set(await res.json());
    } catch (e) { console.error('Failed to load players', e); }
  }

  function handleResume(full) {
    match.set(full);
    turnState.set(full.turnState ?? null);
    ws?.join(full.id, 'controller');
    screen.set('score');
  }

  onMount(async () => {
    ws = createWsClient();

    ws.socket.on('connect',    () => connected.set(true));
    ws.socket.on('disconnect', () => connected.set(false));

    ws.onMatchState((state) => {
      match.set(state);
      turnState.set(state.turnState ?? null);
    });

    ws.onDartAdded((_, ts)       => turnState.set(ts));
    ws.onTurnEnded((ts)          => turnState.set(ts));
    ws.onLegWon(({ matchState }) => {
      match.set(matchState);
      turnState.set(matchState.turnState ?? null);
    });
    ws.onMatchWon((_) => {
      summaryMatchId = $match?.id ?? null;
      screen.set('summary');
    });

    await loadPlayers();
  });

  onDestroy(() => ws?.disconnect());

  function handleStarted(e) {
    const full = e.detail;
    match.set(full);
    turnState.set(full.turnState ?? null);
    ws?.join(full.id, 'controller');
    screen.set('score');
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
    <NewMatch on:back={() => screen.set('home')} on:started={handleStarted} />
  {:else if $screen === 'score'}
    <ScoreEntry
      on:exit={() => screen.set('home')}
      on:finish={() => { summaryMatchId = $match?.id ?? null; screen.set('summary'); }}
    />
  {:else if $screen === 'summary'}
    <MatchSummary
      matchId={summaryMatchId}
      on:home={() => { screen.set('home'); resetMatch(); }}
      on:newmatch={() => { resetMatch(); screen.set('newMatch'); }}
    />
  {/if}
</main>

<style>
  main { min-height: 100vh; background: #1a1a2e; color: #fff; }
</style>

<script>
  import { onDestroy } from 'svelte';
  import Dartboard from '../dartboard/Dartboard.svelte';

  export let matchState = null;
  export let turnState  = null;

  // Match elapsed timer
  let elapsedStr = '';
  let timerInterval = null;

  function formatElapsed(startedAt) {
    if (!startedAt) return '';
    const start = new Date(startedAt.replace(' ', 'T') + 'Z');
    const secs = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  $: {
    clearInterval(timerInterval);
    timerInterval = null;
    if (matchState?.started_at) {
      elapsedStr = formatElapsed(matchState.started_at);
      timerInterval = setInterval(() => {
        elapsedStr = formatElapsed(matchState.started_at);
      }, 1000);
    }
  }

  $: players   = matchState?.players ?? [];
  $: activeLeg = matchState?.activeLeg ?? null;

  $: currentPlayerId = turnState?.currentPlayerId ?? null;
  $: currentPlayer   = players.find((p) => p.id === currentPlayerId) ?? null;
  $: currentRemaining = turnState?.remaining?.[currentPlayerId] ?? 0;

  $: turn = turnState?.turn ?? [];
  $: lastDart = turn.length > 0 ? turn[turn.length - 1] : null;

  // Keep the dart visible for 2s after the turn resets
  let displayDart = null;
  let clearTimer = null;
  $: {
    if (lastDart) {
      clearTimeout(clearTimer);
      displayDart = lastDart;
    } else {
      clearTimer = setTimeout(() => { displayDart = null; }, 2000);
    }
  }

  onDestroy(() => { clearTimeout(clearTimer); clearInterval(timerInterval); });

  function dartLabel(d) {
    if (!d) return '—';
    if (d.busted) return 'BUST';
    if (d.segment === 0) return 'Miss';
    if (d.segment === 25 && d.multiplier === 2) return 'BULL';
    if (d.segment === 25) return '25';
    const p = d.multiplier === 2 ? 'D' : d.multiplier === 3 ? 'T' : '';
    return `${p}${d.segment}`;
  }

  function dartScore(d) {
    if (!d || d.busted) return 0;
    return d.score_value ?? 0;
  }

  $: turnTotal = turn.reduce((s, d) => s + dartScore(d), 0);

  $: lastTurnDarts   = turnState?.lastTurnDarts ?? [];
  $: lastTurnPlayer  = players.find((p) => p.id === lastTurnDarts[0]?.player_id) ?? null;
  $: lastTurnTotal   = lastTurnDarts.reduce((s, d) => s + (d.busted ? 0 : (d.score_value ?? 0)), 0);

  $: legInfo = matchState
    ? `#${matchState.id} · ${matchState.starting_score} · Manșa ${activeLeg?.leg_number ?? '?'} · Cel mai bun din ${matchState.legs_to_win * 2 - 1}`
    : '';
</script>

<!-- Top bar -->
<div class="top-bar">
  <span class="top-meta">{legInfo}</span>
  {#if elapsedStr}<span class="top-timer">⏱ {elapsedStr}</span>{/if}
</div>

<div class="match-view">
  <!-- Left: active player panel -->
  <div class="left-panel" style="--player-color:{currentPlayer?.color ?? '#e63946'}">

    <div class="match-meta-small">{legInfo}</div>

    <div class="player-name-row">
      <div class="player-avatar" style="background:{currentPlayer?.color ?? '#e63946'}">
        {#if currentPlayer?.photo}
          <img src={currentPlayer.photo} alt={currentPlayer.name} class="player-avatar-img" />
        {:else}
          {currentPlayer?.name?.[0]?.toUpperCase() ?? '?'}
        {/if}
      </div>
      <span class="player-name">{currentPlayer?.name ?? '—'}</span>
    </div>

    <div
      class="big-score"
      class:busted={turnState?.busted}
      style="--glow-color:{currentPlayer?.color ?? '#e63946'}"
    >
      {turnState?.busted ? 'BUST' : currentRemaining}
    </div>

    <!-- Dart chips -->
    <div class="dart-trail">
      {#each Array(3) as _, i}
        <div
          class="dart-chip"
          class:filled={i < turn.length}
          class:busted={turn[i]?.busted}
          style={i < turn.length && !turn[i]?.busted ? `--chip-color:${currentPlayer?.color ?? '#e63946'}` : ''}
        >
          {#if turn[i]}
            <span class="chip-label">{dartLabel(turn[i])}</span>
            <span class="chip-score">{dartScore(turn[i])}</span>
          {:else}
            <span class="chip-empty">D{i + 1}</span>
          {/if}
        </div>
      {/each}
      {#if turnTotal > 0}
        <div class="turn-total">= {turnTotal}</div>
      {/if}
    </div>

    <!-- Last turn darts -->
    {#if lastTurnDarts.length > 0}
      <div class="last-turn">
        <div class="last-turn-hdr">
          <div class="lt-dot" style="background:{lastTurnPlayer?.color ?? '#6660aa'}"></div>
          <span>{lastTurnPlayer?.name ?? '?'} · tura anterioară</span>
        </div>
        <div class="last-turn-chips">
          {#each lastTurnDarts as d}
            <div class="ltc" class:busted={d.busted}>
              <span class="ltc-lbl">{dartLabel(d)}</span>
              <span class="ltc-score">{d.busted ? '✕' : d.score_value}</span>
            </div>
          {/each}
          {#if lastTurnTotal > 0}
            <span class="lt-total">= {lastTurnTotal}</span>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Checkout hint -->
    {#if turnState?.checkoutHint && !turnState?.busted}
      <div class="checkout-hint">
        🎯 {turnState.checkoutHint.map(d => {
          if (d.segment === 25 && d.multiplier === 2) return 'BULL';
          const p = d.multiplier === 2 ? 'D' : d.multiplier === 3 ? 'T' : '';
          return `${p}${d.segment}`;
        }).join(' → ')}
      </div>
    {/if}

    <!-- Dartboard -->
    <div class="board-wrap">
      <Dartboard lastDart={displayDart} size={Math.min(320, 320)} />
    </div>
  </div>

  <!-- Right: scoreboard -->
  <div class="right-panel">
    <div class="scoreboard-header">PUNCTAJ</div>

    <div class="scoreboard">
      {#each players as p (p.id)}
        {@const rem = turnState?.remaining?.[p.id] ?? matchState?.starting_score}
        {@const isActive = p.id === currentPlayerId}
        <div class="player-card" class:active={isActive} style="--c:{p.color}">
          <div class="card-bar"></div>
          <div class="card-avatar" style="background:{p.color}">
            {#if p.photo}<img src={p.photo} alt={p.name} />{:else}{p.name[0].toUpperCase()}{/if}
          </div>
          <div class="card-body">
            <div class="card-name">{p.name}</div>
            <div class="card-score" style={isActive ? `color:${p.color}` : ''}>{rem}</div>
            <div class="card-legs">
              {#each Array(matchState?.legs_to_win ?? 1) as _, li}
                <div class="leg-dot" class:won={li < p.legs_won}></div>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800;900&family=Inter:wght@400;600&display=swap');

  /* Top bar */
  .top-bar {
    width: 100%; background: #191933;
    display: flex; align-items: center; justify-content: center;
    padding: 0.55rem 1.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    position: fixed; top: 0; left: 0; z-index: 10;
  }
  .top-meta {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: #6660aa;
  }
  .top-timer {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.85rem; font-weight: 700; color: #ffb3b1;
    position: absolute; right: 1.5rem;
  }

  /* Main grid */
  .match-view {
    display: grid; grid-template-columns: 58% 42%;
    height: 100vh; padding-top: 2.4rem;
    background: #0d0d1a; overflow: hidden;
    font-family: 'Inter', system-ui, sans-serif;
    color: #e2dfff;
  }

  /* Left panel */
  .left-panel {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 2rem 2.5rem; gap: 1.25rem;
    border-right: 1px solid #191933;
  }

  .match-meta-small {
    font-size: 0.72rem; font-weight: 600; letter-spacing: 0.12em;
    text-transform: uppercase; color: #6660aa;
    font-family: 'Inter', system-ui, sans-serif;
  }

  .player-name-row {
    display: flex; align-items: center; gap: 0.75rem;
  }
  .player-avatar {
    width: 48px; height: 48px; border-radius: 50%;
    box-shadow: 0 0 12px var(--player-color);
    flex-shrink: 0; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.2rem; font-weight: 900; color: #fff;
  }
  .player-avatar-img { width: 100%; height: 100%; object-fit: cover; }
  .player-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: clamp(1.6rem, 3.5vw, 2.4rem);
    font-weight: 900; color: #fff;
    letter-spacing: -0.5px;
  }

  /* Giant remaining score */
  .big-score {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: clamp(5rem, 12vw, 10rem);
    font-weight: 900; line-height: 1;
    letter-spacing: -4px;
    color: var(--player-color, #e2dfff);
    text-shadow: 0 0 40px var(--glow-color, #e63946);
    transition: color 0.3s, text-shadow 0.3s;
  }
  .big-score.busted {
    color: #e63946;
    text-shadow: 0 0 40px #e63946;
    animation: shake 0.4s ease;
  }

  @keyframes shake {
    0%   { transform: translateX(0); }
    20%  { transform: translateX(-8px); }
    40%  { transform: translateX(8px); }
    60%  { transform: translateX(-6px); }
    80%  { transform: translateX(6px); }
    100% { transform: translateX(0); }
  }

  /* Dart chips */
  .dart-trail {
    display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap; justify-content: center;
  }
  .dart-chip {
    min-width: 72px; padding: 0.5rem 0.8rem; border-radius: 999px;
    background: #272742; text-align: center; transition: background 0.2s, box-shadow 0.2s;
  }
  .dart-chip.filled {
    background: color-mix(in srgb, var(--chip-color, #5bd5fc) 18%, #272742);
    box-shadow: 0 0 8px color-mix(in srgb, var(--chip-color, #5bd5fc) 30%, transparent);
  }
  .dart-chip.busted {
    background: rgba(230,57,70,0.15);
  }
  .chip-label {
    display: block; font-size: 1rem; font-weight: 800; color: #fff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
  }
  .dart-chip.busted .chip-label {
    color: #e63946; text-decoration: line-through;
  }
  .chip-score { display: block; font-size: 0.72rem; color: #9990cc; margin-top: 1px; }
  .chip-empty { display: block; font-size: 0.75rem; color: #3a3a5a; font-weight: 600; }
  .turn-total {
    font-size: 1.1rem; font-weight: 700; color: #9990cc;
    font-family: 'Space Grotesk', system-ui, sans-serif;
  }

  /* Checkout hint */
  .checkout-hint {
    font-size: 0.95rem; font-weight: 600; color: #4caf50;
    background: rgba(76,175,80,0.12);
    border: 1px solid rgba(76,175,80,0.25);
    border-radius: 999px; padding: 0.4rem 1rem;
    font-family: 'Inter', system-ui, sans-serif;
  }

  .board-wrap { margin-top: auto; }

  /* Right panel */
  .right-panel {
    display: flex; flex-direction: column;
    padding: 2rem 1.75rem; gap: 1.25rem;
    background: #0d0d1a;
  }

  .scoreboard-header {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.18em;
    text-transform: uppercase; color: #6660aa;
  }

  .scoreboard { display: flex; flex-direction: column; gap: 1rem; flex: 1; justify-content: center; }

  .player-card {
    display: flex; border-radius: 14px; overflow: hidden;
    background: #191933;
    transition: all 0.3s;
  }
  .player-card.active {
    background: #1d1d37;
    box-shadow: 0 0 20px color-mix(in srgb, var(--c) 25%, transparent);
  }

  /* Last turn darts */
  .last-turn {
    display: flex; flex-direction: column; gap: 0.4rem;
    align-items: center;
  }
  .last-turn-hdr {
    display: flex; align-items: center; gap: 0.45rem;
    font-size: 0.65rem; font-weight: 600; color: #6660aa;
    text-transform: uppercase; letter-spacing: 0.1em;
  }
  .lt-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .last-turn-chips {
    display: flex; align-items: center; gap: 0.5rem;
  }
  .ltc {
    min-width: 52px; padding: 0.3rem 0.6rem; border-radius: 999px;
    background: #1d1d37; border: 1px solid #2a2a42; text-align: center;
  }
  .ltc.busted { opacity: 0.5; }
  .ltc-lbl { display: block; font-size: 0.8rem; font-weight: 700; color: #6660aa; font-family: 'Space Grotesk', system-ui, sans-serif; }
  .ltc-score { display: block; font-size: 0.6rem; color: #4a4a6a; }
  .lt-total { font-size: 0.85rem; font-weight: 700; color: #6660aa; font-family: 'Space Grotesk', system-ui, sans-serif; }

  .card-bar { width: 6px; background: var(--c); flex-shrink: 0; }

  .card-avatar {
    width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1rem; font-weight: 800; color: #fff;
    overflow: hidden; margin-left: 0.75rem;
    opacity: 0.5; transition: opacity 0.3s, transform 0.3s;
  }
  .player-card.active .card-avatar {
    opacity: 1; transform: scale(1.1);
    box-shadow: 0 0 12px color-mix(in srgb, var(--c) 50%, transparent);
  }
  .card-avatar img { width: 100%; height: 100%; object-fit: cover; }

  .card-body { display: flex; align-items: center; padding: 1.2rem 1rem; gap: 1rem; flex: 1; }
  .card-name {
    font-size: clamp(1rem, 2.5vw, 1.4rem); font-weight: 700; flex: 1; color: #9990cc;
    font-family: 'Space Grotesk', system-ui, sans-serif;
  }
  .player-card.active .card-name { color: #e2dfff; }
  .card-score {
    font-size: clamp(1.5rem, 4vw, 2.4rem); font-weight: 900; color: #fff;
    min-width: 4ch; text-align: right;
    font-family: 'Space Grotesk', system-ui, sans-serif;
  }

  .card-legs { display: flex; gap: 0.4rem; align-items: center; }
  .leg-dot {
    width: 13px; height: 13px; border-radius: 50%;
    background: #272742; border: 2px solid #3a3a5a;
    transition: background 0.3s;
  }
  .leg-dot.won { background: var(--c); border-color: var(--c); }
</style>

<script>
  import { onDestroy } from 'svelte';
  import Dartboard from '../dartboard/Dartboard.svelte';
  import BadgeToken from '../../../shared/BadgeToken.svelte';

  export let matchState = null;
  export let turnState = null;
  export let liveMatchStats = [];
  export let lifetimeStats = {};

  let elapsedStr = '';
  let elapsedMs = 0;
  let localTimeStr = '';
  let timerInterval = null;

  function formatElapsed(activeMs) {
    const secs = Math.max(0, Math.floor((Number(activeMs) || 0) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function currentActiveElapsedMs(matchState) {
    return Number(matchState?.active_elapsed_ms ?? 0);
  }

  function formatLocalTime(date = new Date()) {
    return date.toLocaleTimeString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function stopElapsedTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function startElapsedTimer(state) {
    stopElapsedTimer();
    elapsedMs = currentActiveElapsedMs(state);
    elapsedStr = formatElapsed(elapsedMs);
    localTimeStr = formatLocalTime();
    timerInterval = setInterval(() => {
      elapsedMs += 1000;
      elapsedStr = formatElapsed(elapsedMs);
      localTimeStr = formatLocalTime();
    }, 1000);
  }

  function dartLabel(dart) {
    if (!dart) return '—';
    if (dart.busted) return 'BUST';
    if (dart.segment === 0) return 'MISS';
    if (dart.segment === 25 && dart.multiplier === 2) return 'BULL';
    if (dart.segment === 25) return '25';
    const prefix = dart.multiplier === 2 ? 'D' : dart.multiplier === 3 ? 'T' : '';
    return `${prefix}${dart.segment}`;
  }

  function dartScore(dart) {
    if (!dart || dart.busted) return 0;
    return dart.score_value ?? 0;
  }

  function dartTone(dart) {
    if (!dart || dart.busted) return '';
    if (dart.segment === 0) return 'tone-miss';
    if (dart.segment === 25 && dart.multiplier === 2) return 'segment-bull mult-bull';
    if (dart.segment === 25) return 'segment-bull mult-single';

    let segmentTone = 'segment-1-5';
    if (dart.segment >= 16) segmentTone = 'segment-16-20';
    else if (dart.segment >= 11) segmentTone = 'segment-11-15';
    else if (dart.segment >= 6) segmentTone = 'segment-6-10';

    const multiplierTone = dart.multiplier === 3
      ? 'mult-triple'
      : dart.multiplier === 2
        ? 'mult-double'
        : 'mult-single';

    return `${segmentTone} ${multiplierTone}`;
  }

  function checkoutLabel(darts) {
    return (darts ?? []).map((dart) => dartLabel(dart)).join(' • ');
  }

  function safeInitial(name) {
    return name?.[0]?.toUpperCase() ?? '?';
  }

  function formatAvg(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return Number(value).toFixed(2);
  }

  function matchAvgFor(playerId) {
    return liveMatchStats.find((stats) => stats.player_id === playerId)?.avg_3dart ?? null;
  }

  function generalAvgFor(playerId) {
    return lifetimeStats?.[playerId]?.avg_3dart ?? null;
  }

  function avgTrend(playerId) {
    const matchAvg = Number(matchAvgFor(playerId));
    const generalAvg = Number(generalAvgFor(playerId));
    if (!Number.isFinite(matchAvg) || !Number.isFinite(generalAvg) || generalAvg <= 0) return 'neutral';
    if (matchAvg > generalAvg) return 'up';
    if (matchAvg < generalAvg) return 'down';
    return 'neutral';
  }

  $: doubleOutActive = matchState?.double_out === 1;
  $: finishModeNote = doubleOutActive
    ? 'Double Out activ: finish doar pe dubla.'
    : 'Straight Out activ.';
  $: sixtyOneNote = doubleOutActive && currentRemaining === 61
    ? 'La 61 nu merge doar 20, 20, 20.'
    : '';

  function liveBadgesFor(playerId) {
    return liveMatchStats.find((stats) => stats.player_id === playerId)?.awards ?? [];
  }

  const SEGMENT_LEGEND = [
    { label: '1-5', tone: 'segment-1-5 mult-single' },
    { label: '6-10', tone: 'segment-6-10 mult-single' },
    { label: '11-15', tone: 'segment-11-15 mult-single' },
    { label: '16-20', tone: 'segment-16-20 mult-single' },
    { label: 'Bull', tone: 'segment-bull mult-bull' },
  ];

  const MULTIPLIER_LEGEND = [
    { label: 'Simplă', tone: 'segment-16-20 mult-single' },
    { label: 'Dublă', tone: 'segment-16-20 mult-double' },
    { label: 'Triplă', tone: 'segment-16-20 mult-triple' },
  ];

  $: if (matchState) {
    startElapsedTimer(matchState);
  } else {
    stopElapsedTimer();
    elapsedMs = 0;
    elapsedStr = '';
    localTimeStr = formatLocalTime();
  }

  $: players = matchState?.players ?? [];
  $: activeLeg = matchState?.activeLeg ?? null;
  $: currentPlayerId = turnState?.currentPlayerId ?? null;
  $: activeIndex = players.findIndex((player) => player.id === currentPlayerId);
  $: currentPlayer = players[activeIndex] ?? null;
  $: currentRemaining = turnState?.remaining?.[currentPlayerId] ?? matchState?.starting_score ?? 0;
  $: turn = turnState?.turn ?? [];
  $: turnTotal = turn.reduce((sum, dart) => sum + dartScore(dart), 0);
  $: lastTurnDarts = turnState?.lastTurnDarts ?? [];
  $: lastTurnPlayer = players.find((player) => player.id === lastTurnDarts[0]?.player_id) ?? null;
  $: lastTurnTotal = lastTurnDarts.reduce((sum, dart) => sum + dartScore(dart), 0);
  $: lastTurnRemaining = turnState?.lastTurnRemaining ?? null;
  $: activePosition = activeIndex >= 0 ? activeIndex + 1 : null;
  $: headerMeta = matchState
    ? `${matchState.starting_score} · Manșa ${activeLeg?.leg_number ?? '?'} · Best of ${matchState.legs_to_win * 2 - 1} · ${doubleOutActive ? 'Double Out' : 'Straight Out'}`
    : '';
  $: playersOrdered = players.length === 0 || activeIndex < 0
    ? players
    : [...players.slice(activeIndex), ...players.slice(0, activeIndex)];
  $: nextPlayer = playersOrdered[1] ?? null;
  $: playerCount = players.length || 1;
  $: multiLegMatch = (matchState?.legs_to_win ?? 1) > 1;
  $: boardDarts = turn.length > 0 ? turn : lastTurnDarts;
  $: boardLatestDart = boardDarts.length > 0 ? boardDarts[boardDarts.length - 1] : null;
  $: boardPlayer = players.find((player) => player.id === boardDarts[0]?.player_id) ?? null;
  $: boardTotal = boardDarts.reduce((sum, dart) => sum + dartScore(dart), 0);
  $: currentLiveBadges = currentPlayerId ? liveBadgesFor(currentPlayerId) : [];
  $: compactSidebar = playerCount >= 5;
  $: gridSidebar = playerCount >= 6;
  $: playOrderById = new Map(players.map((player, index) => [player.id, index]));
  $: playersById = new Map(players.map((player) => [player.id, player]));
  $: remainingStandings = players
    .map((player) => ({
      id: player.id,
      remaining: turnState?.remaining?.[player.id] ?? matchState?.starting_score ?? 0,
      playOrder: playOrderById.get(player.id) ?? 0,
    }))
    .sort((a, b) => a.remaining - b.remaining || a.playOrder - b.playOrder)
    .map((entry, index) => ({ ...entry, place: index + 1 }));
  $: remainingRankByPlayer = new Map(remainingStandings.map((entry) => [entry.id, entry.place]));

  function progressWidth(playerId) {
    const start = matchState?.starting_score ?? 0;
    const remaining = turnState?.remaining?.[playerId] ?? start;
    if (start <= 0) return 0;
    const completed = ((start - remaining) / start) * 100;
    return Math.max(0, Math.min(100, completed));
  }

  onDestroy(() => {
    stopElapsedTimer();
  });
</script>

<div class="match-shell">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark"></span>
      <div>
        <div class="brand-title">ZboaraSageata</div>
        <div class="brand-sub">{headerMeta}</div>
      </div>
    </div>

    <div class="topbar-center">
      {#if elapsedStr}
        <div class="match-clock">
          <span>Durată meci</span>
          <strong>{elapsedStr}</strong>
        </div>
      {/if}
    </div>

    <div class="topbar-right">
      {#if nextPlayer}
        <div class="next-player-chip">
          <span class="next-player-label">Urmează</span>
          <div class="next-player-main">
            <div class="next-player-avatar">
              {#if nextPlayer.photo}
                <img src={nextPlayer.photo} alt={nextPlayer.name} />
              {:else}
                <span>{safeInitial(nextPlayer.name)}</span>
              {/if}
            </div>
            <strong>{nextPlayer.name}</strong>
          </div>
        </div>
      {/if}
      <div class="clock">{localTimeStr}</div>
    </div>
  </header>

  <div class="match-layout">
    <section class="spotlight" style="--accent:{currentPlayer?.color ?? '#ff6b6b'}">
      <div class="spotlight-main panel">
        <div class="spotlight-head">
          <div class="spotlight-player">
            <div class="spotlight-avatar">
              {#if currentPlayer?.photo}
                <img src={currentPlayer.photo} alt={currentPlayer.name} />
              {:else}
                <span>{safeInitial(currentPlayer?.name)}</span>
              {/if}
            </div>

            <div class="spotlight-copy">
              <div class="spotlight-name">{currentPlayer?.name ?? '—'}</div>
            </div>
          </div>

          <div class="score-tower" class:busted={turnState?.busted}>
            <span class="score-value">{turnState?.busted ? 'BUST' : currentRemaining}</span>
            {#if sixtyOneNote}
              <span class="score-tip">{sixtyOneNote}</span>
            {/if}
          </div>
        </div>

        <div class="visit-strip">
          <article class="visit-card current">
            <div class="card-head">
              <div class="eyebrow">Tura curentă</div>
              <strong>{turnTotal}</strong>
            </div>
            <div class="visit-darts">
              {#each Array(3) as _, i}
                <div class={`dart-card ${turn[i] ? dartTone(turn[i]) : ''}`} class:filled={i < turn.length} class:busted={turn[i]?.busted}>
                  <span class="dart-name">{turn[i] ? dartLabel(turn[i]) : `D${i + 1}`}</span>
                  <small>{turn[i] ? dartScore(turn[i]) : 'în așteptare'}</small>
                </div>
              {/each}
            </div>
            {#if currentLiveBadges.length > 0}
              <div class="current-badge-panel">
                <div class="current-badge-copy">
                  <span class="current-badge-label">Badge-uri meci</span>
                  <strong>{currentPlayer?.name ?? 'Jucător'}</strong>
                </div>
                <div class="current-badge-list">
                  {#each currentLiveBadges as badge (badge.kind)}
                    <BadgeToken
                      kind={badge.kind}
                      count={badge.count}
                      compact={true}
                    />
                  {/each}
                </div>
              </div>
            {/if}
            <div class="visit-meta">
              <span>Săgeți rămase: <strong>{turnState?.dartsLeft ?? 3}</strong></span>
              {#if turnState?.checkoutHint && !turnState?.busted}
                <span>Out: <strong>{checkoutLabel(turnState.checkoutHint)}</strong></span>
              {:else}
                <span>Stare: <strong>{turnState?.busted ? 'BUST' : 'În joc'}</strong></span>
              {/if}
            </div>
          </article>

          <article class="visit-card previous">
            <div class="card-head">
              <div class="eyebrow">Tura anterioară</div>
              <strong>{lastTurnDarts.length > 0 ? lastTurnTotal : '—'}</strong>
            </div>

            {#if lastTurnDarts.length > 0}
              <div class="previous-player">
                <div class="tiny-dot" style="background:{lastTurnPlayer?.color ?? '#8aa0c1'}"></div>
                <span>{lastTurnPlayer?.name ?? '?'}</span>
                {#if lastTurnRemaining != null}
                  <span class="previous-remaining">a rămas cu <strong>{lastTurnRemaining}</strong></span>
                {/if}
              </div>
              <div class="visit-darts compact">
                {#each lastTurnDarts as dart, i}
                  <div class={`dart-card filled ${dartTone(dart)}`} class:busted={dart.busted}>
                    <span class="dart-name">{dartLabel(dart)}</span>
                    <small>{dart.busted ? '✕' : dart.score_value}</small>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="empty-state">Încă nu există o tură completă.</div>
            {/if}
          </article>
        </div>
      </div>

      <div class="board-section panel">
        <div class="board-copy">
          <div class="eyebrow">Tabla live</div>
          <div class="mini-title">Lovituri pe tură</div>
          <div class="board-sub">
            {#if boardDarts.length > 0}
              {boardPlayer?.name ?? 'Jucător'} ·
              {(boardDarts ?? []).map((dart) => dartLabel(dart)).join(' • ')} ·
              Total {boardTotal}
            {:else}
              Așteptăm următoarea săgeată.
            {/if}
          </div>
          <div class="board-legend" aria-label="Legendă culori lovituri">
            <div class="legend-group">
              <span class="legend-label">Segmente</span>
              {#each SEGMENT_LEGEND as item}
                <span class={`legend-chip ${item.tone}`}>{item.label}</span>
              {/each}
            </div>
            <div class="legend-group">
              <span class="legend-label">Multiplicator</span>
              {#each MULTIPLIER_LEGEND as item}
                <span class={`legend-chip ${item.tone}`}>{item.label}</span>
              {/each}
            </div>
          </div>
        </div>

        <div class="board-frame">
          <Dartboard darts={boardDarts} size={230} />
        </div>
      </div>
    </section>

    <aside class="scoreboard panel" class:compact={compactSidebar} class:grid={gridSidebar}>
      <div class="scoreboard-head">
        <div>
          <div class="eyebrow">Scor live</div>
          <div class="scoreboard-title">Ordine de joc și clasament</div>
        </div>
      </div>

      <div class="remaining-standings" aria-label="Clasament după scorul rămas">
        {#each remainingStandings as entry (entry.id)}
          {@const standingPlayer = playersById.get(entry.id)}
          <div class="standing-chip" class:active={entry.id === currentPlayerId} style="--c:{standingPlayer?.color ?? '#8aa0c1'}">
            <span class="standing-place">#{entry.place}</span>
            <span class="standing-name">{standingPlayer?.name ?? '—'}</span>
            <strong>{entry.remaining}</strong>
          </div>
        {/each}
      </div>

      <div class="scoreboard-list">
        {#each playersOrdered as player, idx (player.id)}
          {@const isActive = player.id === currentPlayerId}
          {@const rem = turnState?.remaining?.[player.id] ?? matchState?.starting_score}
          {@const avgState = avgTrend(player.id)}
          {@const remainingRank = remainingRankByPlayer.get(player.id) ?? null}
          <article class="player-card" class:active={isActive} class:compact={compactSidebar} style="--c:{player.color}">
            <div class="player-main">
              <div class="player-rank">{idx === 0 ? 'LIVE' : `#${((activeIndex + idx) % playerCount) + 1}`}</div>

              <div class="player-avatar">
                {#if player.photo}
                  <img src={player.photo} alt={player.name} />
                {:else}
                  <span>{safeInitial(player.name)}</span>
                {/if}
              </div>

              <div class="player-copy">
                <div class="player-name">{player.name}</div>
                <div class="player-sub">{isActive ? 'La aruncare acum' : 'În așteptare'}</div>
                <div class="player-avgs">
                  <div class="player-avg-item" class:up={avgState === 'up'} class:down={avgState === 'down'}>
                    <small>meci</small>
                    <strong>{formatAvg(matchAvgFor(player.id))}</strong>
                  </div>
                  <div class="player-avg-item">
                    <small>general</small>
                    <span>{formatAvg(generalAvgFor(player.id))}</span>
                  </div>
                </div>
              </div>

              <div class="player-score-block">
                {#if remainingRank}
                  <div class="player-standing">Loc {remainingRank}</div>
                {/if}
                <div class="player-score">{rem}</div>
                <div class="player-score-label">rămas</div>
              </div>
            </div>

            <div class="player-progress">
              <div class="value-bar">
                <div class="value-fill" style="width:{progressWidth(player.id)}%; background:{player.color}"></div>
              </div>
              <div class="player-footer">
                <span>{progressWidth(player.id).toFixed(0)}% din scor consumat</span>
                <span>
                  {player.legs_won} / {matchState?.legs_to_win ?? 1} manșe
                  {#if multiLegMatch && player.best_finish > 1}
                    · Finish {player.best_finish}
                  {/if}
                </span>
              </div>
            </div>
          </article>
        {/each}
      </div>
    </aside>
  </div>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Manrope:wght@500;600;700;800&display=swap');

  .match-shell {
    min-height: 100vh;
    background:
      radial-gradient(circle at top left, rgba(255, 107, 107, 0.16), transparent 24%),
      radial-gradient(circle at 78% 18%, rgba(255, 209, 102, 0.12), transparent 18%),
      radial-gradient(circle at bottom right, rgba(82, 197, 255, 0.12), transparent 28%),
      linear-gradient(145deg, #06101c 0%, #0a1625 45%, #0d1b2f 100%);
    color: #eef4ff;
    font-family: 'Manrope', system-ui, sans-serif;
    overflow: hidden;
  }

  .topbar {
    height: 84px;
    padding: 0 28px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(6, 14, 25, 0.82);
    backdrop-filter: blur(16px);
    gap: 18px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .brand-mark {
    width: 12px;
    height: 42px;
    border-radius: 999px;
    background: linear-gradient(180deg, #ff6b6b, #ffd166);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.45);
  }

  .brand-title,
  .spotlight-name,
  .mini-title,
  .scoreboard-title,
  .player-name,
  .score-value,
  .player-score,
  .card-head strong {
    font-family: 'Space Grotesk', system-ui, sans-serif;
  }

  .brand-title {
    font-size: 1.2rem;
    font-weight: 800;
    color: #fff;
  }

  .brand-sub,
  .eyebrow,
  .score-kicker {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.72rem;
    font-weight: 800;
    color: #8fa7cb;
  }

  .topbar-center {
    display: flex;
    justify-content: center;
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: flex-end;
  }

  .clock {
    padding: 0.72rem 1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .clock {
    min-width: 120px;
    text-align: center;
    color: #ffd166;
    font-weight: 800;
  }

  .match-clock {
    min-width: 190px;
    padding: 0.6rem 1.6rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 209, 102, 0.22);
    background: linear-gradient(180deg, rgba(255, 209, 102, 0.12), rgba(255, 255, 255, 0.04));
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 16px 30px rgba(0, 0, 0, 0.22);
  }

  .match-clock span {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.6rem;
    font-weight: 800;
    color: #9db3d5;
  }

  .match-clock strong {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 2rem;
    line-height: 1;
    color: #fff1c2;
  }

  .next-player-chip {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.55rem 0.8rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
  }

  .next-player-label {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.64rem;
    font-weight: 800;
    color: #9ab2d5;
  }

  .next-player-main {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: #dfeaf8;
  }

  .next-player-main strong {
    font-size: 0.92rem;
  }

  .next-player-avatar {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font-size: 0.88rem;
    font-weight: 800;
  }

  .next-player-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .match-layout {
    height: calc(100vh - 84px);
    padding: 22px 28px 28px;
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(360px, 0.78fr);
    gap: 20px;
  }

  .spotlight {
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 18px;
  }

  .panel {
    border-radius: 26px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(9, 19, 35, 0.82);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 24px 80px rgba(0, 0, 0, 0.28);
  }

  .spotlight-main {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-height: 0;
  }

  .spotlight-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 18px;
    align-items: stretch;
  }

  .spotlight-player {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 20px;
    border-radius: 24px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--accent) 24%, #10203a), rgba(255, 255, 255, 0.03));
  }

  .spotlight-avatar {
    width: 148px;
    height: 148px;
    flex-shrink: 0;
    border-radius: 24px;
    overflow: hidden;
    border: 4px solid rgba(255, 255, 255, 0.16);
    background: color-mix(in srgb, var(--accent) 85%, #203652);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3.3rem;
    font-weight: 800;
    box-shadow: 0 0 32px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .spotlight-avatar img,
  .player-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .spotlight-copy {
    min-width: 0;
  }

  .spotlight-name {
    margin-top: 0.4rem;
    font-size: clamp(2.8rem, 4vw, 4.6rem);
    line-height: 0.95;
    font-weight: 800;
    color: #fff;
  }

  .spotlight-meta {
    margin-top: 0.8rem;
    color: #d3e0f2;
    font-size: 1rem;
    font-weight: 700;
  }

  .meta-sep {
    margin: 0 0.45rem;
    color: #89a2c7;
  }

  .score-tower {
    border-radius: 24px;
    min-width: 0;
    max-width: 100%;
    min-height: 188px;
    padding: 18px 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .score-tower.busted .score-value {
    color: #ff7a7a;
    text-shadow: 0 0 24px rgba(255, 122, 122, 0.35);
  }

  .score-value {
    margin-top: 0.45rem;
    max-width: 100%;
    font-size: clamp(3.4rem, 5.2vw, 5rem);
    line-height: 1;
    font-weight: 800;
    color: var(--accent);
    text-shadow: 0 0 28px color-mix(in srgb, var(--accent) 40%, transparent);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow-wrap: normal;
    word-break: keep-all;
    letter-spacing: -0.03em;
  }

  .score-note {
    margin-top: 0.55rem;
    color: #97afcf;
    font-size: 0.84rem;
    font-weight: 700;
  }
  .score-mode {
    margin-top: 0.5rem;
    color: #d3e0f2;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.35;
    max-width: 17rem;
  }
  .score-tip {
    margin-top: 0.35rem;
    color: #ffd166;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.35;
    max-width: 17rem;
  }

  .visit-strip {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(300px, 0.9fr);
    gap: 18px;
  }

  .visit-card {
    min-height: 0;
    padding: 18px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.025);
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
  }

  .visit-card.current {
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.018));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
  }

  .visit-card.previous {
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .card-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }

  .card-head strong {
    font-size: 2rem;
    color: #ffd166;
  }

  .visit-darts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .visit-darts.compact {
    margin-top: auto;
  }

  .dart-card {
    min-height: 98px;
    border-radius: 18px;
    padding: 14px 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 8px;
    text-align: center;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.045);
    box-shadow: none;
  }

  .dart-card.segment-1-5 {
    --segment-border: rgba(255, 92, 145, 0.44);
    --segment-top: rgba(255, 92, 145, 0.18);
    --segment-fill-top: rgba(255, 92, 145, 0.46);
    --segment-fill-bottom: rgba(255, 92, 145, 0.2);
    --segment-name: #ffe0eb;
    --segment-glow: rgba(255, 92, 145, 0.34);
  }

  .dart-card.segment-6-10 {
    --segment-border: rgba(180, 119, 255, 0.44);
    --segment-top: rgba(180, 119, 255, 0.18);
    --segment-fill-top: rgba(180, 119, 255, 0.46);
    --segment-fill-bottom: rgba(180, 119, 255, 0.22);
    --segment-name: #f0e4ff;
    --segment-glow: rgba(180, 119, 255, 0.36);
  }

  .dart-card.segment-11-15 {
    --segment-border: rgba(255, 181, 70, 0.46);
    --segment-top: rgba(255, 181, 70, 0.18);
    --segment-fill-top: rgba(255, 181, 70, 0.48);
    --segment-fill-bottom: rgba(255, 181, 70, 0.22);
    --segment-name: #fff0d8;
    --segment-glow: rgba(255, 181, 70, 0.36);
  }

  .dart-card.segment-16-20 {
    --segment-border: rgba(255, 219, 77, 0.5);
    --segment-top: rgba(255, 219, 77, 0.22);
    --segment-fill-top: rgba(255, 219, 77, 0.56);
    --segment-fill-bottom: rgba(255, 219, 77, 0.24);
    --segment-name: #fff7d2;
    --segment-glow: rgba(255, 219, 77, 0.42);
  }

  .dart-card.segment-bull {
    --segment-border: rgba(255, 239, 165, 0.56);
    --segment-top: rgba(255, 239, 165, 0.22);
    --segment-fill-top: rgba(255, 239, 165, 0.56);
    --segment-fill-bottom: rgba(255, 239, 165, 0.26);
    --segment-name: #fffbe5;
    --segment-glow: rgba(255, 239, 165, 0.46);
  }

  .dart-card[class*='segment-'] {
    border-color: var(--segment-border);
    background: linear-gradient(180deg, var(--segment-top), rgba(255, 255, 255, 0.02));
  }

  .dart-card.mult-double {
    --mult-ring: rgba(72, 219, 251, 0.96);
    --mult-glow: rgba(72, 219, 251, 0.5);
  }

  .dart-card.mult-triple {
    --mult-ring: rgba(121, 255, 126, 0.98);
    --mult-glow: rgba(121, 255, 126, 0.54);
  }

  .dart-card.mult-bull {
    --mult-ring: rgba(255, 251, 233, 0.98);
    --mult-glow: rgba(255, 240, 179, 0.56);
  }

  .dart-card.mult-single {
    --mult-ring: rgba(255, 255, 255, 0.08);
    --mult-glow: transparent;
  }

  .dart-card.filled {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .dart-card[class*='segment-'].filled {
    background: linear-gradient(180deg, var(--segment-fill-top), var(--segment-fill-bottom));
    border-color: color-mix(in srgb, var(--segment-border) 82%, white);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      0 0 20px var(--segment-glow),
      0 0 0 3px var(--mult-ring),
      0 0 28px var(--mult-glow);
  }

  .dart-card.busted {
    background: rgba(255, 107, 107, 0.12);
    border-color: rgba(255, 107, 107, 0.18);
  }

  .dart-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.4rem;
    font-weight: 800;
    color: #fff;
  }

  .dart-card[class*='segment-'] .dart-name {
    color: var(--segment-name);
  }

  .dart-card small {
    color: #9eb2d0;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .visit-meta,
  .player-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .visit-meta {
    margin-top: auto;
    color: #c5d5ec;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .current-badge-panel {
    margin-top: 0.9rem;
    padding: 0.95rem 1rem;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .current-badge-copy {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .current-badge-label {
    color: #8fa7cb;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .current-badge-copy strong {
    color: #f1f6ff;
    font-size: 1rem;
    font-weight: 800;
  }

  .current-badge-list {
    flex: 1 1 auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.7rem 1rem;
  }

  .current-badge-list :global(.badge-token) {
    gap: 0.7rem;
  }

  .current-badge-list :global(.badge-art-shell) {
    width: 2.65rem;
    height: 2.65rem;
  }

  .current-badge-list :global(.badge-label) {
    font-size: 0.86rem;
  }

  .current-badge-list :global(.badge-count) {
    font-size: 0.78rem;
  }

  .previous-player {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    color: #dbe6f8;
    font-weight: 700;
  }

  .previous-remaining {
    color: #93abcf;
    font-size: 0.84rem;
    font-weight: 700;
  }

  .previous-remaining strong {
    color: #ffd166;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1rem;
  }

  .tiny-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .empty-state {
    margin-top: auto;
    min-height: 98px;
    display: grid;
    place-items: center;
    color: #94a9c9;
    text-align: center;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.03);
  }

  .mini-title {
    margin-top: 0.35rem;
    font-size: 1.5rem;
    color: #fff;
    font-weight: 800;
  }

  .board-section {
    padding: 18px 22px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 250px;
    gap: 18px;
    align-items: center;
  }

  .board-sub {
    margin-top: 0.65rem;
    color: #c8d7ec;
    font-size: 0.98rem;
    font-weight: 700;
  }

  .board-legend {
    margin-top: 1rem;
    display: grid;
    gap: 10px;
  }

  .legend-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .legend-label {
    color: #8fa7cb;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .legend-chip {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0.35rem 0.72rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #f1f6ff;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .legend-chip.segment-1-5 {
    background: rgba(255, 92, 145, 0.16);
    border-color: rgba(255, 92, 145, 0.38);
    color: #ffe0eb;
  }

  .legend-chip.segment-6-10 {
    background: rgba(180, 119, 255, 0.16);
    border-color: rgba(180, 119, 255, 0.38);
    color: #f0e4ff;
  }

  .legend-chip.segment-11-15 {
    background: rgba(255, 181, 70, 0.18);
    border-color: rgba(255, 181, 70, 0.4);
    color: #fff0d8;
  }

  .legend-chip.segment-16-20 {
    background: rgba(255, 219, 77, 0.2);
    border-color: rgba(255, 219, 77, 0.42);
    color: #fff7d2;
  }

  .legend-chip.segment-bull {
    background: rgba(255, 239, 165, 0.2);
    border-color: rgba(255, 239, 165, 0.46);
    color: #fffbe5;
  }

  .legend-chip.mult-double {
    box-shadow: 0 0 0 3px rgba(72, 219, 251, 0.96), 0 0 20px rgba(72, 219, 251, 0.36);
  }

  .legend-chip.mult-triple {
    box-shadow: 0 0 0 3px rgba(121, 255, 126, 0.98), 0 0 20px rgba(121, 255, 126, 0.38);
  }

  .legend-chip.mult-bull {
    box-shadow: 0 0 0 3px rgba(255, 251, 233, 0.98), 0 0 20px rgba(255, 240, 179, 0.4);
  }

  .board-frame {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 250px;
    border-radius: 24px;
    background:
      radial-gradient(circle at center, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02) 58%, rgba(255, 255, 255, 0) 72%);
  }

  .scoreboard {
    min-height: 0;
    padding: 22px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .scoreboard-title {
    margin-top: 0.35rem;
    font-size: 1.5rem;
    font-weight: 800;
    color: #fff;
  }

  .remaining-standings {
    margin-top: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    flex-shrink: 0;
  }

  .standing-chip {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.55rem 0.8rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: #d6e2f3;
  }

  .standing-chip.active {
    border-color: color-mix(in srgb, var(--c) 50%, rgba(255, 255, 255, 0.08));
    background: linear-gradient(135deg, color-mix(in srgb, var(--c) 20%, #12203a), rgba(255, 255, 255, 0.04));
    box-shadow: 0 10px 22px color-mix(in srgb, var(--c) 18%, transparent);
  }

  .standing-place {
    color: #9ab1d2;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .standing-name {
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.84rem;
    font-weight: 700;
  }

  .standing-chip strong {
    color: #fff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1rem;
  }

  .scoreboard-list {
    margin-top: 18px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    min-height: 0;
    overflow: hidden;
    align-content: start;
  }

  .player-card {
    border-radius: 22px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    min-height: 0;
  }

  .player-card.active {
    border-color: color-mix(in srgb, var(--c) 42%, rgba(255, 255, 255, 0.08));
    background: linear-gradient(135deg, color-mix(in srgb, var(--c) 16%, #0f1b2f), rgba(255, 255, 255, 0.03));
    box-shadow: 0 16px 36px color-mix(in srgb, var(--c) 18%, transparent);
  }

  .player-main {
    display: grid;
    grid-template-columns: 52px 68px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }

  .player-rank {
    height: 38px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.05);
    color: #a8bddb;
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .player-card.active .player-rank {
    color: #fff;
    background: color-mix(in srgb, var(--c) 28%, rgba(255, 255, 255, 0.06));
  }

  .player-avatar {
    width: 68px;
    height: 68px;
    border-radius: 16px;
    overflow: hidden;
    background: color-mix(in srgb, var(--c) 78%, #1b2d48);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
    font-weight: 800;
  }

  .player-copy {
    min-width: 0;
  }

  .player-name {
    font-size: 1.2rem;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .player-sub {
    margin-top: 0.2rem;
    color: #97accb;
    font-size: 0.84rem;
    font-weight: 700;
  }

  .player-avgs {
    margin-top: 0.35rem;
    display: grid;
    grid-template-columns: auto auto;
    gap: 12px;
    align-items: end;
  }

  .player-avg-item small {
    display: block;
    color: #89a1c4;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 800;
  }

  .player-avg-item strong,
  .player-avg-item span {
    display: block;
    margin-top: 0.12rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    line-height: 1;
  }

  .player-avg-item strong {
    color: #eef4ff;
    font-size: 1rem;
  }

  .player-avg-item.up strong {
    color: #7ef0a6;
    text-shadow: 0 0 18px rgba(126, 240, 166, 0.32);
  }

  .player-avg-item.down strong {
    color: #ff8d8d;
    text-shadow: 0 0 18px rgba(255, 141, 141, 0.28);
  }

  .player-avg-item span {
    color: #a6b8d3;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .player-score {
    min-width: 88px;
    font-size: 2.2rem;
    font-weight: 800;
    color: #fff;
  }

  .player-score-block {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: right;
  }

  .player-standing {
    padding: 0.24rem 0.52rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    color: #9ab1d2;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .player-card.active .player-standing {
    background: color-mix(in srgb, var(--c) 18%, rgba(255, 255, 255, 0.06));
    color: #eef4ff;
  }

  .player-score-label {
    margin-top: 0.12rem;
    color: #8fa7cb;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .player-progress {
    margin-top: 12px;
  }

  .value-bar {
    height: 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }

  .value-fill {
    height: 100%;
    border-radius: inherit;
  }

  .player-footer {
    margin-top: 10px;
    color: #a4b7d4;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .scoreboard.compact {
    padding: 18px;
  }

  .scoreboard.compact .scoreboard-title {
    font-size: 1.18rem;
  }

  .scoreboard.compact .remaining-standings {
    margin-top: 12px;
    gap: 8px;
  }

  .scoreboard.compact .standing-chip {
    gap: 0.42rem;
    padding: 0.4rem 0.62rem;
  }

  .scoreboard.compact .standing-place {
    font-size: 0.64rem;
  }

  .scoreboard.compact .standing-name {
    max-width: 6.8rem;
    font-size: 0.76rem;
  }

  .scoreboard.compact .standing-chip strong {
    font-size: 0.88rem;
  }

  .scoreboard.compact .scoreboard-list {
    margin-top: 12px;
    gap: 10px;
  }

  .player-card.compact {
    padding: 11px 12px;
    border-radius: 18px;
  }

  .player-card.compact .player-main {
    grid-template-columns: 42px 52px minmax(0, 1fr) auto;
    gap: 9px;
  }

  .player-card.compact .player-rank {
    height: 30px;
    border-radius: 10px;
    font-size: 0.64rem;
  }

  .player-card.compact .player-avatar {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    font-size: 1.15rem;
  }

  .player-card.compact .player-name {
    font-size: 0.95rem;
  }

  .player-card.compact .player-sub {
    margin-top: 0.1rem;
    font-size: 0.68rem;
  }

  .player-card.compact .player-avgs {
    margin-top: 0.2rem;
    gap: 6px;
  }

  .player-card.compact .player-avg-item small {
    font-size: 0.5rem;
  }

  .player-card.compact .player-avg-item strong {
    font-size: 0.8rem;
  }

  .player-card.compact .player-avg-item span {
    font-size: 0.72rem;
  }

  .player-card.compact .player-standing {
    padding: 0.18rem 0.42rem;
    font-size: 0.58rem;
  }

  .player-card.compact .player-score {
    min-width: 62px;
    font-size: 1.6rem;
    line-height: 1;
  }

  .player-card.compact .player-score-label {
    font-size: 0.62rem;
  }

  .player-card.compact .player-progress {
    margin-top: 6px;
  }

  .player-card.compact .value-bar {
    height: 8px;
  }

  .player-card.compact .player-footer {
    margin-top: 6px;
    font-size: 0.64rem;
    line-height: 1.2;
    gap: 8px;
  }

  .player-card.compact .player-footer span:last-child {
    text-align: right;
  }

  .scoreboard.grid .scoreboard-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .scoreboard.grid .remaining-standings {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .scoreboard.grid .standing-chip {
    width: 100%;
    justify-content: space-between;
  }

  .scoreboard.grid .standing-name {
    max-width: 100%;
  }

</style>

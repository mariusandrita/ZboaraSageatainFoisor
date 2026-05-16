<script>
  import { onDestroy } from 'svelte';
  import Dartboard from '../dartboard/Dartboard.svelte';
  import BadgeToken from '../../../shared/BadgeToken.svelte';

  export let matchState = null;
  export let turnState = null;
  export let liveMatchStats = [];
  export let playerAwards = {};
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
    return playerAwards?.[playerId]
      ?? liveMatchStats.find((stats) => stats.player_id === playerId)?.awards
      ?? [];
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

  $: players = (matchState?.players ?? []).filter((player) => !player.eliminated_at);
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
  $: nextPlayers = activeIndex >= 0 && playerCount > 1
    ? Array.from({ length: Math.min(8, playerCount - 1) }, (_, i) => players[(activeIndex + 1 + i) % playerCount]).filter(Boolean)
    : [];
  $: playerCount = players.length || 1;
  $: multiLegMatch = (matchState?.legs_to_win ?? 1) > 1;
  $: boardDarts = turn.length > 0 ? turn : lastTurnDarts;
  $: boardLatestDart = boardDarts.length > 0 ? boardDarts[boardDarts.length - 1] : null;
  $: boardPlayer = players.find((player) => player.id === boardDarts[0]?.player_id) ?? null;
  $: boardTotal = boardDarts.reduce((sum, dart) => sum + dartScore(dart), 0);
  $: currentLiveBadges = currentPlayerId ? liveBadgesFor(currentPlayerId) : [];
  $: compactSidebar = playerCount >= 7;
  $: gridSidebar = playerCount >= 7;
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
  $: rankedPlayers = remainingStandings
    .map((entry) => ({
      ...entry,
      player: playersById.get(entry.id),
    }))
    .filter((entry) => entry.player);

  function progressWidth(playerId) {
    const start = matchState?.starting_score ?? 0;
    const remaining = turnState?.remaining?.[playerId] ?? start;
    if (start <= 0) return 0;
    const completed = ((start - remaining) / start) * 100;
    return Math.max(0, Math.min(100, completed));
  }

  function playerVisitFor(playerId) {
    const pVisits = turnState?.playerVisits?.[playerId];
    const isCurrent = playerId === turnState?.currentPlayerId;
    const currentDarts = pVisits?.current ?? [];
    return (isCurrent && currentDarts.length > 0) ? currentDarts : (pVisits?.lastCompleted ?? []);
  }

  function playerLegStats(playerId) {
    const visit = turnState?.playerVisits?.[playerId];
    return {
      turnsCompleted: visit?.turnsCompleted ?? 0,
      dartsThrown: visit?.dartsThrown ?? 0,
    };
  }

  function currentTurnSlotScore(dart) {
    if (!dart) return 'în așteptare';
    if (dart.busted) return 'S0';
    return `S${dartScore(dart)}`;
  }

  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  $: dartboardSize = Math.round(viewportH * 0.215);

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
              {#if nextPlayers.length > 0}
                <div class="spotlight-next">
                  <span>Urmează</span>
                  <div class="spotlight-next-group">
                    {#each nextPlayers as p}
                      <div class="spotlight-next-main">
                        <div class="spotlight-next-avatar">
                          {#if p.photo}
                            <img src={p.photo} alt={p.name} />
                          {:else}
                            <span>{safeInitial(p.name)}</span>
                          {/if}
                        </div>
                        <strong>{p.name}</strong>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
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
                  <span class="dart-slot-label">T{i + 1}</span>
                  <span class="dart-name">{turn[i] ? dartLabel(turn[i]) : `D${i + 1}`}</span>
                  <small>{currentTurnSlotScore(turn[i])}</small>
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
          <Dartboard darts={boardDarts} size={dartboardSize} />
        </div>
      </div>
    </section>

    <aside class="scoreboard panel" class:compact={compactSidebar} class:grid={gridSidebar}>
      <div class="scoreboard-head">
        <div>
          <div class="eyebrow">Scor live</div>
        </div>
      </div>

      <div class="scoreboard-list">
        {#each rankedPlayers as entry (entry.id)}
          {@const player = entry.player}
          {@const isActive = player.id === currentPlayerId}
          {@const avgState = avgTrend(player.id)}
          {@const remainingRank = entry.place}
          {@const visitDarts = playerVisitFor(player.id)}
          <article class="player-card" class:active={isActive} class:compact={compactSidebar} style="--c:{player.color}">
            <div class="player-body">
              <div class="player-main">
                <div class="player-avatar">
                  {#if player.photo}
                    <img src={player.photo} alt={player.name} />
                  {:else}
                    <span>{safeInitial(player.name)}</span>
                  {/if}
                </div>

                <div class="player-copy">
                  <div class="player-name">{player.name}</div>
                  {#if isActive}
                    <div class="player-sub">La aruncare acum</div>
                  {/if}
                </div>
              </div>

              <div class="player-metrics">
                <div class="player-avg-item" class:up={avgState === 'up'} class:down={avgState === 'down'}>
                  <small>meci</small>
                  <strong>{formatAvg(matchAvgFor(player.id))}</strong>
                </div>
                <div class="player-avg-item">
                  <small>general</small>
                  <strong>{formatAvg(generalAvgFor(player.id))}</strong>
                </div>
              </div>

              <div class="player-visit-row" class:empty={visitDarts.length === 0}>
                {#if visitDarts.length > 0}
                  {#each visitDarts as dart, i}
                    <div class={`player-visit-dart filled ${dartTone(dart)}`} class:busted={dart?.busted}>
                      <span>{dartLabel(dart)}</span>
                    </div>
                  {/each}
                  {#each Array(Math.max(0, 3 - visitDarts.length)) as _, i}
                    <div class="player-visit-dart placeholder">
                      <span>D{visitDarts.length + i + 1}</span>
                    </div>
                  {/each}
                {:else}
                  <span class="player-visit-empty">—</span>
                {/if}
              </div>

            </div>

            <div class="player-score-block">
              <div class="player-rank">{isActive ? 'LIVE' : `LOC ${remainingRank}`}</div>
              <div class="player-score">{entry.remaining}</div>
              <div class="player-score-label">rămas</div>
              
              <div class="player-meta-chip">
                <span>{player.legs_won} / {matchState?.legs_to_win ?? 1} manșe</span>
                {#if multiLegMatch && player.best_finish > 1}
                  <span class="meta-sep">·</span>
                  <span>Finish {player.best_finish}</span>
                {/if}
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
    height: 7.8vh;
    padding: 0 1.5vw;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(6, 14, 25, 0.82);
    backdrop-filter: blur(16px);
    gap: 1.7vh;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 1.3vh;
  }

  .brand-mark {
    width: 0.63vw;
    height: 3.9vh;
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
    font-size: 2.2vh;
    font-weight: 800;
    color: #fff;
  }

  .brand-sub,
  .eyebrow,
  .score-kicker {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 1.1vh;
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
    justify-content: flex-end;
  }

  .clock {
    padding: 0.9vh 1.4vh;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    font-size: 1.2vh;
    font-weight: 700;
  }

  .clock {
    min-width: 11.1vh;
    text-align: center;
    color: #ffd166;
    font-weight: 800;
  }

  .match-clock {
    min-width: 9.9vw;
    padding: 0.9vh 2.5vh 1vh;
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
    font-size: 0.9vh;
    font-weight: 800;
    color: #9db3d5;
  }

  .match-clock strong {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 3.7vh;
    line-height: 1;
    color: #fff1c2;
  }

  .spotlight-next {
    display: flex;
    align-items: center;
    gap: 0.7vh;
    margin-top: 0.7vh;
    width: fit-content;
    max-width: 100%;
    opacity: 0.55;
  }

  .spotlight-next span {
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.9vh;
    font-weight: 700;
    color: #9ab2d5;
  }

  .spotlight-next-group {
    display: flex;
    align-items: center;
    gap: 1.2vh;
    flex-wrap: wrap;
  }

  .spotlight-next-main {
    display: flex;
    align-items: center;
    gap: 0.6vh;
    color: #dfeaf8;
    min-width: 0;
  }

  .spotlight-next-main strong {
    font-size: 1.15vh;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .spotlight-next-avatar {
    width: 2vh;
    height: 2vh;
    border-radius: 999px;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 0.9vh;
    font-weight: 800;
  }

  .spotlight-next-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .match-layout {
    height: 92.2vh;
    padding: 2vh 1.5vw 2.6vh;
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(18.75vw, 0.78fr);
    gap: 1.85vh;
  }

  .spotlight {
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 1.7vh;
  }

  .panel {
    border-radius: 2.4vh;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(9, 19, 35, 0.82);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 24px 80px rgba(0, 0, 0, 0.28);
  }

  .spotlight-main {
    padding: 2.2vh;
    display: flex;
    flex-direction: column;
    gap: 1.7vh;
    min-height: 0;
  }

  .spotlight-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 12.5vw;
    gap: 1.7vh;
    align-items: stretch;
  }

  .spotlight-player {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 1.7vh;
    padding: 1.85vh;
    border-radius: 2.2vh;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--accent) 24%, #10203a), rgba(255, 255, 255, 0.03));
  }

  .spotlight-avatar {
    width: 13.7vh;
    height: 13.7vh;
    flex-shrink: 0;
    border-radius: 2.2vh;
    overflow: hidden;
    border: 0.37vh solid rgba(255, 255, 255, 0.16);
    background: color-mix(in srgb, var(--accent) 85%, #203652);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 4.9vh;
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
    margin-top: 0.4vh;
    font-size: clamp(4.1vh, 4vw, 6.8vh);
    line-height: 0.95;
    font-weight: 800;
    color: #fff;
  }

  .spotlight-meta {
    margin-top: 0.8vh;
    color: #d3e0f2;
    font-size: 1.5vh;
    font-weight: 700;
  }

  .meta-sep {
    margin: 0 0.6vh;
    color: #89a2c7;
  }

  .score-tower {
    border-radius: 2.2vh;
    min-width: 0;
    max-width: 100%;
    min-height: 17.4vh;
    padding: 1.7vh 0.83vw;
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
    margin-top: 0.45vh;
    max-width: 100%;
    font-size: clamp(5vh, 5.2vw, 7.4vh);
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
    margin-top: 0.55vh;
    color: #97afcf;
    font-size: 1.25vh;
    font-weight: 700;
  }
  .score-mode {
    margin-top: 0.5vh;
    color: #d3e0f2;
    font-size: 1.15vh;
    font-weight: 700;
    line-height: 1.35;
    max-width: 17vw;
  }
  .score-tip {
    margin-top: 0.35vh;
    color: #ffd166;
    font-size: 1.15vh;
    font-weight: 700;
    line-height: 1.35;
    max-width: 17vw;
  }

  .visit-strip {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(15.6vw, 0.9fr);
    gap: 1.7vh;
  }

  .visit-card {
    min-height: 0;
    padding: 1.7vh;
    border-radius: 2vh;
    background: rgba(255, 255, 255, 0.025);
    display: flex;
    flex-direction: column;
    gap: 1.3vh;
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
    gap: 1.5vh;
  }

  .card-head strong {
    font-size: 3vh;
    color: #ffd166;
  }

  .visit-darts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.1vh;
  }

  .visit-darts.compact {
    margin-top: auto;
  }

  .dart-card {
    min-height: 9.1vh;
    border-radius: 1.7vh;
    padding: 1.3vh 0.625vw;
    display: grid;
    grid-template-rows: auto 1fr auto;
    justify-items: center;
    align-items: center;
    gap: 0.74vh;
    text-align: center;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.045);
    box-shadow: none;
  }

  .dart-slot-label {
    color: #89a1c4;
    font-size: 1vh;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .dart-card.segment-1-5,
  .player-visit-dart.segment-1-5 {
    --segment-border: rgba(255, 92, 145, 0.44);
    --segment-top: rgba(255, 92, 145, 0.18);
    --segment-fill-top: rgba(255, 92, 145, 0.46);
    --segment-fill-bottom: rgba(255, 92, 145, 0.2);
    --segment-name: #ffe0eb;
    --segment-glow: rgba(255, 92, 145, 0.34);
  }

  .dart-card.segment-6-10,
  .player-visit-dart.segment-6-10 {
    --segment-border: rgba(180, 119, 255, 0.44);
    --segment-top: rgba(180, 119, 255, 0.18);
    --segment-fill-top: rgba(180, 119, 255, 0.46);
    --segment-fill-bottom: rgba(180, 119, 255, 0.22);
    --segment-name: #f0e4ff;
    --segment-glow: rgba(180, 119, 255, 0.36);
  }

  .dart-card.segment-11-15,
  .player-visit-dart.segment-11-15 {
    --segment-border: rgba(255, 181, 70, 0.46);
    --segment-top: rgba(255, 181, 70, 0.18);
    --segment-fill-top: rgba(255, 181, 70, 0.48);
    --segment-fill-bottom: rgba(255, 181, 70, 0.22);
    --segment-name: #fff0d8;
    --segment-glow: rgba(255, 181, 70, 0.36);
  }

  .dart-card.segment-16-20,
  .player-visit-dart.segment-16-20 {
    --segment-border: rgba(255, 219, 77, 0.5);
    --segment-top: rgba(255, 219, 77, 0.22);
    --segment-fill-top: rgba(255, 219, 77, 0.56);
    --segment-fill-bottom: rgba(255, 219, 77, 0.24);
    --segment-name: #fff7d2;
    --segment-glow: rgba(255, 219, 77, 0.42);
  }

  .dart-card.segment-bull,
  .player-visit-dart.segment-bull {
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

  .dart-card.mult-double,
  .player-visit-dart.mult-double {
    --mult-ring: rgba(72, 219, 251, 0.96);
    --mult-glow: rgba(72, 219, 251, 0.5);
  }

  .dart-card.mult-triple,
  .player-visit-dart.mult-triple {
    --mult-ring: rgba(121, 255, 126, 0.98);
    --mult-glow: rgba(121, 255, 126, 0.54);
  }

  .dart-card.mult-bull,
  .player-visit-dart.mult-bull {
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
    font-size: 2.1vh;
    font-weight: 800;
    color: #fff;
    align-self: center;
  }

  .dart-card[class*='segment-'] .dart-name {
    color: var(--segment-name);
  }

  .dart-card small {
    color: #9eb2d0;
    font-size: 1.2vh;
    font-weight: 700;
  }

  .visit-meta,
  .player-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.1vh;
  }

  .visit-meta {
    margin-top: auto;
    color: #c5d5ec;
    font-size: 1.35vh;
    font-weight: 700;
  }

  .current-badge-panel {
    margin-top: 0.9vh;
    padding: 0.95vh 1.4vh;
    border-radius: 1.85vh;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.4vh;
  }

  .current-badge-copy {
    display: flex;
    flex-direction: column;
    gap: 0.37vh;
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .current-badge-label {
    color: #8fa7cb;
    font-size: 1.1vh;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .current-badge-copy strong {
    color: #f1f6ff;
    font-size: 1.5vh;
    font-weight: 800;
  }

  .current-badge-list {
    flex: 1 1 auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 1vh 1.4vh;
  }

  .current-badge-list :global(.badge-token) {
    gap: 1vh;
  }

  .current-badge-list :global(.badge-art-shell) {
    width: 3.9vh;
    height: 3.9vh;
  }

  .current-badge-list :global(.badge-label) {
    font-size: 1.3vh;
  }

  .current-badge-list :global(.badge-count) {
    font-size: 1.15vh;
  }

  .previous-player {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.93vh;
    color: #dbe6f8;
    font-weight: 700;
  }

  .previous-remaining {
    color: #93abcf;
    font-size: 1.25vh;
    font-weight: 700;
  }

  .previous-remaining strong {
    color: #ffd166;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.5vh;
  }

  .tiny-dot {
    width: 0.93vh;
    height: 0.93vh;
    border-radius: 50%;
  }

  .empty-state {
    margin-top: auto;
    min-height: 9.1vh;
    display: grid;
    place-items: center;
    color: #94a9c9;
    text-align: center;
    border-radius: 1.7vh;
    background: rgba(255, 255, 255, 0.03);
  }

  .mini-title {
    margin-top: 0.35vh;
    font-size: 2.2vh;
    color: #fff;
    font-weight: 800;
  }

  .board-section {
    padding: 1.7vh 1.15vw;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 13vw;
    gap: 1.7vh;
    align-items: center;
  }

  .board-sub {
    margin-top: 0.65vh;
    color: #c8d7ec;
    font-size: 1.45vh;
    font-weight: 700;
  }

  .board-legend {
    margin-top: 1vh;
    display: grid;
    gap: 0.93vh;
  }

  .legend-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.74vh;
    align-items: center;
  }

  .legend-label {
    color: #8fa7cb;
    font-size: 1vh;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .legend-chip {
    display: inline-flex;
    align-items: center;
    min-height: 2.6vh;
    padding: 0.35vh 0.9vh;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #f1f6ff;
    font-size: 1.1vh;
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
    min-height: 23vh;
    border-radius: 2.2vh;
    background:
      radial-gradient(circle at center, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02) 58%, rgba(255, 255, 255, 0) 72%);
  }

  .scoreboard {
    min-height: 0;
    padding: 2vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .scoreboard-title {
    margin-top: 0.35vh;
    font-size: 2.2vh;
    font-weight: 800;
    color: #fff;
  }

  .scoreboard-list {
    margin-top: 1.5vh;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.1vh;
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
    align-content: start;
  }

  .player-card {
    border-radius: 2vh;
    padding: 1.7vh;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    height: auto;
  }

  .player-card.active {
    border-color: color-mix(in srgb, var(--c) 42%, rgba(255, 255, 255, 0.08));
    background: linear-gradient(135deg, color-mix(in srgb, var(--c) 16%, #0f1b2f), rgba(255, 255, 255, 0.03));
    box-shadow: 0 16px 36px color-mix(in srgb, var(--c) 18%, transparent);
    min-height: 12.8vh;
    padding-bottom: 1.7vh;
  }

  .player-card.active .player-body {
    gap: 0.93vh;
  }

  .player-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1.3vh;
    align-items: start;
    min-height: 8.5vh;
  }

  .player-body {
    min-width: 0;
    display: grid;
    grid-template-rows: auto auto auto auto;
    gap: 0.74vh;
  }

  .player-main {
    display: grid;
    grid-template-columns: 4.8vh minmax(0, 1fr);
    gap: 0.93vh;
    align-items: center;
  }

  .player-rank {
    min-height: 2.96vh;
    padding: 0.22vh 0.9vh;
    border-radius: 1.1vh;
    display: inline-grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.05);
    color: #a8bddb;
    font-size: 1.1vh;
    font-weight: 800;
    letter-spacing: 0.08em;
    justify-self: end;
  }

  .player-card.active .player-rank {
    color: #fff;
    background: color-mix(in srgb, var(--c) 28%, rgba(255, 255, 255, 0.06));
  }

  .player-avatar {
    width: 4.8vh;
    height: 4.8vh;
    border-radius: 1.2vh;
    overflow: hidden;
    background: color-mix(in srgb, var(--c) 78%, #1b2d48);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.2vh;
    font-weight: 800;
  }

  .player-copy {
    min-width: 0;
    display: grid;
    grid-template-rows: auto auto;
    align-content: start;
    row-gap: 0.56vh;
  }

  .player-name {
    font-size: 1.6vh;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .player-sub {
    color: #97accb;
    font-size: 1.1vh;
    font-weight: 700;
  }

  .player-avgs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.3vh;
    align-items: end;
    min-height: 3.15vh;
  }

  .player-avg-item small {
    display: block;
    color: #89a1c4;
    font-size: 0.93vh;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 800;
  }

  .player-avg-item strong,
  .player-avg-item span {
    display: block;
    margin-top: 0.12vh;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    line-height: 1;
  }

  .player-avg-item strong {
    color: #eef4ff;
    font-size: 1.5vh;
  }

  .player-avg-item.up strong {
    color: #7ef0a6;
    text-shadow: 0 0 18px rgba(126, 240, 166, 0.32);
  }

  .player-avg-item.down strong {
    color: #ff8d8d;
    text-shadow: 0 0 18px rgba(255, 141, 141, 0.28);
  }

  .player-avg-item span,
  .player-avg-item strong {
    color: #a6b8d3;
    font-size: 1.35vh;
    font-weight: 700;
  }

  .player-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.1vh;
    align-items: end;
    min-height: 2.6vh;
  }

  .player-visit-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.74vh;
    min-height: 2.78vh;
    align-items: stretch;
  }

  .player-visit-row.empty {
    grid-template-columns: 1fr;
  }

  .player-visit-dart {
    min-width: 0;
    min-height: 2.78vh;
    border-radius: 0.93vh;
    display: grid;
    place-items: center;
    padding: 0 0.42vw;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    font-size: 1.04vh;
    font-weight: 800;
    color: #dfeaf8;
    text-transform: uppercase;
  }

  .player-visit-dart.filled.segment-1-5,
  .player-visit-dart.filled.segment-6-10,
  .player-visit-dart.filled.segment-11-15,
  .player-visit-dart.filled.segment-16-20,
  .player-visit-dart.filled.segment-bull {
    border-color: var(--segment-border);
    background: linear-gradient(180deg, var(--segment-fill-top), var(--segment-fill-bottom));
    box-shadow: 0 0 0 2px var(--mult-ring), 0 0 16px var(--mult-glow);
    color: var(--segment-name);
  }

  .player-visit-dart.busted {
    background: rgba(255, 107, 107, 0.12);
    border-color: rgba(255, 107, 107, 0.18);
    color: #ff9a9a;
  }

  .player-visit-dart.placeholder {
    color: #7489ab;
    border-style: dashed;
    background: rgba(255, 255, 255, 0.02);
  }

  .player-visit-empty {
    align-self: center;
    color: #7085a7;
    font-size: 1.15vh;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .player-score {
    min-width: 8.1vh;
    font-size: 4.1vh;
    font-weight: 800;
    color: #fff;
  }

  .player-score-block {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: right;
    justify-content: center;
    min-width: 10.4vh;
    gap: 0.37vh;
  }

  .player-score-label {
    color: #8fa7cb;
    font-size: 1.1vh;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .player-footer {
    min-height: 1.3vh;
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .player-meta-chip {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.37vh;
    min-width: 0;
    padding: 0;
    color: #a4b7d4;
    font-size: 1vh;
    font-weight: 800;
    line-height: 1.2;
    text-align: right;
  }

  .scoreboard.compact {
    padding: 1.7vh;
  }

  .scoreboard.compact .scoreboard-list {
    margin-top: 1.1vh;
    gap: 1.1vh;
  }

  .player-card.compact {
    padding: 1.3vh;
    border-radius: 1.7vh;
  }

  .player-card.compact .player-main {
    grid-template-columns: 4.8vh minmax(0, 1fr);
    gap: 0.83vh;
  }

  .player-card:not(.active) {
    min-height: 7.2vh;
    padding: 0.93vh 0.83vw;
  }

  .player-card:not(.active) .player-score-block {
    gap: 0;
  }

  .player-card:not(.active) .player-body {
    gap: 0.37vh;
  }

  .player-card:not(.active) .player-main {
    grid-template-columns: 4.07vh minmax(0, 1fr);
    gap: 0.74vh;
  }

  .player-card:not(.active) .player-avatar {
    width: 4.07vh;
    height: 4.07vh;
    border-radius: 1vh;
    font-size: 1.85vh;
  }

  .player-card:not(.active) .player-name {
    font-size: 1.4vh;
  }

  .player-card:not(.active) .player-metrics {
    min-height: 2.22vh;
    gap: 0.93vh;
  }

  .player-card:not(.active) .player-avg-item small {
    font-size: 0.83vh;
  }

  .player-card:not(.active) .player-avg-item strong {
    font-size: 1.35vh;
  }

  .player-card:not(.active) .player-visit-row {
    min-height: 2.04vh;
    gap: 0.46vh;
  }

  .player-card:not(.active) .player-visit-dart {
    min-height: 2.04vh;
    border-radius: 0.74vh;
    font-size: 0.9vh;
    padding: 0 0.21vw;
  }

  .player-card:not(.active) .player-footer {
    min-height: 0.93vh;
  }

  .player-card:not(.active) .player-meta-chip {
    font-size: 0.9vh;
  }

  .player-card:not(.active) .player-score {
    font-size: 3.33vh;
    min-width: 6.67vh;
    line-height: 1;
  }

  .player-card:not(.active) .player-rank {
    min-height: 2.41vh;
    padding: 0.14vh 0.65vh;
    border-radius: 0.93vh;
    font-size: 0.95vh;
  }

  .player-card.compact .player-rank {
    min-height: 2.41vh;
    padding: 0.14vh 0.62vh;
    border-radius: 0.93vh;
    font-size: 0.95vh;
  }

  .player-card.compact .player-avatar {
    width: 4.8vh;
    height: 4.8vh;
    border-radius: 1.1vh;
    font-size: 2.1vh;
  }

  .player-card.compact .player-name {
    font-size: 1.4vh;
  }

  .player-card.compact .player-sub {
    font-size: 1vh;
  }

  .player-card.compact .player-avgs {
    gap: 0.56vh;
    min-height: 2.41vh;
  }

  .player-card.compact .player-avg-item small {
    font-size: 0.74vh;
  }

  .player-card.compact .player-avg-item strong {
    font-size: 1.2vh;
  }

  .player-card.compact .player-avg-item span {
    font-size: 1.07vh;
  }

  .player-card.compact .player-metrics {
    gap: 0.74vh;
    min-height: 2.41vh;
  }

  .player-card.compact .player-visit-row {
    gap: 0.46vh;
    min-height: 2.59vh;
  }

  .player-card.compact .player-visit-dart {
    min-height: 2.59vh;
    border-radius: 0.74vh;
    font-size: 0.92vh;
    padding: 0 0.21vw;
  }

  .player-card.compact .player-visit-empty {
    font-size: 1vh;
  }

  .player-card.compact .player-footer {
    min-height: 1.3vh;
  }

  .player-card.compact .player-score {
    min-width: 5.74vh;
    font-size: 2.96vh;
    line-height: 1;
  }

  .player-card.compact .player-score-label {
    font-size: 0.92vh;
  }

  .player-card.compact .player-meta-chip {
    font-size: 0.95vh;
  }

  .scoreboard.grid .scoreboard-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.93vh;
  }

</style>

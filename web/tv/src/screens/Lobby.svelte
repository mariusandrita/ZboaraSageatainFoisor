<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import BadgeToken from '../../../shared/BadgeToken.svelte';

  export let connected = false;
  export let matchSetup = null;

  let data = null;
  let liveMatches = [];
  let clock = '';
  let sceneIdx = 0;
  let playerIdx = 0;
  let clockTimer, sceneTimer, playerTimer, refreshTimer, liveRefreshTimer;

  onMount(async () => {
    await loadAll();
    updateClock();
    clockTimer   = setInterval(updateClock, 1000);
    sceneTimer   = setInterval(nextScene, 8000);
    playerTimer  = setInterval(nextPlayer, 9000);
    refreshTimer = setInterval(loadData, 60_000);
    liveRefreshTimer = setInterval(loadLiveMatches, 15_000);
  });

  onDestroy(() => {
    clearInterval(clockTimer);
    clearInterval(sceneTimer);
    clearInterval(playerTimer);
    clearInterval(refreshTimer);
    clearInterval(liveRefreshTimer);
  });

  async function loadAll() {
    await Promise.all([loadData(), loadLiveMatches()]);
  }

  async function loadData() {
    try {
      const res = await fetch('/api/stats/lobby');
      if (res.ok) data = await res.json();
    } catch (e) { console.error(e); }
  }

  async function loadLiveMatches() {
    try {
      const res = await fetch('/api/matches?status=live');
      if (!res.ok) return;
      const matches = await res.json();
      liveMatches = await Promise.all(
        matches.map(async (match) => {
          const full = await fetch(`/api/matches/${match.id}`);
          if (!full.ok) return null;
          return full.json();
        })
      ).then((items) => items.filter(Boolean));
    } catch (e) {
      console.error(e);
    }
  }

  function updateClock() {
    const now = new Date();
    clock = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  }

  $: scenes = buildScenes(data, liveMatches);

  function nextScene() {
    sceneIdx = (sceneIdx + 1) % Math.max(scenes.length, 1);
  }

  function nextPlayer() {
    playerIdx = (playerIdx + 1) % Math.max((data?.playerSpotlights?.length ?? 0), 1);
  }

  function fmtDate(dt) {
    if (!dt) return '';
    const normalized = dt.includes('T') ? dt : dt.replace(' ', 'T');
    const date = new Date(`${normalized}Z`);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  }

  function pct(value, total) {
    if (!total) return 0;
    return Math.max(6, Math.round((value / total) * 100));
  }

  function buildScenes(d, activeMatches = []) {
    if (!d) return activeMatches.length ? ['resume'] : ['waiting'];
    const list = [];
    if (activeMatches.length)                               list.push('resume');
    if (d.recentMatches?.length)                            list.push('recent');
    if (d.highFinish?.value || d.most180?.count)            list.push('records');
    if (d.triplesBySegment?.length || d.highTriplesLeaderboard?.length) list.push('triples');
    if (d.playerWinRates?.length)                           list.push('winrates');
    if (d.recentHundredPlus?.length)                        list.push('hundredplus');
    if (d.hundredPlusLeaderboard?.length)                   list.push('hundredboard');
    if (d.highFinishLeaderboard?.length)                    list.push('highfinishes');
    if (d.bestMatchAvg?.avg || d.longestStreak?.count > 1)  list.push('highlights');
    return list.length ? list : ['waiting'];
  }

  $: currentScene = scenes[sceneIdx % Math.max(scenes.length, 1)];
  $: spotlightPlayers = data?.playerSpotlights ?? [];
  $: spotlight = spotlightPlayers[playerIdx % Math.max(spotlightPlayers.length, 1)] ?? null;
  $: setupPlayers = buildSetupPlayers(matchSetup, data?.playerSpotlights ?? []);
  $: selectedPlayerIds = new Set(matchSetup?.selectedIds ?? []);
  $: selectedPlayerCount = matchSetup?.selectedIds?.length ?? 0;
  $: setupLegLabel = setupLegsLabel(matchSetup?.legsToWin);
  $: liveLobbyMatches = liveMatches.slice(0, 3);
  $: liveMatchesCount = liveMatches.length;

  function tickerText(d) {
    if (!d) return 'DartsLeague — Așteptăm jucătorii…';
    const parts = [];
    if (d.top?.[0])                   parts.push(`🎯 ${d.top[0].name}: medie ${d.top[0].avg_3dart}`);
    if (d.most180?.count)             parts.push(`💯 ${d.most180.name}: ${d.most180.count} 180-uri`);
    if (d.highFinish?.value)          parts.push(`🏆 Cel mai mare finish: ${d.highFinish.value} (${d.highFinish.name})`);
    if (d.totalMatches)               parts.push(`📋 ${d.totalMatches} meciuri jucate`);
    if (d.totalDarts)                 parts.push(`🎯 ${d.totalDarts} săgeți aruncate`);
    if (d.longestStreak?.count > 1)   parts.push(`🔗 Serie: ${d.longestStreak.count} manșe (${d.longestStreak.name})`);
    return parts.join('   ·   ') || 'DartsLeague — Așteptăm jucătorii…';
  }

  function buildSetupPlayers(setup, statsPlayers) {
    if (!setup?.availablePlayers?.length) return [];
    const statsById = new Map(statsPlayers.map((player) => [player.id, player]));

    return setup.availablePlayers.map((player, idx) => {
      const stats = statsById.get(player.id) ?? {};
      const selectionIdx = setup.selectedIds?.indexOf(player.id) ?? -1;
      return {
        ...player,
        avg_3dart: stats.avg_3dart ?? 0,
        wins: stats.wins ?? 0,
        played_matches: stats.played_matches ?? 0,
        high_finish: stats.high_finish ?? 0,
        s100plus: stats.s100plus ?? 0,
        selectionIdx,
        orderIdx: idx,
      };
    });
  }

  function setupLegsLabel(value) {
    const totalLegs = Math.max(((value ?? 1) * 2) - 1, 1);
    return `Best of ${totalLegs}`;
  }

  function safeInitial(name) {
    return name?.[0]?.toUpperCase() ?? '?';
  }

  function liveMatchMeta(match) {
    if (!match) return '';
    return `${match.starting_score} · Manșa ${match.activeLeg?.leg_number ?? '?'} · Best of ${Math.max((match.legs_to_win ?? 1) * 2 - 1, 1)}`;
  }

  function liveMatchElapsed(activeMs) {
    const secs = Math.max(0, Math.floor((Number(activeMs) || 0) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${String(m).padStart(2, '0')}m`;
  }

  function liveCurrentPlayer(match) {
    return match?.players?.find((player) => player.id === match?.turnState?.currentPlayerId) ?? null;
  }

  function liveRemaining(match, playerId) {
    return match?.turnState?.remaining?.[playerId] ?? match?.starting_score ?? 0;
  }

  function winRate(player) {
    if (!player?.played_matches) return 0;
    return Math.round((player.wins / player.played_matches) * 100);
  }
</script>

<div class="lobby">

  <!-- Top bar -->
  <header class="topbar">
    <div class="logo">
      <span class="logo-dart">🎯</span>
      <div class="logo-text">
        <span class="logo-main">DartsLeague</span>
        <span class="logo-sub">Editia Foisor</span>
      </div>
    </div>
    <div class="clock">{clock}</div>
    <div class="status-pill" class:online={connected} class:setup-live={matchSetup}>
      <span class="pulse"></span>
      {#if !connected}
        Se conectează…
      {:else if matchSetup}
        Se configurează următorul meci
      {:else if liveMatchesCount}
        {liveMatchesCount} meci{liveMatchesCount === 1 ? '' : 'uri'} în curs · pot fi reluate
      {:else}
        Așteptăm meciul următor
      {/if}
    </div>
  </header>

  {#if matchSetup}
    <div class="setup-shell">
      <section class="setup-stage">
        <div class="setup-header">
          <div>
            <div class="setup-kicker">Match Creation</div>
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

        <div class="setup-grid" class:has-selection={selectedPlayerCount > 0}>
          {#each setupPlayers as player}
            <article class="setup-card" class:selected={selectedPlayerIds.has(player.id)} style="--player-color:{player.color}">
              {#if player.selectionIdx >= 0}
                <div class="setup-selected-chip">Selectat</div>
              {/if}
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
                {#if player.selectionIdx >= 0}
                  <div class="setup-order">{player.selectionIdx + 1}</div>
                {/if}
              </div>

              <div class="setup-stats">
                <div class="setup-stat">
                  <span>Avg 3</span>
                  <strong>{player.avg_3dart}</strong>
                </div>
                <div class="setup-stat">
                  <span>High finish</span>
                  <strong>{player.high_finish}</strong>
                </div>
                <div class="setup-stat">
                  <span>100+</span>
                  <strong>{player.s100plus}</strong>
                </div>
              </div>
            </article>
          {/each}
        </div>
      </section>
    </div>
  {:else}
    <!-- Body: 3 columns -->
    <div class="body">

    <!-- Left: Leaderboard -->
    <aside class="leaderboard">
      <div class="desk-panel">
        <div class="panel-label">
          <span class="panel-label-bar" style="background:#5bd5fc"></span>
          Match Desk
        </div>

        {#if liveLobbyMatches.length}
          <div class="resume-stack">
            {#each liveLobbyMatches as match}
              <article class="resume-mini-card">
                <div class="resume-mini-top">
                  <span class="resume-mini-chip">LIVE</span>
                  <span class="resume-mini-time">{liveMatchElapsed(match.active_elapsed_ms)}</span>
                </div>
                <div class="resume-mini-title">{liveMatchMeta(match)}</div>
                <div class="resume-mini-players">
                  {#each match.players ?? [] as player}
                    <div class="resume-mini-player">
                      <span class="resume-mini-dot" style="background:{player.color}"></span>
                      <span class="resume-mini-name">{player.name}</span>
                      <strong>{liveRemaining(match, player.id)}</strong>
                    </div>
                  {/each}
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <div class="desk-empty">
            <strong>Niciun meci live</strong>
            <span>Lobby-ul e liber pentru următoarea confruntare.</span>
          </div>
        {/if}
      </div>

      <div class="panel-label">
        <span class="panel-label-bar"></span>
        Clasament
      </div>

      {#if data?.top?.length}
        <div class="lb-list">
          {#each data.top as p, i}
            <div class="lb-card" class:rank1={i === 0} class:rank2={i === 1} class:rank3={i === 2}>
              <span class="lb-rank" class:gold={i===0} class:silver={i===1} class:bronze={i===2}>{i + 1}</span>
              <div class="lb-avatar" style="--c:{p.color}">
                {#if p.photo}
                  <img src={p.photo} alt={p.name} />
                {:else}
                  <span>{p.name[0].toUpperCase()}</span>
                {/if}
              </div>
              <div class="lb-info">
                <span class="lb-name">{p.name}</span>
                <span class="lb-legs">{p.legs_won} manșe · {p.s180 ?? 0}× 180</span>
              </div>
              <div class="lb-avg-block">
                <span class="lb-avg">{p.avg_3dart ?? '—'}</span>
                <span class="lb-avg-lbl">avg</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="lb-empty">
          <span>Fără statistici</span>
          <small>Joacă primul meci!</small>
        </div>
      {/if}

      <div class="lb-footer">
        <div class="lb-total">
          <span>Meciuri</span>
          <strong>{data?.totalMatches ?? 0}</strong>
        </div>
        <div class="lb-total">
          <span>Săgeți</span>
          <strong>{data?.totalDarts ?? 0}</strong>
        </div>
      </div>
    </aside>

    <!-- Center: Player spotlight -->
    <aside class="player-col">
      <div class="panel-label">
        <span class="panel-label-bar" style="background:#5bd5fc"></span>
        Player Spotlight
        {#if spotlightPlayers.length > 1}
          <div class="sdots-inline">
            {#each spotlightPlayers as _, i}
              <div class="sdot-sm" class:active={i === playerIdx % spotlightPlayers.length}></div>
            {/each}
          </div>
        {/if}
      </div>

      {#if spotlight}
        {#key spotlight.id}
          <div class="sp-card" in:fade={{ duration: 350 }}>
            <div class="sp-hero" style="--c:{spotlight.color}">
              <div class="sp-avatar">
                {#if spotlight.photo}
                  <img src={spotlight.photo} alt={spotlight.name} />
                {:else}
                  <span>{safeInitial(spotlight.name)}</span>
                {/if}
              </div>
              <div class="sp-info">
                <div class="sp-name">{spotlight.name}</div>
                <div class="sp-sub">{spotlight.played_matches} meciuri · {spotlight.wins} victorii</div>
              </div>
              <div class="sp-pill">
                <span>Win rate</span>
                <strong>{winRate(spotlight)}%</strong>
              </div>
            </div>

            <div class="sp-metrics">
              <div class="sp-metric">
                <span>Avg 3</span>
                <strong>{spotlight.avg_3dart ?? 0}</strong>
              </div>
              <div class="sp-metric">
                <span>First 9</span>
                <strong>{spotlight.avg_first9 ?? 0}</strong>
              </div>
              <div class="sp-metric">
                <span>Checkout</span>
                <strong>{spotlight.checkout_pct ?? 0}%</strong>
              </div>
              <div class="sp-metric">
                <span>High finish</span>
                <strong>{spotlight.high_finish ?? 0}</strong>
              </div>
              <div class="sp-metric">
                <span>180</span>
                <strong>{spotlight.s180 ?? 0}</strong>
              </div>
              <div class="sp-metric">
                <span>Legs</span>
                <strong>{spotlight.legs_won ?? 0}/{spotlight.legs_played ?? 0}</strong>
              </div>
            </div>

            {#if spotlight.top_values?.length}
              <div class="sp-section">
                <div class="sp-section-lbl">Top 5 valori lovite</div>
                <div class="sp-values">
                  {#each spotlight.top_values as hit}
                    <div class="sp-value-row">
                      <span class="sp-value-label">{hit.label}</span>
                      <div class="sp-bar-bg">
                        <div class="sp-bar-fill" style="width:{pct(hit.count, spotlight.top_values[0]?.count)}%; background:{spotlight.color}"></div>
                      </div>
                      <strong>{hit.count}</strong>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if spotlight.awards?.length}
              <div class="sp-section">
                <div class="sp-section-lbl">Badge-uri</div>
                <div class="sp-badges">
                  {#each spotlight.awards as award}
                    <BadgeToken kind={award.kind} count={award.count} />
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/key}
      {:else}
        <div class="lb-empty">
          <span>Apare după primul meci</span>
        </div>
      {/if}
    </aside>

    <!-- Right: Broadcast desk (rotating scenes) -->
    <section class="spotlight">
      {#key sceneIdx}
        <div class="scene" in:fade={{ duration: 450 }}>

          {#if currentScene === 'resume'}
            <div class="scene-hdr">
              <span class="scene-icon">🕹️</span>
              <span class="scene-title">Meciuri în curs</span>
            </div>
            <div class="resume-scene-list">
              {#each liveMatches as match}
                <article class="resume-scene-card">
                  <div class="resume-scene-head">
                    <div>
                      <div class="resume-scene-kicker">Se poate relua din controller</div>
                      <div class="resume-scene-meta">{liveMatchMeta(match)}</div>
                    </div>
                    <div class="resume-scene-right">
                      <span class="resume-scene-chip">LIVE</span>
                      <span class="resume-scene-elapsed">{liveMatchElapsed(match.active_elapsed_ms)}</span>
                    </div>
                  </div>

                  <div class="resume-scene-grid">
                    {#each match.players ?? [] as player}
                      <div class="resume-player-card" style="--player-color:{player.color}">
                        <div class="resume-player-top">
                          <div class="resume-player-ident">
                            <span class="resume-player-dot"></span>
                            <span>{player.name}</span>
                          </div>
                          <strong>{player.legs_won}</strong>
                        </div>
                        <div class="resume-player-score">{liveRemaining(match, player.id)}</div>
                        <div class="resume-player-sub">
                          {#if liveCurrentPlayer(match)?.id === player.id}
                            La aruncare acum
                          {:else}
                            În așteptare
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </article>
              {/each}
            </div>

          {:else if currentScene === 'recent'}
            <div class="scene-hdr">
              <span class="scene-icon">📋</span>
              <span class="scene-title">Rezultate Recente</span>
            </div>
            <div class="recent-list">
              {#each (data?.recentMatches ?? []) as m}
                <div class="result-card">
                  <div class="result-meta">
                    <div class="result-badge">{m.starting_score}</div>
                    {#if m.public_code}<div class="result-code">{m.public_code}</div>{/if}
                  </div>
                  <div class="result-players">
                    {#each m.players as p}
                      <div class="rp" class:winner={p.id === m.winner_id}>
                        <div class="rp-dot" style="background:{p.color}"></div>
                        <span class="rp-name">{p.name}</span>
                        {#if p.id === m.winner_id}<span class="rp-crown">👑</span>{/if}
                        <span class="rp-legs">{p.legs_won}</span>
                      </div>
                    {/each}
                  </div>
                  <div class="result-date">{fmtDate(m.ended_at)}</div>
                </div>
              {/each}
            </div>

          {:else if currentScene === 'records'}
            <div class="scene-hdr">
              <span class="scene-icon">🏆</span>
              <span class="scene-title">Recorduri</span>
            </div>
            <div class="records-grid">
              {#if data?.highFinish?.value}
                <div class="rec-card">
                  <div class="rec-val" style="color:#ffd700">{data.highFinish.value}</div>
                  <div class="rec-lbl">Cel mai mare finish</div>
                  <div class="rec-player" style="color:{data.highFinish.color}">{data.highFinish.name}</div>
                </div>
              {/if}
              {#if data?.most180?.count}
                <div class="rec-card">
                  <div class="rec-val" style="color:#ffb3b1">{data.most180.count}</div>
                  <div class="rec-lbl">Cele mai multe 180-uri</div>
                  <div class="rec-player" style="color:{data.most180.color}">{data.most180.name}</div>
                </div>
              {/if}
              {#if data?.most100plus?.count}
                <div class="rec-card">
                  <div class="rec-val" style="color:#5bd5fc">{data.most100plus.count}</div>
                  <div class="rec-lbl">Scoruri 100+</div>
                  <div class="rec-player" style="color:{data.most100plus.color}">{data.most100plus.name}</div>
                </div>
              {/if}
              {#if data?.mostHighTriples?.count}
                <div class="rec-card">
                  <div class="rec-val" style="color:#4caf50">{data.mostHighTriples.count}</div>
                  <div class="rec-lbl">Triple T15–T20</div>
                  <div class="rec-player" style="color:{data.mostHighTriples.color}">{data.mostHighTriples.name}</div>
                </div>
              {/if}
            </div>

          {:else if currentScene === 'triples'}
            <div class="scene-hdr">
              <span class="scene-icon">🎯</span>
              <span class="scene-title">Triple T15–T20</span>
            </div>
            {#if data?.triplesBySegment?.length}
              <div class="triples-grid">
                {#each data.triplesBySegment as seg}
                  <div class="triple-seg">
                    <div class="triple-seg-title">T{seg.segment}</div>
                    {#each seg.leaders as leader, li}
                      <div class="triple-seg-row">
                        <span class="triple-seg-rank" class:gold={li===0} class:silver={li===1} class:bronze={li===2}>{li+1}</span>
                        <div class="triple-dot" style="background:{leader.color}"></div>
                        <span class="triple-seg-name">{leader.name}</span>
                        <strong style="color:{leader.color}">{leader.count}</strong>
                      </div>
                    {/each}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="lb2-list">
                {#each (data?.highTriplesLeaderboard ?? []) as p, i}
                  <div class="lb2-row">
                    <span class="lb2-rank" class:gold={i===0} class:silver={i===1} class:bronze={i===2}>{i+1}</span>
                    <div class="lb2-dot" style="background:{p.color}">
                      {#if p.photo}<img src={p.photo} alt={p.name} />{:else}{p.name[0].toUpperCase()}{/if}
                    </div>
                    <span class="lb2-name">{p.name}</span>
                    <div class="lb2-bar-bg"><div class="lb2-bar" style="width:{Math.round(p.count / (data.highTriplesLeaderboard[0]?.count || 1) * 100)}%; background:{p.color}"></div></div>
                    <span class="lb2-val" style="color:{p.color}">{p.count}</span>
                  </div>
                {/each}
              </div>
            {/if}

          {:else if currentScene === 'hundredboard'}
            <div class="scene-hdr">
              <span class="scene-icon">💯</span>
              <span class="scene-title">Clubul 100+</span>
            </div>
            <div class="lb2-list">
              {#each (data?.hundredPlusLeaderboard ?? []) as p, i}
                <div class="lb2-row">
                  <span class="lb2-rank" class:gold={i===0} class:silver={i===1} class:bronze={i===2}>{i+1}</span>
                  <div class="lb2-dot" style="background:{p.color}">
                    {#if p.photo}<img src={p.photo} alt={p.name} />{:else}{p.name[0].toUpperCase()}{/if}
                  </div>
                  <span class="lb2-name">{p.name}</span>
                  <div class="lb2-bar-bg"><div class="lb2-bar" style="width:{Math.round(p.count / (data.hundredPlusLeaderboard[0]?.count || 1) * 100)}%; background:{p.color}"></div></div>
                  <span class="lb2-val" style="color:#ffb3b1">{p.count}</span>
                </div>
              {/each}
            </div>

          {:else if currentScene === 'highfinishes'}
            <div class="scene-hdr">
              <span class="scene-icon">🎖️</span>
              <span class="scene-title">High Finishes</span>
            </div>
            <div class="lb2-list">
              {#each (data?.highFinishLeaderboard ?? []) as p, i}
                <div class="lb2-row">
                  <span class="lb2-rank" class:gold={i===0} class:silver={i===1} class:bronze={i===2}>{i+1}</span>
                  <div class="lb2-dot" style="background:{p.color}">
                    {#if p.photo}<img src={p.photo} alt={p.name} />{:else}{p.name[0].toUpperCase()}{/if}
                  </div>
                  <span class="lb2-name">{p.name}</span>
                  <div class="lb2-bar-bg"><div class="lb2-bar" style="width:{Math.round(p.value / (data.highFinishLeaderboard[0]?.value || 1) * 100)}%; background:{p.color}"></div></div>
                  <span class="lb2-val" style="color:#ffd700">{p.value}</span>
                </div>
              {/each}
            </div>

          {:else if currentScene === 'winrates'}
            <div class="scene-hdr">
              <span class="scene-icon">📈</span>
              <span class="scene-title">Rata de Câștig</span>
            </div>
            <div class="wr-list">
              {#each (data?.playerWinRates ?? []) as p}
                <div class="wr-row">
                  <div class="wr-top">
                    <div class="wr-dot" style="background:{p.color}"></div>
                    <span class="wr-name">{p.name}</span>
                    <span class="wr-record">{p.wins}V · {p.played - p.wins}L</span>
                    <span class="wr-pct" style="color:{p.color}">{p.pct}%</span>
                  </div>
                  <div class="wr-bar-bg">
                    <div class="wr-bar" style="width:{p.pct}%; background:{p.color}"></div>
                  </div>
                </div>
              {/each}
            </div>

          {:else if currentScene === 'hundredplus'}
            <div class="scene-hdr">
              <span class="scene-icon">💥</span>
              <span class="scene-title">Club 100+</span>
            </div>
            <div class="h100-list">
              {#each (data?.recentHundredPlus ?? []) as t}
                <div class="h100-row">
                  <div class="h100-avatar" style="background:{t.color}">{t.player_name[0].toUpperCase()}</div>
                  <div class="h100-info">
                    <span class="h100-name">{t.player_name}</span>
                    <span class="h100-vs">
                      {#if t.opponents?.length}vs {t.opponents.join(' & ')}{/if}{#if t.public_code} · {t.public_code}{/if}{#if t.date} · {fmtDate(t.date)}{/if}
                    </span>
                  </div>
                  <div class="h100-score">{t.value}</div>
                </div>
              {/each}
            </div>

          {:else if currentScene === 'highlights'}
            <div class="scene-hdr">
              <span class="scene-icon">🔥</span>
              <span class="scene-title">Momente de Top</span>
            </div>
            <div class="hl-list">
              {#if data?.bestMatchAvg?.avg}
                <div class="hl-item">
                  <div class="hl-icon-wrap">📊</div>
                  <div class="hl-info">
                    <span class="hl-lbl">Cea mai bună medie într-un meci</span>
                    <span class="hl-player" style="color:{data.bestMatchAvg.color}">{data.bestMatchAvg.name}</span>
                  </div>
                  <div class="hl-val" style="color:#ffd700">{data.bestMatchAvg.avg}</div>
                </div>
              {/if}
              {#if data?.longestStreak?.count > 1}
                <div class="hl-item">
                  <div class="hl-icon-wrap">🔗</div>
                  <div class="hl-info">
                    <span class="hl-lbl">Cea mai lungă serie de victorii</span>
                    <span class="hl-player" style="color:{data.longestStreak.color}">{data.longestStreak.name}</span>
                  </div>
                  <div class="hl-val" style="color:#5bd5fc">{data.longestStreak.count}</div>
                </div>
              {/if}
              {#if data?.totalMatches > 0}
                <div class="hl-item">
                  <div class="hl-icon-wrap">🎯</div>
                  <div class="hl-info">
                    <span class="hl-lbl">Total</span>
                    <span class="hl-player">{data.totalMatches} meciuri · {data.totalDarts} săgeți</span>
                  </div>
                </div>
              {/if}
            </div>

          {:else}
            <div class="waiting-scene">
              <div class="waiting-icon">🎯</div>
              <div class="waiting-title">DartsLeague</div>
              <div class="waiting-sub">Editia Foisor</div>
            </div>
          {/if}

          {#if scenes.length > 1}
            <div class="scene-dots">
              {#each scenes as _, i}
                <div class="sdot" class:active={i === sceneIdx % scenes.length}></div>
              {/each}
            </div>
          {/if}

        </div>
      {/key}
    </section>

    </div>
  {/if}

  <!-- Ticker -->
  <div class="ticker">
    <span class="ticker-lbl">LIVE</span>
    <div class="ticker-track">
      <div class="ticker-scroll">
        <span>{tickerText(data)}</span>
        <span class="ticker-sep">◆</span>
        <span>{tickerText(data)}</span>
      </div>
    </div>
  </div>

</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700;800;900&family=Inter:wght@400;600&display=swap');

  .lobby {
    display: flex; flex-direction: column;
    height: 100vh; background: #0d0d1a; color: #c6c4df;
    font-family: 'Inter', system-ui, sans-serif;
    overflow: hidden;
  }

  /* ── Topbar ── */
  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.75rem 2rem;
    background: #191933;
    border-bottom: 1px solid #272742;
    flex-shrink: 0;
  }
  .logo { display: flex; align-items: center; gap: 0.7rem; }
  .logo-dart { font-size: 1.7rem; line-height: 1; }
  .logo-text { display: flex; flex-direction: column; }
  .logo-main {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.15rem; font-weight: 800; color: #fff; line-height: 1;
  }
  .logo-sub { font-size: 0.6rem; color: #6660aa; letter-spacing: 0.06em; margin-top: 1px; }

  .clock {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 2.4rem; font-weight: 900; color: #fff; letter-spacing: -2px;
  }

  .status-pill {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.75rem; color: #444;
    background: rgba(255,255,255,0.03); border: 1px solid #272742;
    padding: 0.4rem 1rem; border-radius: 999px;
  }
  .status-pill.online { color: #c6c4df; }
  .status-pill.setup-live {
    border-color: rgba(91, 213, 252, 0.35);
    background: rgba(91, 213, 252, 0.08);
  }
  .pulse {
    width: 8px; height: 8px; border-radius: 50%;
    background: #ffb3b1;
    animation: blink 2s ease-in-out infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

  /* ── Body: 3-column grid ── */
  .body {
    display: grid;
    grid-template-columns: 34% 30% 1fr;
    flex: 1; min-height: 0;
  }

  .setup-shell {
    flex: 1;
    min-height: 0;
    padding: 1.5rem 2rem 1.25rem;
    background:
      radial-gradient(circle at top left, rgba(91, 213, 252, 0.15), transparent 30%),
      radial-gradient(circle at top right, rgba(255, 179, 177, 0.15), transparent 26%),
      linear-gradient(180deg, #0f1124 0%, #090b17 100%);
  }

  .setup-stage {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .setup-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }

  .setup-kicker {
    color: #5bd5fc;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    margin-bottom: 0.45rem;
  }

  .setup-header h1 {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 2.25rem;
    line-height: 1;
    color: #fff;
  }

  .setup-summary {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.65rem;
  }

  .setup-summary span {
    padding: 0.5rem 0.8rem;
    border-radius: 999px;
    border: 1px solid rgba(91, 213, 252, 0.18);
    background: rgba(25, 28, 52, 0.9);
    color: #dfe7ff;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .setup-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
    flex: 1;
    min-height: 0;
    align-content: start;
  }

  .setup-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    border-radius: 18px;
    background: rgba(23, 26, 48, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease, filter 0.18s ease;
  }

  .setup-grid.has-selection .setup-card:not(.selected) {
    opacity: 0.46;
    filter: saturate(0.65);
  }

  .setup-card.selected {
    border-color: color-mix(in srgb, var(--player-color, #5bd5fc) 82%, white);
    box-shadow:
      0 18px 40px rgba(0, 0, 0, 0.22),
      0 0 0 2px color-mix(in srgb, var(--player-color, #5bd5fc) 45%, transparent),
      0 0 36px color-mix(in srgb, var(--player-color, #5bd5fc) 22%, transparent),
      inset 0 0 0 1px color-mix(in srgb, var(--player-color, #5bd5fc) 24%, transparent);
    transform: translateY(-5px) scale(1.015);
    background: linear-gradient(160deg, rgba(23, 26, 48, 0.98), color-mix(in srgb, var(--player-color, #5bd5fc) 24%, rgba(23, 26, 48, 0.98)));
    opacity: 1;
    filter: none;
  }

  .setup-selected-chip {
    position: absolute;
    top: 0.8rem;
    left: 0.8rem;
    padding: 0.32rem 0.58rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--player-color, #5bd5fc) 88%, #0d1020);
    color: #fff;
    font-size: 0.66rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.2);
  }

  .setup-card-top {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .setup-avatar {
    width: 64px;
    height: 64px;
    border-radius: 18px;
    background: var(--player-color, #5bd5fc);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color: #fff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.5rem;
    font-weight: 800;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08);
  }

  .setup-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .setup-ident {
    min-width: 0;
    flex: 1;
  }

  .setup-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.15rem;
    font-weight: 800;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .setup-meta {
    margin-top: 0.25rem;
    color: #8f97c5;
    font-size: 0.72rem;
  }

  .setup-order {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--player-color, #5bd5fc) 80%, #10132a);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 900;
    font-size: 1rem;
    flex-shrink: 0;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
  }

  .setup-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .setup-stat {
    border-radius: 14px;
    background: rgba(8, 11, 22, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.06);
    padding: 0.75rem 0.8rem;
  }

  .setup-stat span {
    display: block;
    color: #7882b8;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 700;
  }

  .setup-stat strong {
    display: block;
    margin-top: 0.25rem;
    color: #fff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.15rem;
    font-weight: 900;
  }

  /* ── Leaderboard (left) ── */
  .leaderboard {
    background: #10102a;
    border-right: 1px solid #1d1d37;
    display: flex; flex-direction: column;
    padding: 1.25rem 1.25rem 1rem;
    gap: 0.85rem;
    overflow: hidden;
  }

  .panel-label {
    display: flex; align-items: center; gap: 0.6rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.6rem; font-weight: 700; letter-spacing: 0.16em;
    text-transform: uppercase; color: #6660aa;
    flex-shrink: 0;
  }
  .panel-label-bar {
    display: inline-block;
    width: 3px; height: 14px; border-radius: 2px;
    background: #ffb3b1;
  }

  .desk-panel {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.9rem;
    border-radius: 18px;
    border: 1px solid rgba(91, 213, 252, 0.14);
    background:
      radial-gradient(circle at top right, rgba(91, 213, 252, 0.14), transparent 38%),
      linear-gradient(180deg, rgba(21, 24, 47, 0.96), rgba(12, 15, 31, 0.96));
    flex-shrink: 0;
  }

  .resume-stack {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .resume-mini-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.8rem 0.9rem;
    border-radius: 14px;
    background: rgba(8, 12, 26, 0.56);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .resume-mini-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .resume-mini-chip {
    padding: 0.18rem 0.45rem;
    border-radius: 999px;
    background: rgba(255, 99, 132, 0.18);
    border: 1px solid rgba(255, 99, 132, 0.35);
    color: #ffb3b1;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .resume-mini-time {
    font-size: 0.68rem;
    color: #95a0d8;
    font-weight: 700;
  }

  .resume-mini-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.84rem;
    color: #fff;
    font-weight: 700;
  }

  .resume-mini-players {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .resume-mini-player {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.76rem;
  }

  .resume-mini-dot,
  .resume-player-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--player-color, #5bd5fc);
  }

  .resume-mini-name {
    color: #cfd6ff;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .resume-mini-player strong {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    color: #fff;
    font-size: 0.95rem;
  }

  .desk-empty {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.15rem 0.1rem 0;
  }

  .desk-empty strong {
    color: #fff;
    font-size: 0.92rem;
  }

  .desk-empty span {
    color: #8b94c8;
    font-size: 0.72rem;
    line-height: 1.4;
  }

  .lb-list {
    display: flex; flex-direction: column; gap: 0.55rem;
    flex: 1; overflow: hidden;
  }

  .lb-card {
    display: flex; align-items: center; gap: 0.85rem;
    background: #191933; border-radius: 14px;
    border: 1px solid #272742;
    padding: 0.7rem 1rem;
    flex-shrink: 0;
  }
  .lb-card.rank1 {
    border-color: rgba(255,215,0,0.35);
    background: linear-gradient(135deg, #1e1a10 0%, #191933 60%);
  }
  .lb-card.rank2 { border-color: rgba(180,180,190,0.25); }
  .lb-card.rank3 { border-color: rgba(205,127,50,0.25); }

  .lb-rank {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.1rem; font-weight: 900; width: 1.4rem;
    text-align: center; color: #444; flex-shrink: 0;
  }
  .lb-rank.gold   { color: #ffd700; }
  .lb-rank.silver { color: #b0b0b8; }
  .lb-rank.bronze { color: #cd7f32; }

  .lb-avatar {
    width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
    background: var(--c);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1rem; font-weight: 800; color: #fff;
    overflow: hidden;
    border: 2px solid rgba(255,255,255,0.08);
  }
  .lb-card.rank1 .lb-avatar { border-color: rgba(255,215,0,0.5); width: 48px; height: 48px; }
  .lb-avatar img { width: 100%; height: 100%; object-fit: cover; }

  .lb-info {
    display: flex; flex-direction: column; gap: 0.15rem; flex: 1; min-width: 0;
  }
  .lb-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.95rem; font-weight: 700; color: #e2dfff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .lb-card.rank1 .lb-name { font-size: 1.05rem; }
  .lb-legs { font-size: 0.65rem; color: #555; }

  .lb-avg-block { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
  .lb-avg {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.3rem; font-weight: 900; color: #ffd700; line-height: 1;
  }
  .lb-card.rank1 .lb-avg { font-size: 1.5rem; }
  .lb-avg-lbl { font-size: 0.55rem; color: #555; letter-spacing: 0.08em; text-transform: uppercase; }

  .lb-footer {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;
    flex-shrink: 0; margin-top: auto;
  }
  .lb-total {
    background: #191933; border: 1px solid #272742; border-radius: 12px;
    padding: 0.6rem 0.75rem;
    display: flex; flex-direction: column; gap: 0.2rem;
  }
  .lb-total span { font-size: 0.6rem; color: #6660aa; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
  .lb-total strong {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.15rem; font-weight: 900; color: #e2dfff;
  }

  .lb-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 0.4rem;
    color: #444; font-size: 0.9rem;
  }
  .lb-empty small { font-size: 0.72rem; color: #333; }

  /* ── Player Spotlight (center) ── */
  .player-col {
    background: #0d0d1a;
    border-right: 1px solid #1d1d37;
    display: flex; flex-direction: column;
    padding: 1.25rem 1.25rem 1rem;
    gap: 0.85rem;
    overflow: hidden;
  }

  .sdots-inline {
    display: flex; gap: 0.35rem; margin-left: auto;
  }
  .sdot-sm {
    width: 5px; height: 5px; border-radius: 50%;
    background: #272742;
  }
  .sdot-sm.active { background: #5bd5fc; }

  .sp-card {
    display: flex; flex-direction: column; gap: 0.75rem;
    flex: 1; overflow: hidden;
  }

  .sp-hero {
    display: flex; align-items: center; gap: 0.9rem;
    background: linear-gradient(135deg, color-mix(in srgb, var(--c, #6660aa) 20%, #191933), #191933);
    border: 1px solid color-mix(in srgb, var(--c, #6660aa) 30%, #272742);
    border-radius: 16px;
    padding: 0.9rem 1rem;
    flex-shrink: 0;
  }
  .sp-avatar {
    width: 58px; height: 58px; border-radius: 50%; flex-shrink: 0;
    background: var(--c, #6660aa);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.3rem; font-weight: 800; color: #fff;
    overflow: hidden;
    border: 2px solid rgba(255,255,255,0.12);
  }
  .sp-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .sp-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.1rem; font-weight: 800; color: #fff;
  }
  .sp-sub { font-size: 0.68rem; color: #6660aa; margin-top: 0.15rem; }
  .sp-pill {
    margin-left: auto;
    padding: 0.55rem 0.7rem;
    border-radius: 14px;
    background: rgba(8, 12, 26, 0.42);
    border: 1px solid rgba(255, 255, 255, 0.08);
    text-align: right;
    min-width: 92px;
  }
  .sp-pill span {
    display: block;
    font-size: 0.56rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #aab4ea;
    font-weight: 700;
  }
  .sp-pill strong {
    display: block;
    margin-top: 0.15rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.15rem;
    color: #fff;
  }

  .sp-metrics {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem;
    flex-shrink: 0;
  }
  .sp-metric {
    background: #191933; border: 1px solid #272742; border-radius: 12px;
    padding: 0.6rem 0.75rem;
  }
  .sp-metric span {
    display: block; font-size: 0.6rem; color: #6660aa;
    text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;
  }
  .sp-metric strong {
    display: block; margin-top: 0.2rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.15rem; font-weight: 900; color: #e2dfff;
  }

  .sp-section {
    background: #191933; border: 1px solid #272742; border-radius: 14px;
    padding: 0.75rem 0.85rem;
    flex-shrink: 0;
    overflow: hidden;
  }
  .sp-section-lbl {
    font-size: 0.6rem; color: #6660aa;
    text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;
    margin-bottom: 0.55rem;
  }

  .sp-values { display: flex; flex-direction: column; gap: 0.45rem; }
  .sp-value-row {
    display: grid; grid-template-columns: 48px 1fr 28px;
    gap: 0.5rem; align-items: center;
    font-size: 0.78rem; color: #c6c4df; font-weight: 600;
  }
  .sp-value-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sp-bar-bg {
    height: 6px; border-radius: 999px;
    background: #1d1d37; overflow: hidden;
  }
  .sp-bar-fill { height: 100%; border-radius: 999px; opacity: 0.85; }

  .sp-badges { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .sp-badges :global(.badge-token) {
    background: #272742;
    border-color: #36365a;
  }

  /* ── Spotlight/Broadcast desk (right) ── */
  .spotlight {
    flex: 1; min-width: 0;
    background: #0d0d1a;
    display: flex; flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  .scene {
    flex: 1; display: flex; flex-direction: column;
    padding: 1.75rem 2rem 1rem;
    gap: 1.5rem;
    overflow: hidden;
  }

  .scene-hdr {
    display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0;
  }
  .scene-icon { font-size: 1.4rem; line-height: 1; }
  .scene-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.18em;
    text-transform: uppercase; color: #6660aa;
  }

  .resume-scene-list {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    overflow: hidden;
  }

  .resume-scene-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border-radius: 18px;
    border: 1px solid rgba(91, 213, 252, 0.14);
    background:
      radial-gradient(circle at top right, rgba(91, 213, 252, 0.12), transparent 35%),
      linear-gradient(180deg, rgba(25, 28, 51, 0.98), rgba(16, 18, 34, 0.98));
  }

  .resume-scene-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .resume-scene-kicker {
    color: #5bd5fc;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .resume-scene-meta {
    margin-top: 0.3rem;
    color: #fff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
  }

  .resume-scene-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .resume-scene-chip {
    padding: 0.22rem 0.55rem;
    border-radius: 999px;
    background: rgba(255, 99, 132, 0.18);
    border: 1px solid rgba(255, 99, 132, 0.35);
    color: #ffb3b1;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .resume-scene-elapsed {
    font-size: 0.72rem;
    color: #95a0d8;
    font-weight: 700;
  }

  .resume-scene-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }

  .resume-player-card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.9rem;
    border-radius: 16px;
    background: rgba(8, 12, 26, 0.62);
    border: 1px solid color-mix(in srgb, var(--player-color, #5bd5fc) 28%, rgba(255, 255, 255, 0.08));
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  }

  .resume-player-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .resume-player-ident {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    color: #fff;
    font-weight: 700;
  }

  .resume-player-ident span:last-child {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .resume-player-top strong {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    color: color-mix(in srgb, var(--player-color, #5bd5fc) 72%, white);
    font-size: 1.2rem;
    font-weight: 900;
  }

  .resume-player-score {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: clamp(2rem, 3vw, 2.8rem);
    font-weight: 900;
    line-height: 1;
    color: #fff;
  }

  .resume-player-sub {
    font-size: 0.72rem;
    color: #9ca6dd;
    font-weight: 600;
  }

  /* Recent results */
  .recent-list {
    display: flex; flex-direction: column; gap: 0.75rem;
    overflow: hidden;
  }
  .result-card {
    display: flex; align-items: center; gap: 1.25rem;
    background: #191933; border-radius: 14px;
    border: 1px solid #272742;
    padding: 0.85rem 1.25rem;
  }
  .result-meta { display: flex; flex-direction: column; gap: 0.3rem; flex-shrink: 0; }
  .result-badge {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.7rem; font-weight: 800; color: #6660aa;
    background: #272742; border-radius: 6px;
    padding: 0.25rem 0.55rem;
  }
  .result-code {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.65rem; font-weight: 700; color: #ffb3b1;
    letter-spacing: 0.05em;
  }
  .result-players { display: flex; flex-direction: column; gap: 0.35rem; flex: 1; }
  .rp { display: flex; align-items: center; gap: 0.55rem; }
  .rp-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .rp-name { font-size: 0.9rem; font-weight: 600; color: #888; flex: 1; }
  .rp.winner .rp-name { color: #4caf50; }
  .rp-crown { font-size: 0.8rem; }
  .rp-legs {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.85rem; font-weight: 800; color: #c6c4df;
  }
  .result-date { font-size: 0.65rem; color: #555; flex-shrink: 0; }

  /* Records */
  .records-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 1rem; flex: 1; overflow: hidden;
  }
  .rec-card {
    background: #191933; border-radius: 16px;
    border: 1px solid #272742;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 0.4rem; padding: 1.5rem 1rem;
    text-align: center;
  }
  .rec-val {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 900;
    line-height: 1;
  }
  .rec-lbl { font-size: 0.7rem; color: #6660aa; text-transform: uppercase; letter-spacing: 0.1em; }
  .rec-player { font-size: 0.85rem; font-weight: 600; }

  /* Triples per-segment grid */
  .triples-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
    overflow: hidden;
  }
  .triple-seg {
    background: #191933; border: 1px solid #272742;
    border-radius: 14px; padding: 0.75rem;
    display: flex; flex-direction: column; gap: 0.45rem;
  }
  .triple-seg-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.9rem; font-weight: 800; color: #e2dfff;
    margin-bottom: 0.2rem;
  }
  .triple-seg-row {
    display: grid; grid-template-columns: 16px 8px 1fr auto;
    gap: 0.4rem; align-items: center;
    font-size: 0.75rem;
  }
  .triple-seg-rank { font-family: 'Space Grotesk', system-ui, sans-serif; font-weight: 900; color: #444; text-align: center; }
  .triple-seg-rank.gold   { color: #ffd700; }
  .triple-seg-rank.silver { color: #b0b0b8; }
  .triple-seg-rank.bronze { color: #cd7f32; }
  .triple-dot { width: 8px; height: 8px; border-radius: 50%; }
  .triple-seg-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #c6c4df; font-weight: 600; }

  /* Leaderboard rows */
  .lb2-list { display: flex; flex-direction: column; gap: 0.65rem; overflow: hidden; }
  .lb2-row {
    display: flex; align-items: center; gap: 0.75rem;
    background: #191933; border-radius: 12px;
    border: 1px solid #272742; padding: 0.65rem 1rem;
  }
  .lb2-rank {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1rem; font-weight: 900; width: 1.4rem; text-align: center;
    color: #444; flex-shrink: 0;
  }
  .lb2-rank.gold   { color: #ffd700; }
  .lb2-rank.silver { color: #b0b0b8; }
  .lb2-rank.bronze { color: #cd7f32; }
  .lb2-dot {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.85rem; font-weight: 800; color: #fff; overflow: hidden;
  }
  .lb2-dot img { width: 100%; height: 100%; object-fit: cover; }
  .lb2-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.95rem; font-weight: 700; color: #e2dfff; flex: 1; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .lb2-bar-bg {
    width: 120px; flex-shrink: 0; height: 6px; border-radius: 999px;
    background: #1d1d37; overflow: hidden;
  }
  .lb2-bar { height: 100%; border-radius: 999px; opacity: 0.8; }
  .lb2-val {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.1rem; font-weight: 900; min-width: 2.5rem; text-align: right;
    flex-shrink: 0;
  }

  /* Win rates */
  .wr-list {
    display: flex; flex-direction: column; gap: 1.1rem;
    overflow: hidden;
  }
  .wr-row { display: flex; flex-direction: column; gap: 0.4rem; }
  .wr-top { display: flex; align-items: center; gap: 0.6rem; }
  .wr-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .wr-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1rem; font-weight: 700; color: #e2dfff; flex: 1;
  }
  .wr-record { font-size: 0.7rem; color: #555; }
  .wr-pct {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.1rem; font-weight: 900; min-width: 3.5rem; text-align: right;
  }
  .wr-bar-bg {
    height: 7px; border-radius: 999px;
    background: #1d1d37; overflow: hidden;
  }
  .wr-bar { height: 100%; border-radius: 999px; opacity: 0.85; }

  /* 100+ club */
  .h100-list {
    display: flex; flex-direction: column; gap: 0.75rem; overflow: hidden;
  }
  .h100-row {
    display: flex; align-items: center; gap: 1rem;
    background: #191933; border-radius: 14px;
    border: 1px solid #272742;
    padding: 0.85rem 1.25rem;
  }
  .h100-avatar {
    width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1rem; font-weight: 800; color: #fff;
  }
  .h100-info { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; }
  .h100-name { font-size: 0.95rem; font-weight: 600; color: #e2dfff; }
  .h100-vs { font-size: 0.7rem; color: #555; }
  .h100-score {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.8rem; font-weight: 900; color: #ffb3b1;
    line-height: 1;
  }

  /* Highlights */
  .hl-list {
    display: flex; flex-direction: column; gap: 1rem; overflow: hidden;
  }
  .hl-item {
    display: flex; align-items: center; gap: 1.25rem;
    background: #191933; border-radius: 16px;
    border: 1px solid #272742;
    padding: 1.1rem 1.5rem;
  }
  .hl-icon-wrap { font-size: 1.6rem; line-height: 1; flex-shrink: 0; }
  .hl-info { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; }
  .hl-lbl { font-size: 0.7rem; color: #6660aa; text-transform: uppercase; letter-spacing: 0.1em; }
  .hl-player { font-size: 0.95rem; font-weight: 600; }
  .hl-val {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 2.2rem; font-weight: 900; line-height: 1; flex-shrink: 0;
  }

  /* Waiting */
  .waiting-scene {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 0.6rem;
  }
  .waiting-icon { font-size: 4rem; line-height: 1; }
  .waiting-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 2rem; font-weight: 900; color: #fff;
  }
  .waiting-sub { font-size: 0.85rem; color: #6660aa; }

  /* Scene dots */
  .scene-dots {
    display: flex; gap: 0.45rem;
    justify-content: center; margin-top: auto; padding-top: 0.5rem; flex-shrink: 0;
  }
  .sdot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #272742; transition: background 0.3s, transform 0.3s;
  }
  .sdot.active { background: #ffb3b1; transform: scale(1.3); }

  /* ── Ticker ── */
  .ticker {
    display: flex; align-items: center;
    background: #191933; border-top: 1px solid #272742;
    height: 34px; flex-shrink: 0; overflow: hidden;
  }
  .ticker-lbl {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.6rem; font-weight: 800; letter-spacing: 0.15em;
    background: #e63946; color: #fff;
    padding: 0 0.85rem; height: 100%;
    display: flex; align-items: center; flex-shrink: 0;
  }
  .ticker-track { flex: 1; overflow: hidden; height: 100%; display: flex; align-items: center; }
  .ticker-scroll {
    display: flex; gap: 3rem; white-space: nowrap;
    animation: marquee 35s linear infinite;
    font-size: 0.75rem; color: #6660aa;
  }
  .ticker-sep { color: #2a2a42; }
  @keyframes marquee {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
</style>

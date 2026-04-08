<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';

  export let connected = false;

  let data = null;
  let clock = '';
  let sceneIdx = 0;
  let clockTimer, sceneTimer, refreshTimer;

  onMount(async () => {
    await loadData();
    updateClock();
    clockTimer   = setInterval(updateClock, 1000);
    sceneTimer   = setInterval(nextScene, 8000);
    refreshTimer = setInterval(loadData, 60_000);
  });

  onDestroy(() => {
    clearInterval(clockTimer);
    clearInterval(sceneTimer);
    clearInterval(refreshTimer);
  });

  async function loadData() {
    try {
      const res = await fetch('/api/stats/lobby');
      if (res.ok) data = await res.json();
    } catch (e) { console.error(e); }
  }

  function updateClock() {
    const now = new Date();
    clock = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  }

  $: scenes = buildScenes(data);

  function nextScene() {
    sceneIdx = (sceneIdx + 1) % Math.max(scenes.length, 1);
  }

  function fmtDate(dt) {
    if (!dt) return '';
    const parts = dt.split(' ')[0].split('-'); // "YYYY-MM-DD" from SQLite UTC datetime
    if (parts.length < 3) return '';
    const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  }

  function buildScenes(d) {
    if (!d) return ['waiting'];
    const list = [];
    if (d.recentMatches?.length)                            list.push('recent');
    if (d.highFinish?.value || d.most180?.count)            list.push('records');
    if (d.highTriplesLeaderboard?.length)                   list.push('triples');
    if (d.playerWinRates?.length)                           list.push('winrates');
    if (d.recentHundredPlus?.length)                        list.push('hundredplus');
    if (d.hundredPlusLeaderboard?.length)                   list.push('hundredboard');
    if (d.bestMatchAvg?.avg || d.longestStreak?.count > 1)  list.push('highlights');
    return list.length ? list : ['waiting'];
  }

  $: currentScene = scenes[sceneIdx % Math.max(scenes.length, 1)];

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
</script>

<div class="lobby">

  <!-- Top bar -->
  <header class="topbar">
    <div class="logo">
      <span class="logo-dart">🎯</span>
      <div class="logo-text">
        <span class="logo-main">DartsLeague</span>
        <span class="logo-sub">Editia Garaj</span>
      </div>
    </div>
    <div class="clock">{clock}</div>
    <div class="status-pill" class:online={connected}>
      <span class="pulse"></span>
      {connected ? 'Așteptăm meciul următor' : 'Se conectează…'}
    </div>
  </header>

  <!-- Body -->
  <div class="body">

    <!-- Left: Leaderboard -->
    <aside class="leaderboard">
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
                <span class="lb-legs">{p.legs_won} manșe</span>
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
    </aside>

    <!-- Right: Spotlight -->
    <section class="spotlight">
      {#key sceneIdx}
        <div class="scene" in:fade={{ duration: 450 }}>

          {#if currentScene === 'recent'}
            <div class="scene-hdr">
              <span class="scene-icon">📋</span>
              <span class="scene-title">Rezultate Recente</span>
            </div>
            <div class="recent-list">
              {#each (data?.recentMatches ?? []) as m}
                <div class="result-card">
                  <div class="result-badge">{m.starting_score}</div>
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
                      {#if t.opponents?.length}vs {t.opponents.join(' & ')}{/if}{#if t.date} · {fmtDate(t.date)}{/if}
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
              <div class="waiting-sub">Editia Garaj</div>
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
  .pulse {
    width: 8px; height: 8px; border-radius: 50%;
    background: #ffb3b1;
    animation: blink 2s ease-in-out infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

  /* ── Body ── */
  .body {
    display: flex; flex: 1; min-height: 0;
  }

  /* ── Leaderboard (left) ── */
  .leaderboard {
    width: 38%; flex-shrink: 0;
    background: #10102a;
    border-right: 1px solid #1d1d37;
    display: flex; flex-direction: column;
    padding: 1.25rem 1.25rem 1rem;
    gap: 1rem;
    overflow: hidden;
  }

  .panel-label {
    display: flex; align-items: center; gap: 0.6rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.6rem; font-weight: 700; letter-spacing: 0.16em;
    text-transform: uppercase; color: #6660aa;
  }
  .panel-label-bar {
    display: inline-block;
    width: 3px; height: 14px; border-radius: 2px;
    background: #ffb3b1;
  }

  .lb-list {
    display: flex; flex-direction: column; gap: 0.6rem;
    flex: 1; overflow: hidden;
  }

  .lb-card {
    display: flex; align-items: center; gap: 0.85rem;
    background: #191933; border-radius: 14px;
    border: 1px solid #272742;
    padding: 0.75rem 1rem;
    transition: border-color 0.2s;
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

  .lb-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 0.4rem;
    color: #444; font-size: 0.9rem;
  }
  .lb-empty small { font-size: 0.72rem; color: #333; }

  /* ── Spotlight (right) ── */
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
  .result-badge {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.7rem; font-weight: 800; color: #6660aa;
    background: #272742; border-radius: 6px;
    padding: 0.25rem 0.55rem; flex-shrink: 0;
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

  /* Leaderboard rows (triples + 100+ board) */
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

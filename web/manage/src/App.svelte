<script>
  import BadgeToken from '../../shared/BadgeToken.svelte';

  let loading = true;
  let error = '';
  let data = null;
  let filter = 'all';

  const GROUP_LABELS = {
    score: 'Score',
    finish: 'Finish',
    funny: 'Funny',
    match: 'Match',
    'post-match': 'Post-match',
  };

  async function loadCatalog() {
    loading = true;
    error = '';

    try {
      const res = await fetch('/api/catalog/management');
      if (!res.ok) throw new Error('Nu am putut încărca management catalog.');
      data = await res.json();
    } catch (err) {
      console.error(err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function filterCelebrations(items = []) {
    if (filter === 'all') return items;
    return items.filter((item) => item.group === filter);
  }

  $: badgesWithImages = data?.badges?.filter((badge) => badge.hasCustomImage).length ?? 0;
  $: totalBadges = data?.badges?.length ?? 0;
  $: celebrationGroups = [...new Set((data?.celebrations ?? []).map((item) => item.group))];

  loadCatalog();
</script>

<div class="shell">
  <header class="hero">
    <div>
      <div class="eyebrow">Management Hub</div>
      <h1>Badge-uri și celebrations</h1>
      <p>
        Hub separat pentru administrarea asset-urilor și a efectelor din DartsLeague.
        Verifici rapid ce badge-uri au imagini, ce lipsește și ce celebration-uri sunt active în engine.
      </p>
    </div>

    <div class="hero-actions">
      <a class="nav-link" href="/">Controller</a>
      <a class="nav-link" href="/tv">TV</a>
      <button class="nav-link buttonish" on:click={loadCatalog}>Refresh</button>
    </div>
  </header>

  {#if loading}
    <section class="panel empty">Se încarcă management catalog…</section>
  {:else if error}
    <section class="panel empty error">{error}</section>
  {:else if data}
    <section class="stats-grid">
      <article class="stat-card">
        <span>Badge-uri totale</span>
        <strong>{totalBadges}</strong>
      </article>
      <article class="stat-card">
        <span>Cu imagine custom</span>
        <strong>{badgesWithImages}</strong>
      </article>
      <article class="stat-card">
        <span>Fără imagine custom</span>
        <strong>{Math.max(totalBadges - badgesWithImages, 0)}</strong>
      </article>
      <article class="stat-card wide">
        <span>Folder asset-uri</span>
        <strong class="path">{data.badgeAssetDir}</strong>
      </article>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-kicker">Badge Assets</div>
          <h2>Badge-uri disponibile</h2>
        </div>
        <div class="ext-list">
          {#each data.badgeAssetExtensions as ext}
            <span>{ext}</span>
          {/each}
        </div>
      </div>

      <div class="badge-grid">
        {#each data.badges as badge}
          <article class="badge-card" class:missing={!badge.hasCustomImage}>
            <div class="badge-preview">
              <BadgeToken kind={badge.kind} />
            </div>
            <div class="badge-card-head">
              <h3>{badge.label}</h3>
              <span class:ok={badge.hasCustomImage} class:warn={!badge.hasCustomImage}>
                {badge.hasCustomImage ? 'Custom image' : 'Fallback image'}
              </span>
            </div>
            <code>{badge.kind}</code>
            <p>{badge.description}</p>
            {#if badge.files.length}
              <div class="file-list">
                {#each badge.files as file}
                  <span>{file}</span>
                {/each}
              </div>
            {:else}
              <div class="hint">Adaugă un fișier ca `/{'assets/badges/' + badge.kind}.png`</div>
            {/if}
          </article>
        {/each}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-kicker">Celebration Catalog</div>
          <h2>Celebrations active</h2>
        </div>
        <div class="filters">
          <button class:active={filter === 'all'} on:click={() => filter = 'all'}>Toate</button>
          {#each celebrationGroups as group}
            <button class:active={filter === group} on:click={() => filter = group}>{GROUP_LABELS[group] ?? group}</button>
          {/each}
        </div>
      </div>

      <div class="celebration-grid">
        {#each filterCelebrations(data.celebrations) as celebration}
          <article class="celebration-card">
            <div class="celebration-top">
              <div>
                <div class="celebration-subtitle">{celebration.subtitle}</div>
                <h3>{celebration.label}</h3>
              </div>
              <span class="group-pill">{GROUP_LABELS[celebration.group] ?? celebration.group}</span>
            </div>

            <code>{celebration.kind}</code>
            <p>{celebration.description}</p>

            <div class="card-meta">
              <span class:ok={celebration.awardsBadge} class:muted={!celebration.awardsBadge}>
                {celebration.awardsBadge ? 'Se salvează și ca badge' : 'Doar celebration TV'}
              </span>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-kicker">Experimental Ideas</div>
          <h2>Ideas to try later</h2>
        </div>
      </div>

      <div class="celebration-grid">
        {#each data.experimentalCelebrations ?? [] as idea}
          <article class="celebration-card">
            <div class="celebration-top">
              <div>
                <div class="celebration-subtitle">{idea.status === 'implemented' ? 'Implemented' : 'Needs manual support'}</div>
                <h3>{idea.label}</h3>
              </div>
              <span class="group-pill">{idea.kind}</span>
            </div>
            <p>{idea.description}</p>
          </article>
        {/each}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-kicker">Tournament Option</div>
          <h2>Structură propusă</h2>
        </div>
      </div>

      <div class="tournament-grid">
        <article class="tournament-card">
          <h3>Format recomandat</h3>
          <p>Round Robin pe grupe mici, urmat de Knockout. E cel mai bun pas următor pentru aplicația actuală fiindcă reutilizează meciurile `x01` deja existente.</p>
        </article>
        <article class="tournament-card">
          <h3>Model minim</h3>
          <p>Turneu, participanți, grupe opționale, meciuri legate de un turneu, clasament per grupă și bracket de eliminare.</p>
        </article>
        <article class="tournament-card">
          <h3>De ce așa</h3>
          <p>Poți porni simplu cu 4-8 jucători, mai puține reguli speciale și UX clar în controller și TV fără a rescrie engine-ul de scor.</p>
        </article>
      </div>
    </section>
  {/if}
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Manrope:wght@500;600;700;800&display=swap');

  .shell {
    min-height: 100vh;
    padding: 28px;
    background:
      radial-gradient(circle at top left, rgba(58, 134, 255, 0.18), transparent 25%),
      radial-gradient(circle at top right, rgba(255, 183, 3, 0.14), transparent 20%),
      linear-gradient(180deg, #08111d 0%, #0d1728 52%, #111d2f 100%);
    color: #eef4ff;
    font-family: 'Manrope', system-ui, sans-serif;
  }

  .hero,
  .panel-head,
  .badge-card-head,
  .celebration-top,
  .card-meta,
  .stats-grid {
    display: flex;
    gap: 14px;
  }

  .hero,
  .panel-head,
  .celebration-top,
  .card-meta {
    align-items: flex-start;
    justify-content: space-between;
  }

  .hero {
    margin-bottom: 20px;
  }

  .eyebrow,
  .panel-kicker {
    color: #8db1d8;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.72rem;
    font-weight: 800;
  }

  h1,
  h2,
  h3,
  .stat-card strong {
    font-family: 'Space Grotesk', system-ui, sans-serif;
  }

  h1 {
    margin-top: 0.4rem;
    font-size: clamp(2.2rem, 4vw, 3.7rem);
    line-height: 1;
  }

  .hero p {
    margin-top: 0.9rem;
    max-width: 780px;
    color: #b6c9e4;
    font-size: 1rem;
    line-height: 1.55;
  }

  .hero-actions {
    display: flex;
    gap: 0.7rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .nav-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0.7rem 1rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #f7fbff;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }

  .buttonish {
    font: inherit;
  }

  .stats-grid {
    flex-wrap: wrap;
    margin-bottom: 18px;
  }

  .stat-card {
    flex: 1 1 180px;
    min-width: 180px;
    padding: 18px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .stat-card.wide {
    flex-basis: 340px;
  }

  .stat-card span {
    display: block;
    color: #8fb0d4;
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .stat-card strong {
    display: block;
    margin-top: 0.45rem;
    font-size: 1.7rem;
  }

  .path {
    font-size: 0.98rem;
    line-height: 1.35;
    word-break: break-all;
  }

  .panel {
    margin-top: 18px;
    padding: 22px;
    border-radius: 28px;
    background: rgba(7, 15, 28, 0.74);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
  }

  .empty {
    display: grid;
    place-items: center;
    min-height: 160px;
    color: #b9c8dd;
    text-align: center;
  }

  .error {
    color: #ffb0bb;
  }

  .ext-list,
  .filters,
  .file-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .ext-list span,
  .filters button,
  .file-list span,
  .group-pill,
  .card-meta span,
  .badge-card-head span {
    padding: 0.42rem 0.72rem;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 800;
  }

  .ext-list span,
  .file-list span,
  .group-pill {
    background: rgba(255, 255, 255, 0.08);
  }

  .filters button {
    font: inherit;
    color: #d9e7fb;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
  }

  .filters button.active {
    background: rgba(68, 168, 255, 0.18);
    border-color: rgba(68, 168, 255, 0.42);
  }

  .badge-grid,
  .celebration-grid,
  .tournament-grid {
    margin-top: 18px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 14px;
  }

  .badge-card,
  .celebration-card,
  .tournament-card {
    padding: 18px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .badge-card.missing {
    border-color: rgba(255, 183, 3, 0.28);
  }

  .badge-preview {
    margin-bottom: 14px;
  }

  .badge-card h3,
  .celebration-card h3 {
    font-size: 1.1rem;
  }

  .badge-card code,
  .celebration-card code {
    display: inline-block;
    margin-top: 0.55rem;
    color: #9ec8ff;
    font-size: 0.82rem;
  }

  .badge-card p,
  .celebration-card p,
  .tournament-card p {
    margin-top: 0.75rem;
    color: #bed0e6;
    line-height: 1.5;
  }

  .tournament-card h3 {
    font-size: 1.05rem;
  }

  .badge-card-head span.ok,
  .card-meta span.ok {
    background: rgba(74, 222, 128, 0.14);
    color: #a7f3c0;
  }

  .badge-card-head span.warn {
    background: rgba(255, 183, 3, 0.14);
    color: #ffe08a;
  }

  .card-meta span.muted {
    background: rgba(255, 255, 255, 0.07);
    color: #aebcd2;
  }

  .celebration-subtitle {
    color: #89afd9;
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .hint {
    margin-top: 0.9rem;
    color: #ffd88a;
    font-size: 0.86rem;
  }

  @media (max-width: 720px) {
    .shell {
      padding: 18px;
    }

    .hero,
    .panel-head {
      flex-direction: column;
    }

    .hero-actions {
      justify-content: flex-start;
    }
  }
</style>

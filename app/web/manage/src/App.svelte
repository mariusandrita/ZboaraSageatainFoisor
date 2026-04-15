<script>
  import BadgeToken from '../../shared/BadgeToken.svelte';

  let loading = true;
  let error = '';
  let data = null;
  let saving = false;
  let saveMessage = '';

  let editorOpen = false;
  let editorBadge = null;
  let editorImage = null;
  let editorObjectUrl = '';
  let editorFileName = '';
  let editorDimensions = '';
  let editorTooSmall = false;
  let cropCanvas;
  let editorZoom = 1;
  let editorPanX = 0;
  let editorPanY = 0;

  const CROP_SIZE = 512;
  const MIN_INPUT_PX = 256;

  const CATEGORIES = [
    {
      key: 'hallOfFame',
      label: 'Hall of Fame',
      subtitle: 'Aruncări extraordinare care merită recunoscute',
      accent: 'gold',
    },
    {
      key: 'scoreCallout',
      label: 'Strigături de Scor',
      subtitle: 'Scoruri cu nume din cultura pub darts',
      accent: 'blue',
    },
    {
      key: 'hallOfShame',
      label: 'Hall of Shame',
      subtitle: 'Dezastre care trebuie văzute de toți',
      accent: 'red',
    },
    {
      key: 'ceremony',
      label: 'Ceremonii',
      subtitle: 'Momente și repere din meci',
      accent: 'purple',
    },
  ];

  const STATUS_LABELS = {
    implemented: 'Implementat',
    feasible: 'Fezabil — detectabil din scor',
    'needs-per-dart-data': 'Necesită date per săgeată',
    'manual-only': 'Doar manual',
  };

  const STATUS_CLASS = {
    implemented: 'ok',
    feasible: 'feasible',
    'needs-per-dart-data': 'warn',
    'manual-only': 'muted',
  };

  async function loadCatalog() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/catalog/management');
      if (!res.ok) throw new Error('Eroare la încărcarea catalogului.');
      data = await res.json();
    } catch (err) {
      console.error(err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function celebrationsByCategory(key) {
    return (data?.celebrations ?? []).filter((c) => c.group === key);
  }

  function ideasByCategory(key) {
    return (data?.experimentalCelebrations ?? []).filter((i) => i.category === key);
  }

  function resetEditorState() {
    editorImage = null;
    editorFileName = '';
    editorDimensions = '';
    editorTooSmall = false;
    editorZoom = 1;
    editorPanX = 0;
    editorPanY = 0;
    if (editorObjectUrl) URL.revokeObjectURL(editorObjectUrl);
    editorObjectUrl = '';
  }

  function openEditor(badge) {
    editorOpen = true;
    editorBadge = badge;
    saveMessage = '';
    resetEditorState();
    renderCropPreview();
  }

  function closeEditor() {
    editorOpen = false;
    editorBadge = null;
    saveMessage = '';
    resetEditorState();
  }

  async function handleFileChange(event) {
    const file = event.currentTarget?.files?.[0];
    if (!file) return;
    editorFileName = file.name;
    editorDimensions = '';
    editorTooSmall = false;
    if (editorObjectUrl) URL.revokeObjectURL(editorObjectUrl);
    editorObjectUrl = URL.createObjectURL(file);
    const image = await loadImage(editorObjectUrl);
    editorDimensions = `${image.width} × ${image.height} px`;
    editorTooSmall = image.width < MIN_INPUT_PX || image.height < MIN_INPUT_PX;
    editorImage = image;
    editorZoom = 1;
    editorPanX = 0;
    editorPanY = 0;
    renderCropPreview();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function computeCropLayout() {
    if (!editorImage) return null;
    const baseScale = Math.max(CROP_SIZE / editorImage.width, CROP_SIZE / editorImage.height);
    const scale = baseScale * editorZoom;
    const width = editorImage.width * scale;
    const height = editorImage.height * scale;
    const maxOffsetX = Math.max(0, (width - CROP_SIZE) / 2);
    const maxOffsetY = Math.max(0, (height - CROP_SIZE) / 2);
    const x = (CROP_SIZE - width) / 2 + maxOffsetX * editorPanX;
    const y = (CROP_SIZE - height) / 2 + maxOffsetY * editorPanY;
    return { x, y, width, height };
  }

  function renderCropPreview() {
    if (!cropCanvas) return;
    const ctx = cropCanvas.getContext('2d');
    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.fillStyle = '#08111d';
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
    drawTransparencyGrid(ctx);
    if (!editorImage) return;
    const layout = computeCropLayout();
    if (!layout) return;
    ctx.drawImage(editorImage, layout.x, layout.y, layout.width, layout.height);
  }

  function drawTransparencyGrid(ctx) {
    const size = 24;
    for (let y = 0; y < CROP_SIZE; y += size) {
      for (let x = 0; x < CROP_SIZE; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0)
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(255,255,255,0.02)';
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  async function saveBadgeImage() {
    if (!editorBadge || !cropCanvas || !editorImage) return;
    saving = true;
    error = '';
    saveMessage = '';
    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = CROP_SIZE;
      exportCanvas.height = CROP_SIZE;
      const exportCtx = exportCanvas.getContext('2d');
      const layout = computeCropLayout();
      if (layout) exportCtx.drawImage(editorImage, layout.x, layout.y, layout.width, layout.height);
      const imageBase64 = exportCanvas.toDataURL('image/png');
      const res = await fetch(`/api/catalog/badges/${editorBadge.kind}/image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error?.message ?? 'Eroare la salvarea imaginii insignei.');
      }
      await loadCatalog();
      saveMessage = `Insignă salvată pentru ${editorBadge.label}.`;
    } catch (err) {
      console.error(err);
      error = err.message;
    } finally {
      saving = false;
    }
  }

  $: badgesWithImages = data?.badges?.filter((b) => b.hasCustomImage).length ?? 0;
  $: totalBadges = data?.badges?.length ?? 0;
  // Explicitly list all vars that affect the canvas so Svelte tracks them as deps.
  // Without this, only cropCanvas would trigger re-renders — zoom/pan would be ignored.
  $: {
    void editorZoom;
    void editorPanX;
    void editorPanY;
    void editorImage;
    if (cropCanvas) renderCropPreview();
  }

  loadCatalog();
</script>

<div class="shell">
  <header class="hero">
    <div>
      <div class="eyebrow">Centru de Management</div>
      <h1>Insigne &amp; Celebrări</h1>
      <p>Gestionare resurse, catalog celebrări și idei în așteptare.</p>
    </div>
    <div class="hero-actions">
      <a class="nav-link" href="/">Controller</a>
      <a class="nav-link" href="/tv">TV</a>
      <button class="nav-link buttonish" on:click={loadCatalog}>Reîncarcă</button>
    </div>
  </header>

  {#if saveMessage}
    <section class="flash ok">{saveMessage}</section>
  {/if}

  {#if loading}
    <section class="panel empty">Se încarcă catalogul…</section>
  {:else if error}
    <section class="panel empty error">{error}</section>
  {:else if data}

    <!-- Badge stats -->
    <section class="stats-grid">
      <article class="stat-card">
        <span>Total insigne</span>
        <strong>{totalBadges}</strong>
      </article>
      <article class="stat-card">
        <span>Imagine personalizată</span>
        <strong>{badgesWithImages}</strong>
      </article>
      <article class="stat-card">
        <span>Imagine implicită</span>
        <strong>{Math.max(totalBadges - badgesWithImages, 0)}</strong>
      </article>
      <article class="stat-card wide">
        <span>Folder resurse</span>
        <strong class="path">{data.badgeAssetDir}</strong>
      </article>
    </section>

    <!-- Badge assets -->
    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-kicker">Resurse Insigne</div>
          <h2>Imagini insigne</h2>
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
            {#if badge.customImageUrl}
              <div class="badge-preview">
                <img src={badge.customImageUrl} alt={badge.label} />
              </div>
            {/if}
            <div class="badge-card-head">
              <h3>{badge.label}</h3>
              <span class:ok={badge.hasCustomImage} class:warn={!badge.hasCustomImage}>
                {badge.hasCustomImage ? 'Personalizat' : 'Implicit'}
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
              <div class="hint">Adaugă un fișier ca <code>/assets/badges/{badge.kind}.png</code></div>
            {/if}
            <button class="edit-button" on:click={() => openEditor(badge)}>
              {badge.hasCustomImage ? 'Schimbă pictograma' : 'Adaugă pictogramă'}
            </button>
          </article>
        {/each}
      </div>
    </section>

    <!-- Celebrations — 4 category panels -->
    <div class="section-label">
      <div class="section-label-kicker">Catalog Celebrări</div>
      <h2>Celebrări active</h2>
      <p>Ce apare pe TV și ce câștigă o insignă. Organizat pe categorii.</p>
    </div>

    {#each CATEGORIES as cat}
      {@const items = celebrationsByCategory(cat.key)}
      {#if items.length}
        <section class="panel category-panel accent-{cat.accent}">
          <div class="category-header">
            <div class="category-header-left">
              <div class="category-title">{cat.label}</div>
              <div class="category-subtitle">{cat.subtitle}</div>
            </div>
            <span class="category-count">{items.length}</span>
          </div>

          <div class="celebration-grid">
            {#each items as celebration}
              <article class="celebration-card">
                <div class="celebration-top">
                  <h3>{celebration.label}</h3>
                  <span class="badge-pill" class:ok={celebration.awardsBadge} class:muted={!celebration.awardsBadge}>
                    {celebration.awardsBadge ? 'Insignă' : 'Doar TV'}
                  </span>
                </div>
                <div class="celebration-callout">{celebration.subtitle}</div>
                <p>{celebration.description}</p>
                <code>{celebration.kind}</code>
              </article>
            {/each}
          </div>
        </section>
      {/if}
    {/each}

    <!-- Experimental ideas — grouped by the same 4 categories -->
    <div class="section-label">
      <div class="section-label-kicker">Idei &amp; Propuneri</div>
      <h2>Încă neimplementat</h2>
      <p>Lucruri din cultura pub darts care merită adăugate. Sortate după dificultate.</p>
    </div>

    {#each CATEGORIES as cat}
      {@const ideas = ideasByCategory(cat.key)}
      {#if ideas.length}
        <section class="panel ideas-panel accent-{cat.accent}">
          <div class="category-header">
            <div class="category-header-left">
              <div class="category-title">{cat.label}</div>
            </div>
          </div>

          <div class="ideas-grid">
            {#each ideas as idea}
              <article class="idea-card">
                <div class="idea-top">
                  <h3>{idea.label}</h3>
                  <span class="status-pill {STATUS_CLASS[idea.status] ?? 'muted'}">
                    {STATUS_LABELS[idea.status] ?? idea.status}
                  </span>
                </div>
                <p>{idea.description}</p>
                <code>{idea.kind}</code>
              </article>
            {/each}
          </div>
        </section>
      {/if}
    {/each}

  {/if}

  <!-- Badge editor modal -->
  {#if editorOpen && editorBadge}
    <button class="editor-overlay" on:click={closeEditor} aria-label="Închide editorul"></button>
    <section class="editor-modal">
      <div class="editor-head">
        <div>
          <div class="panel-kicker">Editor Insigne</div>
          <h2>{editorBadge.label}</h2>
          <div class="editor-kind">{editorBadge.kind}</div>
        </div>
        <button class="close-button" on:click={closeEditor}>Închide</button>
      </div>

      <div class="editor-layout">
        <div class="editor-preview-panel">
          <div class="editor-preview-wrap">
            <canvas bind:this={cropCanvas} width={CROP_SIZE} height={CROP_SIZE} style="width:256px;height:256px;"></canvas>
          </div>
          <div class="editor-note">Exportă ca PNG pătrat, ideal pentru fundaluri transparente.</div>
        </div>

        <div class="editor-controls">
          <label class="upload-box">
            <span>Încarcă PNG</span>
            <input type="file" accept="image/png" on:change={handleFileChange} />
            {#if editorFileName}
              <strong>{editorFileName}</strong>
              {#if editorDimensions}
                <span class="img-dims">{editorDimensions}</span>
              {/if}
            {/if}
          </label>
          {#if editorTooSmall}
            <div class="editor-warn">Imagine prea mică — minim {MIN_INPUT_PX}×{MIN_INPUT_PX} px recomandat.</div>
          {/if}

          <div class="slider-group">
            <label for="zoom">Zoom</label>
            <input id="zoom" type="range" min="1" max="3" step="0.01" bind:value={editorZoom} disabled={!editorImage} />
          </div>

          <div class="slider-group">
            <label for="panx">Panoramare orizontală</label>
            <input id="panx" type="range" min="-1" max="1" step="0.01" bind:value={editorPanX} disabled={!editorImage} />
          </div>

          <div class="slider-group">
            <label for="pany">Panoramare verticală</label>
            <input id="pany" type="range" min="-1" max="1" step="0.01" bind:value={editorPanY} disabled={!editorImage} />
          </div>

          <div class="editor-live-preview">
            <div class="editor-live-preview-title">Previzualizare insignă</div>
            <div class="editor-live-preview-card">
              {#if editorImage}
                <img src={cropCanvas?.toDataURL('image/png') ?? ''} alt="Badge preview" />
              {:else}
                <BadgeToken kind={editorBadge.kind} />
              {/if}
            </div>
          </div>

          <div class="editor-actions">
            <button class="ghost-button" on:click={closeEditor}>Anulează</button>
            <button class="save-button" on:click={saveBadgeImage} disabled={!editorImage || saving}>
              {saving ? 'Se salvează…' : 'Salvează PNG'}
            </button>
          </div>
        </div>
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
  .stats-grid,
  .editor-head,
  .editor-layout,
  .editor-actions {
    display: flex;
    gap: 14px;
  }

  .hero,
  .panel-head,
  .editor-head,
  .editor-actions {
    align-items: flex-start;
    justify-content: space-between;
  }

  .hero { margin-bottom: 20px; }

  .eyebrow,
  .panel-kicker,
  .section-label-kicker {
    color: #8db1d8;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.72rem;
    font-weight: 800;
  }

  h1, h2, h3, .stat-card strong {
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

  .nav-link,
  .edit-button,
  .close-button,
  .save-button,
  .ghost-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0.7rem 1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #f7fbff;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
    font: inherit;
  }

  .nav-link, .ghost-button, .close-button {
    background: rgba(255, 255, 255, 0.07);
  }

  .save-button, .edit-button {
    background: linear-gradient(135deg, rgba(68, 168, 255, 0.3), rgba(0, 212, 170, 0.26));
    border-color: rgba(90, 186, 255, 0.42);
  }

  .edit-button { width: 100%; margin-top: 1rem; }

  .save-button:disabled { opacity: 0.45; cursor: not-allowed; }

  .buttonish { font: inherit; }

  .flash {
    margin-bottom: 18px;
    padding: 14px 18px;
    border-radius: 18px;
    font-weight: 800;
  }

  .flash.ok {
    background: rgba(74, 222, 128, 0.14);
    color: #b8f7cb;
    border: 1px solid rgba(74, 222, 128, 0.22);
  }

  /* Stats */
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

  .stat-card.wide { flex-basis: 340px; }

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

  /* Panels */
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

  .error { color: #ffb0bb; }

  /* Section labels between groups of panels */
  .section-label {
    margin-top: 48px;
    margin-bottom: 4px;
    padding-left: 4px;
  }

  .section-label h2 {
    margin-top: 0.35rem;
    font-size: clamp(1.5rem, 3vw, 2.2rem);
    line-height: 1.1;
  }

  .section-label p {
    margin-top: 0.5rem;
    color: #9ab5d4;
    font-size: 0.95rem;
  }

  /* Category panels */
  .category-panel { border-top-width: 3px; }

  .accent-gold  { border-top-color: rgba(255, 196, 57, 0.7); }
  .accent-blue  { border-top-color: rgba(68, 168, 255, 0.7); }
  .accent-red   { border-top-color: rgba(255, 90, 90, 0.7); }
  .accent-purple { border-top-color: rgba(170, 100, 255, 0.7); }

  .category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
  }

  .category-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.25rem;
    font-weight: 800;
    color: #eef4ff;
  }

  .category-subtitle {
    margin-top: 0.2rem;
    font-size: 0.82rem;
    color: #7fa4c8;
  }

  .category-count {
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    font-size: 0.78rem;
    font-weight: 800;
    color: #9ab5d4;
  }

  /* Celebration cards */
  .celebration-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }

  .celebration-card {
    padding: 16px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .celebration-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .celebration-top h3 {
    font-size: 1rem;
    line-height: 1.3;
    margin: 0;
  }

  .celebration-callout {
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #6e97be;
  }

  .celebration-card p {
    margin: 0;
    color: #b4c8e0;
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .celebration-card code {
    margin-top: 4px;
    color: #7ab0e0;
    font-size: 0.78rem;
  }

  /* Ideas panels */
  .ideas-panel {
    border-top-width: 2px;
    border-style: dashed;
    opacity: 0.85;
  }

  .ideas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  .idea-card {
    padding: 16px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .idea-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .idea-top h3 {
    font-size: 1rem;
    margin: 0;
  }

  .idea-card p {
    margin: 0;
    color: #a0b8d2;
    font-size: 0.86rem;
    line-height: 1.5;
  }

  .idea-card code {
    margin-top: 4px;
    color: #6a96c0;
    font-size: 0.76rem;
  }

  /* Pills */
  .badge-pill,
  .status-pill {
    flex-shrink: 0;
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .badge-pill.ok    { background: rgba(74, 222, 128, 0.14); color: #a7f3c0; }
  .badge-pill.muted { background: rgba(255, 255, 255, 0.07); color: #8aaccc; }

  .status-pill.ok       { background: rgba(74, 222, 128, 0.14); color: #a7f3c0; }
  .status-pill.feasible { background: rgba(68, 168, 255, 0.14); color: #9dd0ff; }
  .status-pill.warn     { background: rgba(255, 183, 3, 0.14);  color: #ffe08a; }
  .status-pill.muted    { background: rgba(255, 255, 255, 0.07); color: #8aaccc; }

  /* Badge grid */
  .ext-list, .file-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .ext-list span, .file-list span {
    padding: 0.42rem 0.72rem;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 800;
    background: rgba(255, 255, 255, 0.08);
  }

  .badge-grid {
    margin-top: 18px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 14px;
  }

  .badge-card {
    padding: 18px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .badge-card.missing { border-color: rgba(255, 183, 3, 0.28); }

  .badge-preview {
    margin-bottom: 14px;
    width: 86px;
    height: 86px;
  }

  .badge-preview img {
    width: 86px;
    height: 86px;
    object-fit: contain;
    display: block;
  }

  .badge-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .badge-card h3 { font-size: 1.1rem; }

  .badge-card-head span {
    flex-shrink: 0;
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 800;
  }

  .badge-card-head span.ok   { background: rgba(74, 222, 128, 0.14); color: #a7f3c0; }
  .badge-card-head span.warn { background: rgba(255, 183, 3, 0.14);  color: #ffe08a; }

  .badge-card code {
    display: inline-block;
    margin-top: 0.55rem;
    color: #9ec8ff;
    font-size: 0.82rem;
  }

  .badge-card p {
    margin-top: 0.75rem;
    color: #bed0e6;
    line-height: 1.5;
  }

  .hint {
    margin-top: 0.9rem;
    color: #ffd88a;
    font-size: 0.86rem;
  }

  /* Editor modal */
  .editor-overlay {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.7);
    backdrop-filter: blur(6px);
    border: 0;
    padding: 0;
    z-index: 30;
  }

  .editor-modal {
    position: fixed;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: min(980px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    overflow: auto;
    padding: 22px;
    border-radius: 28px;
    background: #09111c;
    border: 1px solid rgba(255,255,255,0.09);
    box-shadow: 0 30px 90px rgba(0,0,0,0.35);
    z-index: 31;
  }

  .editor-layout {
    display: flex;
    gap: 14px;
    margin-top: 18px;
    align-items: stretch;
  }

  .editor-preview-panel, .editor-controls { flex: 1; min-width: 0; }

  .editor-preview-panel {
    padding: 18px;
    border-radius: 22px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
  }

  .editor-preview-wrap {
    width: min(100%, 340px);
    aspect-ratio: 1;
    margin: 0 auto;
    border-radius: 24px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.08);
  }

  .editor-preview-wrap canvas { width: 100%; height: 100%; display: block; }

  .editor-note {
    margin-top: 14px;
    color: #99b4d2;
    text-align: center;
    font-size: 0.88rem;
  }

  .editor-controls { display: grid; gap: 16px; }

  .upload-box,
  .slider-group,
  .editor-live-preview {
    padding: 16px;
    border-radius: 18px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
  }

  .upload-box { display: grid; gap: 12px; }

  .upload-box span,
  .slider-group label,
  .editor-live-preview-title {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #95b6d8;
  }

  .upload-box input, .slider-group input { width: 100%; }
  .upload-box strong { color: #f7fbff; }
  .img-dims { font-size: 0.78rem; color: #6b9ec7; }
  .editor-warn {
    padding: 8px 12px;
    background: rgba(234, 179, 8, 0.12);
    border: 1px solid rgba(234, 179, 8, 0.35);
    border-radius: 8px;
    color: #fde68a;
    font-size: 0.82rem;
  }

  .editor-kind {
    display: inline-block;
    margin-top: 0.55rem;
    color: #9ec8ff;
    font-size: 0.82rem;
  }

  .editor-live-preview-card {
    margin-top: 12px;
    min-height: 88px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    background: rgba(6, 15, 28, 0.7);
  }

  .editor-live-preview-card img { width: 72px; height: 72px; object-fit: contain; }

  @media (max-width: 820px) {
    .shell { padding: 18px; }

    .hero,
    .panel-head,
    .editor-head,
    .editor-layout {
      flex-direction: column;
    }

    .hero-actions { justify-content: flex-start; }
  }
</style>

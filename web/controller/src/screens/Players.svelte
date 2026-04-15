<script>
  import { createEventDispatcher } from 'svelte';
  import { players } from '../stores/match.js';

  const dispatch = createEventDispatcher();

  const COLORS = [
    '#e63946', '#ff6b6b', '#f77f00', '#f4a261', '#e9c46a', '#90be6d',
    '#2a9d8f', '#43aa8b', '#4d908e', '#577590', '#457b9d', '#277da1',
    '#4895ef', '#00bbf9', '#4361ee', '#5e60ce', '#7b2cbf', '#9b5de5',
    '#f15bb5', '#d62888',
  ];
  const PHOTO_SIZE = 200;
  const EDITOR_CANVAS_SIZE = 280;
  const DEFAULT_EDITOR = {
    zoom: 1,
    panX: 0,
    panY: 0,
  };

  let adding = false;
  let editingId = null;
  let form = { name: '', color: COLORS[0], photo: null };
  let error = '';
  let fileInput;
  let photoEditorOpen = false;
  let photoSource = null;
  let photoImage = null;
  let photoEditor = { ...DEFAULT_EDITOR };
  let editorFrameSize = 0;
  let touchState = null;
  let editorCanvas;

  $: if (editorCanvas && photoImage && photoEditorOpen) {
    drawEditorPreview(photoEditor);
  }

  function startAdd() { adding = true; editingId = null; form = { name: '', color: COLORS[0], photo: null }; error = ''; }
  function startEdit(p) { editingId = p.id; adding = false; form = { name: p.name, color: p.color, photo: p.photo ?? null }; error = ''; }
  function cancel() {
    adding = false;
    editingId = null;
    error = '';
    closePhotoEditor();
  }

  function triggerPhoto() { fileInput?.click(); }
  function resetPhotoEditor() { photoEditor = { ...DEFAULT_EDITOR }; }
  function closePhotoEditor() {
    photoEditorOpen = false;
    photoSource = null;
    photoImage = null;
    touchState = null;
    isDragging = false;
    window.removeEventListener('mousemove', onEditorMouseMove);
    window.removeEventListener('mouseup', onEditorMouseUp);
    resetPhotoEditor();
  }

  function drawEditorPreview(_editor) {
    if (!editorCanvas || !photoImage) return;
    editorCanvas.width = EDITOR_CANVAS_SIZE;
    editorCanvas.height = EDITOR_CANVAS_SIZE;
    const ctx = editorCanvas.getContext('2d');
    ctx.clearRect(0, 0, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
    const { drawWidth, drawHeight, drawX, drawY } = getDrawMetrics(EDITOR_CANVAS_SIZE);
    ctx.drawImage(photoImage, drawX, drawY, drawWidth, drawHeight);
  }

  async function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        photoSource = ev.target.result;
        photoImage = await loadImage(photoSource);
        resetPhotoEditor();
        photoEditorOpen = true;
      } catch (err) {
        error = err.message ?? 'Imagine invalidă';
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function applyPhotoEdits() {
    if (!photoSource) return;
    try {
      const img = photoImage ?? await loadImage(photoSource);
      const { drawWidth, drawHeight, drawX, drawY } = getDrawMetrics(PHOTO_SIZE);

      const canvas = document.createElement('canvas');
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      form = { ...form, photo: canvas.toDataURL('image/png') };
      closePhotoEditor();
    } catch (e) {
      error = e.message ?? 'Nu am putut procesa poza';
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Imagine invalidă'));
      img.src = src;
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getDrawMetrics(frameSize) {
    if (!photoImage || !frameSize) {
      return { drawWidth: frameSize, drawHeight: frameSize, drawX: 0, drawY: 0 };
    }
    const baseScale = Math.max(frameSize / photoImage.width, frameSize / photoImage.height);
    const drawWidth = photoImage.width * baseScale * photoEditor.zoom;
    const drawHeight = photoImage.height * baseScale * photoEditor.zoom;
    const maxOffsetX = Math.max(0, (drawWidth - frameSize) / 2);
    const maxOffsetY = Math.max(0, (drawHeight - frameSize) / 2);
    const drawX = (frameSize - drawWidth) / 2 + photoEditor.panX * maxOffsetX;
    const drawY = (frameSize - drawHeight) / 2 + photoEditor.panY * maxOffsetY;
    return { drawWidth, drawHeight, drawX, drawY, maxOffsetX, maxOffsetY };
  }

  function clampEditorState(nextState) {
    return {
      zoom: clamp(nextState.zoom, 1, 4),
      panX: clamp(nextState.panX, -1, 1),
      panY: clamp(nextState.panY, -1, 1),
    };
  }

  function updateZoom(nextZoom) {
    photoEditor = clampEditorState({ ...photoEditor, zoom: nextZoom });
  }

  function distanceBetweenTouches(touchA, touchB) {
    return Math.hypot(touchA.clientX - touchB.clientX, touchA.clientY - touchB.clientY);
  }

  function onEditorTouchStart(event) {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      touchState = {
        mode: 'pan',
        startX: touch.clientX,
        startY: touch.clientY,
        startPanX: photoEditor.panX,
        startPanY: photoEditor.panY,
      };
      return;
    }

    if (event.touches.length >= 2) {
      touchState = {
        mode: 'pinch',
        startDistance: distanceBetweenTouches(event.touches[0], event.touches[1]),
        startZoom: photoEditor.zoom,
      };
    }
  }

  function onEditorTouchMove(event) {
    if (!touchState) return;

    if (touchState.mode === 'pan' && event.touches.length === 1) {
      const touch = event.touches[0];
      const { maxOffsetX = 0, maxOffsetY = 0 } = getDrawMetrics(editorFrameSize);
      const deltaX = maxOffsetX ? (touch.clientX - touchState.startX) / maxOffsetX : 0;
      const deltaY = maxOffsetY ? (touch.clientY - touchState.startY) / maxOffsetY : 0;
      photoEditor = clampEditorState({
        ...photoEditor,
        panX: touchState.startPanX + deltaX,
        panY: touchState.startPanY + deltaY,
      });
      return;
    }

    if (touchState.mode === 'pinch' && event.touches.length >= 2) {
      const distance = distanceBetweenTouches(event.touches[0], event.touches[1]);
      updateZoom(touchState.startZoom * (distance / touchState.startDistance));
    }
  }

  let isDragging = false;

  function onEditorMouseDown(event) {
    if (event.button !== 0) return;
    isDragging = true;
    touchState = {
      mode: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      startPanX: photoEditor.panX,
      startPanY: photoEditor.panY,
    };
    window.addEventListener('mousemove', onEditorMouseMove);
    window.addEventListener('mouseup', onEditorMouseUp);
  }

  function onEditorMouseMove(event) {
    if (!touchState || touchState.mode !== 'pan') return;
    const { maxOffsetX = 0, maxOffsetY = 0 } = getDrawMetrics(editorFrameSize);
    const deltaX = maxOffsetX ? (event.clientX - touchState.startX) / maxOffsetX : 0;
    const deltaY = maxOffsetY ? (event.clientY - touchState.startY) / maxOffsetY : 0;
    photoEditor = clampEditorState({
      ...photoEditor,
      panX: touchState.startPanX + deltaX,
      panY: touchState.startPanY + deltaY,
    });
  }

  function onEditorMouseUp() {
    isDragging = false;
    touchState = null;
    window.removeEventListener('mousemove', onEditorMouseMove);
    window.removeEventListener('mouseup', onEditorMouseUp);
  }

  function onEditorWheel(event) {
    updateZoom(photoEditor.zoom * (event.deltaY > 0 ? 1 / 1.1 : 1.1));
  }

  function onEditorTouchEnd(event) {
    if (event.touches.length >= 2) {
      touchState = {
        mode: 'pinch',
        startDistance: distanceBetweenTouches(event.touches[0], event.touches[1]),
        startZoom: photoEditor.zoom,
      };
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      touchState = {
        mode: 'pan',
        startX: touch.clientX,
        startY: touch.clientY,
        startPanX: photoEditor.panX,
        startPanY: photoEditor.panY,
      };
      return;
    }

    touchState = null;
  }

  async function save() {
    if (!form.name.trim()) { error = 'Numele este obligatoriu'; return; }
    try {
      const url = editingId ? `/api/players/${editingId}` : '/api/players';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        error = data.error?.message ?? 'Error'; return;
      }
      await refresh();
      cancel();
    } catch (e) { error = e.message; }
  }

  async function remove(id) {
    if (!confirm('Ștergi jucătorul?')) return;
    await fetch(`/api/players/${id}`, { method: 'DELETE' });
    await refresh();
  }

  async function refresh() {
    const res = await fetch('/api/players');
    players.set(await res.json());
    dispatch('refresh');
  }
</script>

<div class="players">
  <header>
    <button class="back" on:click={() => dispatch('back')}>← Înapoi</button>
    <h2>Jucători</h2>
    <button class="add-btn" on:click={startAdd}>+ Adaugă</button>
  </header>

  <!-- Hidden file input for camera/photo -->
  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    style="display:none"
    on:change={onFileSelected}
  />

  {#if photoEditorOpen}
    <button class="photo-editor-backdrop" aria-label="Închide editorul foto" on:click={closePhotoEditor}></button>
    <div class="photo-editor-card">
      <div class="photo-editor-header">
        <h3>Editează poza</h3>
        <button class="icon-close" on:click={closePhotoEditor}>✕</button>
      </div>

      <div class="photo-editor-preview">
        <button
          type="button"
          class="photo-editor-frame"
          aria-label="Editează poza"
          bind:clientWidth={editorFrameSize}
          bind:clientHeight={editorFrameSize}
          on:touchstart|preventDefault={onEditorTouchStart}
          on:touchmove|preventDefault={onEditorTouchMove}
          on:touchend|preventDefault={onEditorTouchEnd}
          on:touchcancel|preventDefault={onEditorTouchEnd}
          on:mousedown={onEditorMouseDown}
          on:wheel|preventDefault={onEditorWheel}
          style:cursor={isDragging ? 'grabbing' : 'grab'}
        >
          <canvas
            bind:this={editorCanvas}
            width={EDITOR_CANVAS_SIZE}
            height={EDITOR_CANVAS_SIZE}
            class="photo-editor-canvas"
          ></canvas>
        </button>
      </div>

      <p class="editor-hint">Mută poza cu degetul și fă pinch pentru zoom. Decupajul final este pătrat.</p>

      <div class="form-btns">
        <button class="btn ghost" on:click={resetPhotoEditor}>Resetează</button>
        <button class="btn ghost" on:click={() => updateZoom(photoEditor.zoom / 1.2)}>−</button>
        <button class="btn ghost" on:click={() => updateZoom(photoEditor.zoom * 1.2)}>+</button>
        <button class="btn ghost" on:click={closePhotoEditor}>Anulează</button>
        <button class="btn primary" on:click={applyPhotoEdits}>Aplică</button>
      </div>
    </div>
  {/if}

  {#if adding || editingId !== null}
    <div class="form-card">
      <h3>{adding ? 'Jucător Nou' : 'Editează'}</h3>
      {#if error}<p class="err">{error}</p>{/if}

      <!-- Photo section -->
      <div class="photo-section">
        <button class="photo-btn" on:click={triggerPhoto}>
          {#if form.photo}
            <img src={form.photo} alt="foto" class="photo-preview" />
          {:else}
            <div class="photo-placeholder">
              <span style="font-size:2rem">📷</span>
              <span class="photo-hint">Adaugă poză</span>
            </div>
          {/if}
        </button>
        {#if form.photo}
          <button class="remove-photo-btn" on:click={() => form = {...form, photo: null}}>✕ Șterge poza</button>
        {/if}
      </div>

      <input class="input" placeholder="Nume *" bind:value={form.name} maxlength="32" />
      <div class="color-row">
        {#each COLORS as c}
          <button
            class="swatch"
            style="background:{c}"
            class:selected={form.color === c}
            on:click={() => form.color = c}
          ></button>
        {/each}
      </div>
      <div class="form-btns">
        <button class="btn ghost" on:click={cancel}>Anulează</button>
        <button class="btn primary" on:click={save}>Salvează</button>
      </div>
    </div>
  {/if}

  <ul class="list">
    {#each $players as p (p.id)}
      <li class="player-row">
        <div class="avatar" style="background:{p.color}">
          {#if p.photo}
            <img src={p.photo} alt={p.name} class="avatar-photo" />
          {:else}
            {p.name[0].toUpperCase()}
          {/if}
        </div>
        <div class="info">
          <span class="name">{p.name}</span>
        </div>
        <div class="row-actions">
          <button class="icon-btn" on:click={() => startEdit(p)}>✏️</button>
          <button class="icon-btn danger" on:click={() => remove(p.id)}>🗑️</button>
        </div>
      </li>
    {:else}
      <li class="empty">Niciun jucător. Adaugă unul!</li>
    {/each}
  </ul>
</div>

<style>
  .players { display: flex; flex-direction: column; min-height: 100vh; background: #1a1a2e; }

  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem; background: #12122a; border-bottom: 1px solid #2a2a4a;
    position: sticky; top: 0; z-index: 10;
  }
  header h2 { font-size: 1.1rem; font-weight: 700; }
  .back { background: none; border: none; color: #aaa; font-size: 1rem; cursor: pointer; }
  .add-btn { background: #e63946; border: none; color: #fff; padding: 0.4rem 0.8rem; border-radius: 8px; font-weight: 700; cursor: pointer; }

  .form-card { margin: 1rem; background: #1e1e38; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .form-card h3 { font-size: 1rem; color: #ccc; }
  .input { background: #2a2a4a; border: none; color: #fff; padding: 0.75rem; border-radius: 8px; font-size: 1rem; width: 100%; }
  .input::placeholder { color: #666; }
  .color-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .swatch { width: 32px; height: 32px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; }
  .swatch.selected { border-color: #fff; }
  .form-btns { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn { padding: 0.6rem 1.2rem; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
  .btn.primary { background: #e63946; color: #fff; }
  .btn.ghost { background: #2a2a4a; color: #ccc; }
  .err { color: #e63946; font-size: 0.85rem; }

  .photo-editor-backdrop {
    position: fixed; inset: 0; background: rgba(4, 6, 17, 0.82); z-index: 20;
    border: none; padding: 0; margin: 0; cursor: pointer;
  }
  .photo-editor-card {
    position: fixed; inset: auto 1rem 1rem; top: 4.5rem; z-index: 21;
    background: #12122a; border: 1px solid #2f3159; border-radius: 18px;
    padding: 1rem; display: flex; flex-direction: column; gap: 1rem;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  }
  .photo-editor-header {
    display: flex; align-items: center; justify-content: space-between;
  }
  .photo-editor-header h3 { margin: 0; font-size: 1rem; }
  .icon-close {
    background: none; border: none; color: #fff; font-size: 1rem; cursor: pointer;
  }
  .photo-editor-preview {
    display: flex; justify-content: center;
  }
  .photo-editor-frame {
    width: min(72vw, 280px); aspect-ratio: 1; border-radius: 24px;
    overflow: hidden; border: 3px solid rgba(255,255,255,0.18);
    background: linear-gradient(135deg, #20254d, #101529);
    position: relative; touch-action: none;
    padding: 0; appearance: none;
  }
  .photo-editor-canvas {
    width: 100%; height: 100%; display: block;
  }
  .editor-hint {
    margin: 0; text-align: center; font-size: 0.82rem; color: #b8b9d1;
  }

  /* Photo upload */
  .photo-section { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .photo-btn {
    width: 100px; height: 100px; border-radius: 22px; border: 2px dashed #3a3a5a;
    background: #2a2a4a; cursor: pointer; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    padding: 0;
  }
  .photo-preview { width: 100%; height: 100%; object-fit: cover; }
  .photo-placeholder { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
  .photo-hint { font-size: 0.65rem; color: #666; }
  .remove-photo-btn {
    background: none; border: none; color: #e63946; font-size: 0.75rem;
    cursor: pointer; opacity: 0.7;
  }

  .list { list-style: none; padding: 0.5rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .player-row { display: flex; align-items: center; gap: 0.75rem; background: #1e1e38; border-radius: 10px; padding: 0.75rem; }
  .avatar {
    width: 40px; height: 40px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 1.1rem; flex-shrink: 0;
    overflow: hidden;
  }
  .avatar-photo { width: 100%; height: 100%; object-fit: cover; }
  .info { flex: 1; }
  .name { font-weight: 600; }
  .row-actions { display: flex; gap: 0.5rem; }
  .icon-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; padding: 0.25rem; }
  .icon-btn.danger { opacity: 0.7; }
  .empty { color: #666; text-align: center; padding: 2rem; }

  @media (min-width: 700px) {
    .photo-editor-card {
      inset: 5rem auto auto 50%;
      width: min(540px, calc(100vw - 2rem));
      transform: translateX(-50%);
    }
  }
</style>

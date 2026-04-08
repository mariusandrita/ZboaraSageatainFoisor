<script>
  import { createEventDispatcher } from 'svelte';
  import { players } from '../stores/match.js';

  const dispatch = createEventDispatcher();

  const COLORS = ['#e63946','#457b9d','#2a9d8f','#e9c46a','#f4a261','#9b5de5','#00bbf9','#fee440'];

  let adding = false;
  let editingId = null;
  let form = { name: '', nickname: '', color: COLORS[0], photo: null };
  let error = '';
  let fileInput;

  function startAdd() { adding = true; editingId = null; form = { name: '', nickname: '', color: COLORS[0], photo: null }; error = ''; }
  function startEdit(p) { editingId = p.id; adding = false; form = { name: p.name, nickname: p.nickname ?? '', color: p.color, photo: p.photo ?? null }; error = ''; }
  function cancel() { adding = false; editingId = null; error = ''; }

  function triggerPhoto() { fileInput?.click(); }

  function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const size = 200;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        // Crop to square center
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        form = { ...form, photo: canvas.toDataURL('image/jpeg', 0.8) };
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
    capture="user"
    style="display:none"
    on:change={onFileSelected}
  />

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
      <input class="input" placeholder="Poreclă" bind:value={form.nickname} maxlength="20" />
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
            {(p.nickname || p.name)[0].toUpperCase()}
          {/if}
        </div>
        <div class="info">
          <span class="name">{p.name}</span>
          {#if p.nickname}<span class="nick">{p.nickname}</span>{/if}
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

  /* Photo upload */
  .photo-section { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .photo-btn {
    width: 100px; height: 100px; border-radius: 50%; border: 2px dashed #3a3a5a;
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
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 1.1rem; flex-shrink: 0;
    overflow: hidden;
  }
  .avatar-photo { width: 100%; height: 100%; object-fit: cover; }
  .info { flex: 1; }
  .name { font-weight: 600; }
  .nick { display: block; font-size: 0.8rem; color: #888; }
  .row-actions { display: flex; gap: 0.5rem; }
  .icon-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; padding: 0.25rem; }
  .icon-btn.danger { opacity: 0.7; }
  .empty { color: #666; text-align: center; padding: 2rem; }
</style>

<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { players } from '../stores/match.js';

  const dispatch = createEventDispatcher();
  export let ws = null;

  let step = 1; // 1=players, 2=settings
  let selectedIds = [];
  let startingScore = 501;
  let legsToWin = 1;
  let doubleOut = 1;
  let playerOrderMode = 'selected';
  let loading = false;
  let error = '';
  let setupSyncTimer = null;
  const MAX_PLAYERS = 10;

  const SCORES = [301, 501, 701];
  const LEGS = [
    { label: 'Bo1', value: 1 },
    { label: 'Bo3', value: 2 },
    { label: 'Bo5', value: 3 },
    { label: 'Bo7', value: 4 },
  ];

  const previewPlayers = (list = []) => list.map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    // photo omitted — base64 images make the payload too large (413)
  }));

  function currentSetupPreview() {
    return {
      step,
      startingScore,
      legsToWin,
      doubleOut,
      playerOrderMode,
      selectedIds,
      availablePlayers: previewPlayers($players ?? []),
    };
  }

  function scheduleSetupPreviewSync() {
    clearTimeout(setupSyncTimer);
    const payload = currentSetupPreview();
    setupSyncTimer = setTimeout(async () => {
      try {
        await fetch('/api/matches/setup-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.error('Failed to sync setup preview', e);
      }
    }, 80);
  }

  async function clearSetupPreviewSync() {
    clearTimeout(setupSyncTimer);
    setupSyncTimer = null;
    try {
      await fetch('/api/matches/setup-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      });
    } catch (e) {
      console.error('Failed to clear setup preview', e);
    }
  }

  $: {
    ws;
    step;
    startingScore;
    legsToWin;
    doubleOut;
    playerOrderMode;
    selectedIds;
    $players;

    ws?.updateMatchSetup?.(currentSetupPreview());
    scheduleSetupPreviewSync();
  }

  onDestroy(() => {
    ws?.clearMatchSetup?.();
    clearSetupPreviewSync();
  });

  function togglePlayer(id) {
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((x) => x !== id);
    } else if (selectedIds.length < MAX_PLAYERS) {
      selectedIds = [...selectedIds, id];
    }
  }

  async function startMatch() {
    if (selectedIds.length < 1) { error = 'Selectează cel puțin 1 jucător'; return; }
    loading = true; error = '';
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starting_score: startingScore,
          double_out: doubleOut,
          legs_to_win: legsToWin,
          player_order_mode: playerOrderMode,
          player_ids: selectedIds,
        }),
      });
      if (!res.ok) { const d = await res.json(); error = d.error?.message ?? 'Error'; loading = false; return; }
      const created = await res.json();

      const res2 = await fetch(`/api/matches/${created.id}/start`, { method: 'POST' });
      if (!res2.ok) { const d = await res2.json(); error = d.error?.message ?? 'Start failed'; loading = false; return; }
      const started = await res2.json();
      ws?.clearMatchSetup?.();
      await clearSetupPreviewSync();
      dispatch('started', started);
    } catch (e) { error = e.message; loading = false; }
  }

  function handlePlayerKeydown(event, id) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    togglePlayer(id);
  }
</script>

<div class="wizard">
  <header>
    <button class="back" on:click={() => step === 1 ? dispatch('back') : step--}>← {step === 1 ? 'Acasă' : 'Înapoi'}</button>
    <h2>Meci Nou</h2>
    <span class="step-hint">{step}/2</span>
  </header>

  {#if error}<p class="err">{error}</p>{/if}

  <div class="scroll-body">
    {#if step === 1}
      <!-- Step 1: Pick players -->
      <p class="section-title">Selectează Jucători <span class="count">({selectedIds.length}/{MAX_PLAYERS})</span></p>
      <ul class="player-list">
        {#each $players as p (p.id)}
          <li class="player-shell">
            <button
              type="button"
              class="player-item"
              class:selected={selectedIds.includes(p.id)}
              aria-pressed={selectedIds.includes(p.id)}
              on:click={() => togglePlayer(p.id)}
              on:keydown={(event) => handlePlayerKeydown(event, p.id)}
            >
            <div class="avatar" style="background:{p.color}">
              {#if p.photo}<img src={p.photo} alt={p.name} class="avatar-img" />{:else}{p.name[0].toUpperCase()}{/if}
            </div>
            <span class="pname">{p.name}</span>
            <span class="check">{selectedIds.includes(p.id) ? '✓' : ''}</span>
            <div class="order-badge" style="display:{selectedIds.includes(p.id)?'flex':'none'}">
              {selectedIds.indexOf(p.id) + 1}
            </div>
            </button>
          </li>
        {:else}
          <li class="empty">Niciun jucător — <button type="button" class="empty-link" on:click={() => dispatch('back')}>adaugă mai întâi</button></li>
        {/each}
      </ul>

    {:else}
      <!-- Step 2: Settings -->
      <div class="settings">
        <p class="section-title">Scor Inițial</p>
        <div class="pill-row">
          {#each SCORES as s}
            <button class="pill" class:active={startingScore === s} on:click={() => startingScore = s}>{s}</button>
          {/each}
        </div>

        <p class="section-title">Format Meci</p>
        <div class="pill-row">
          {#each LEGS as l}
            <button class="pill" class:active={legsToWin === l.value} on:click={() => legsToWin = l.value}>{l.label}</button>
          {/each}
        </div>

        <p class="section-title">Finalizare</p>
        <div class="pill-row">
          <button class="pill" class:active={doubleOut === 1} on:click={() => doubleOut = 1}>Dublu Afară</button>
          <button class="pill" class:active={doubleOut === 0} on:click={() => doubleOut = 0}>Direct Afară</button>
        </div>

        <p class="section-title">Ordine Aruncare</p>
        <div class="pill-row">
          <button class="pill" class:active={playerOrderMode === 'selected'} on:click={() => playerOrderMode = 'selected'}>
            Ca la selecție
          </button>
          <button class="pill" class:active={playerOrderMode === 'random'} on:click={() => playerOrderMode = 'random'}>
            Aleatoriu
          </button>
        </div>

        <div class="summary">
          <p>{selectedIds.length} player{selectedIds.length !== 1 ? 's' : ''} · {startingScore} · {LEGS.find(l=>l.value===legsToWin)?.label} · {doubleOut ? 'Double Out' : 'Straight'} · {playerOrderMode === 'random' ? 'Ordine aleatorie' : 'Ordinea selecției'}</p>
        </div>
      </div>
    {/if}
  </div>

  <div class="footer">
    {#if step === 1}
      <button class="btn primary" disabled={selectedIds.length === 0} on:click={() => step = 2}>
        Următor →
      </button>
    {:else}
      <button class="btn primary" on:click={startMatch} disabled={loading}>
        {loading ? 'Se pornește…' : '🎯 Începe Meciul'}
      </button>
    {/if}
  </div>
</div>

<style>
  .wizard { display: flex; flex-direction: column; height: 100vh; height: 100dvh; background: #1a1a2e; overflow: hidden; }

  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem; background: #12122a; border-bottom: 1px solid #2a2a4a;
    position: sticky; top: 0; z-index: 10;
  }
  header h2 { font-size: 1.1rem; font-weight: 700; }
  .back { background: none; border: none; color: #aaa; font-size: 1rem; cursor: pointer; }
  .step-hint { font-size: 0.8rem; color: #666; }
  .err { background: #3a1a1e; color: #e63946; padding: 0.75rem 1rem; font-size: 0.9rem; }
  .section-title { padding: 1rem 1rem 0.5rem; color: #aaa; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; }
  .count { color: #666; }

  .player-list { list-style: none; padding: 0 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .player-shell { list-style: none; }
  .player-item {
    display: flex; align-items: center; gap: 0.75rem;
    background: #1e1e38; border-radius: 10px; padding: 0.9rem;
    cursor: pointer; border: 2px solid transparent; position: relative;
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
    width: 100%; text-align: left;
    appearance: none; -webkit-appearance: none;
    color: inherit; font: inherit; outline: none;
  }
  .player-item.selected {
    border-color: #e63946;
    background: #2a1a2e;
    box-shadow: inset 0 0 0 1px rgba(230, 57, 70, 0.18);
  }
  .player-item:focus-visible {
    border-color: #f4a261;
    box-shadow: 0 0 0 3px rgba(244, 162, 97, 0.2);
  }
  .avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0; overflow: hidden; }
  .avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
  .pname { flex: 1; font-weight: 600; }
  .check { color: #e63946; font-weight: 800; font-size: 1.1rem; }
  .order-badge {
    position: absolute; right: 3rem; top: 50%; transform: translateY(-50%);
    width: 22px; height: 22px; border-radius: 50%; background: #e63946;
    align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800;
  }
  .empty { color: #666; padding: 1rem; text-align: center; }
  .empty-link {
    color: #e63946; background: none; border: none; padding: 0;
    font: inherit; cursor: pointer;
  }

  .scroll-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }

  .settings { padding: 0 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .pill-row { display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0 0 0.5rem; }
  .pill { padding: 0.6rem 1.1rem; border: 2px solid #2a2a4a; background: #1e1e38; color: #aaa; border-radius: 999px; font-weight: 600; cursor: pointer; }
  .pill.active { border-color: #e63946; color: #fff; background: #2a1a2e; }
  .summary { background: #1e1e38; border-radius: 10px; padding: 1rem; text-align: center; color: #888; font-size: 0.9rem; margin-top: 0.5rem; }

  .footer { padding: 1rem; flex-shrink: 0; }
  .btn { width: 100%; padding: 1rem; border: none; border-radius: 12px; font-size: 1.1rem; font-weight: 700; cursor: pointer; }
  .btn.primary { background: #e63946; color: #fff; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

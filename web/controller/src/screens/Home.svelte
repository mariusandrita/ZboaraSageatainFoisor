<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { connected } from '../stores/match.js';

  const dispatch = createEventDispatcher();

  let liveMatches = [];
  let loading = true;

  onMount(fetchLive);

  async function fetchLive() {
    loading = true;
    try {
      const res = await fetch('/api/matches?status=live');
      if (res.ok) {
        const list = await res.json();
        liveMatches = await Promise.all(
          list.map(m => fetch(`/api/matches/${m.id}`).then(r => r.json()))
        );
      }
    } catch (e) { console.error(e); }
    finally { loading = false; }
  }

  async function deleteMatch(m) {
    if (!confirm(`Delete match between ${m.players?.map(p => p.name).join(' vs ')}?`)) return;
    try {
      await fetch(`/api/matches/${m.id}/abort`, { method: 'POST' });
    } catch (e) { console.error(e); }
    liveMatches = liveMatches.filter(x => x.id !== m.id);
  }

  function gameInfo(m) {
    return `${m.starting_score} · Leg ${m.activeLeg?.leg_number ?? '?'}`;
  }
</script>

<div class="home">

  <!-- Hero -->
  <div class="hero">
    <div class="hero-icon">🎯</div>
    <h1>ZboaraSageata</h1>
    <p class="tagline">Editia Foisor</p>
    <div class="conn-pill" class:online={$connected}>
      <span class="conn-dot"></span>
      {$connected ? 'Conectat' : 'Se conectează…'}
    </div>
  </div>

  <!-- Active matches -->
  <div class="section">
    {#if loading}
      <p class="empty">Se caută meciuri active…</p>
    {:else if liveMatches.length > 0}
      <div class="section-header">
        <span class="section-title">Meciuri Active</span>
        <span class="live-badge">LIVE</span>
      </div>
      <div class="card-list">
        {#each liveMatches as m (m.id)}
          <div class="match-card">
            <div class="card-accent" style="background: linear-gradient(180deg,{m.players?.[0]?.color ?? '#e63946'},{m.players?.[1]?.color ?? '#4caf50'})"></div>
            <div class="card-content">
              <div class="card-top">
                <div class="card-players">
                  {#each m.players ?? [] as p}
                    <div class="player-chip">
                      <div class="chip-dot" style="background:{p.color}"></div>
                      <span>{p.name}</span>
                    </div>
                  {/each}
                </div>
                <span class="card-meta">{gameInfo(m)}</span>
              </div>
              <div class="card-right">
                <button class="delete-btn" on:click={() => deleteMatch(m)} title="Șterge meciul">🗑</button>
                <button class="resume-btn" on:click={() => dispatch('resume', m)}>
                  Continuă →
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="empty">Niciun meci activ</p>
    {/if}
  </div>

  <!-- Actions -->
  <div class="actions">
    <button class="btn primary" on:click={() => dispatch('newmatch')}>
      <span class="btn-icon">＋</span> Meci Nou
    </button>
    <button class="btn secondary" on:click={() => dispatch('players')}>
      Jucători
    </button>
  </div>

</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700;800&family=Inter:wght@400;600&display=swap');

  .home {
    display: flex; flex-direction: column;
    min-height: 100vh;
    min-height: 100svh;
    min-height: 100dvh;
    background: #10102a; color: #e2dfff;
    font-family: 'Inter', system-ui, sans-serif;
  }

  /* Hero */
  .hero {
    display: flex; flex-direction: column; align-items: center;
    padding: 2rem 1.25rem 1.25rem;
    background: linear-gradient(160deg, #2a0a12 0%, #10102a 60%);
    text-align: center; gap: 0.4rem;
  }
  .hero-icon { font-size: 3.5rem; line-height: 1; }
  h1 {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 2.4rem; font-weight: 800; letter-spacing: -1.5px;
    color: #fff; margin: 0;
  }
  .tagline { color: #9990cc; font-size: 0.9rem; margin: 0; }

  .conn-pill {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.75rem; font-weight: 600; color: #666;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
    padding: 0.3rem 0.85rem; border-radius: 999px; margin-top: 0.5rem;
  }
  .conn-pill.online { color: #4caf50; }
  .conn-dot {
    width: 7px; height: 7px; border-radius: 50%; background: currentColor;
  }

  /* Section */
  .section {
    padding: 1rem 1.25rem 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .section-header {
    display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem;
  }
  .section-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: #6660aa;
  }
  .live-badge {
    font-size: 0.6rem; font-weight: 800; letter-spacing: 0.1em;
    background: #e63946; color: #fff; padding: 0.15rem 0.4rem;
    border-radius: 4px;
  }

  .empty { color: #444; font-size: 0.85rem; text-align: center; padding: 1rem 0; }

  /* Match cards */
  .card-list { display: flex; flex-direction: column; gap: 0.6rem; }

  .match-card {
    display: flex; border-radius: 14px; overflow: hidden;
    background: #1a1a38; border: 1px solid rgba(255,255,255,0.06);
  }
  .card-accent { width: 5px; flex-shrink: 0; }
  .card-content { flex: 1; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.65rem; }

  .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }

  .card-players { display: flex; flex-direction: column; gap: 0.3rem; }
  .player-chip { display: flex; align-items: center; gap: 0.45rem; }
  .chip-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .player-chip span { font-size: 0.9rem; font-weight: 600; color: #e2dfff; }

  .card-meta { font-size: 0.72rem; color: #6660aa; white-space: nowrap; padding-top: 2px; }

  .card-right {
    display: flex; align-items: center; gap: 0.5rem;
  }

  .delete-btn {
    background: transparent; border: none; cursor: pointer;
    font-size: 1.1rem; color: #e63946; padding: 0.3rem 0.4rem;
    border-radius: 8px; line-height: 1; opacity: 0.7;
    transition: opacity 0.15s;
  }
  .delete-btn:active { opacity: 1; }

  .resume-btn {
    background: rgba(76,175,80,0.12); color: #4caf50;
    border: 1px solid rgba(76,175,80,0.3); font-size: 0.85rem; font-weight: 700;
    padding: 0.55rem 1rem; border-radius: 10px; cursor: pointer;
    text-align: center; transition: background 0.15s;
    font-family: inherit;
  }
  .resume-btn:active { background: rgba(76,175,80,0.25); }

  /* Actions */
  .actions {
    display: flex; flex-direction: column; gap: 0.75rem;
    padding: 1rem 1.25rem calc(1rem + env(safe-area-inset-bottom, 0px));
    background:
      linear-gradient(180deg, rgba(16,16,42,0) 0%, rgba(16,16,42,0.82) 18%, #10102a 44%);
  }

  .btn {
    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
    width: 100%; padding: 1rem; border: none; border-radius: 14px;
    font-size: 1rem; font-weight: 700; cursor: pointer;
    transition: opacity 0.15s; font-family: inherit;
  }
  .btn:active { opacity: 0.75; }
  .btn-icon { font-size: 1.2rem; line-height: 1; }
  .btn.primary   { background: #e63946; color: #fff; }
  .btn.secondary { background: rgba(255,255,255,0.05); color: #9990cc; border: 1px solid rgba(255,255,255,0.1); }

  @media (max-height: 760px) {
    .hero {
      padding-top: 1.35rem;
      padding-bottom: 1rem;
    }

    .hero-icon { font-size: 2.9rem; }

    h1 {
      font-size: 2rem;
    }

    .actions {
      gap: 0.6rem;
      padding-top: 0.85rem;
    }

    .btn {
      padding: 0.88rem;
    }
  }
</style>

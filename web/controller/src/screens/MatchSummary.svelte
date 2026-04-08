<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { match } from '../stores/match.js';

  const dispatch = createEventDispatcher();

  export let matchId;

  let stats = [];
  let loading = true;

  $: players   = $match?.players ?? [];
  $: winner    = $match?.winner_id ? players.find(p => p.id === $match.winner_id) : null;
  $: isAborted = $match?.status === 'aborted';

  onMount(async () => {
    try {
      const res = await fetch(`/api/stats/matches/${matchId}`);
      if (res.ok) stats = await res.json();
    } catch (e) { console.error('stats fetch failed', e); }
    finally { loading = false; }
  });

  function ps(playerId) {
    return stats.find(s => s.player_id === playerId) ?? { avg_3dart: 0, s180: 0, legs_won: 0 };
  }
</script>

<div class="summary">

  <div class="status-banner" class:won={!isAborted} class:abandoned={isAborted}>
    {isAborted ? 'ABANDONAT' : 'MECI ÎNCHEIAT'}
  </div>

  {#if winner && !isAborted}
    <div class="winner-card" style="--c:{winner.color}">
      <div class="crown">🏆</div>
      <div class="winner-name">{winner.name}</div>
      <div class="winner-label">Câștigător</div>
    </div>
  {:else if isAborted}
    <div class="abandoned-msg">Meciul a fost abandonat.</div>
  {/if}

  <div class="meta">
    {$match?.starting_score ?? ''} · Cel mai bun din {($match?.legs_to_win ?? 1) * 2 - 1}
  </div>

  <div class="players-grid">
    {#each players as p (p.id)}
      {@const s = ps(p.id)}
      <div class="player-row" class:is-winner={p.id === $match?.winner_id && !isAborted}>
        <div class="p-dot" style="background:{p.color}"></div>
        <div class="p-name">{p.name}</div>
        <div class="p-legs">
          {#each Array($match?.legs_to_win ?? 1) as _, i}
            <div class="leg-pip" class:won={i < s.legs_won} style="--c:{p.color}"></div>
          {/each}
        </div>
        {#if !loading}
          <div class="p-stat">
            <span class="sv">{s.avg_3dart ?? '—'}</span>
            <span class="sl">med</span>
          </div>
          {#if s.s180 > 0}
            <div class="badge-180">180 ×{s.s180}</div>
          {/if}
        {:else}
          <div class="p-stat"><span class="sv">…</span></div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="actions">
    <button class="btn primary" on:click={() => dispatch('newmatch')}>Meci Nou</button>
    <button class="btn secondary" on:click={() => dispatch('home')}>Acasă</button>
  </div>

</div>

<style>
  .summary {
    display: flex; flex-direction: column; align-items: center;
    min-height: 100vh; padding: 2rem 1.5rem; gap: 1.5rem;
    background: #1a1a2e; color: #fff;
  }

  .status-banner {
    font-size: 0.8rem; font-weight: 800; letter-spacing: 0.15em;
    padding: 0.4rem 1.4rem; border-radius: 999px;
  }
  .status-banner.won       { background: #0a2010; color: #4caf50; }
  .status-banner.abandoned { background: #3a1a1e; color: #e63946; }

  .winner-card {
    text-align: center; padding: 1.5rem 2rem;
    background: #1e1e38; border-radius: 16px;
    border: 2px solid var(--c);
    width: 100%; max-width: 320px;
  }
  .crown       { font-size: 2.5rem; }
  .winner-name { font-size: 1.8rem; font-weight: 900; color: var(--c); margin-top: 0.25rem; }
  .winner-label{ font-size: 0.8rem; color: #888; }

  .abandoned-msg { color: #888; font-size: 0.95rem; text-align: center; }

  .meta { color: #555; font-size: 0.8rem; }

  .players-grid {
    display: flex; flex-direction: column; gap: 0.75rem;
    width: 100%; max-width: 400px;
  }

  .player-row {
    display: flex; align-items: center; gap: 0.75rem;
    background: #1e1e38; border-radius: 12px; padding: 0.85rem 1rem;
    border: 2px solid transparent;
  }
  .player-row.is-winner { border-color: #4caf50; }

  .p-dot  { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .p-name { flex: 1; font-weight: 700; }
  .p-legs { display: flex; gap: 4px; }
  .leg-pip { width: 12px; height: 12px; border-radius: 50%; background: #2a2a4a; border: 2px solid #3a3a5a; }
  .leg-pip.won { background: var(--c); border-color: var(--c); }

  .p-stat { text-align: center; min-width: 44px; }
  .sv { display: block; font-weight: 800; font-size: 1rem; }
  .sl { display: block; font-size: 0.6rem; color: #666; text-transform: uppercase; }

  .badge-180 {
    background: #2a1a4a; color: #c084fc;
    font-size: 0.7rem; font-weight: 700;
    padding: 0.2rem 0.5rem; border-radius: 6px;
  }

  .actions {
    display: flex; flex-direction: column; gap: 0.75rem;
    width: 100%; max-width: 320px; margin-top: auto; padding-top: 1rem;
  }

  .btn {
    width: 100%; padding: 1rem; border: none; border-radius: 12px;
    font-size: 1.1rem; font-weight: 700; cursor: pointer; transition: opacity 0.15s;
  }
  .btn:active  { opacity: 0.75; }
  .btn.primary   { background: #e63946; color: #fff; }
  .btn.secondary { background: #2a2a4a; color: #ccc; }
</style>

<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { match } from '../stores/match.js';
  import BadgeToken from '../../../shared/BadgeToken.svelte';
  import { badgesForPlayer } from '../../../shared/badges.js';

  const dispatch = createEventDispatcher();

  export let matchId;

  let recap = null;
  let loading = true;
  let loadError = '';

  function fmt(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return Number(value).toFixed(2);
  }

  function deltaLabel(value) {
    if (value == null || Number.isNaN(Number(value))) return '0.00';
    const num = Number(value);
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}`;
  }

  $: players = recap?.players ?? $match?.players ?? [];
  $: winner = recap?.players?.find((player) => player.id === recap?.winner_id)
    ?? ($match?.winner_id ? players.find((player) => player.id === $match.winner_id) : null);
  $: isAborted = $match?.status === 'aborted';

  onMount(async () => {
    if (!matchId || isAborted) {
      loading = false;
      return;
    }

    try {
      const res = await fetch(`/api/stats/matches/${matchId}/tv-recap`);
      if (!res.ok) throw new Error('Nu am putut încărca recapitularea meciului.');
      recap = await res.json();
    } catch (e) {
      console.error('recap fetch failed', e);
      loadError = e.message;
    } finally {
      loading = false;
    }
  });
</script>

<div class="summary-shell">
  <div class="status-banner" class:won={!isAborted} class:abandoned={isAborted}>
    {isAborted ? 'ABANDONAT' : 'MECI ÎNCHEIAT'}
  </div>

  {#if winner && !isAborted}
    <section class="winner-card" style="--c:{winner.color}">
      <div class="winner-portrait">
        {#if winner.photo}
          <img src={winner.photo} alt={winner.name} />
        {:else}
          <span>{winner.name?.[0]?.toUpperCase() ?? '?'}</span>
        {/if}
      </div>

      <div class="winner-copy">
        <div class="winner-kicker">Câștigător</div>
        <h1>{winner.name}</h1>
        <p>{winner.legs_won} manșe câștigate</p>

        {#if recap}
          <div class="winner-metrics">
            <div class="metric">
              <span>Avg meci</span>
              <strong>{fmt(winner.match_avg)}</strong>
            </div>
            <div class="metric">
              <span>Avg înainte</span>
              <strong>{fmt(winner.general_avg_before)}</strong>
            </div>
            <div class="metric">
              <span>Avg după</span>
              <strong>{fmt(winner.general_avg_after)}</strong>
            </div>
            <div class="metric" class:up={winner.avg_delta > 0} class:down={winner.avg_delta < 0}>
              <span>Evoluție</span>
              <strong>{deltaLabel(winner.avg_delta)}</strong>
            </div>
          </div>

          <div class="compare-line" class:good={winner.beat_general}>
            {#if winner.beat_general}
              Media din meci a depășit media generală anterioară.
            {:else}
              Media din meci nu a depășit media generală anterioară.
            {/if}
          </div>

          <div class="badge-row">
            {#each badgesForPlayer(winner, 4) as award}
              <BadgeToken kind={award.kind} count={award.count} />
            {:else}
              <span class="badge empty">Fără badge-uri noi</span>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {:else if isAborted}
    <div class="empty-state">
      <h1>Meci abandonat</h1>
      <p>Meciul a fost oprit înainte de final, așa că nu există recapitulare completă.</p>
    </div>
  {/if}

  <div class="meta">
    {#if recap?.public_code || $match?.public_code}
      <strong>{recap?.public_code ?? $match?.public_code}</strong>
      <span>•</span>
    {/if}
    <span>{recap?.starting_score ?? $match?.starting_score ?? '—'}</span>
    <span>•</span>
    <span>Best of {(($match?.legs_to_win ?? 1) * 2) - 1}</span>
  </div>

  {#if loadError}
    <div class="error-card">{loadError}</div>
  {/if}

  <div class="players-grid">
    {#each players as player (player.id)}
      {@const badges = badgesForPlayer(player, 4)}
      <article class="player-card" class:is-winner={player.id === (recap?.winner_id ?? $match?.winner_id)} style="--c:{player.color}">
        <div class="player-head">
          <div class="player-main">
            <div class="avatar">
              {#if player.photo}
                <img src={player.photo} alt={player.name} />
              {:else}
                <span>{player.name?.[0]?.toUpperCase() ?? '?'}</span>
              {/if}
            </div>
            <div>
              <div class="player-name">{player.name}</div>
              <div class="player-sub">{player.legs_won ?? 0} manșe câștigate</div>
            </div>
          </div>

          {#if player.id === (recap?.winner_id ?? $match?.winner_id) && !isAborted}
            <div class="winner-pill">WIN</div>
          {/if}
        </div>

        {#if recap}
          <div class="metrics">
            <div class="metric">
              <span>Avg meci</span>
              <strong>{fmt(player.match_avg)}</strong>
            </div>
            <div class="metric">
              <span>Avg înainte</span>
              <strong>{fmt(player.general_avg_before)}</strong>
            </div>
            <div class="metric">
              <span>Avg după</span>
              <strong>{fmt(player.general_avg_after)}</strong>
            </div>
            <div class="metric" class:up={player.avg_delta > 0} class:down={player.avg_delta < 0}>
              <span>Evoluție</span>
              <strong>{deltaLabel(player.avg_delta)}</strong>
            </div>
          </div>

          <div class="compare-line" class:good={player.beat_general}>
            {#if player.beat_general}
              Media din meci a depășit media generală anterioară.
            {:else}
              Media din meci nu a depășit media generală anterioară.
            {/if}
          </div>

          <div class="badge-row">
            {#each badges as award}
              <BadgeToken kind={award.kind} count={award.count} />
            {:else}
              <span class="badge empty">Fără badge-uri noi</span>
            {/each}
          </div>
        {:else if loading}
          <div class="loading-card">Se încarcă statisticile meciului…</div>
        {:else}
          <div class="loading-card">Statisticile detaliate nu sunt disponibile momentan.</div>
        {/if}
      </article>
    {/each}
  </div>

  <div class="actions">
    <button class="btn primary" on:click={() => dispatch('newmatch')}>Meci Nou</button>
    <button class="btn secondary" on:click={() => dispatch('home')}>Acasă</button>
  </div>
</div>

<style>
  .summary-shell {
    min-height: 100vh;
    padding: 1.25rem;
    background:
      radial-gradient(circle at top left, rgba(230, 57, 70, 0.16), transparent 28%),
      linear-gradient(180deg, #111426 0%, #151a31 48%, #0f1322 100%);
    color: #f4f6ff;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .status-banner {
    align-self: center;
    padding: 0.45rem 1rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.14em;
  }
  .status-banner.won { background: rgba(76, 175, 80, 0.14); color: #9fe3ac; }
  .status-banner.abandoned { background: rgba(230, 57, 70, 0.14); color: #ff8d98; }

  .winner-card,
  .player-card,
  .error-card,
  .empty-state {
    background: rgba(17, 21, 39, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 22px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.22);
  }

  .winner-card {
    padding: 1rem;
    border-color: color-mix(in srgb, var(--c) 42%, rgba(255, 255, 255, 0.08));
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 1rem;
    align-items: center;
  }

  .winner-portrait,
  .avatar {
    background: color-mix(in srgb, var(--c, #e63946) 20%, #1f2744);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .winner-portrait {
    width: 112px;
    height: 112px;
    border-radius: 24px;
    font-size: 2.6rem;
    font-weight: 900;
  }

  .winner-portrait img,
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .winner-copy h1 {
    font-size: 1.9rem;
    line-height: 1.05;
    margin: 0.25rem 0 0.2rem;
  }

  .winner-copy p,
  .player-sub,
  .meta,
  .compare-line,
  .loading-card,
  .empty-state p {
    color: #aab3d9;
  }

  .winner-kicker {
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: #9ed9b9;
    font-weight: 900;
  }

  .winner-metrics,
  .metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    margin-top: 0.9rem;
  }

  .metric {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 16px;
    padding: 0.75rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .metric span {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8f9ac7;
    font-weight: 700;
  }

  .metric strong {
    font-size: 1.1rem;
  }

  .metric.up strong { color: #9fe3ac; }
  .metric.down strong { color: #ff9aa5; }

  .compare-line {
    margin-top: 0.8rem;
    font-size: 0.88rem;
    line-height: 1.4;
  }
  .compare-line.good { color: #9fe3ac; }

  .meta {
    display: flex;
    gap: 0.45rem;
    justify-content: center;
    flex-wrap: wrap;
    font-size: 0.86rem;
  }

  .players-grid {
    display: grid;
    gap: 0.9rem;
  }

  .player-card {
    padding: 0.95rem;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .player-card.is-winner {
    border-color: color-mix(in srgb, var(--c) 42%, rgba(255, 255, 255, 0.08));
  }

  .player-head,
  .player-main {
    display: flex;
    align-items: center;
  }

  .player-head {
    justify-content: space-between;
    gap: 0.75rem;
  }

  .player-main {
    gap: 0.75rem;
    min-width: 0;
  }

  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 18px;
    flex-shrink: 0;
    font-size: 1.4rem;
    font-weight: 900;
  }

  .player-name {
    font-weight: 800;
    font-size: 1rem;
  }

  .winner-pill {
    padding: 0.35rem 0.6rem;
    border-radius: 999px;
    background: rgba(159, 227, 172, 0.12);
    color: #9fe3ac;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.85rem;
  }

  .badge-row :global(.badge-token) {
    background: rgba(135, 97, 255, 0.16);
  }

  .badge.empty {
    background: rgba(255, 255, 255, 0.06);
    color: #8f9ac7;
  }

  .loading-card,
  .error-card,
  .empty-state {
    padding: 1rem;
    text-align: center;
  }

  .error-card {
    color: #ff9aa5;
    background: rgba(58, 26, 30, 0.88);
    border-color: rgba(230, 57, 70, 0.28);
  }

  .empty-state h1 {
    margin: 0 0 0.35rem;
    font-size: 1.5rem;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: auto;
    padding-top: 0.5rem;
  }

  .btn {
    width: 100%;
    padding: 1rem;
    border: none;
    border-radius: 16px;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
  }

  .btn.primary {
    background: #e63946;
    color: #fff;
  }

  .btn.secondary {
    background: rgba(255, 255, 255, 0.07);
    color: #d6dcff;
  }

  @media (max-width: 640px) {
    .winner-card {
      grid-template-columns: 1fr;
      justify-items: center;
      text-align: center;
    }

    .winner-copy {
      width: 100%;
    }
  }
</style>

<script>
  import BadgeToken from '../../../shared/BadgeToken.svelte';
  import { badgesForPlayer } from '../../../shared/badges.js';

  export let recap = null;

  function fmt(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return Number(value).toFixed(2);
  }

  function deltaLabel(value) {
    if (!value) return '0.00';
    const num = Number(value);
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}`;
  }

  $: winner = recap?.players?.find((player) => player.id === recap?.winner_id) ?? null;
  $: winnerBadges = winner ? badgesForPlayer(winner, 6) : [];
</script>

<div class="recap-shell">
  <header class="hero">
    <div>
      <div class="eyebrow">Meci terminat</div>
      <div class="title">Clasamentul final</div>
      <div class="subtitle">
        {#if recap?.public_code}{recap.public_code} · {/if}{recap?.starting_score ?? '—'}
      </div>
    </div>
  </header>

  {#if winner}
    <section class="winner-hero" style="--c:{winner.color}">
      <div class="winner-portrait">
        {#if winner.photo}
          <img src={winner.photo} alt={winner.name} />
        {:else}
          <span>{winner.name?.[0]?.toUpperCase() ?? '?'}</span>
        {/if}
      </div>

      <div class="winner-copy">
        <div class="winner-kicker">Câștigător</div>
        <div class="winner-name">{winner.name}</div>
        <div class="winner-sub">{winner.legs_won} manșe câștigate</div>

        <div class="winner-metrics">
          <div class="metric hero-metric">
            <span>Avg meci</span>
            <strong>{fmt(winner.match_avg)}</strong>
          </div>
          <div class="metric hero-metric">
            <span>Avg înainte</span>
            <strong>{fmt(winner.general_avg_before)}</strong>
          </div>
          <div class="metric hero-metric">
            <span>Avg după</span>
            <strong>{fmt(winner.general_avg_after)}</strong>
          </div>
          <div class="metric hero-metric" class:up={winner.avg_delta > 0} class:down={winner.avg_delta < 0}>
            <span>Evoluție</span>
            <strong>{deltaLabel(winner.avg_delta)}</strong>
          </div>
        </div>

        <div class="compare-line hero-compare" class:good={winner.beat_general}>
          {#if winner.beat_general}
            Media din meci a fost mai bună decât media generală anterioară.
          {:else}
            Media din meci nu a depășit media generală anterioară.
          {/if}
        </div>

        <div class="hero-badges">
          {#if winnerBadges.length}
            {#each winnerBadges as award}
              <BadgeToken kind={award.kind} count={award.count} />
            {/each}
          {:else}
            <span class="badge empty">Fără badge-uri noi în acest meci</span>
          {/if}
        </div>
      </div>
    </section>
  {/if}

  <section class="stats-section">
    <div class="section-title">Statistici meci</div>

    <div class="grid">
      {#each recap?.players ?? [] as player}
        {@const playerBadges = badgesForPlayer(player, 6)}
        <article class="player-card" style="--c:{player.color}">
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
                <div class="player-sub">{player.legs_won} manșe câștigate</div>
              </div>
            </div>

            {#if player.id === recap?.winner_id}
              <div class="winner-pill">CÂȘTIG</div>
            {/if}
          </div>

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
              Media din meci a fost mai bună decât media generală anterioară.
            {:else}
              Media din meci nu a depășit media generală anterioară.
            {/if}
          </div>

          <div class="badges">
            {#if playerBadges.length}
              {#each playerBadges as award}
                <BadgeToken kind={award.kind} count={award.count} />
              {/each}
            {:else}
              <span class="badge empty">Fără badge-uri noi</span>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  </section>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Manrope:wght@500;600;700;800&display=swap');

  .recap-shell {
    min-height: 100vh;
    padding: 28px;
    background:
      radial-gradient(circle at top left, rgba(255, 107, 107, 0.12), transparent 22%),
      radial-gradient(circle at top right, rgba(255, 209, 102, 0.12), transparent 20%),
      linear-gradient(160deg, #07111c 0%, #0a1728 50%, #0d1b30 100%);
    color: #eef4ff;
    font-family: 'Manrope', system-ui, sans-serif;
  }

  .hero {
    margin-bottom: 20px;
  }

  .eyebrow {
    color: #8ea5c7;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.72rem;
    font-weight: 800;
  }

  .title,
  .winner-name,
  .player-name,
  .metric strong {
    font-family: 'Space Grotesk', system-ui, sans-serif;
  }

  .title {
    margin-top: 0.35rem;
    font-size: 2.5rem;
    font-weight: 800;
  }

  .subtitle,
  .winner-sub,
  .player-sub {
    color: #9cb0cc;
    font-weight: 700;
  }

  .winner-hero {
    display: grid;
    grid-template-columns: 248px minmax(0, 1fr);
    gap: 26px;
    align-items: stretch;
    margin-bottom: 24px;
    padding: 24px;
    border-radius: 30px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--c) 18%, #10203a), rgba(255, 255, 255, 0.04));
    border: 1px solid color-mix(in srgb, var(--c) 42%, rgba(255, 255, 255, 0.08));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 24px 80px rgba(0, 0, 0, 0.28);
  }

  .winner-portrait {
    min-height: 280px;
    border-radius: 28px;
    overflow: hidden;
    background: color-mix(in srgb, var(--c) 28%, #152844);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7rem;
    font-weight: 900;
    box-shadow: 0 24px 70px color-mix(in srgb, var(--c) 18%, transparent);
  }

  .winner-portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .winner-copy {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .winner-kicker {
    color: #9fd6b8;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.8rem;
    font-weight: 900;
  }

  .winner-name {
    margin-top: 0.4rem;
    font-size: clamp(2.8rem, 5vw, 4.8rem);
    line-height: 0.92;
    font-weight: 900;
  }

  .winner-sub {
    margin-top: 0.8rem;
    font-size: 1.1rem;
  }

  .winner-metrics {
    margin-top: 1.4rem;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .hero-metric {
    min-height: 108px;
  }

  .hero-compare {
    margin-top: 14px;
  }

  .hero-badges {
    margin-top: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .section-title {
    margin-bottom: 12px;
    color: #cfe0f7;
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 18px;
  }

  .player-card {
    padding: 18px;
    border-radius: 24px;
    background: rgba(10, 20, 35, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .player-head,
  .player-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .avatar {
    width: 76px;
    height: 76px;
    border-radius: 18px;
    overflow: hidden;
    background: color-mix(in srgb, var(--c) 72%, #1b2d48);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.8rem;
    font-weight: 800;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .winner-pill,
  .badge {
    border-radius: 999px;
    padding: 0.42rem 0.72rem;
    font-size: 0.72rem;
    font-weight: 800;
  }

  .winner-pill {
    background: color-mix(in srgb, var(--c) 24%, rgba(255, 255, 255, 0.05));
    color: #fff;
  }

  .metrics {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .metric {
    padding: 14px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .metric span {
    display: block;
    color: #8ea5c7;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.7rem;
    font-weight: 800;
  }

  .metric strong {
    display: block;
    margin-top: 0.45rem;
    font-size: 1.5rem;
    line-height: 1;
  }

  .metric.up strong {
    color: #7ef0a6;
  }

  .metric.down strong {
    color: #ff8d8d;
  }

  .compare-line {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.04);
    color: #c7d8ef;
    font-weight: 700;
  }

  .compare-line.good {
    background: rgba(126, 240, 166, 0.12);
    color: #dff9e8;
  }

  .badges {
    margin-top: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .hero-badges :global(.badge-token),
  .badges :global(.badge-token) {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .badge.empty {
    opacity: 0.7;
  }
</style>

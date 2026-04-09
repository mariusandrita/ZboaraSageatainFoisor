<script>
  import {
    awardLabel,
    badgeAssetCandidates,
    badgeFallbackDataUri,
  } from './badges.js';

  export let kind;
  export let count = null;
  export let compact = false;

  let currentKind = null;
  let attempt = 0;

  $: label = awardLabel(kind);
  $: sources = [...badgeAssetCandidates(kind), badgeFallbackDataUri(kind)];
  $: src = sources[Math.min(attempt, sources.length - 1)];

  $: if (kind !== currentKind) {
    currentKind = kind;
    attempt = 0;
  }

  function handleError() {
    if (attempt < sources.length - 1) attempt += 1;
  }
</script>

<span class="badge-token" class:compact title={label}>
  <span class="badge-art-shell">
    <img class="badge-art" src={src} alt={label} loading="lazy" on:error={handleError} />
  </span>

  <span class="badge-copy">
    <span class="badge-label">{label}</span>
    {#if count != null}
      <span class="badge-count">×{count}</span>
    {/if}
  </span>
</span>

<style>
  .badge-token {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-height: 2.7rem;
    padding: 0.35rem 0.65rem 0.35rem 0.4rem;
    border-radius: 999px;
    background: rgba(8, 15, 30, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(14px);
  }

  .badge-token.compact {
    gap: 0.45rem;
    min-height: 2.3rem;
    padding: 0.24rem 0.55rem 0.24rem 0.28rem;
  }

  .badge-art-shell {
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    overflow: hidden;
    flex: 0 0 auto;
    background: rgba(255, 255, 255, 0.08);
  }

  .badge-token.compact .badge-art-shell {
    width: 1.75rem;
    height: 1.75rem;
  }

  .badge-art {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .badge-copy {
    display: inline-flex;
    align-items: baseline;
    gap: 0.28rem;
    min-width: 0;
  }

  .badge-label,
  .badge-count {
    color: #f8fbff;
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    line-height: 1;
  }

  .badge-token.compact .badge-label,
  .badge-token.compact .badge-count {
    font-size: 0.7rem;
  }

  .badge-label {
    white-space: nowrap;
  }

  .badge-count {
    color: #9ed3ff;
  }
</style>

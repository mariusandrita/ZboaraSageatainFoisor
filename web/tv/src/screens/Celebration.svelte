<script>
  import { fade, fly } from 'svelte/transition';

  export let kind        = '180';
  export let playerName  = '';
  export let value       = 0;

  const FUNNY = new Set(['lunetist','breakfast','zugrav','hamster','matematician','centrul']);
  $: isFunny = FUNNY.has(kind);

  $: cfg = buildCfg(kind, value);

  function buildCfg(k, v) {
    const map = {
      // ── Standard ──────────────────────────────────────────────────────────
      '180':          { label: '180',        sub: 'MAXIMUM!',                          color: '#ffd700', bg: 'rgba(255,215,0,0.13)'   },
      'highFinish':   { label: String(v),    sub: 'FINALIZARE ÎNALTĂ!',                color: '#00e5ff', bg: 'rgba(0,229,255,0.11)'   },
      'bullFinish':   { label: '🎯',         sub: 'FINALIZARE BULL!',                  color: '#4caf50', bg: 'rgba(76,175,80,0.11)'   },
      'bust':         { label: '💥',         sub: 'PREA MULT!',                        color: '#e63946', bg: 'rgba(230,57,70,0.15)'   },
      'ton140':       { label: String(v),    sub: 'MAGNIFIC!',                         color: '#f4a261', bg: 'rgba(244,162,97,0.12)'  },
      'threeMisses':  { label: '🙈',         sub: 'TREI RATATE!',                      color: '#9b5de5', bg: 'rgba(155,93,229,0.12)'  },
      'lowTriple':    { label: '🎯',         sub: 'CEL PUȚIN L-AI NIMERIT!',           color: '#fee440', bg: 'rgba(254,228,64,0.10)'  },
      // ── Funny Awards ──────────────────────────────────────────────────────
      'lunetist':     { label: '3',          sub: 'LUNETISTUL CONFUZ! 🔭',             color: '#c77dff', bg: 'rgba(199,125,255,0.13)' },
      'breakfast':    { label: '🍳',         sub: 'MIC DEJUN ENGLEZESC!',              color: '#f4a261', bg: 'rgba(244,162,97,0.13)'  },
      'zugrav':       { label: '🪣',         sub: 'SE CAUTĂ MESERIAȘ PENTRU GLET!',    color: '#5bd5fc', bg: 'rgba(91,213,252,0.11)'  },
      'hamster':      { label: String(v),    sub: 'EFORT MAXIM, REZULTAT MINIM! 🐹',   color: '#fee440', bg: 'rgba(254,228,64,0.11)'  },
      'matematician': { label: '?',          sub: 'ERROR 404 — CALCUL GREȘIT! 🤯',     color: '#e63946', bg: 'rgba(230,57,70,0.18)'   },
      'centrul':      { label: 'BULL',       sub: 'DAR NU ERA MOMENTUL... 🎉',          color: '#4caf50', bg: 'rgba(76,175,80,0.12)'   },
    };
    return map[k] ?? map['180'];
  }

  const MATH_SYMBOLS = ['∑', 'π', '∞', '±', '≠', '∫', '√', '×', '÷', '²'];
</script>

<div
  class="overlay"
  class:funny={isFunny}
  style="background: radial-gradient(circle at center, {cfg.bg} 0%, rgba(0,0,0,0.9) 70%)"
  in:fade={{ duration: 250 }}
  out:fade={{ duration: 300 }}
>

  <!-- Floating math symbols for matematician -->
  {#if kind === 'matematician'}
    <div class="math-field" aria-hidden="true">
      {#each MATH_SYMBOLS as sym, i}
        <span class="math-sym" style="left:{8 + i * 9}%; animation-delay:{i * 0.18}s">{sym}</span>
      {/each}
    </div>
  {/if}

  <!-- Paint splatter for zugrav -->
  {#if kind === 'zugrav'}
    <div class="splatter" aria-hidden="true">
      {#each [0,1,2,3,4] as i}
        <div class="blob" style="--angle:{i*72}deg; --dist:{120+i*30}px; animation-delay:{i*0.12}s"></div>
      {/each}
    </div>
  {/if}

  <div
    class="content"
    class:anim-wobble={kind === 'lunetist'}
    class:anim-drip={kind === 'zugrav'}
    class:anim-spin={kind === 'hamster'}
    class:anim-glitch={kind === 'matematician'}
    class:anim-pop={kind === 'breakfast' || kind === 'centrul'}
    in:fly={{ y: 40, duration: 350, delay: 80 }}
    out:fly={{ y: -20, duration: 250 }}
  >
    <div class="value" style="color:{cfg.color}; text-shadow: 0 0 60px {cfg.color}, 0 0 120px {cfg.color}40">
      {cfg.label}
    </div>
    <div class="sub">{cfg.sub}</div>
    {#if playerName}<div class="player">{playerName}</div>{/if}
  </div>

</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800;900&display=swap');

  .overlay {
    position: fixed; inset: 0; z-index: 100;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }

  .content { text-align: center; position: relative; z-index: 2; }

  .value {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: clamp(6rem, 20vw, 16rem);
    font-weight: 900;
    line-height: 1;
    letter-spacing: -4px;
  }

  .sub {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: clamp(1.2rem, 3.5vw, 2.5rem);
    font-weight: 800;
    color: #fff;
    letter-spacing: 4px;
    text-transform: uppercase;
    margin-top: 0.5rem;
    opacity: 0.9;
  }

  .player {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: clamp(1rem, 2.5vw, 1.8rem);
    color: #aaa;
    margin-top: 1rem;
  }

  /* ── Funny: wobble (lunetist — confused sniper) ── */
  .anim-wobble .value {
    display: inline-block;
    animation: wobble 0.9s ease both;
  }
  @keyframes wobble {
    0%,100% { transform: rotate(0deg) scale(1); }
    15%      { transform: rotate(-10deg) scale(1.05); }
    30%      { transform: rotate(9deg) scale(1.08); }
    45%      { transform: rotate(-7deg) scale(1.04); }
    60%      { transform: rotate(6deg) scale(1.02); }
    75%      { transform: rotate(-3deg) scale(1.01); }
  }

  /* ── Funny: drip (zugrav — paint bucket) ── */
  .anim-drip .value {
    display: inline-block;
    animation: drip 0.7s cubic-bezier(0.34,1.56,0.64,1) both;
  }
  @keyframes drip {
    from { transform: translateY(-60px) scaleY(1.6); opacity: 0; }
    to   { transform: translateY(0)     scaleY(1);   opacity: 1; }
  }

  /* Paint blobs */
  .splatter {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none; z-index: 1;
  }
  .blob {
    position: absolute;
    width: 18px; height: 28px; border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    background: #5bd5fc; opacity: 0;
    transform: rotate(var(--angle)) translateY(calc(-1 * var(--dist)));
    animation: blob-fly 1.2s ease-out forwards;
  }
  @keyframes blob-fly {
    0%   { opacity: 0; transform: rotate(var(--angle)) translateY(0) scale(0.3); }
    20%  { opacity: 0.8; }
    60%  { opacity: 0.6; transform: rotate(var(--angle)) translateY(calc(-1 * var(--dist))) scale(1); }
    100% { opacity: 0; transform: rotate(var(--angle)) translateY(calc(-1 * var(--dist) - 40px)) scale(0.5); }
  }

  /* ── Funny: spin (hamster — going nowhere) ── */
  .anim-spin .value {
    display: inline-block;
    animation: hamster-spin 1.4s cubic-bezier(0.25,0.46,0.45,0.94) both;
  }
  @keyframes hamster-spin {
    0%   { transform: rotate(0deg) scale(0.5); opacity: 0; }
    40%  { transform: rotate(540deg) scale(1.15); opacity: 1; }
    70%  { transform: rotate(510deg) scale(0.95); }
    85%  { transform: rotate(525deg) scale(1.02); }
    100% { transform: rotate(520deg) scale(1); }
  }

  /* ── Funny: glitch (matematician — error) ── */
  .anim-glitch .value {
    display: inline-block;
    animation: glitch 0.15s steps(1) infinite;
  }
  @keyframes glitch {
    0%   { text-shadow: 3px 0 #e63946, -3px 0 #00e5ff, 0 0 60px #e63946; transform: skewX(0deg); }
    25%  { text-shadow: -4px 0 #e63946, 4px 0 #00e5ff, 0 0 60px #e63946; transform: skewX(-4deg) translateX(2px); }
    50%  { text-shadow: 3px 0 #00e5ff, -3px 0 #e63946, 0 0 60px #e63946; transform: skewX(3deg) translateX(-2px); }
    75%  { text-shadow: -2px 0 #e63946, 2px 0 #00e5ff, 0 0 60px #e63946; transform: skewX(0deg); }
  }

  /* Floating math symbols */
  .math-field {
    position: absolute; inset: 0;
    pointer-events: none; z-index: 1; overflow: hidden;
  }
  .math-sym {
    position: absolute;
    bottom: 15%;
    font-size: clamp(1.5rem, 3vw, 2.5rem);
    font-weight: 700; color: #e63946; opacity: 0;
    animation: float-math 2.2s ease-out forwards;
  }
  @keyframes float-math {
    0%   { opacity: 0; transform: translateY(0) rotate(0deg); }
    15%  { opacity: 0.7; }
    80%  { opacity: 0.3; }
    100% { opacity: 0; transform: translateY(-55vh) rotate(200deg); }
  }

  /* ── Funny: pop (breakfast & centrul) ── */
  .anim-pop .value {
    display: inline-block;
    animation: pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
  }
  @keyframes pop {
    from { transform: scale(0.4); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
</style>

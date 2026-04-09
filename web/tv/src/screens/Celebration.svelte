<script>
  import { fade, fly } from 'svelte/transition';

  export let kind        = '180';
  export let playerName  = '';
  export let playerPhoto = null;
  export let value       = 0;

  const FUNNY = new Set(['lunetist','breakfast','zugrav','hamster','matematician','centrul','shanghai','blackHat','bailOut','bucket','madhouseEscape']);
  $: isFunny = FUNNY.has(kind);

  $: cfg = buildCfg(kind, value);

  function buildCfg(k, v) {
    const map = {
      // ── Standard ──────────────────────────────────────────────────────────
      '180':          { label: '180',        sub: 'MAXIMUM!',                          color: '#ffd700', bg: 'rgba(255,215,0,0.13)'   },
      'legWon':       { label: 'LEG',        sub: 'MANȘĂ CÂȘTIGATĂ!',                  desc: `Închidere curată. Total manșe câștigate: ${v}.`, color: '#ffd166', bg: 'rgba(255,209,102,0.14)' },
      'highFinish':   { label: String(v),    sub: 'FINALIZARE ÎNALTĂ!',                color: '#00e5ff', bg: 'rgba(0,229,255,0.11)'   },
      'bullFinish':   { label: '🎯',         sub: 'FINALIZARE BULL!',                  color: '#4caf50', bg: 'rgba(76,175,80,0.11)'   },
      'bust':         { label: '💥',         sub: 'PREA MULT!',                        color: '#e63946', bg: 'rgba(230,57,70,0.15)'   },
      'ton140':       { label: String(v),    sub: 'MAGNIFIC!',                         color: '#f4a261', bg: 'rgba(244,162,97,0.12)'  },
      'ton100':       { label: String(v),    sub: 'CLUB 100+!',                        color: '#7ee7b7', bg: 'rgba(126,231,183,0.12)' },
      'threeMisses':  { label: '🙈',         sub: 'TREI RATATE!',                      color: '#9b5de5', bg: 'rgba(155,93,229,0.12)'  },
      'lowTriple':    { label: '🎯',         sub: 'CEL PUȚIN L-AI NIMERIT!',           color: '#fee440', bg: 'rgba(254,228,64,0.10)'  },
      'bigDouble':    { label: 'D+',        sub: 'DUBLĂ GREA!',                        color: '#5bd5fc', bg: 'rgba(91,213,252,0.13)'  },
      'bigTriple':    { label: 'T+',        sub: 'TRIPLĂ GREA!',                       color: '#ffd166', bg: 'rgba(255,209,102,0.13)' },
      'overAvg':      { label: String(v),   sub: 'PESTE MEDIA TA!',                    color: '#7ee7b7', bg: 'rgba(126,231,183,0.14)' },
      // ── Funny Awards ──────────────────────────────────────────────────────
      'shanghai':     { label: 'SH',         sub: 'SHANGHAI!',                         desc: 'Single, dublă și triplă pe același număr. Vizită de mare clasă.', color: '#ffb703', bg: 'rgba(255,183,3,0.14)' },
      'blackHat':     { label: '🎩',         sub: 'BLACK HAT!',                        desc: 'Trei bull-uri într-o singură tură. Asta e deja legendă de foișor.', color: '#fdf0d5', bg: 'rgba(253,240,213,0.16)' },
      'bailOut':      { label: 'SAVE',       sub: 'BAIL OUT!',                         desc: 'Ai salvat o tură slabă cu ultimul dart. Foarte amator, foarte frumos.', color: '#8ecae6', bg: 'rgba(142,202,230,0.14)' },
      'bucket':       { label: '🪣',         sub: 'BUCKET OF NAILS!',                  desc: 'Darturile au mers în toate direcțiile, dar cumva tot a ieșit spectacol.', color: '#b08968', bg: 'rgba(176,137,104,0.16)' },
      'madhouseEscape': { label: 'D1',       sub: 'MADHOUSE ESCAPE!',                  desc: 'Ai închis pe double 1. Se pune și tremurul din mână.', color: '#ffafcc', bg: 'rgba(255,175,204,0.15)' },
      'lunetist':     { label: '3',          sub: 'LUNETISTUL CONFUZ! 🔭',             desc: 'Ai nimerit T1: precizie maximă pe ținta cea mai greșită.', color: '#c77dff', bg: 'rgba(199,125,255,0.13)' },
      'breakfast':    { label: '🍳',         sub: 'MIC DEJUN ENGLEZESC!',              desc: 'Ai dat 1, 5 și 20 simplu în aceeași tură: clasicul English Breakfast.', color: '#f4a261', bg: 'rgba(244,162,97,0.13)'  },
      'zugrav':       { label: '🪣',         sub: 'SE CAUTĂ MESERIAȘ PENTRU GLET!',    desc: 'Săgeata a ratat tabla complet. Direct în perete.', color: '#5bd5fc', bg: 'rgba(91,213,252,0.11)'  },
      'hamster':      { label: String(v),    sub: 'EFORT MAXIM, REZULTAT MINIM! 🐹',   desc: 'Toate cele 3 săgeți au intrat pe tablă, dar totalul turei a rămas sub 20.', color: '#fee440', bg: 'rgba(254,228,64,0.11)'  },
      'matematician': { label: '?',          sub: 'ERROR 404 — CALCUL GREȘIT! 🤯',     desc: 'Ai făcut bust când scorul rămas era foarte mic. Matematica n-a ieșit.', color: '#e63946', bg: 'rgba(230,57,70,0.18)'   },
      'centrul':      { label: 'BULL',       sub: 'DAR NU ERA MOMENTUL... 🎉',          desc: 'Bullseye frumos, dar nu era lovitura de închidere.', color: '#4caf50', bg: 'rgba(76,175,80,0.12)'   },
    };
    return map[k] ?? map['180'];
  }

  const MATH_SYMBOLS = ['∑', 'π', '∞', '±', '≠', '∫', '√', '×', '÷', '²'];
</script>

<div
  class="overlay"
  class:funny={isFunny}
  style="background: radial-gradient(circle at center, {cfg.bg} 0%, rgba(0,0,0,0.96) 55%, rgba(0,0,0,0.985) 100%)"
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
    class:anim-crown={kind === 'legWon'}
    in:fly={{ y: 40, duration: 350, delay: 80 }}
    out:fly={{ y: -20, duration: 250 }}
  >
    {#if playerPhoto}
      <div class="player-photo-wrap">
        <img class="player-photo" src={playerPhoto} alt={playerName || 'player'} />
      </div>
    {/if}
    <div class="value" style="color:{cfg.color}; text-shadow: 0 0 60px {cfg.color}, 0 0 120px {cfg.color}40">
      {cfg.label}
    </div>
    <div class="sub">{cfg.sub}</div>
    {#if cfg.desc}
      <div class="desc">{cfg.desc}</div>
    {/if}
    {#if playerName}<div class="player">{playerName}</div>{/if}
  </div>

</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800;900&display=swap');

  .overlay {
    position: fixed; inset: 0; z-index: 100;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    backdrop-filter: blur(10px);
  }

  .content {
    text-align: center;
    position: relative;
    z-index: 2;
    padding: 2.4rem 3rem;
    border-radius: 36px;
    background: rgba(4, 8, 15, 0.54);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5);
  }

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

  .player-photo-wrap {
    width: 128px;
    height: 128px;
    margin: 0 auto 1.15rem;
    padding: 8px;
    border-radius: 30px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.32);
  }

  .player-photo {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    border-radius: 22px;
  }

  .desc {
    max-width: min(72vw, 900px);
    margin: 1rem auto 0;
    color: rgba(255, 255, 255, 0.86);
    font-size: clamp(0.95rem, 1.8vw, 1.25rem);
    line-height: 1.45;
    font-weight: 600;
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

  .anim-crown .value {
    display: inline-block;
    animation: crown-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes crown-rise {
    0% { transform: translateY(20px) scale(0.88); opacity: 0; }
    55% { transform: translateY(-8px) scale(1.06); opacity: 1; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
  }
  @keyframes pop {
    from { transform: scale(0.4); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
</style>

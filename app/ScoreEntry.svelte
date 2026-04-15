<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { match, turnState, multiplier, currentPlayer, currentRemaining } from '../stores/match.js';

  const dispatch = createEventDispatcher();

  // Segments in display order
  const SEGMENTS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];

  let submitting = false;
  let lastAction = null;
  let apiError = '';
  let scoreReaderEnabled = true;
  let preferredVoiceUri = '';
  let availableVoices = [];
  let currentUtterance = null;

  // Safety net: if turnState is missing on mount, re-fetch from server
  onMount(async () => {
    if (typeof window !== 'undefined') {
      scoreReaderEnabled = window.localStorage.getItem('dl.scoreReader.enabled') !== '0';
      preferredVoiceUri = window.localStorage.getItem('dl.scoreReader.voiceUri') ?? '';
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    if ($match && !$turnState) {
      try {
        const res = await fetch(`/api/matches/${$match.id}`);
        if (res.ok) {
          const full = await res.json();
          match.set(full);
          turnState.set(full.turnState ?? null);
        }
      } catch (e) { console.error('re-fetch failed', e); }
    }
  });

  async function throwDart(segment) {
    if (!$match || !$turnState || submitting) return;
    if ($turnState.finished) return;
    submitting = true;
    lastAction = segment;
    apiError = '';
    try {
      const res = await fetch(`/api/matches/${$match.id}/darts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, multiplier: $multiplier }),
      });
      if (!res.ok) {
        const d = await res.json();
        apiError = d.error?.message ?? 'Eroare la trimiterea aruncării';
      } else {
        const nextTurnState = await res.json();
        announceScore(segment, $multiplier, nextTurnState);
        turnState.set(nextTurnState);
        apiError = '';
      }
    } catch(e) { apiError = e.message; }
    finally { submitting = false; lastAction = null; multiplier.set(1); }
  }

  async function undo() {
    if (!$match || submitting) return;
    submitting = true;
    apiError = '';
    try {
      const res = await fetch(`/api/matches/${$match.id}/undo`, { method: 'POST' });
      if (res.ok) { turnState.set(await res.json()); }
      else { const d = await res.json(); apiError = d.error?.message ?? 'Undo failed'; }
    } catch(e) { apiError = e.message; }
    finally { submitting = false; multiplier.set(1); }
  }

  async function exitMatch() {
    if ($match?.id) {
      try { await fetch(`/api/matches/${$match.id}/exit`, { method: 'POST' }); } catch {}
    }
    dispatch('exit');
  }

  function viewResults() {
    dispatch('finish');
  }

  async function eliminatePlayer(playerId) {
    if (!$match?.id || submitting) return;
    const player = $match.players?.find((entry) => entry.id === playerId);
    if (!player) return;
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`Îl elimini pe ${player.name} din meci? Săgețile, badge-urile și stats-urile rămân salvate.`);
    if (!confirmed) return;

    submitting = true;
    apiError = '';
    try {
      const res = await fetch(`/api/matches/${$match.id}/eliminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const d = await res.json();
        apiError = d.error?.message ?? 'Eliminarea a eșuat';
      } else {
        const full = await res.json();
        match.set(full);
        turnState.set(full.turnState ?? null);
      }
    } catch (e) {
      apiError = e.message;
    } finally {
      submitting = false;
    }
  }

  $: currentTurnTotal = $turnState?.turn?.reduce((s, d) => s + d.score_value, 0) ?? 0;
  $: dartsInTurn = $turnState?.turn?.length ?? 0;
  $: isBusted = $turnState?.busted ?? false;
  $: hint = $turnState?.checkoutHint ?? null;
  $: activePlayers = ($match?.players ?? []).filter((player) => !player.eliminated_at);
  $: removablePlayers = activePlayers.filter((player) => player.id !== $currentPlayer?.id);
  $: doubleOutActive = $match?.double_out === 1;
  $: doubleOutNote = doubleOutActive
    ? 'Double Out activ: trebuie să închizi pe dublă. Dacă ajungi la 1 sau la 0 fără dublă, tura devine BUST și scorul revine.'
    : '';
  $: sixtyOneTip = doubleOutActive && $currentRemaining === 61
    ? 'La 61 nu merge doar 20, 20, 20. O variantă bună este 25 apoi D18.'
    : '';

  function dartLabel(d) {
    if (!d) return '—';
    const prefix = d.multiplier === 2 ? 'D' : d.multiplier === 3 ? 'T' : '';
    if (d.segment === 25 && d.multiplier === 2) return 'BULL';
    if (d.segment === 25) return '25';
    return `${prefix}${d.segment}`;
  }

  function hintLabel(h) {
    return h.map(d => {
      if (d.segment === 25 && d.multiplier === 2) return 'BULL';
      if (d.segment === 0) return 'Miss';
      const p = d.multiplier === 2 ? 'D' : d.multiplier === 3 ? 'T' : '';
      return `${p}${d.segment}`;
    }).join(' → ');
  }

  function loadVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    availableVoices = window.speechSynthesis
      .getVoices()
      .filter((voice) => voice.lang?.toLowerCase().startsWith('ro'))
      .sort((a, b) => Number(b.default) - Number(a.default) || a.name.localeCompare(b.name));

    if (!preferredVoiceUri && availableVoices[0]?.voiceURI) {
      preferredVoiceUri = availableVoices[0].voiceURI;
    }
  }

  function updateScoreReader(value) {
    scoreReaderEnabled = value;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('dl.scoreReader.enabled', value ? '1' : '0');
    }
    if (!value) stopSpeaking();
  }

  function updateVoice(uri) {
    preferredVoiceUri = uri;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('dl.scoreReader.voiceUri', uri);
    }
  }

  function stopSpeaking() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }

  function selectedVoice() {
    if (!availableVoices.length) return null;
    return availableVoices.find((voice) => voice.voiceURI === preferredVoiceUri) ?? availableVoices[0] ?? null;
  }

  function speak(text) {
    if (!scoreReaderEnabled || typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;

    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ro-RO';
    utterance.rate = 1.02;
    utterance.pitch = 0.96;

    const voice = selectedVoice();
    if (voice) utterance.voice = voice;

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function scoreWords(value) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0 || num > 999) return String(value);
    if (num === 0) return 'zero';

    const under20 = ['','unu','doi','trei','patru','cinci','sase','sapte','opt','noua','zece','unsprezece','doisprezece','treisprezece','paisprezece','cincisprezece','saisprezece','saptesprezece','optsprezece','nouasprezece'];
    const tens = ['', '', 'douazeci','treizeci','patruzeci','cincizeci','saizeci','saptezeci','optzeci','nouazeci'];
    const hundreds = ['', 'o suta','doua sute','trei sute','patru sute','cinci sute','sase sute','sapte sute','opt sute','noua sute'];

    const parts = [];
    const h = Math.floor(num / 100);
    const rest = num % 100;

    if (h) parts.push(hundreds[h]);
    if (rest) {
      if (rest < 20) {
        parts.push(under20[rest]);
      } else {
        const t = Math.floor(rest / 10);
        const u = rest % 10;
        parts.push(u ? `${tens[t]} si ${under20[u]}` : tens[t]);
      }
    }

    return parts.join(' ').trim();
  }

  function dartCall(segment, mult) {
    if (segment === 0) return 'ratat';
    if (segment === 25 && mult === 2) return 'bull';
    if (segment === 25) return 'douazeci si cinci';
    if (mult === 3) return `triplu ${scoreWords(segment)}`;
    if (mult === 2) return `dublu ${scoreWords(segment)}`;
    return scoreWords(segment);
  }

  function announceScore(segment, mult, nextTurnState) {
    if (!nextTurnState) return;

    const spokenParts = [dartCall(segment, mult)];
    const lastDart = nextTurnState.turn?.[nextTurnState.turn.length - 1] ?? null;
    const busted = lastDart?.busted || nextTurnState.busted;

    if (busted) {
      spokenParts.push('bust');
      speak(spokenParts.join('. '));
      return;
    }

    const lastVisit = nextTurnState.lastTurnDarts ?? [];
    const turnJustEnded = segment !== 0 && lastVisit.length > 0 && nextTurnState.turn?.length === 0;
    if (turnJustEnded) {
      const visitTotal = lastVisit.reduce((sum, dart) => sum + (dart.busted ? 0 : (dart.score_value ?? 0)), 0);
      spokenParts.push(`total ${scoreWords(visitTotal)}`);
    }

    const currentId = nextTurnState.currentPlayerId;
    const remaining = nextTurnState.remaining?.[$currentPlayer?.id] ?? nextTurnState.remaining?.[currentId];
    if (Number.isInteger(remaining) && !nextTurnState.finished) {
      spokenParts.push(`raman ${scoreWords(remaining)}`);
    }

    if (nextTurnState.finished) {
      spokenParts.push('meci incheiat');
    }

    speak(spokenParts.join('. '));
  }
</script>

<div class="score-entry">
  <!-- Header bar -->
  <header>
    <div class="player-info">
      <div class="player-dot" style="background:{$currentPlayer?.color ?? '#e63946'}"></div>
      <span class="player-name">{$currentPlayer?.name ?? '—'}</span>
    </div>
    <div class="header-actions">
      {#if $turnState}
        <button class="undo-top-btn" on:click={undo} disabled={submitting}>
          ↩ Anulează
        </button>
      {/if}
      <button
        class="reader-toggle"
        class:active={scoreReaderEnabled}
        on:click={() => updateScoreReader(!scoreReaderEnabled)}
        title="Score reader în română"
      >
        {scoreReaderEnabled ? 'RO Voice ON' : 'RO Voice OFF'}
      </button>
      <button class="abort-btn" on:click={exitMatch}>✕</button>
    </div>
  </header>

  {#if apiError}
    <button class="api-error" on:click={() => apiError = ''}>{apiError} ✕</button>
  {/if}
  {#if !$turnState}
    <div class="api-error">Se încarcă meciul…</div>
  {/if}

  <!-- Remaining + turn summary -->
  <div class="score-panel">
    <div class="remaining" class:bust={isBusted}>
      {isBusted ? 'BUST' : $currentRemaining}
    </div>
    <div class="turn-darts">
      {#each Array(3) as _, i}
        <div class="dart-slot" class:active={i < dartsInTurn} class:busted={$turnState?.turn?.[i]?.busted}>
          {dartLabel($turnState?.turn?.[i])}
        </div>
      {/each}
      <div class="turn-total">{currentTurnTotal > 0 ? `= ${currentTurnTotal}` : ''}</div>
    </div>

    <!-- Checkout hint -->
    {#if hint && !isBusted}
      <div class="hint">🎯 Out: {hintLabel(hint)}</div>
    {/if}
    {#if doubleOutActive}
      <div class="mode-note">{doubleOutNote}</div>
    {/if}
    {#if sixtyOneTip}
      <div class="smart-note">{sixtyOneTip}</div>
    {/if}
    {#if scoreReaderEnabled && availableVoices.length > 1}
      <div class="reader-select-wrap">
        <label for="reader-voice">Voce</label>
        <select id="reader-voice" class="reader-select" bind:value={preferredVoiceUri} on:change={(e) => updateVoice(e.currentTarget.value)}>
          {#each availableVoices as voice}
            <option value={voice.voiceURI}>{voice.name}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <!-- Modifier toggles -->
  <div class="modifiers">
    {#each [[1,'S','Simplu'],[2,'D','Dublu'],[3,'T','Triplu']] as [val, lbl, full]}
      <button
        class="mod-btn"
        class:active={$multiplier === val}
        on:click={() => multiplier.set(val)}
      >
        <span class="mod-short">{lbl}</span>
        <span class="mod-full">{full}</span>
      </button>
    {/each}
  </div>

  <!-- Segment grid (1–20 in dartboard order) -->
  <div class="segment-grid">
    {#each SEGMENTS as seg}
      <button
        class="seg-btn"
        class:loading={lastAction === seg && submitting}
        on:click={() => throwDart(seg)}
        disabled={submitting || $turnState?.finished}
      >
        {seg}
      </button>
    {/each}
  </div>

  <!-- Bull row -->
  <div class="bull-row">
    <button class="bull-btn outer" on:click={() => throwDart(25)} disabled={submitting || $multiplier === 3}>
      <span>25</span><small>Bull Extern</small>
    </button>
    <button class="bull-btn inner" on:click={() => { multiplier.set(2); throwDart(25); }} disabled={submitting}>
      <span>BULL</span><small>50 pct</small>
    </button>
    <button class="bull-btn miss" on:click={() => throwDart(0)} disabled={submitting}>
      <span>RATAT</span><small>0 pct</small>
    </button>
  </div>

  <!-- Match finished: show View Results -->
  {#if $turnState?.finished}
    <div class="finish-bar">
      <button class="finish-btn" on:click={viewResults}>
        Vezi Rezultate →
      </button>
    </div>
  {/if}

  <!-- Bottom actions -->
  <div class="bottom-bar">
    <button class="undo-btn" on:click={undo} disabled={submitting || !$turnState}>
      ↩ Anulează
    </button>
    <div class="legs-info">
      {#if $match}
        {#each $match.players as p}
          <div class="leg-pip">
            <div class="pip-dot" style="background:{p.color}"></div>
            <span>{$match.players.find(mp => mp.id === p.id)?.legs_won ?? 0}</span>
          </div>
        {/each}
      {/if}
    </div>
    {#if !$turnState?.finished}
      <button class="abandon-btn" on:click={exitMatch}>Ieșire</button>
    {/if}
  </div>

  {#if !$turnState?.finished && removablePlayers.length > 0}
    <div class="eliminate-bar">
      <div class="eliminate-title">Elimină jucător</div>
      <div class="eliminate-list">
        {#each removablePlayers as player}
          <button class="eliminate-btn" on:click={() => eliminatePlayer(player.id)} disabled={submitting}>
            <span class="eliminate-dot" style="background:{player.color}"></span>
            <span>{player.name}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .score-entry {
    display: flex; flex-direction: column; min-height: 100vh;
    background: #1a1a2e; user-select: none; -webkit-user-select: none;
  }

  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.75rem 1rem; background: #12122a;
    border-bottom: 1px solid #2a2a4a; position: sticky; top: 0; z-index: 10;
  }
  .header-actions { display: flex; align-items: center; gap: 0.5rem; }
  .player-info { display: flex; align-items: center; gap: 0.5rem; }
  .player-dot { width: 12px; height: 12px; border-radius: 50%; }
  .player-name { font-weight: 700; font-size: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40vw; }
  .reader-toggle {
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    color: #98a6d4;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    border-radius: 999px;
    padding: 0.35rem 0.7rem;
    cursor: pointer;
  }
  .reader-toggle.active {
    color: #baf7cf;
    background: rgba(76,175,80,0.12);
    border-color: rgba(76,175,80,0.26);
  }
  .undo-top-btn {
    border: 1px solid rgba(230,57,70,0.28);
    background: rgba(230,57,70,0.14);
    color: #ff9099;
    font-size: 0.76rem;
    font-weight: 800;
    border-radius: 999px;
    padding: 0.45rem 0.8rem;
    cursor: pointer;
  }
  .undo-top-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .abort-btn { background: none; border: none; color: #666; font-size: 1.2rem; cursor: pointer; padding: 0.25rem; }
  .api-error {
    width: 100%; background: #3a1a1e; border: none; color: #e63946;
    font-size: 0.85rem; padding: 0.5rem 1rem; text-align: center; cursor: pointer;
  }

  .score-panel {
    text-align: center; padding: 1rem 1rem 0.5rem;
    background: linear-gradient(180deg, #12122a 0%, #1a1a2e 100%);
  }
  .remaining {
    font-size: clamp(3rem, 20vw, 6rem); font-weight: 900; line-height: 1;
    color: #fff; letter-spacing: -3px;
    transition: color 0.2s;
  }
  .remaining.bust { color: #e63946; }

  .turn-darts {
    display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 0.5rem;
  }
  .dart-slot {
    min-width: 48px; padding: 0.3rem 0.6rem; border-radius: 8px;
    background: #2a2a4a; color: #888; font-size: 0.85rem; text-align: center;
  }
  .dart-slot.active { background: #3a3a5a; color: #fff; }
  .dart-slot.busted { background: #3a1a1e; color: #e63946; text-decoration: line-through; }
  .turn-total { color: #888; font-size: 0.9rem; margin-left: 0.25rem; }

  .hint {
    margin-top: 0.5rem; font-size: 0.85rem; color: #4caf50;
    background: #0a2010; border-radius: 8px; padding: 0.4rem 0.75rem; display: inline-block;
  }
  .mode-note {
    margin-top: 0.6rem;
    color: #9aa3d7;
    font-size: 0.8rem;
    line-height: 1.35;
    max-width: 26rem;
    margin-left: auto;
    margin-right: auto;
  }
  .smart-note {
    margin-top: 0.5rem;
    color: #ffd166;
    font-size: 0.84rem;
    font-weight: 700;
  }
  .reader-select-wrap {
    margin-top: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: #9aa3d7;
    font-size: 0.8rem;
    padding: 0 0.5rem;
  }
  .reader-select {
    flex: 1;
    max-width: 11rem;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.06);
    color: #eef4ff;
    padding: 0.35rem 0.75rem;
    font: inherit;
  }

  .modifiers {
    display: flex; gap: 0.5rem; padding: 0.75rem 1rem;
  }
  .mod-btn {
    flex: 1; padding: 0.6rem 0.25rem; border: 2px solid #2a2a4a;
    background: #1e1e38; color: #888; border-radius: 10px;
    cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.1rem;
    transition: all 0.1s;
  }
  .mod-btn.active { border-color: #e63946; color: #fff; background: #2a1a2e; }
  .mod-short { font-size: 1.1rem; font-weight: 800; }
  .mod-full { font-size: 0.65rem; color: inherit; opacity: 0.7; }

  .segment-grid {
    display: grid; grid-template-columns: repeat(5, 1fr);
    gap: 0.4rem; padding: 0 0.75rem;
  }
  .seg-btn {
    aspect-ratio: 1; border: none; border-radius: 10px;
    background: #2a2a4a; color: #fff; font-size: 1.2rem; font-weight: 700;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.1s, transform 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .seg-btn:active:not(:disabled) { background: #e63946; transform: scale(0.93); }
  .seg-btn.loading { background: #e63946; opacity: 0.7; }
  .seg-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .bull-row {
    display: flex; gap: 0.4rem; padding: 0.5rem 0.75rem;
  }
  .bull-btn {
    flex: 1; border: none; border-radius: 10px; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; padding: 0.6rem;
    gap: 0.1rem; font-weight: 700; transition: opacity 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .bull-btn:active:not(:disabled) { opacity: 0.7; }
  .bull-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .bull-btn span { font-size: 1rem; color: #fff; }
  .bull-btn small { font-size: 0.65rem; opacity: 0.7; color: #fff; }
  .bull-btn.outer { background: #2a4a2a; }
  .bull-btn.inner { background: #1e3a1e; border: 2px solid #4caf50; }
  .bull-btn.miss  { background: #2a2a2a; }

  .bottom-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.75rem 1rem; background: #12122a;
    border-top: 1px solid #2a2a4a; margin-top: auto;
    position: sticky;
    bottom: 0;
    z-index: 9;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  }

  .eliminate-bar {
    padding: 0.75rem 1rem calc(0.9rem + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid rgba(255,255,255,0.06);
    background: rgba(10, 10, 26, 0.94);
  }

  .eliminate-title {
    color: #ff9099;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .eliminate-list {
    margin-top: 0.55rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .eliminate-btn {
    border: 1px solid rgba(230,57,70,0.24);
    background: rgba(230,57,70,0.1);
    color: #ffd5d9;
    border-radius: 999px;
    padding: 0.55rem 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .eliminate-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .undo-btn {
    background: #3a1a1e; border: none; color: #e63946; font-weight: 700;
    padding: 0.6rem 1.2rem; border-radius: 10px; cursor: pointer; font-size: 0.95rem;
  }
  .undo-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .legs-info { display: flex; gap: 0.75rem; flex: 1; justify-content: center; }
  .leg-pip { display: flex; align-items: center; gap: 0.3rem; }
  .pip-dot { width: 10px; height: 10px; border-radius: 50%; }
  .leg-pip span { font-size: 0.9rem; font-weight: 600; }

  .abandon-btn {
    background: none; border: 1px solid #3a1a1e; color: #e63946;
    font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.75rem;
    border-radius: 8px; cursor: pointer; opacity: 0.7;
  }
  .abandon-btn:active { opacity: 1; }

  .finish-bar {
    padding: 0.75rem 1rem;
    background: #0a2010;
  }
  .finish-btn {
    width: 100%; padding: 1rem; border: none; border-radius: 12px;
    background: #4caf50; color: #fff; font-size: 1.1rem; font-weight: 800;
    cursor: pointer; transition: opacity 0.15s;
  }
  .finish-btn:active { opacity: 0.8; }
</style>

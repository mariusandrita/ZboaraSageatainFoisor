<script>
  export let connected = false;
</script>

<div class="idle">
  <div class="board-icon">🎯</div>
  <h1>DartsLeague</h1>
  <p class="sub">Garage Edition</p>
  <div class="status" class:online={connected}>
    {connected ? 'Ready — open dartsleague.local on your phone' : 'Connecting…'}
  </div>
  <p class="hint">Waiting for a match to start</p>
</div>

<style>
  .idle {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100vh; gap: 1rem; text-align: center;
    background: #0d0d1a;
  }

  .board-icon { font-size: 5rem; animation: float 3s ease-in-out infinite; }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50%       { transform: translateY(-12px); }
  }

  h1 {
    font-size: clamp(3rem, 8vw, 6rem);
    font-weight: 900; color: #fff; letter-spacing: -3px;
  }

  .sub { color: #555; font-size: 1.2rem; }

  .status {
    margin-top: 1rem; font-size: 1rem; color: #555;
    background: #1a1a2e; padding: 0.6rem 1.5rem; border-radius: 999px;
    transition: color 0.3s;
  }
  .status.online { color: #4caf50; }

  .hint { color: #333; font-size: 0.95rem; }
</style>

// Global UI chrome: transient toast + connection status / disconnect overlay.

let toastTimer = null;

// kind: 'info' (default) or 'error'. Errors linger a little longer since they
// carry a reason the user needs to read.
function showToast(msg, kind) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', kind === 'error');
  el.classList.remove('hidden');
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('visible');
    el.classList.add('hidden');
  }, kind === 'error' ? 3500 : 2000);
}

// Turn a rejected API call into a readable toast. ApiError carries the bridge's
// own message ("Not connected to Meld Studio", "sceneId required in body"); a
// bare network failure doesn't, so we say something true instead of guessing.
function showError(what, err) {
  const detail = err && err.message ? err.message : 'request failed';
  showToast(`${what} failed — ${detail}`, 'error');
}

// Run an action, toast `okMsg` only if it actually succeeded. Returns true on
// success so callers can decide whether to follow up.
async function withFeedback(what, okMsg, fn) {
  try {
    await fn();
    if (okMsg) showToast(okMsg);
    return true;
  } catch (err) {
    showError(what, err);
    return false;
  }
}

// Render the header dot/text and the blocking overlay from the two link flags in
// state.js. Called whenever either changes.
function updateConnectionUi() {
  const dot = $('statusDot');
  const text = $('statusText');
  const overlay = $('disconnectOverlay');
  const title = $('disconnectTitle');
  const body = $('disconnectBody');
  const ok = bridgeUp && meldUp;

  dot.className = `status-dot ${ok ? 'connected' : bridgeUp ? 'degraded' : 'disconnected'}`;
  if (ok) {
    text.textContent = 'Connected';
    $('versionBadge').textContent = `v${apiVersion || 1}`;
  } else if (bridgeUp) {
    text.textContent = 'Meld offline';
    $('versionBadge').textContent = '';
  } else {
    text.textContent = 'Disconnected';
  }

  if (overlay) overlay.classList.toggle('hidden', ok);
  if (!ok && title && body) {
    if (bridgeUp) {
      title.textContent = 'Meld Studio offline';
      body.textContent = 'The bridge is running but Meld Studio isn’t responding — waiting for it to come back…';
    } else {
      title.textContent = 'Disconnected';
      body.textContent = 'Lost connection to the bridge — reconnecting…';
    }
  }
}

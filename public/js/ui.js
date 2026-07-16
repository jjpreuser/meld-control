// Global UI chrome: transient toast + connection status / disconnect overlay.

function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('visible');
  setTimeout(() => {
    el.classList.remove('visible');
    el.classList.add('hidden');
  }, 2000);
}

function setStatus(connected, version) {
  const dot = $('statusDot');
  const text = $('statusText');
  const overlay = $('disconnectOverlay');
  if (connected) {
    dot.className = 'status-dot connected';
    text.textContent = 'Connected';
    $('versionBadge').textContent = `v${version || 1}`;
    if (overlay) overlay.classList.add('hidden');
  } else {
    dot.className = 'status-dot disconnected';
    text.textContent = 'Disconnected';
    if (overlay) overlay.classList.remove('hidden');
  }
}

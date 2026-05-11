const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const API = (() => {
  const base = '';
  return {
    async get(path) {
      const r = await fetch(`${base}${path}`);
      return r.json();
    },
    async post(path, body) {
      const r = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return r.json();
    },
  };
})();

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
  if (connected) {
    dot.className = 'status-dot connected';
    text.textContent = 'Connected';
    $('versionBadge').textContent = `v${version || 1}`;
  } else {
    dot.className = 'status-dot disconnected';
    text.textContent = 'Disconnected';
  }
}

function getSceneIcon(scene) {
  if (scene.source) return '🖥️';
  if (scene.url) return '🌐';
  if (scene.mediaSource) return '🎬';
  return '📺';
}

function formatTime(ms) {
  if (!ms || ms <= 0) return '';
  const totalSec = Math.floor((Date.now() - ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Small DOM + formatting helpers shared across the app.
// Loaded first: everything below relies on these globals.

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
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

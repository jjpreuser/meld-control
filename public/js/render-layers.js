// Renders the Layers tab: scene picker + the selected scene's layer cards
// (position/size/transform inputs, visibility/mute, foldable props + effects).

function renderLayers() {
  const container = $('layerList');
  const header = $('layerHeader');
  const title = $('layerSceneName');
  const picker = $('scenePicker');

  // Skip entirely when the Layers tab isn't showing — no point rebuilding a
  // hidden list on every session update. showTab() re-renders it when opened.
  if (!$('tab-layers').classList.contains('active')) return;

  // Don't rebuild the layers list while the user is editing one of its text
  // inputs, or their keystrokes get wiped out by the re-render. Buttons/folds are
  // fine to redraw under (and must be — a focused toggle button would otherwise
  // block its own re-render).
  const active = document.activeElement;
  if (active && container.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;

  // Don't tear down the transform stage out from under an in-progress drag/resize.
  if (transformDragging) return;

  const scenes = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'scene')
    .sort((a, b) => (a[1].index || 0) - (b[1].index || 0));

  picker.innerHTML = scenes.map(([id, s]) => `
    <button class="btn btn-sm ${id === selectedSceneId ? 'btn-primary' : 'btn-outline'}" data-action="pick-scene" data-scene-id="${id}">${escHtml(s.name || `Scene ${s.index}`)}</button>
  `).join('');

  if (!selectedSceneId) {
    container.innerHTML = '<p class="empty">Select a scene to view layers</p>';
    header.classList.add('hidden');
    return;
  }

  const scene = session.items[selectedSceneId];
  if (!scene) {
    container.innerHTML = '<p class="empty">Scene not found</p>';
    header.classList.add('hidden');
    return;
  }

  header.classList.remove('hidden');
  title.textContent = escHtml(scene.name);

  const layerItems = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'layer' && v.parent === selectedSceneId)
    .sort((a, b) => (a[1].index || 0) - (b[1].index || 0));

  const trackItems = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'track' && v.parent === selectedSceneId);

  const effectItems = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'effect');

  const layerTrackMap = {};
  for (const [id, track] of trackItems) {
    layerTrackMap[track.parent] = { id, ...track };
  }

  const layerEffectMap = {};
  for (const [id, effect] of effectItems) {
    if (!layerEffectMap[effect.parent]) layerEffectMap[effect.parent] = [];
    layerEffectMap[effect.parent].push({ id, ...effect });
  }

  container.innerHTML = layerItems.map(([id, layer], idx) => {
    const track = layerTrackMap[id];
    const effects = layerEffectMap[id] || [];
    const icon = layer.source ? '🖼️' : layer.url ? '🌐' : layer.mediaSource ? '🎬' : '📄';
    const sourceType = layer.source ? 'Image' : layer.url ? 'Browser' : layer.mediaSource ? 'Media' : 'Source';

    const coreProps = new Set(['type', 'parent', 'index', 'name', 'x', 'y', 'width', 'height', 'rotation', 'visible', 'isEffectivelyVisible']);
    const extraProps = Object.entries(layer).filter(([k]) => !coreProps.has(k));
    const isOpen = expandedProps[id];
    const effectsOpen = expandedProps[`${id}-effects`];
    const transformOpen = expandedProps[`${id}-transform`];

    return `
      <div class="card layer-card" data-id="${id}">
        <div class="layer-head">
          <span class="layer-idx">${idx + 1}</span>
          ${icon}
          <input class="layer-name-input" value="${escHtml(layer.name || 'Untitled')}" data-layer-id="${id}" data-prop="name">
          <span class="card-badge">${sourceType}</span>
        </div>
        <div class="layer-section">
          <div class="layer-section-title">Position</div>
          <div class="layer-geo-grid">
            <label class="layer-num-wrap">X <input type="number" class="layer-num" value="${layer.x}" data-layer-id="${id}" data-prop="x"></label>
            <label class="layer-num-wrap">Y <input type="number" class="layer-num" value="${layer.y}" data-layer-id="${id}" data-prop="y"></label>
          </div>
        </div>
        <div class="layer-section">
          <div class="layer-section-title">Size</div>
          <div class="layer-geo-grid">
            <label class="layer-num-wrap">W <input type="number" class="layer-num" value="${layer.width}" data-layer-id="${id}" data-prop="width"></label>
            <label class="layer-num-wrap">H <input type="number" class="layer-num" value="${layer.height}" data-layer-id="${id}" data-prop="height"></label>
          </div>
        </div>
        <div class="layer-section">
          <div class="layer-section-title">Transform</div>
          <div class="layer-geo-grid">
            <label class="layer-num-wrap">↻ <input type="number" class="layer-num" value="${layer.rotation || 0}" data-layer-id="${id}" data-prop="rotation" step="0.1"></label>
          </div>
          ${apiVersion >= 2 ? `
          <div class="layer-fold" data-action="toggle-transform">
            <span class="layer-fold-icon">${transformOpen ? '▼' : '◳'}</span>
            <span class="layer-fold-label">Visual editor</span>
          </div>
          ${transformOpen ? transformStage(id) : ''}
          ` : `<div class="transform-hint">Visual editor needs Meld API v2+</div>`}
        </div>
        <div class="layer-section">
          <div class="card-actions">
            <button class="btn btn-sm ${layer.visible ? 'btn-primary active' : 'btn-outline'}" data-action="toggle-vis">${layer.visible ? 'Visible' : 'Hidden'}</button>
            ${track ? `<button class="btn btn-sm ${track.muted ? 'btn-danger' : 'btn-outline'}" data-action="mute" data-track-id="${track.id}">${track.muted ? 'Muted' : 'Mute'}</button>` : ''}
          </div>
        </div>
        ${extraProps.length ? `
        <div class="layer-fold" data-action="toggle-props" data-fold="${id}">
          <span class="layer-fold-icon">${isOpen ? '▼' : '▶'}</span>
          <span class="layer-fold-label">Properties (${extraProps.length})</span>
        </div>
        <div class="layer-fold-body ${isOpen ? '' : 'hidden'}" data-fold-body="${id}">
          ${extraProps.map(([k, v]) => `
          <label class="layer-prop-row"><span class="layer-prop-key">${k}</span> <input class="layer-prop-val" value="${escHtml(String(v))}" data-layer-id="${id}" data-prop="${k}"></label>
          `).join('')}
        </div>` : ''}
        ${effects.length ? `
        <div class="layer-fold" data-action="toggle-effects" data-fold="${id}-effects">
          <span class="layer-fold-icon">${effectsOpen ? '▼' : '▶'}</span>
          <span class="layer-fold-label">Effects (${effects.length})</span>
        </div>
        <div class="layer-fold-body ${effectsOpen ? '' : 'hidden'}" data-fold-body="${id}-effects">
          <div class="layer-effects">${effects.map(e => `
            <button class="btn btn-xs ${e.enabled ? 'btn-on' : 'btn-off'}" data-action="toggle-effect" data-layer-id="${id}" data-effect-id="${e.id}">${escHtml(e.name)}</button>
          `).join('')}</div>
        </div>` : ''}
      </div>
    `;
  }).join('');
}

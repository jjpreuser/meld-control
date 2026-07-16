// Delegated card/button actions + gain POSTing. Called from main.js handlers.

async function postGain(trackId) {
  const slider = document.querySelector(`.gain-slider[data-track-id="${trackId}"]`);
  if (!slider) return;
  clearTimeout(gainTimers[trackId]);
  await API.post(`/api/track/${trackId}/gain`, { gain: parseFloat(slider.value) }).catch(() => {});
}

async function handleAction(btn) {
  const action = btn.dataset.action;
  const card = btn.closest('[data-id]');
  const id = card ? card.dataset.id : null;

  switch (action) {
    case 'layers':
      if (!id) return;
      selectedSceneId = id;
      showTab('layers');
      break;

    case 'show':
      if (!id) return;
      card.classList.add('transitioning');
      await API.post(`/api/scene/${id}/switch`);
      showToast('Switched scene');
      setTimeout(refreshSession, 400);
      setTimeout(() => card.classList.remove('transitioning'), 1500);
      break;

    case 'stage':
      if (!id) return;
      await API.post(`/api/scene/${id}/stage`);
      showToast('Staged scene');
      setTimeout(refreshSession, 300);
      break;

    case 'toggle-vis':
      if (!selectedSceneId || !id) return;
      await API.post(`/api/layer/${id}/toggle`, { sceneId: selectedSceneId });
      setTimeout(refreshSession, 300);
      break;

    case 'mute':
      await API.post(`/api/track/${btn.dataset.trackId}/mute`);
      setTimeout(refreshSession, 300);
      break;

    case 'monitor':
      await API.post(`/api/track/${btn.dataset.trackId}/monitor`);
      setTimeout(refreshSession, 300);
      break;

    case 'toggle-effect': {
      const { effectId, layerId } = btn.dataset;
      if (!selectedSceneId || !layerId || !effectId) return;
      await API.post(`/api/effect/${effectId}/toggle`, { sceneId: selectedSceneId, layerId });
      setTimeout(refreshSession, 300);
      break;
    }

    case 'pick-scene':
      selectedSceneId = btn.dataset.sceneId;
      renderLayers();
      break;

    case 'toggle-props':
      if (!id) return;
      expandedProps[id] = !expandedProps[id];
      renderLayers();
      break;

    case 'toggle-effects':
      if (!id) return;
      expandedProps[`${id}-effects`] = !expandedProps[`${id}-effects`];
      renderLayers();
      break;

    case 'toggle-transform':
      if (!id) return;
      expandedProps[`${id}-transform`] = !expandedProps[`${id}-transform`];
      renderLayers();
      break;
  }
}

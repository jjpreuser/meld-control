// Delegated card/button actions + gain POSTing. Called from main.js handlers.

async function postGain(trackId) {
  const slider = document.querySelector(`.gain-slider[data-track-id="${trackId}"]`);
  if (!slider) return;
  clearTimeout(gainTimers[trackId]);
  try {
    await API.post(`/api/track/${trackId}/gain`, { gain: parseFloat(slider.value) });
  } catch (err) {
    showError('Gain', err);
  }
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

    // Every mutation below follows the same shape: report honestly (no success
    // toast unless the POST actually succeeded), and lean on the bridge's
    // sessionChanged push for the redraw, with one coalesced safety refetch.
    case 'show': {
      if (!id) return;
      markTransitioning(id);
      const ok = await withFeedback('Scene switch', 'Switched scene',
        () => API.post(`/api/scene/${id}/switch`));
      if (ok) scheduleSafetyRefresh();
      else clearTransitioning(id);
      break;
    }

    case 'stage':
      if (!id) return;
      if (await withFeedback('Stage scene', 'Staged scene',
        () => API.post(`/api/scene/${id}/stage`))) scheduleSafetyRefresh();
      break;

    case 'toggle-vis':
      if (!selectedSceneId || !id) return;
      if (await withFeedback('Layer toggle', null,
        () => API.post(`/api/layer/${id}/toggle`, { sceneId: selectedSceneId }))) scheduleSafetyRefresh();
      break;

    case 'mute':
      if (await withFeedback('Mute', null,
        () => API.post(`/api/track/${btn.dataset.trackId}/mute`))) scheduleSafetyRefresh();
      break;

    case 'monitor':
      if (await withFeedback('Monitor', null,
        () => API.post(`/api/track/${btn.dataset.trackId}/monitor`))) scheduleSafetyRefresh();
      break;

    case 'toggle-effect': {
      const { effectId, layerId } = btn.dataset;
      if (!selectedSceneId || !layerId || !effectId) return;
      if (await withFeedback('Effect toggle', null,
        () => API.post(`/api/effect/${effectId}/toggle`, { sceneId: selectedSceneId, layerId }))) scheduleSafetyRefresh();
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

    case 'media-play':
      await withFeedback('Play', 'Play', () => mediaPlay(btn.dataset.layerId));
      break;

    case 'media-pause':
      await withFeedback('Pause', 'Pause', () => mediaPause(btn.dataset.layerId));
      break;

    case 'instant-replay':
      // Fire-and-forget: the runner owns its own status/countdown UI.
      runInstantReplay();
      break;

    case 'replay-extend':
      replayExtendFn();
      break;

    case 'replay-dismiss-now':
      replayDismissFn();
      break;
  }
}

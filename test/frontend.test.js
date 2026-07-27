// Unit tests for the DOM-free frontend logic in public/js/catalog.js — the
// catalog that drives the command deck, plus the pure helpers used by the audio /
// media / switcher renderers. These run in plain node (no jsdom): the
// module.exports guard at the bottom of catalog.js exposes them here while staying
// a no-op in the browser.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  COMMAND_GROUPS, isMediaLayer, groupTracks, busScenes, gainPctOf,
} = require('../public/js/catalog.js');
const { REPLAY_DEFAULTS, clampDismissSec, replayPlan } = require('../public/js/replay.js');

describe('command catalog  [Feature 3]', () => {
  const allCmds = COMMAND_GROUPS.flatMap((g) => g.commands.map((c) => c.cmd));

  test('includes explicit start/stop variants (not just toggle)', () => {
    for (const c of [
      'meld.startStreamingAction', 'meld.stopStreamingAction',
      'meld.startRecordingAction', 'meld.stopRecordingAction',
    ]) assert.ok(allCmds.includes(c), `missing ${c}`);
  });

  test('includes all capture + camera commands', () => {
    for (const c of [
      'meld.screenshot', 'meld.screenshot.vertical', 'meld.recordClip',
      'meld.replay.show', 'meld.replay.dismiss', 'meld.toggleVirtualCameraAction',
    ]) assert.ok(allCmds.includes(c), `missing ${c}`);
  });

  test('every command has a label', () => {
    for (const g of COMMAND_GROUPS)
      for (const c of g.commands) assert.ok(c.label && c.label.length, `${c.cmd} has no label`);
  });
});

describe('isMediaLayer  [Feature 2]', () => {
  test('true only when mediaSource present', () => {
    assert.equal(isMediaLayer({ mediaSource: 'file:///a.mp4' }), true);
    assert.equal(isMediaLayer({ source: 'file:///a.png' }), false);
    assert.equal(isMediaLayer({ url: 'https://x' }), false);
    assert.equal(isMediaLayer({}), false);
    assert.equal(isMediaLayer(null), false);
  });
});

describe('groupTracks  [Feature 7]', () => {
  // scene-1 has layer lay-1; lay-1 has an associated audio track trk-lay.
  // trk-global has no parent (mic). trk-orphan points at a missing parent.
  const items = {
    'scene-1': { type: 'scene', index: 0, name: 'Cam' },
    'scene-0': { type: 'scene', index: 1, name: 'Intro' },
    'lay-1': { type: 'layer', parent: 'scene-1', name: 'Browser' },
    'trk-global': { type: 'track', name: 'Mic' },
    'trk-lay': { type: 'track', parent: 'lay-1', name: 'Browser Audio' },
    'trk-orphan': { type: 'track', parent: 'missing', name: 'Ghost' },
  };

  test('global tracks (no parent) land in the global group', () => {
    const { global } = groupTracks(items);
    assert.deepEqual(global.map((t) => t.id), ['trk-global']);
  });

  test('layer-parented track resolves through layer -> scene', () => {
    const { scenes } = groupTracks(items);
    const cam = scenes.find((s) => s.sceneId === 'scene-1');
    assert.ok(cam, 'expected a scene-1 group');
    assert.deepEqual(cam.tracks.map((t) => t.id), ['trk-lay']);
    assert.equal(cam.sceneName, 'Cam');
  });

  test('unresolvable parent falls into an "Other" bucket, never dropped', () => {
    const { scenes } = groupTracks(items);
    const other = scenes.find((s) => s.sceneName === 'Other');
    assert.ok(other, 'expected an Other group');
    assert.deepEqual(other.tracks.map((t) => t.id), ['trk-orphan']);
  });

  test('scene groups are ordered by scene index', () => {
    const withTwo = {
      ...items,
      'lay-0': { type: 'layer', parent: 'scene-0', name: 'L0' },
      'trk-intro': { type: 'track', parent: 'lay-0', name: 'Intro Audio' },
    };
    const { scenes } = groupTracks(withTwo);
    const named = scenes.filter((s) => s.sceneId).map((s) => s.sceneName);
    assert.deepEqual(named, ['Cam', 'Intro']); // index 0 then 1
  });

  test('empty input yields empty groups', () => {
    const { global, scenes } = groupTracks({});
    assert.deepEqual(global, []);
    assert.deepEqual(scenes, []);
  });
});

describe('busScenes  [Feature 5]', () => {
  const items = {
    'a': { type: 'scene', index: 0, name: 'A', current: true },
    'b': { type: 'scene', index: 1, name: 'B', staged: true },
    'c': { type: 'scene', index: 2, name: 'C' },
    't': { type: 'track', name: 'x' },
  };
  test('picks program (current) and preview (staged)', () => {
    const { program, preview, scenes } = busScenes(items);
    assert.equal(program[0], 'a');
    assert.equal(preview[0], 'b');
    assert.equal(scenes.length, 3); // tracks excluded
  });
  test('null program/preview when none flagged', () => {
    const { program, preview } = busScenes({ c: { type: 'scene', index: 0, name: 'C' } });
    assert.equal(program, null);
    assert.equal(preview, null);
  });
});

describe('replayPlan  [Feature 3 — Instant Replay]', () => {
  const cmds = (steps) => steps.filter((s) => s.cmd).map((s) => s.cmd);

  test('full macro: save -> delay -> show -> countdown -> dismiss, in order', () => {
    const steps = replayPlan();
    assert.deepEqual(cmds(steps), [
      'meld.recordClip', 'meld.replay.show', 'meld.replay.dismiss',
    ]);
    // recordClip then a wait then show: the clip needs a beat to finalize.
    assert.equal(steps[0].cmd, 'meld.recordClip');
    assert.ok(steps[1].wait > 0, 'expected a delay before showing');
    assert.equal(steps[2].cmd, 'meld.replay.show');
  });

  test('the pre-dismiss wait is flagged as a countdown', () => {
    const steps = replayPlan();
    const countdown = steps.find((s) => s.countdown);
    assert.ok(countdown, 'expected a countdown wait');
    assert.equal(countdown.wait, REPLAY_DEFAULTS.dismissDelayMs);
    // the countdown must be the step immediately before dismiss
    const i = steps.indexOf(countdown);
    assert.equal(steps[i + 1].cmd, 'meld.replay.dismiss');
  });

  test('dismissDelayMs is honored', () => {
    const steps = replayPlan({ dismissDelayMs: 30000 });
    assert.equal(steps.find((s) => s.countdown).wait, 30000);
  });

  test('autoDismiss:false stops after show (no dismiss step)', () => {
    const steps = replayPlan({ autoDismiss: false });
    assert.deepEqual(cmds(steps), ['meld.recordClip', 'meld.replay.show']);
    assert.ok(!steps.some((s) => s.countdown));
  });

  test('autoShow:false records a clip only', () => {
    const steps = replayPlan({ autoShow: false });
    assert.deepEqual(cmds(steps), ['meld.recordClip']);
  });

  test('zero delays collapse the wait steps but keep the commands', () => {
    const steps = replayPlan({ showDelayMs: 0, dismissDelayMs: 0 });
    assert.deepEqual(cmds(steps), [
      'meld.recordClip', 'meld.replay.show', 'meld.replay.dismiss',
    ]);
    assert.ok(!steps.some((s) => s.wait), 'no wait steps when delays are 0');
  });
});

describe('clampDismissSec  [Feature 3 — Instant Replay]', () => {
  test('clamps to [1, 120] and rounds', () => {
    assert.equal(clampDismissSec(15), 15);
    assert.equal(clampDismissSec(0), 1);
    assert.equal(clampDismissSec(-5), 1);
    assert.equal(clampDismissSec(500), 120);
    assert.equal(clampDismissSec(15.7), 16);
  });
  test('genuine non-numbers fall back to the default (15s)', () => {
    assert.equal(clampDismissSec('abc'), 15);
    assert.equal(clampDismissSec(undefined), 15);
    assert.equal(clampDismissSec(NaN), 15);
  });
  test('empty-ish values coerce to 0 and clamp up to the 1s floor', () => {
    // an empty number input yields '' -> Number('') === 0 -> min 1
    assert.equal(clampDismissSec(''), 1);
    assert.equal(clampDismissSec(null), 1);
  });
  test('numeric strings are accepted', () => {
    assert.equal(clampDismissSec('20'), 20);
  });
});

describe('gainPctOf', () => {
  test('formats linear gain as percent, defaulting null to 100%', () => {
    assert.equal(gainPctOf(1), '100%');
    assert.equal(gainPctOf(0.5), '50%');
    assert.equal(gainPctOf(0), '0%');
    assert.equal(gainPctOf(null), '100%');
  });
});

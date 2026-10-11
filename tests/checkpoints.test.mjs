import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointBeat, checkpointOptions, canJoinSegments } from '../lib/director-checkpoints.ts';
import { compileDirectorTimeline } from '../lib/director-timeline.ts';
import { buildH3VideoPrompt } from '../lib/h3-video-prompt.ts';
const beat = { id: 'b2', title: '答话', duration: '5s', mode: 'I2V', status: 'review', summary: '微笑', prompt: '二维动画人物微笑', continuityFromPrevious: true, referenceAssetIds: [], scene: '露台' };
const options = { steps: 20, seed: 100, megapixels: 0.4, aspect: '9:16', label: 'film', acceleration: 'turbo8' };
test('FL2VA authored shot keeps opening and ending frame order', () => {
  const corrected = checkpointBeat({ ...beat, mode: 'FL2VA' }, 'approved-opening', { workflow: 'FL2VA', endKeyframeId: 'approved-ending' }, '', '');
  assert.equal(corrected.mode, 'FL2VA');
  assert.deepEqual(corrected.referenceAssetIds, ['approved-opening', 'approved-ending']);
  assert.equal(corrected.continuityFromPrevious, false);
  assert.throws(() => checkpointBeat({ ...beat, mode: 'FL2VA' }, undefined, { workflow: 'FL2VA', endKeyframeId: 'end' }, '', ''), /完整首帧/);
});
test('retry override preserves source beat and inherited visual style', () => {
  const original = { ...beat, visualStyle: 'Japanese 2D cel animation' };
  const corrected = checkpointBeat(original, 'last', { promptOverride: 'Fixed two-shot. <d>[Chinese] 巧了，我也是。</d>' }, '酒红礼服', '');
  assert.equal(original.prompt, beat.prompt);
  assert.equal(corrected.visualStyle, original.visualStyle);
  assert.match(corrected.prompt, /Fixed two-shot/);
  assert.doesNotMatch(corrected.prompt, /二维动画人物微笑/);
  assert.deepEqual(corrected.referenceAssetIds, ['last']);
  assert.equal(checkpointBeat(original, 'last', { promptOverride: ' ' }, '', '').prompt, original.prompt);
});
test('continuation requires an approved last frame; keyframe explicitly replaces continuation', () => {
  assert.throws(() => checkpointBeat(beat, undefined, {}, '', ''), /首帧/);
  assert.deepEqual(checkpointBeat(beat, 'last', {}, '', '').referenceAssetIds, ['last']);
  const corrected = checkpointBeat(beat, 'last', { keyframeId: 'corrected' }, '酒红礼服，固定双人', '二维动画');
  assert.equal(corrected.continuityFromPrevious, false);
  assert.deepEqual(corrected.referenceAssetIds, ['corrected']);
  assert.match(corrected.prompt, /酒红礼服/);
});
test('single-clip checkpoint saves literal final frame and preserves original seed offset', () => {
  const resolved = checkpointBeat(beat, 'last', {}, '', '2D cel animation');
  const opts = checkpointOptions(options, { acceleration: 'standard', steps: 24 }, 3);
  const result = compileDirectorTimeline([resolved], { last: { id: 'last', title: '末帧', kind: 'first_frame', file: 'saved/last.png' } }, opts);
  assert.equal(result.timeline.clips[0].settings.seed, 103);
  assert.equal(result.timeline.clips[0].settings.steps, 24);
  assert.equal(result.workflow['8'], undefined);
  assert.equal(result.workflow['9'].inputs.batch_index, result.totalFrames - 1);
  assert.equal(result.workflow['10'].class_type, 'SaveImage');
  assert.throws(() => compileDirectorTimeline([resolved, { ...resolved, id: 'b3' }], { last: { id: 'last', title: '', file: 'saved/last.png' } }, opts), /每次只能/);
});
test('animation prompts never gain conflicting live-action wrapper across modes', () => {
  for (const mode of ['T2V', 'I2V', 'FL2VA', 'Ref2VA']) {
    const refs = mode === 'T2V' ? [] : [{ id: 'a', title: '开场' }, ...(mode === 'I2V' ? [] : [{ id: 'b', title: '结束' }])];
    const prompt = buildH3VideoPrompt({ ...beat, mode, visualStyle: '2D cel animation' }, refs);
    assert.match(prompt, /2D cel animation/);
    assert.doesNotMatch(prompt, /live-action/i);
  }
});
test('joining blocks incomplete, failed or merely generated segments', () => {
  assert.equal(canJoinSegments([], 0), false);
  assert.equal(canJoinSegments([{ status: 'completed' }], 1), false);
  assert.equal(canJoinSegments([{ status: 'completed', qc: 'failed' }], 1), false);
  assert.equal(canJoinSegments([{ status: 'running', qc: 'passed' }], 1), false);
  assert.equal(canJoinSegments([{ status: 'completed', qc: 'passed' }], 2), false);
  assert.equal(canJoinSegments([{ status: 'completed', qc: 'passed' }], 1), true);
});
test('workflow selection resolves ordered references into the actual Ref2VA graph', () => {
  const config = { workflow: 'Ref2VA', referenceAssetIds: ['person', 'place'], acceleration: 'standard', steps: 20 };
  const resolved = checkpointBeat({ ...beat, mode: 'Ref2VA', continuityFromPrevious: false }, 'last', config, '', '');
  const images = { person: { id: 'person', title: '人物', kind: 'identity', file: 'person.png' }, place: { id: 'place', title: '场景', kind: 'location', file: 'place.png' } };
  const graph = compileDirectorTimeline([resolved], images, checkpointOptions(options, config, 0));
  assert.equal(graph.timeline.clips[0].mode, 'r2v');
  assert.deepEqual(graph.timeline.clips[0].media.refs.map((r) => r.file), ['person.png', 'place.png']);
  assert.equal(graph.workflow['5'].class_type, 'MiniMaxH3DirectorWeb');
  assert.deepEqual(graph.workflow['5'].inputs.ref_model, ['7', 0]);
  assert.equal(graph.workflow['8'], undefined);
  assert.throws(() => checkpointBeat({ ...beat, mode: 'Ref2VA', continuityFromPrevious: false }, 'last', { workflow: 'Ref2VA', referenceAssetIds: [] }, '', ''), /1–9/);
});
test('explicit frame workflows ignore stale opposite workflow settings', () => {
  const first = checkpointBeat(beat, 'last', { workflow: 'I2V', keyframeId: 'start', endKeyframeId: 'end' }, '', '');
  assert.equal(first.mode, 'I2V');
  assert.deepEqual(first.referenceAssetIds, ['start']);
  const both = checkpointBeat({ ...beat, mode: 'FL2VA' }, 'last', { workflow: 'FL2VA', endKeyframeId: 'end' }, '', '');
  assert.deepEqual(both.referenceAssetIds, ['last', 'end']);
  assert.throws(() => checkpointBeat({ ...beat, mode: 'FL2VA' }, 'last', { workflow: 'FL2VA' }, '', ''), /尾帧/);
});

test('inherited I2V ignores cached planned ending instead of silently switching workflow', () => {
 const resolved=checkpointBeat(beat,'last',{keyframeId:'start',endKeyframeId:'old-end'},'','');
 assert.equal(resolved.mode,'I2V'); assert.deepEqual(resolved.referenceAssetIds,['start']);
});

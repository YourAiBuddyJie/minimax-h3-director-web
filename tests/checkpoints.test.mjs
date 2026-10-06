import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointBeat, checkpointOptions, canJoinSegments } from '../lib/director-checkpoints.ts';
import { compileDirectorTimeline } from '../lib/director-timeline.ts';
import { buildH3VideoPrompt } from '../lib/h3-video-prompt.ts';
const beat = { id: 'b2', title: '答话', duration: '5s', mode: 'I2V', status: 'review', summary: '微笑', prompt: '二维动画人物微笑', continuityFromPrevious: true, referenceAssetIds: [], scene: '露台' };
const options = { steps: 20, seed: 100, megapixels: 0.4, aspect: '9:16', label: 'film', acceleration: 'turbo8' };
test('continuation requires an approved last frame; keyframe explicitly replaces continuation', () => {
  assert.throws(() => checkpointBeat(beat, undefined, {}, '', ''), /上一段/);
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

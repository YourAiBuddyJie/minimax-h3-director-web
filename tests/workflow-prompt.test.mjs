import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointBeat } from '../lib/director-checkpoints.ts';
import { reviewBeat } from '../lib/director-review.ts';
import { isStoryboardApproved, storyboardSignature } from '../lib/storyboard-approval.ts';
import { compileDirectorTimeline } from '../lib/director-timeline.ts';

test('each cross-workflow switch refuses the old authored prompt before submission', () => {
  const modes = ['T2V', 'I2V', 'FL2VA', 'Ref2VA'];
  for (const mode of modes) for (const target of modes) {
    if (mode === target) continue;
    const beat = { id: 'b1', mode, duration: '8s', title: '起身', summary: '起身', prompt: '人物站起', referenceAssetIds: ['a', 'b'] };
    assert.throws(() => checkpointBeat(beat, undefined, { workflow: target, keyframeId: 'a', endKeyframeId: 'b', referenceAssetIds: ['a', 'b'] }, '', ''), /不能直接用于/);
  }
});

test('mode edit without rewriting blocks approval and timeline including legacy path', () => {
  const beat = { id: 'b1', mode: 'T2V', promptWorkflow: 'I2V', duration: '8s', title: '起身', summary: '起身', prompt: '从首帧起身', referenceAssetIds: [] };
  beat.storyboardApproval = storyboardSignature(beat);
  assert.equal(isStoryboardApproved(beat), false);
  assert.ok(reviewBeat(beat).some(issue => issue.severity === 'error' && /重写/.test(issue.message)));
  assert.throws(() => compileDirectorTimeline([beat], {}, { steps: 20, seed: 1, megapixels: 0.4, aspect: '9:16', label: 'test' }), /重写/);
});

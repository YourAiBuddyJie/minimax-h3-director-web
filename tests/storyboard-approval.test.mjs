import test from 'node:test';
import assert from 'node:assert/strict';
import { storyboardSignature, isStoryboardApproved, storyboardBlockReason, withoutStoryboardApproval, storyboardPromptBlockReason } from '../lib/storyboard-approval.ts';

const beat = { id: 'B1', title: '约定', summary: '两人约好明天见面', sourceText: '林晚：明天见。', prompt: 'S2 says 明天见。', scene: '河畔', startState: '对视', endState: '微笑', duration: '9s', mode: 'I2V', status: 'ready', referenceAssetIds: ['first'] };
const approved = { ...beat, storyboardApproval: storyboardSignature(beat) };

test('model readiness and old projects never count as user storyboard approval', () => {
  assert.equal(isStoryboardApproved(beat), false);
  assert.equal(isStoryboardApproved(approved), true);
  assert.match(storyboardBlockReason([approved, { ...beat, id: 'B2' }]), /B2/);
  assert.equal(storyboardBlockReason([approved]), '');
});

test('old retry prompts cannot bypass storyboard adoption', () => {
  assert.equal(storyboardPromptBlockReason(approved, undefined), '');
  assert.equal(storyboardPromptBlockReason(approved, '  '), '');
  assert.equal(storyboardPromptBlockReason(approved, approved.prompt), '');
  assert.match(storyboardPromptBlockReason(approved, 'old episode prompt'), /未采纳/);
});
test('story, performance and prompt edits invalidate approval', () => {
  for (const patch of [{ prompt: 'different' }, { duration: '10s' }, { summary: 'different' }, { startState: '低头' }, { endState: '离开' }, { scene: '露台' }, { mode: 'FL2VA' }, { continuityFromPrevious: true }, { visualStyle: '真人' }, { sourceText: '改写' }]) {
    assert.equal(isStoryboardApproved({ ...approved, ...patch }), false, JSON.stringify(patch));
  }
});
test('image binding after approval preserves it and acceptance leaves existing checkpoint fingerprints intact', () => {
  assert.equal(isStoryboardApproved({ ...approved, referenceAssetIds: ['new-first'] }), true);
  assert.equal(isStoryboardApproved({ ...approved, duration: '9.0s' }), true);
  assert.deepEqual(withoutStoryboardApproval(approved), beat);
  assert.equal(isStoryboardApproved({ ...approved, storyboardApproval: undefined }), false);
});

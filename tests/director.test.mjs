import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalDraft } from '../lib/director.ts';
import { normalizeDirectorAnalysis } from '../lib/director-analysis.ts';
import { compileDirectorTimeline, h3Timing } from '../lib/director-timeline.ts';
import { reviewBeat, reviewAnalysis } from '../lib/director-review.ts';
import { buildH3VideoPrompt } from '../lib/h3-video-prompt.ts';
import { checkDirectorEnvironment } from '../lib/director-preflight.ts';

const options = { steps: 20, seed: 42, megapixels: 0.4, aspect: '16:9', label: 'test-film' };
const base = { id: '01', title: '进门', duration: '5s', mode: 'T2V', status: 'review', summary: '女人走进房间。', prompt: 'An adult woman enters the room.', referenceAssetIds: [], sourceText: '女人走进房间。', scene: '房间', modeReason: '建立镜头', startState: '门外', endState: '门内', continuityFromPrevious: false, reviewNotes: [] };
const images = { first: { id: 'first', title: '起始构图', kind: 'first_frame', file: 'h3-director-web/qa.png' }, last: { id: 'last', title: '结束构图', kind: 'last_frame', file: 'h3-director-web/qa.png' }, identity: { id: 'identity', title: '女人身份', kind: 'identity', file: 'h3-director-web/qa.png' }, scene: { id: 'scene', title: '房间', kind: 'location', file: 'h3-director-web/qa.png' } };
test('H3 frame grid matches known 31-second run and legal floor/cap', () => {
  assert.equal(h3Timing(5).frames, 124); assert.equal(h3Timing(4).frames, 107); assert.equal(h3Timing(15).frames, 345);
  const result = compileDirectorTimeline(Array.from({ length: 6 }, (_, i) => ({ ...base, id: String(i + 1) })), {}, options);
  assert.equal(result.totalFrames, 744); assert.equal(result.totalSeconds, 31);
  assert.throws(() => h3Timing(NaN)); assert.throws(() => h3Timing(16));
});
test('explicit text clips stay text while deliberate continuity becomes auto I2V', () => {
  const result = compileDirectorTimeline([base, { ...base, id: '02', mode: 'I2V', continuityFromPrevious: true }], {}, options);
  assert.deepEqual(result.timeline.clips.map((clip) => clip.mode), ['t2v', 'auto']);
  assert.match(result.timeline.clips[1].prompt, /literal opening frame/);
  assert.equal(result.timeline.clips[1].settings.seed, 43);
  assert.equal(result.workflow['5'].class_type, 'MiniMaxH3Director');
});
test('mixed modes keep exact media order, independent checkpoint and bridge', () => {
  const result = compileDirectorTimeline([base, { ...base, id: '02', mode: 'I2V', referenceAssetIds: ['first'] }, { ...base, id: '03', mode: 'FL2VA', referenceAssetIds: ['first', 'last'] }, { ...base, id: '04', mode: 'Ref2VA', referenceAssetIds: ['identity', 'scene'] }], images, options);
  assert.deepEqual(result.timeline.clips.map((clip) => clip.mode), ['t2v', 'i2v', 'flf2v', 'r2v']);
  assert.equal(result.timeline.clips[2].media.last_frame.file, images.last.file);
  assert.equal(result.timeline.clips[3].media.refs[1].role, 'scene');
  assert.equal(result.workflow['5'].class_type, 'MiniMaxH3DirectorWeb'); assert.deepEqual(result.workflow['5'].inputs.ref_model, ['7', 0]);
  assert.equal(result.timeline.clips[3].settings.scheduler, 'beta');
});
test('missing, duplicate, unsafe assets and incompatible continuity refuse compilation', () => {
  assert.throws(() => compileDirectorTimeline([{ ...base, mode: 'I2V', referenceAssetIds: ['missing'] }], images, options), /素材/);
  assert.throws(() => compileDirectorTimeline([{ ...base, mode: 'FL2VA', referenceAssetIds: ['first', 'first'] }], images, options), /重复/);
  assert.throws(() => compileDirectorTimeline([{ ...base, mode: 'I2V', referenceAssetIds: ['first'] }], { first: { ...images.first, file: '../secret.png' } }, options), /相对路径/);
  assert.throws(() => compileDirectorTimeline([{ ...base, mode: 'I2V', continuityFromPrevious: true }], {}, options), /首段/);
  assert.throws(() => compileDirectorTimeline([base, { ...base, id: '02', mode: 'I2V', continuityFromPrevious: true, scene: '走廊' }], {}, options), /场景/);
});
test('dialogue review detects omissions but accepts original words inside H3 d tags', () => {
  const beat = { ...base, sourceText: '女人说：“还是家里暖和。”', prompt: 'The woman (S1) says <d>[Chinese] 还是家里暖和。</d>' };
  assert.equal(reviewBeat(beat).filter((i) => i.severity === 'error').length, 0);
  assert.ok(reviewBeat({ ...beat, prompt: 'The woman smiles.' }).some((i) => i.message.includes('对白')));
});
test('local import retains more than twelve shots and does not force every action into FL2VA', () => {
  const script = Array.from({ length: 15 }, (_, index) => `【镜头 ${index + 1}】\n女人站起，走到门边。`).join('\n\n');
  const result = createLocalDraft(script); assert.equal(result.beats.length, 15);
  assert.ok(result.beats.every((beat) => beat.mode === 'I2V' && beat.sourceText.includes('站起')));
  assert.equal(createLocalDraft('首尾帧：女人打开门，结束画面门完全打开。').beats[0].mode, 'FL2VA');
});
test('AI results reject fabricated source text and cyclic reference dependencies', () => {
  const data = { projectTitle: '测试', characters: [], spaces: [], conflicts: [], beats: [base], referenceAssets: [] };
  assert.equal(normalizeDirectorAnalysis(data, base.sourceText).source, 'ai');
  assert.throws(() => normalizeDirectorAnalysis(data, '其他剧本'), /不是剧本原文/);
  const asset = { id: 'a', title: 'a', kind: 'first_frame', prompt: 'a', sourceAssetIds: ['a'] };
  assert.throws(() => normalizeDirectorAnalysis({ ...data, referenceAssets: [asset] }, base.sourceText), /循环/);
  assert.ok(reviewAnalysis({ ...data, beats: [{ ...base, sourceText: '' }] }, '女人：你好。').some((issue) => issue.message.includes('对白')));
});
test('H3 prompt uses selected framing and single-image opening instructions', () => {
  const prompt = buildH3VideoPrompt({ ...base, mode: 'I2V' }, [images.first], '16:9');
  assert.match(prompt, /landscape/); assert.match(prompt, /0.00 seconds/); assert.doesNotMatch(prompt, /vertical/);
});
test('preflight fails clearly without required node/model rather than silently degrading', () => {
  const result = compileDirectorTimeline([base], {}, options);
  assert.ok(checkDirectorEnvironment(result.workflow, {}).includes('MiniMaxH3Director'));
  assert.ok(checkDirectorEnvironment(result.workflow, {}).some((name) => name.includes('minimax_h3_audio_vae')));
});


test('Turbo uses matching FL2VA LoRA, eight steps and leaves standard unchanged', () => {
  const turbo = compileDirectorTimeline([base, { ...base, id: '02', mode: 'I2V', continuityFromPrevious: true }], {}, { ...options, acceleration: 'turbo8' });
  assert.equal(turbo.workflow['8'].class_type, 'LoraLoaderModelOnly');
  assert.deepEqual(turbo.workflow['5'].inputs.model, ['8', 0]);
  assert.ok(turbo.timeline.clips.every((clip) => clip.settings.steps === 8 && clip.settings.scheduler === 'simple'));
  assert.equal(compileDirectorTimeline([base], {}, options).workflow['8'], undefined);
  assert.throws(() => compileDirectorTimeline([{ ...base, mode: 'Ref2VA', referenceAssetIds: ['identity', 'scene'] }], images, { ...options, acceleration: 'turbo8' }), /Turbo/);
  assert.ok(checkDirectorEnvironment(turbo.workflow, {}).includes('minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'));
});

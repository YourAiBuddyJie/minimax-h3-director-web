import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImageCanvas, prepareQwen21Workflow, prepareWorkflow } from '../lib/comfy.ts';
import { createLocalDraft, resolveBeatDurations } from '../lib/director.ts';
import { providerEndpoint, validateProviderConfig } from '../lib/providers.ts';
import { isAliyunImageEndpoint, isVolcengineImageEndpoint } from '../lib/image-providers.ts';
import { matchBuiltInWorkflow } from '../lib/workflow-library.ts';
import { assetSourceIssue, imageInputPath, resolveAssetSources, resolveBeatAssets } from '../lib/asset-binding.ts';
import { buildH3VideoPrompt, normalizeBeatDuration, parseBeatDuration } from '../lib/h3-video-prompt.ts';
import { readFileSync } from 'node:fs';

test('generated images retain the ComfyUI output directory annotation', () => {
  assert.equal(imageInputPath({ filename: 'a.png', subfolder: 'test', type: 'output' }), 'test/a.png [output]');
  assert.throws(() => imageInputPath({ filename: '../secret.png' }));
  assert.throws(() => imageInputPath({ filename: 'a.png', subfolder: '../outside' }));
});

test('beat binding never borrows unrelated assets or reverses missing frame slots', () => {
  const assets = [
    { id: 'person', kind: 'identity', beatId: '', status: 'approved', files: [{ filename: 'p.png' }] },
    { id: 'end', kind: 'last_frame', beatId: '02', status: 'approved', files: [{ filename: 'end.png' }] },
  ];
  assert.deepEqual(resolveBeatAssets({ id: '01', mode: 'Ref2VA' }, assets), [undefined, undefined]);
  assert.deepEqual(resolveBeatAssets({ id: '02', mode: 'FL2VA' }, assets).map((a) => a?.id), [undefined, 'end']);
  assert.equal(resolveBeatAssets({ id: '01', mode: 'Ref2VA', referenceAssetIds: ['person', ''] }, assets)[0].id, 'person');
  assert.equal(resolveBeatAssets({ id: '01', mode: 'Ref2VA', referenceAssetIds: ['person', ''] }, assets.map((a) => ({ ...a, status: 'review' })))[0], undefined);
});

test('local draft preserves dialogue and chooses a reference mode', () => {
  const result = createLocalDraft('寒夜。沈昭醒来。\n\n萧彻：你终于醒了。');
  assert.equal(result.source, 'local-draft');
  assert.ok(result.beats.length >= 1);
  assert.ok(result.beats.some((beat) => beat.prompt.includes('萧彻：你终于醒了。')));
});

test('beat duration is normalized and H3 prompts assign explicit image roles', () => {
  assert.equal(normalizeBeatDuration('不定长·状态建立'), '6.0s');
  assert.equal(normalizeBeatDuration('18秒'), '15.0s');
  assert.equal(parseBeatDuration('7.5s'), 7.5);
  assert.equal(parseBeatDuration('状态建立'), null);
  const prompt = buildH3VideoPrompt({ id: 'B1', title: '寒蛊侵心', duration: '7.5s', mode: 'Ref2VA', status: 'ready', summary: '云初醒来', prompt: '云初在山洞石台上醒来。' }, [
    { id: 'character-yunchu', title: '云初身份母版', kind: 'identity' },
    { id: 'location-cave', title: '山洞连续空间', kind: 'location' },
  ]);
  assert.match(prompt, /<Picture 1> \(@character-yunchu, input image 1/);
  assert.match(prompt, /character facial identity/);
  assert.match(prompt, /<Picture 2> \(@location-cave, input image 2/);
  assert.match(prompt, /single continuous location/);
  assert.match(prompt, /7\.50-second/);
});

test('uniform model durations are re-estimated from each beat workload', () => {
  const beats = [
    { id: '01', title: '睁眼', duration: '6.0s', mode: 'Ref2VA', status: 'draft', summary: '云初缓慢睁眼。', prompt: '云初在石台上缓慢睁眼，急促喘息。' },
    { id: '02', title: '诊脉', duration: '6.0s', mode: 'Ref2VA', status: 'draft', summary: '陆承渊搭脉，云初警告。', prompt: '陆承渊伸手搭脉。云初说：“走开，噬心蛊会顺着真气反噬，你碰我也会死。”陆承渊收紧手指并看向她。' },
    { id: '03', title: '解带', duration: '6.0s', mode: 'FL2VA', status: 'draft', summary: '陆承渊起身走到洞口，解下玉带并脱下外袍。', prompt: '陆承渊起身、转身、走到洞口，解开玉带并脱下外袍。云初问：“你要做什么？”他回头答：“逼蛊。”' },
  ];
  const resolved = resolveBeatDurations(beats);
  assert.ok(new Set(resolved.map((beat) => beat.duration)).size > 1);
  assert.ok(Number.parseFloat(resolved[1].duration) > Number.parseFloat(resolved[0].duration));
});

test('markdown screenplay parsing rejects shot labels and grounds image prompts in story evidence', () => {
  const script = `# 《寒渊噬心》·第一集
**【场景】山洞内。洞外瀑布轰鸣，水雾弥漫。石台上火光摇曳。**
**【镜头1】**
特写：云初蜷缩在石台上，衣衫湿透贴身，唇色发紫，眉心黑气上爬。
**云初**（声音沙哑）：
“噬心蛊会顺着真气反噬。”
**【镜头2】**
陆承渊解下腰间玉带，外袍落地。
**陆承渊**（低声）：
“守住丹田。”`;
  const result = createLocalDraft(script);
  assert.deepEqual(result.characters, ['云初', '陆承渊']);
  assert.equal(result.spaces.length, 1);
  assert.equal(result.beats.length, 2);
  assert.ok(result.referenceAssets[0].prompt.includes('衣衫湿透'));
  assert.ok(result.referenceAssets[0].prompt.includes('服装与风格服从剧本'));
  assert.equal(result.referenceAssets.some((asset) => asset.title.startsWith('特写')), false);
});

test('workflow parameters are patched by class type', () => {
  const source = {
    '1': { class_type: 'PrimitiveStringMultiline', inputs: { value: 'old' } },
    '2': { class_type: 'PrimitiveFloat', inputs: { value: 5 } },
    '3': { class_type: 'BasicScheduler', inputs: { steps: 20 } },
    '4': { class_type: 'RandomNoise', inputs: { noise_seed: 1 } },
    '5': { class_type: 'ResolutionSelector', inputs: { megapixels: 0.4 } },
    '6': { class_type: 'LoadImage', inputs: { image: 'old.png' } },
    '7': { class_type: 'SaveVideo', inputs: { filename_prefix: 'old' } },
  };
  const result = prepareWorkflow(source, { prompt: 'new prompt', duration: 7, steps: 12, seed: 42, megapixels: 0.7, aspect: '9:16 (Portrait Widescreen)', label: 'beat-01', images: ['new.png'] });
  assert.equal(result['1'].inputs.value, 'new prompt');
  assert.equal(result['2'].inputs.value, 7);
  assert.equal(result['3'].inputs.steps, 12);
  assert.equal(result['4'].inputs.noise_seed, 42);
  assert.equal(result['5'].inputs.megapixels, 0.7);
  assert.equal(result['6'].inputs.image, 'new.png');
  assert.equal(result['7'].inputs.filename_prefix, 'h3-director-web/beat-01');
});

test('uploaded image order matches LoadImage order and prompt picture roles', () => {
  const workflow = prepareWorkflow({
    '1': { class_type: 'PrimitiveStringMultiline', inputs: { value: 'old' } },
    '2': { class_type: 'LoadImage', inputs: { image: 'old-1.png' } },
    '3': { class_type: 'LoadImage', inputs: { image: 'old-2.png' } },
    '4': { class_type: 'SaveVideo', inputs: { filename_prefix: 'old' } },
  }, { prompt: 'new', duration: 6, steps: 20, seed: 42, megapixels: 0.4, aspect: '9:16', label: 'B01', images: ['uploaded-first.png', 'uploaded-second.png'] });
  assert.equal(workflow['2'].inputs.image, 'uploaded-first.png');
  assert.equal(workflow['3'].inputs.image, 'uploaded-second.png');
  const prompt = buildH3VideoPrompt({ id: 'B01', mode: 'Ref2VA', duration: '6.0s', prompt: '两人相见' }, [
    { id: 'uploaded-image-1', title: 'first.png', role: 'the first character identity' },
    { id: 'uploaded-image-2', title: 'second.png', role: 'the second character costume' },
  ]);
  assert.match(prompt, /<Picture 1> \(@uploaded-image-1, input image 1, “first\.png”\) and provides the first character identity/);
  assert.match(prompt, /<Picture 2> \(@uploaded-image-2, input image 2, “second\.png”\) and provides the second character costume/);
});

test('workflow without prompt or output is rejected', () => {
  assert.throws(() => prepareWorkflow({}, { prompt: 'x', duration: 5, steps: 4, seed: 1, megapixels: 0.4, aspect: '9:16', label: 'x' }));
});

test('provider configuration accepts official endpoints and blocks arbitrary hosts', () => {
  const config = validateProviderConfig({ provider: 'deepseek', apiKey: 'test-key', model: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com/' });
  assert.equal(providerEndpoint(config), 'https://api.deepseek.com/chat/completions');
  assert.throws(() => validateProviderConfig({ provider: 'deepseek', apiKey: 'test-key', model: 'x', baseUrl: 'http://127.0.0.1:9999' }));
  assert.throws(() => validateProviderConfig({ provider: 'aliyun', apiKey: 'test-key', model: 'x', baseUrl: 'https://example.com/v1' }));
});

test('online image generation only accepts the official Alibaba synchronous image endpoint', () => {
  assert.equal(isAliyunImageEndpoint('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'), true);
  assert.equal(isAliyunImageEndpoint('https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'), true);
  assert.equal(isAliyunImageEndpoint('https://example.com/api/v1/services/aigc/multimodal-generation/generation'), false);
  assert.equal(isAliyunImageEndpoint('http://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'), false);
});

test('Seedream generation only accepts the official Volcengine Ark image endpoint', () => {
  assert.equal(isVolcengineImageEndpoint('https://ark.cn-beijing.volces.com/api/v3/images/generations'), true);
  assert.equal(isVolcengineImageEndpoint('https://ark.cn-beijing.volces.com/api/v3/chat/completions'), false);
  assert.equal(isVolcengineImageEndpoint('https://example.com/api/v3/images/generations'), false);
});

test('built-in workflow routing follows the director beat mode', () => {
  assert.equal(matchBuiltInWorkflow('T2V').id, 'h3-t2v');
  assert.equal(matchBuiltInWorkflow('Ref2VA').requiredImages, 2);
  assert.equal(matchBuiltInWorkflow('FL2VA').imageLabel, '依次选择首帧、尾帧');
  assert.equal(matchBuiltInWorkflow('IMAGE_T2I').id, 'qwen-image-21-t2i');
});

test('Qwen 2.1 text generation uses native conditioning, sampler and requested canvas', () => {
  const graph = prepareQwen21Workflow({ prompt: '角色母版', negativePrompt: '文字', width: 768, height: 1344, steps: 25, seed: 42, label: 'character' });
  assert.equal(graph['5'].class_type, 'TextEncodeQwenImage21');
  assert.match(graph['5'].inputs.prompt, /角色母版/);
  assert.equal(graph['6'].inputs.width, 768);
  assert.deepEqual(graph['7'].inputs.latent_image, ['6', 0]);
  assert.equal(graph['7'].inputs.seed, 42);
  assert.equal(graph['7'].inputs.cfg, 1);
  assert.equal(graph['7'].inputs.steps, 25);
  assert.equal(graph['1'].inputs.unet_name, 'qwen_image_2.1_int8_convrot.safetensors');
});

test('AI-proposed image sizes are normalized to the local image canvas contract', () => {
  assert.deepEqual(normalizeImageCanvas(1080, 1920), { width: 864, height: 1536 });
  assert.deepEqual(normalizeImageCanvas(1024, 1024), { width: 1024, height: 1024 });
  assert.deepEqual(normalizeImageCanvas(Number.NaN, 0), { width: 768, height: 1344 });
});

test('Qwen 2.1 editing preserves ten ordered references and uses the first reference latent', () => {
  const options = { prompt: '两人山洞', width: 768, height: 1344, steps: 40, seed: 42, label: 'edit', images: Array.from({ length: 10 }, (_, i) => `ref${i}.png`) };
  const graph = prepareQwen21Workflow(options);
  assert.deepEqual(graph['7'].inputs.latent_image, ['5', 2]);
  assert.equal(graph['6'], undefined);
  options.images.forEach((image, i) => {
    assert.deepEqual(graph['5'].inputs[`images.image_${i + 1}`], [String(20 + i), 0]);
    assert.equal(graph[String(20 + i)].inputs.image, image);
  });
  assert.throws(() => prepareQwen21Workflow({ ...options, images: [...options.images, 'overflow.png'] }), /10/);
  assert.throws(() => prepareQwen21Workflow({ ...options, steps: 0 }));
  for (const node of Object.values(graph)) for (const input of Object.values(node.inputs)) {
    if (Array.isArray(input)) assert.ok(graph[input[0]], `missing linked node ${input[0]}`);
  }
});

test('derived asset sources prefer explicit approved anchors and last-frame continuity', () => {
  const files = [{ filename: 'x.png' }];
  const assets = [
    { id: 'identity', title: '云初 · 身份母版', kind: 'identity', beatId: '', prompt: '', status: 'approved', files },
    { id: 'identity-2', title: '陆承渊 · 身份母版', kind: 'identity', beatId: '', prompt: '', status: 'approved', files },
    { id: 'location', title: '山洞 · 连续空间', kind: 'location', beatId: '', prompt: '', status: 'approved', files },
    { id: 'poisoned', title: '云初中蛊湿衣状态', kind: 'body_state', beatId: '1', prompt: '云初在山洞', status: 'approved', sourceAssetIds: ['identity', 'location'], files },
    { id: 'first', title: 'Beat 3 首帧', kind: 'first_frame', beatId: '3', prompt: '云初在山洞', status: 'approved', files },
  ];
  assert.deepEqual(resolveAssetSources({ id: 'state', title: '云初中毒', kind: 'body_state', beatId: '2', prompt: '云初', status: 'draft', sourceAssetIds: ['identity', 'location'] }, assets).map((asset) => asset.id), ['identity', 'location']);
  const inferred = resolveAssetSources({ id: 'wet', title: '云初中蛊湿衣状态', kind: 'body_state', beatId: '1', prompt: '云初在山洞石台', status: 'draft', sourceAssetIds: ['location'] }, assets);
  assert.deepEqual(inferred.map((asset) => asset.id), ['identity', 'location']);
  assert.equal(assetSourceIssue({ id: 'wet', title: '云初中蛊湿衣状态', kind: 'body_state', beatId: '1', prompt: '云初在山洞石台', status: 'draft', sourceAssetIds: ['location'] }, inferred, assets), '');
  const carryTarget = { id: 'carry', title: '陆承渊横抱云初', kind: 'first_frame', beatId: '4', prompt: '陆承渊横抱中蛊湿衣的云初', status: 'draft', sourceAssetIds: ['poisoned', 'identity-2'] };
  const carrySources = resolveAssetSources(carryTarget, assets);
  assert.deepEqual(carrySources.map((asset) => asset.id), ['poisoned', 'identity', 'identity-2', 'location']);
  assert.equal(assetSourceIssue(carryTarget, carrySources, assets), '', 'the approved state composite carries its inherited location forward');
  assert.deepEqual(resolveAssetSources({ id: 'last', title: '尾帧', kind: 'last_frame', beatId: '3', prompt: '云初', status: 'draft' }, assets).map((asset) => asset.id), ['first', 'identity', 'location']);
});

test('built-in API workflows contain no presentation-only MarkdownNote nodes', () => {
  for (const file of ['h3-t2v.json', 'h3-ref2va.json', 'h3-fl2va.json', 'qwen-image-21-t2i.json', 'qwen-image-21-edit.json']) {
    const workflow = JSON.parse(readFileSync(new URL(`../public/workflows/${file}`, import.meta.url), 'utf8'));
    assert.equal(Object.values(workflow).some((node) => node.class_type === 'MarkdownNote'), false, file);
  }

  const t2v = JSON.parse(readFileSync(new URL('../public/workflows/h3-t2v.json', import.meta.url), 'utf8'));
  const turboLoader = Object.values(t2v).find((node) => node.class_type === 'MiniMaxH3TurboLoRA');
  assert.equal(turboLoader?.inputs?.low_vram, true, '12 GB local profile must enable low_vram');

  const ref2va = JSON.parse(readFileSync(new URL('../public/workflows/h3-ref2va.json', import.meta.url), 'utf8'));
  assert.equal(Object.values(ref2va).some((node) => node.class_type === 'ModelPatchTorchSettings'), false, 'Ref2VA must not depend on the optional torch settings node');
  assert.deepEqual(ref2va['124'].inputs.model, ['192', 0]);
  assert.deepEqual(ref2va['126'].inputs.model, ['192', 0]);
});

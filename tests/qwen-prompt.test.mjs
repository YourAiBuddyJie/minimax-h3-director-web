import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQwenImagePrompt, normalizeImageReferenceLanguage, orderImageSources } from '../lib/qwen-image-prompt.ts';

test('cached image prompts replace timeline language while preserving visible actions', () => {
  const raw = '基于上一段尾帧与亭子场景参考，生成同机位双人中景尾帧：白素贞右手握伞，许仙退至亭内。保留首帧的人物服装，只改变手部位置。';
  const result = normalizeImageReferenceLanguage(raw);
  assert.doesNotMatch(result, /上一段|首帧|尾帧|末帧|上一帧/);
  assert.match(result, /白素贞右手握伞，许仙退至亭内/);
  assert.equal(normalizeImageReferenceLanguage(result), result);
});

test('local and cloud submissions use the actual reference order and no temporal titles', () => {
  const input = [{kind:'identity',title:'白素贞'}, {kind:'location',title:'亭子'}, {kind:'last_frame',title:'B1尾帧：二人对视'}];
  const ordered = orderImageSources(input);
  assert.equal(ordered[0].kind, 'last_frame');
  assert.equal(input[0].kind, 'identity');
  for (const modelTags of [true,false]) {
    const result = buildQwenImagePrompt({kind:'first_frame',prompt:'基于上一段尾帧，略微拉开构图，白素贞持伞，许仙站在亭内。'},ordered,modelTags);
    assert.doesNotMatch(result, /上一段|首帧|尾帧|末帧/);
    assert.match(result, /参考图1.*B1参考图/);
    assert.match(result, /参考图2.*白素贞/);
    assert.match(result, /参考图3.*亭子/);
    assert.match(result, /以参考图1.*为编辑画布/);
    assert.equal(result.includes('<image1>'), modelTags);
  }
});
import { createLocalDraft } from '../lib/director.ts';

test('Qwen scene compositing can add actors without freezing empty-canvas count', () => {
  const prompt = buildQwenImagePrompt({ kind: 'first_frame', prompt: '两个人坐在桌边。' }, [{ kind: 'location', title: '书房' }, { kind: 'identity', title: '小林' }, { kind: 'identity', title: '小夏' }]);
  assert.ok(prompt.includes('参考图1（<image1>）：书房'));
  assert.ok(prompt.includes('参考图2（<image2>）：小林'));
  assert.ok(prompt.includes('参考图3（<image3>）：小夏'));
  assert.ok(prompt.includes('添加目标中明确要求的角色'));
  assert.ok(!prompt.includes('保持人物数量'));
});
test('Qwen single-image edits use natural reference and target overrides preservation', () => {
  const prompt = buildQwenImagePrompt({ kind: 'last_frame', prompt: '打开笔记本，其他内容保持一致。' }, [{ kind: 'first_frame', title: '起始画面' }]);
  assert.ok(!prompt.includes('<image1>'));
  assert.ok(prompt.includes('参考图1（输入图像）为编辑画布'));
  assert.ok(prompt.includes('以目标为准'));
});
test('modern screenplay keeps wardrobe and separates baseline identity from transient state', () => {
  const draft = createLocalDraft('【场景】白天，现代书房。\n小林穿浅蓝衬衫。\n\n小林：你好。');
  const identity = draft.referenceAssets.find((asset) => asset.kind === 'identity');
  assert.ok(identity.prompt.includes('浅蓝衬衫'));
  assert.ok(!identity.prompt.includes('不得改成现代西装'));
  assert.ok(identity.prompt.includes('另建状态图'));
});

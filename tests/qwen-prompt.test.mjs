import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQwenImagePrompt } from '../lib/qwen-image-prompt.ts';
import { createLocalDraft } from '../lib/director.ts';

test('Qwen scene compositing can add actors without freezing empty-canvas count', () => {
  const prompt = buildQwenImagePrompt({ kind: 'first_frame', prompt: '两个人坐在桌边。' }, [{ kind: 'location', title: '书房' }, { kind: 'identity', title: '小林' }, { kind: 'identity', title: '小夏' }]);
  assert.ok(prompt.includes('<image1>：书房'));
  assert.ok(prompt.includes('<image2>：小林'));
  assert.ok(prompt.includes('<image3>：小夏'));
  assert.ok(prompt.includes('添加目标中明确要求的角色'));
  assert.ok(!prompt.includes('保持人物数量'));
});
test('Qwen single-image edits use natural reference and target overrides preservation', () => {
  const prompt = buildQwenImagePrompt({ kind: 'last_frame', prompt: '打开笔记本，其他内容保持一致。' }, [{ kind: 'first_frame', title: '起始画面' }]);
  assert.ok(!prompt.includes('<image1>'));
  assert.ok(prompt.includes('输入图像为编辑画布'));
  assert.ok(prompt.includes('以目标为准'));
});
test('modern screenplay keeps wardrobe and separates baseline identity from transient state', () => {
  const draft = createLocalDraft('【场景】白天，现代书房。\n小林穿浅蓝衬衫。\n\n小林：你好。');
  const identity = draft.referenceAssets.find((asset) => asset.kind === 'identity');
  assert.ok(identity.prompt.includes('浅蓝衬衫'));
  assert.ok(!identity.prompt.includes('不得改成现代西装'));
  assert.ok(identity.prompt.includes('另建状态图'));
});

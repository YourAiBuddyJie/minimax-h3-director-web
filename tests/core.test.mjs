import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWorkflow } from '../lib/comfy.ts';
import { createLocalDraft } from '../lib/director.ts';
import { providerEndpoint, validateProviderConfig } from '../lib/providers.ts';

test('local draft preserves dialogue and chooses a reference mode', () => {
  const result = createLocalDraft('寒夜。沈昭醒来。\n\n萧彻：你终于醒了。');
  assert.equal(result.source, 'local-draft');
  assert.ok(result.beats.length >= 1);
  assert.ok(result.beats.some((beat) => beat.prompt.includes('萧彻：你终于醒了。')));
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

test('workflow without prompt or output is rejected', () => {
  assert.throws(() => prepareWorkflow({}, { prompt: 'x', duration: 5, steps: 4, seed: 1, megapixels: 0.4, aspect: '9:16', label: 'x' }));
});

test('provider configuration accepts official endpoints and blocks arbitrary hosts', () => {
  const config = validateProviderConfig({ provider: 'deepseek', apiKey: 'test-key', model: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com/' });
  assert.equal(providerEndpoint(config), 'https://api.deepseek.com/chat/completions');
  assert.throws(() => validateProviderConfig({ provider: 'deepseek', apiKey: 'test-key', model: 'x', baseUrl: 'http://127.0.0.1:9999' }));
  assert.throws(() => validateProviderConfig({ provider: 'aliyun', apiKey: 'test-key', model: 'x', baseUrl: 'https://example.com/v1' }));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { resetProjectExecution } from '../lib/project-reset.ts';

test('new project clears execution state while preserving connection settings and credentials', () => {
  const values = new Map([
    ['h3-director-run', JSON.stringify({ url: 'http://localhost:9191', job: { promptId: 'old' }, steps: 32, acceleration: 'turbo8', aspect: '16:9', seed: 99, execution: 'legacy' })],
    ['h3-director-checkpoints', JSON.stringify({ session: { segments: ['old'] }, configs: { B1: { prompt: 'old', keyframeId: 'old-frame' } }, constraints: 'old clothes', style: 'old style' })],
    ['h3-director-provider', 'provider-settings'], ['h3-director-image-provider', 'image-settings'],
    ['h3-director-system-log', 'log'], ['h3-director-asset-view', 'list'],
  ]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  resetProjectExecution(storage);
  assert.deepEqual(JSON.parse(values.get('h3-director-run')), { url: 'http://localhost:9191' });
  assert.equal(values.has('h3-director-checkpoints'), false);
  for (const [key, value] of [['h3-director-provider', 'provider-settings'], ['h3-director-image-provider', 'image-settings'], ['h3-director-system-log', 'log'], ['h3-director-asset-view', 'list']]) assert.equal(values.get(key), value);
  resetProjectExecution(storage);
  assert.deepEqual(JSON.parse(values.get('h3-director-run')), { url: 'http://localhost:9191' });
});

test('corrupt execution cache can be reset without restoring old fields', () => {
  let run;
  resetProjectExecution({ getItem: () => '{broken', removeItem: () => {}, setItem: (_, value) => { run = JSON.parse(value); } });
  assert.deepEqual(run, { url: 'http://127.0.0.1:8189' });
});

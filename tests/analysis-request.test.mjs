import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisRequest } from '../lib/analysis-request.ts';

test('analysis deadline covers stalled headers, stalled body, cancellation and late replies', async () => {
  const original = globalThis.fetch;
  try {
    let signal;
    globalThis.fetch = async (_url, init) => { signal = init.signal; return new Promise(() => {}); };
    await assert.rejects(analysisRequest('http://test', {}, 20), /超过1秒/);
    assert.equal(signal.aborted, true);

    let finish;
    globalThis.fetch = async () => ({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) });
    await assert.rejects(analysisRequest('http://test', {}, 20), /超过1秒/);
    finish({ late: true });

    globalThis.fetch = async () => new Promise(() => {});
    const controller = new AbortController();
    const pending = analysisRequest('http://test', { signal: controller.signal }, 1000);
    controller.abort();
    await assert.rejects(pending, /已取消/);

    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 });
    const result = await analysisRequest('http://test', {}, 1000);
    assert.equal(result.response.status, 401);
    assert.equal(result.data.error.message, 'bad key');
  } finally { globalThis.fetch = original; }
});

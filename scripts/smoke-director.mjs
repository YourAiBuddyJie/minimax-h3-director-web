// Local HTTP fixture only. No actual ComfyUI prompt is submitted or model called.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { checkDirectorEnvironment } from '../lib/director-preflight.ts';
const fixtures = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const info = JSON.parse(readFileSync(process.argv[3], 'utf8'));
for (const fixture of Object.values(fixtures)) assert.deepEqual(checkDirectorEnvironment(fixture.workflow, info), []);
let submissions = 0; let uploads = 0; let submitted;
const server = createServer(async (req, res) => {
  if (req.url === '/object_info') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(info)); return; }
  if (req.url.startsWith('/view?')) { res.setHeader('Content-Type', 'image/png'); res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')); return; }
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  if (req.url === '/upload/image') { uploads++; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ name: 'smoke.png', subfolder: 'h3-director-web/transfer', type: 'input' })); return; }
  if (req.url === '/prompt') { submissions++; submitted = JSON.parse(Buffer.concat(chunks)); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ prompt_id: 'fixture-task-id' })); return; }
  res.writeHead(404); res.end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const fakeUrl = `http://127.0.0.1:${server.address().port}`;
const endpoint = 'http://localhost:3000/api/comfy/director';
const base = { id: '01', title: '测试镜头', duration: '5s', mode: 'T2V', status: 'review', summary: 'A woman enters a room.', prompt: 'An adult woman enters a room.', referenceAssetIds: [], scene: 'room' };
const options = { steps: 20, seed: 42, megapixels: 0.4, aspect: '16:9', label: 'HTTP_FIXTURE_ONLY' };
const body = { sourceUrl: fakeUrl, directorUrl: fakeUrl, beats: [base, { ...base, id: '02', mode: 'I2V', continuityFromPrevious: true }], assets: [], options };
async function call(payload) { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); return { status: response.status, data: await response.json() }; }
try {
  const dry = await call({ ...body, dryRun: true }); assert.equal(dry.status, 200, JSON.stringify(dry)); assert.equal(submissions, 0); assert.equal(uploads, 0); assert.equal(dry.data.totalSeconds, 31 / 3);
  const referenceBody = { ...body, beats: [{ ...base, mode: 'Ref2VA', referenceAssetIds: ['person', 'room'] }], assets: [{ id: 'person', title: '人物', kind: 'identity', file: { filename: 'p.png', type: 'output' } }, { id: 'room', title: '房间', kind: 'location', file: { filename: 'r.png', type: 'input' } }] };
  const refDry = await call({ ...referenceBody, dryRun: true }); assert.equal(refDry.status, 200, JSON.stringify(refDry)); assert.equal(refDry.data.assetsChecked, 2); assert.equal(uploads, 0);
  const run = await call(referenceBody); assert.equal(run.status, 200, JSON.stringify(run)); assert.equal(submissions, 1); assert.equal(uploads, 2); assert.equal(submitted.prompt['5'].class_type, 'MiniMaxH3DirectorWeb');
  const timeline = JSON.parse(submitted.prompt['5'].inputs.timeline_json); assert.ok(timeline.clips[0].media.refs.every((ref) => ref.file === 'h3-director-web/transfer/smoke.png'));
  const bad = await call({ ...body, beats: [{ ...base, mode: 'I2V', continuityFromPrevious: true }] }); assert.equal(bad.status, 400); assert.equal(submissions, 1);
  const remote = await call({ ...body, directorUrl: 'http://example.com' }); assert.equal(remote.status, 400); assert.equal(submissions, 1);
  const analysis = await fetch('http://localhost:3000/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script: '# 测试\n\n女人站起。\n\n男人：你好。' }) }).then((r) => r.json());
  assert.equal(analysis.source, 'local-draft'); assert.ok(analysis.beats.every((beat) => beat.sourceText));
  const report = { nativeMetadataCompatible: true, dryRunDidNotSubmitOrUpload: true, referencesTransferredBeforeOneSubmission: true, invalidContinuityBlocked: true, remoteHostBlocked: true, offlineAnalysisPreservedSource: true, realComfySubmissions: 0, fakeSubmissions: submissions };
  writeFileSync(process.argv[4], JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await new Promise((resolve) => server.close(resolve)); }

// Local integration smoke test; explicitly submits one low-resolution Qwen Image 2.1 image edit.
import { prepareQwen21Workflow } from '../lib/comfy.ts';

const comfyUrl = 'http://127.0.0.1:8188';
const images = process.argv.slice(2);
if (!images.length || images.length > 10) throw new Error('Pass 1–10 ComfyUI image paths, including [input] or [output] annotations.');
const prompt = prepareQwen21Workflow({
  prompt: 'Keep the identity, clothing and environment of <image1>. Change the lighting to soft cinematic evening light. Preserve the composition. No text or collage.',
  width: 768, height: 1024, steps: 25, seed: 9210801,
  label: 'qwen21-edit-test', images,
});
const response = await fetch(`${comfyUrl}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, client_id: 'director-image-edit-smoke' }) });
const submitted = await response.json();
if (!response.ok || !submitted.prompt_id) throw new Error(JSON.stringify(submitted));
console.log('Submitted:', submitted.prompt_id);
for (let index = 0; index < 900; index++) {
  const history = await fetch(`${comfyUrl}/history/${submitted.prompt_id}`).then((result) => result.json());
  const entry = history[submitted.prompt_id];
  if (entry?.status?.status_str === 'error') throw new Error(JSON.stringify(entry.status.messages));
  if (entry?.status?.completed) {
    const files = Object.values(entry.outputs || {}).flatMap((output) => output.images || []);
    console.log('PASS:', JSON.stringify(files));
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
throw new Error('Timed out; inspect ComfyUI queue before rerunning');

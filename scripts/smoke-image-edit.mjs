// Local integration smoke test; explicitly submits one low-resolution FLUX.2 image edit.
import { prepareFlux2ImageEdit } from '../lib/comfy.ts';

const comfyUrl = 'http://127.0.0.1:8188';
const prompt = prepareFlux2ImageEdit({
  prompt: 'Use image1 as the exact identity anchor. Preserve the same adult woman face, facial proportions, hairstyle and ancient Chinese costume design. Create one vertical cinematic frame in a cold fantasy cave: she is weak from poison, clothes visibly damp, lips pale purple, a subtle black poison trace climbs toward the brow. No collage, no text.',
  width: 512,
  height: 896,
  seed: 9210801,
  label: 'flux2-klein-identity-test',
  images: ['h3-director-web/assets/as_yunchu_identity_00001_.png [output]'],
});
const response = await fetch(`${comfyUrl}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, client_id: 'director-image-edit-smoke' }) });
const submitted = await response.json();
if (!response.ok || !submitted.prompt_id) throw new Error(JSON.stringify(submitted));
console.log('Submitted:', submitted.prompt_id);
for (let index = 0; index < 180; index++) {
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

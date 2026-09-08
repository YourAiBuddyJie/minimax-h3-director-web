// Local integration smoke test; explicitly submits one image, never a video.
import { readFileSync } from 'node:fs';
const origin = 'http://127.0.0.1:3000';
const comfyUrl = 'http://127.0.0.1:8188';
const check = await fetch(`${origin}/api/comfy?url=${encodeURIComponent(comfyUrl)}&workflow=z-image-t2i`).then((r) => r.json());
if (check.missingNodes?.length || check.missingModels?.length) throw new Error(JSON.stringify(check));
const workflow = JSON.parse(readFileSync(new URL('../public/workflows/z-image-t2i.json', import.meta.url), 'utf8'));
const response = await fetch(`${origin}/api/comfy/image/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comfyUrl, workflow, prompt: '写实电影场景参考图，一个连续的蓝色冰洞内部，地面浅水反射冰壁，洞口在画面左侧，右侧一块平坦岩石，柔和冷蓝光，无人物，无文字，无水印。', negativePrompt: '', width: 768, height: 1024, steps: 9, seed: 9210701, label: 'integration-ice-cave' }) });
const submitted = await response.json();
if (!response.ok || !submitted.promptId) throw new Error(JSON.stringify(submitted));
console.log('Submitted:', submitted.promptId);
for (let i = 0; i < 90; i++) {
  const result = await fetch(`${origin}/api/comfy/status?url=${encodeURIComponent(comfyUrl)}&promptId=${submitted.promptId}`).then((r) => r.json());
  if (result.status === 'error' || result.error) throw new Error(JSON.stringify(result));
  if (result.status === 'completed') {
    const file = result.files?.find((f) => f.filename.endsWith('.png'));
    if (!file) throw new Error('No image in completed response');
    const preview = await fetch(`${origin}/api/comfy/view?${new URLSearchParams({ url: comfyUrl, ...file })}`);
    if (!preview.ok || !preview.headers.get('content-type')?.startsWith('image/')) throw new Error('Image preview failed');
    console.log('PASS: generation, history and image preview', JSON.stringify(file));
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
throw new Error('Timed out; inspect ComfyUI queue before rerunning');

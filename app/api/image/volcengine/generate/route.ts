import { NextResponse } from 'next/server';
import { localComfyBase } from '@/lib/comfy';
import { isVolcengineImageEndpoint } from '@/lib/image-providers';

type SourceImage = { filename?: string; subfolder?: string; type?: string };
const supportedModels = new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-5-0-lite-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']);

function safePart(value: string) { return value.replace(/[^\w\u4e00-\u9fa5.-]/g, '_').slice(0, 80) || 'seedream'; }
function bytesToBase64(bytes: Uint8Array) { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }
function base64ToBytes(value: string) { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index); return bytes; }

async function readComfyImage(base: URL, file: SourceImage) {
  const filename = file.filename || ''; const subfolder = file.subfolder || ''; const type = file.type || 'output';
  if (!filename || filename.includes('..') || subfolder.includes('..') || !['output', 'input', 'temp'].includes(type)) throw new Error('参考图路径无效');
  const target = new URL('/view', base); target.searchParams.set('filename', filename); target.searchParams.set('subfolder', subfolder); target.searchParams.set('type', type);
  const response = await fetch(target); if (!response.ok) throw new Error(`读取参考图失败：HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('单张参考图超过 Seedream 10 MB 限制');
  return `data:${response.headers.get('content-type') || 'image/png'};base64,${bytesToBase64(bytes)}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { comfyUrl: string; apiKey: string; model: string; baseUrl: string; prompt: string; negativePrompt?: string; seed: number; label: string; images?: SourceImage[] };
    if (!body.apiKey?.trim()) throw new Error('请先配置火山方舟 API Key');
    if (!supportedModels.has(body.model)) throw new Error('当前支持 Seedream 5.0、5.0 Lite、4.5 或 4.0 的官方模型 ID');
    if (!isVolcengineImageEndpoint(body.baseUrl)) throw new Error('生图接口必须使用火山方舟北京地域官方图片生成地址');
    if (!body.prompt?.trim()) throw new Error('素材提示词不能为空');
    const comfy = localComfyBase(body.comfyUrl);
    const referenceImages = await Promise.all((body.images || []).slice(0, 3).map((file) => readComfyImage(comfy, file)));
    const prompt = `${body.prompt.trim()}${body.negativePrompt?.trim() ? `\n必须避免：${body.negativePrompt.trim()}` : ''}`;
    const payload: Record<string, unknown> = { model: body.model, prompt, size: '2K', seed: body.seed, sequential_image_generation: 'disabled', stream: false, response_format: 'b64_json', watermark: false };
    if (referenceImages.length) payload.image = referenceImages.length === 1 ? referenceImages[0] : referenceImages;
    const response = await fetch(body.baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${body.apiKey.trim()}` }, body: JSON.stringify(payload) });
    const result = await response.json() as { data?: Array<{ b64_json?: string; url?: string }>; error?: { code?: string; message?: string }; code?: string; message?: string; request_id?: string };
    const output = result.data?.[0];
    if (!response.ok || (!output?.b64_json && !output?.url)) return NextResponse.json({ error: `Seedream 生图失败：${result.error?.message || result.message || result.error?.code || result.code || `HTTP ${response.status}`}`, requestId: result.request_id }, { status: response.status >= 400 ? response.status : 502 });
    let blob: Blob;
    if (output.b64_json) blob = new Blob([base64ToBytes(output.b64_json)], { type: 'image/png' });
    else { const generated = await fetch(output.url!); if (!generated.ok) throw new Error(`下载 Seedream 结果失败：HTTP ${generated.status}`); blob = await generated.blob(); }
    const filename = `${safePart(body.label)}-${Date.now()}.png`;
    const form = new FormData(); form.append('image', new File([blob], filename, { type: blob.type || 'image/png' })); form.append('subfolder', 'h3-director-web/cloud/seedream'); form.append('type', 'input'); form.append('overwrite', 'true');
    const saved = await fetch(new URL('/upload/image', comfy), { method: 'POST', body: form });
    const savedResult = await saved.json() as { name?: string; subfolder?: string; type?: string; error?: string };
    if (!saved.ok || !savedResult.name) throw new Error(`Seedream 图片已生成，但保存到 ComfyUI 失败：${savedResult.error || `HTTP ${saved.status}`}`);
    return NextResponse.json({ files: [{ filename: savedResult.name, subfolder: savedResult.subfolder || 'h3-director-web/cloud/seedream', type: savedResult.type || 'input' }], requestId: result.request_id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Seedream 生图失败' }, { status: 400 }); }
}

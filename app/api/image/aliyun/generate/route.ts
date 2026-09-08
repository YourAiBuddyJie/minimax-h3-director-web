import { NextResponse } from 'next/server';
import { localComfyBase } from '@/lib/comfy';
import { isAliyunImageEndpoint } from '@/lib/image-providers';

type SourceImage = { filename?: string; subfolder?: string; type?: string };
function safePart(value: string) { return value.replace(/[^\w\u4e00-\u9fa5.-]/g, '_').slice(0, 80) || 'image'; }
function bytesToBase64(bytes: Uint8Array) { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }

async function readComfyImage(base: URL, file: SourceImage) {
  const filename = file.filename || ''; const subfolder = file.subfolder || ''; const type = file.type || 'output';
  if (!filename || filename.includes('..') || subfolder.includes('..') || !['output', 'input', 'temp'].includes(type)) throw new Error('参考图路径无效');
  const target = new URL('/view', base); target.searchParams.set('filename', filename); target.searchParams.set('subfolder', subfolder); target.searchParams.set('type', type);
  const response = await fetch(target); if (!response.ok) throw new Error(`读取参考图失败：HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('单张参考图超过线上接口 10 MB 限制');
  return `data:${response.headers.get('content-type') || 'image/png'};base64,${bytesToBase64(bytes)}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { comfyUrl: string; apiKey: string; model: string; baseUrl: string; prompt: string; negativePrompt?: string; width: number; height: number; seed: number; label: string; enableThinking?: boolean; images?: SourceImage[] };
    if (!body.apiKey?.trim()) throw new Error('请先配置百炼生图 API Key');
    if (!['qwen-image-3.0-pro', 'qwen-image-3.0'].includes(body.model)) throw new Error('当前仅支持 qwen-image-3.0-pro 或 qwen-image-3.0');
    if (!isAliyunImageEndpoint(body.baseUrl)) throw new Error('生图接口必须使用阿里云百炼官方域名与同步接口路径');
    if (!body.prompt?.trim()) throw new Error('素材提示词不能为空');
    const comfy = localComfyBase(body.comfyUrl);
    const sourceData = await Promise.all((body.images || []).slice(0, 3).map((file) => readComfyImage(comfy, file)));
    const content = [...sourceData.map((image) => ({ image })), { text: body.prompt.trim() }];
    const response = await fetch(body.baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${body.apiKey.trim()}` }, body: JSON.stringify({ model: body.model, input: { messages: [{ role: 'user', content }] }, parameters: { prompt_extend: true, prompt_extend_mode: 'direct', enable_thinking: Boolean(body.enableThinking), n: 1, size: `${body.width}*${body.height}`, negative_prompt: body.negativePrompt || '', seed: body.seed, watermark: false } }) });
    const result = await response.json() as { output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> }; request_id?: string; code?: string; message?: string };
    const imageUrl = result.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
    if (!response.ok || !imageUrl) return NextResponse.json({ error: `百炼生图失败：${result.message || result.code || `HTTP ${response.status}`}`, requestId: result.request_id }, { status: response.status >= 400 ? response.status : 502 });
    const generated = await fetch(imageUrl); if (!generated.ok) throw new Error(`下载线上结果失败：HTTP ${generated.status}`);
    const blob = await generated.blob(); const filename = `${safePart(body.label)}-${Date.now()}.png`;
    const form = new FormData(); form.append('image', new File([blob], filename, { type: blob.type || 'image/png' })); form.append('subfolder', 'h3-director-web/cloud'); form.append('type', 'input'); form.append('overwrite', 'true');
    const saved = await fetch(new URL('/upload/image', comfy), { method: 'POST', body: form });
    const savedResult = await saved.json() as { name?: string; subfolder?: string; type?: string; error?: string };
    if (!saved.ok || !savedResult.name) throw new Error(`线上图片已生成，但保存到 ComfyUI 失败：${savedResult.error || `HTTP ${saved.status}`}`);
    return NextResponse.json({ files: [{ filename: savedResult.name, subfolder: savedResult.subfolder || 'h3-director-web/cloud', type: savedResult.type || 'input' }], requestId: result.request_id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '线上生图失败' }, { status: 400 }); }
}

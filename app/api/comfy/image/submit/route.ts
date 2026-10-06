import { NextResponse } from 'next/server';
import { localComfyBase, normalizeImageCanvas, prepareQwen21Workflow } from '@/lib/comfy';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { comfyUrl: string; prompt: string; negativePrompt: string; width: number; height: number; steps: number; seed: number; label: string; images?: string[]; engine?: string };
    const base = localComfyBase(body.comfyUrl);
    if (body.engine && body.engine !== 'qwen21') throw new Error('本地生图已升级为 Qwen Image 2.1，请刷新页面后重试');
    if (!body.prompt?.trim()) throw new Error('素材提示词不能为空');
    if (body.images && (!Array.isArray(body.images) || body.images.some((image) => typeof image !== 'string' || !image.trim()))) throw new Error('参考图列表无效');
    const canvas = normalizeImageCanvas(body.width, body.height);
    const prompt = prepareQwen21Workflow(body);
    const response = await fetch(new URL('/prompt', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    const result = await response.json() as { prompt_id?: string; node_errors?: unknown; error?: { message?: string; details?: string; extra_info?: { node_id?: string; class_type?: string } } };
    if (!response.ok || !result.prompt_id) {
      const detail = result.error?.message || result.error?.details || 'ComfyUI 未返回具体原因';
      const node = result.error?.extra_info;
      return NextResponse.json({ error: `ComfyUI 拒绝了生图工作流：${detail}${node?.class_type ? `（节点 ${node.node_id || '?'}：${node.class_type}）` : ''}`, nodeErrors: result.node_errors, comfyError: result.error }, { status: 422 });
    }
    return NextResponse.json({ promptId: result.prompt_id, canvas });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '提交生图任务失败' }, { status: 400 }); }
}

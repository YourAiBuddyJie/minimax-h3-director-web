import { NextResponse } from 'next/server';
import { localComfyBase, normalizeImageCanvas, prepareFlux2ImageEdit, prepareImageWorkflow, prepareQwenImageEdit, type ApiWorkflow } from '@/lib/comfy';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { comfyUrl: string; workflow: ApiWorkflow; prompt: string; negativePrompt: string; width: number; height: number; steps: number; seed: number; label: string; images?: string[]; engine?: 'flux2' | 'qwen2511' };
    const base = localComfyBase(body.comfyUrl);
    if (!body.workflow || typeof body.workflow !== 'object' || Array.isArray(body.workflow)) throw new Error('生图工作流格式无效');
    if (!body.prompt?.trim()) throw new Error('素材提示词不能为空');
    if (!Number.isInteger(body.steps) || body.steps < 4 || body.steps > 30) throw new Error('生图步数必须为 4–30');
    const canvas = normalizeImageCanvas(body.width, body.height);
    const prompt = body.images?.length
      ? body.engine === 'flux2'
        ? prepareFlux2ImageEdit({ ...body, images: body.images })
        : prepareQwenImageEdit({ ...body, images: body.images })
      : prepareImageWorkflow(body.workflow, { ...body, ...canvas });
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

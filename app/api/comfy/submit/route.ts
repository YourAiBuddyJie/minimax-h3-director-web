import { NextResponse } from 'next/server';
import { localComfyBase, prepareWorkflow, type ApiWorkflow } from '@/lib/comfy';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { comfyUrl: string; workflow: ApiWorkflow; prompt: string; duration: number; steps: number; seed: number; megapixels: number; aspect: string; label: string; images?: string[] };
    const base = localComfyBase(body.comfyUrl);
    if (!body.workflow || typeof body.workflow !== 'object' || Array.isArray(body.workflow)) throw new Error('请导入 API Format 工作流');
    if (!body.prompt?.trim()) throw new Error('Beat 提示词不能为空');
    if (body.duration < 4 || body.duration > 15) throw new Error('时长必须为 4–15 秒');
    if (body.steps < 4 || body.steps > 40) throw new Error('步数必须为 4–40');
    if (![0.4, 0.7, 1].includes(body.megapixels)) throw new Error('分辨率仅支持 0.4、0.7 或 1MP');
    const imageInputs = Object.values(body.workflow).filter((node) => node.class_type === 'LoadImage').length;
    if ((body.images?.length ?? 0) !== imageInputs) throw new Error(imageInputs ? `该工作流需要 ${imageInputs} 张图片` : '该工作流不接受参考图');
    const prompt = prepareWorkflow(body.workflow, body);
    const response = await fetch(new URL('/prompt', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    const result = await response.json() as { prompt_id?: string; node_errors?: unknown; error?: { type?: string; message?: string; details?: string; extra_info?: { node_id?: string; class_type?: string; node_title?: string } } };
    if (!response.ok || !result.prompt_id) {
      const detail = result.error?.message || result.error?.details || 'ComfyUI 未返回具体原因';
      const node = result.error?.extra_info;
      const nodeText = node?.class_type ? `（节点 ${node.node_id || '?'}：${node.class_type}）` : '';
      return NextResponse.json({ error: `ComfyUI 拒绝了工作流：${detail}${nodeText}`, nodeErrors: result.node_errors, comfyError: result.error }, { status: 422 });
    }
    return NextResponse.json({ promptId: result.prompt_id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '提交失败' }, { status: 400 }); }
}

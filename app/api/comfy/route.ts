import { NextResponse } from 'next/server';
import { getBuiltInWorkflow } from '@/lib/workflow-library';
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const value = search.get('url');
  const workflow = getBuiltInWorkflow(search.get('workflow'));
  if (!value) return NextResponse.json({ ok: false, error: '缺少 ComfyUI 地址' }, { status: 400 });
  try {
    const base = new URL(value);
    if (!localHosts.has(base.hostname)) return NextResponse.json({ ok: false, error: '本地版暂时只允许 localhost' }, { status: 400 });
    const [statsResponse, nodesResponse] = await Promise.all([
      fetch(new URL('/system_stats', base), { signal: AbortSignal.timeout(5000), cache: 'no-store' }),
      fetch(new URL('/object_info', base), { signal: AbortSignal.timeout(10000), cache: 'no-store' }),
    ]);
    if (!statsResponse.ok) throw new Error(`HTTP ${statsResponse.status}`);
    const nodeInfo = nodesResponse.ok ? await nodesResponse.json() as Record<string, unknown> : {};
    const missingNodes = workflow?.requiredNodes.filter((node) => !(node in nodeInfo)) ?? [];
    const missingModels = workflow?.requiredModels.filter((model) => {
      const info = nodeInfo[model.classType] as { input?: { required?: Record<string, unknown[]> } } | undefined;
      const choices = info?.input?.required?.[model.input]?.[0];
      return !Array.isArray(choices) || !choices.includes(model.filename);
    }).map((model) => model.filename) ?? [];
    return NextResponse.json({ ok: true, stats: await statsResponse.json(), workflow: workflow?.id, missingNodes, missingModels, nodesChecked: nodesResponse.ok });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '连接失败' }, { status: 502 }); }
}

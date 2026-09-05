import { NextResponse } from 'next/server';
import { localComfyBase } from '@/lib/comfy';

type OutputFile = { filename?: string; subfolder?: string; type?: string };
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const base = localComfyBase(query.get('url') || '');
    const promptId = query.get('promptId');
    if (!promptId || !/^[a-zA-Z0-9-]+$/.test(promptId)) throw new Error('任务 ID 无效');
    const historyResponse = await fetch(new URL(`/history/${promptId}`, base), { cache: 'no-store' });
    if (!historyResponse.ok) throw new Error(`读取历史失败：HTTP ${historyResponse.status}`);
    const history = await historyResponse.json() as Record<string, { status?: { status_str?: string; completed?: boolean; messages?: unknown[] }; outputs?: Record<string, Record<string, OutputFile[]>> }>;
    const entry = history[promptId];
    if (!entry) {
      const queue = await fetch(new URL('/queue', base), { cache: 'no-store' }).then((response) => response.json()) as { queue_running?: unknown[]; queue_pending?: unknown[] };
      const serialized = JSON.stringify(queue);
      return NextResponse.json({ status: serialized.includes(promptId) ? 'running' : 'pending' });
    }
    if (entry.status?.status_str === 'error') return NextResponse.json({ status: 'error', messages: entry.status.messages ?? [] });
    const files = Object.values(entry.outputs ?? {}).flatMap((output) => Object.values(output).flat()).filter((file) => file.filename?.toLowerCase().endsWith('.mp4'));
    return NextResponse.json({ status: entry.status?.completed || files.length ? 'completed' : 'running', files });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '状态查询失败' }, { status: 400 }); }
}

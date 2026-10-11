import { NextResponse } from 'next/server';
import { localComfyBase } from '@/lib/comfy';
import { historyTaskStatus } from '@/lib/task-state';

type OutputFile = { filename?: string; subfolder?: string; type?: string };
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const base = localComfyBase(query.get('url') || '');
    const promptId = query.get('promptId');
    if (!promptId || !/^[a-zA-Z0-9-]+$/.test(promptId)) throw new Error('任务 ID 无效');
    const historyResponse = await fetch(new URL(`/history/${promptId}`, base), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!historyResponse.ok) throw new Error(`读取历史失败：HTTP ${historyResponse.status}`);
    const history = await historyResponse.json() as Record<string, { status?: { status_str?: string; completed?: boolean; messages?: unknown[] }; outputs?: Record<string, Record<string, OutputFile[]>> }>;
    const entry = history[promptId];
    if (!entry) {
      const queueResponse = await fetch(new URL('/queue', base), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!queueResponse.ok) throw new Error(`读取队列失败：HTTP ${queueResponse.status}`);
      const queue = await queueResponse.json() as { queue_running?: unknown[]; queue_pending?: unknown[] };
      if (!Array.isArray(queue.queue_running) || !Array.isArray(queue.queue_pending)) throw new Error('队列响应不完整，保留任务ID等待重查');
      const contains = (items?: unknown[]) => items?.some((item) => Array.isArray(item) && item[1] === promptId);
      if (contains(queue.queue_running)) return NextResponse.json({ status: 'running' });
      if (contains(queue.queue_pending)) return NextResponse.json({ status: 'pending' });
      return NextResponse.json({ status: 'error', messages: ['任务不在队列或历史中，可能已取消或 ComfyUI 已重启；请检查后手动重试。'] });
    }
    if (entry.status?.status_str === 'error') return NextResponse.json({ status: 'error', messages: entry.status.messages ?? [] });
    const files = Object.values(entry.outputs ?? {}).flatMap((output) => Object.values(output).flat()).filter((file) => /\.(mp4|png|jpe?g|webp)$/i.test(file.filename ?? ''));
    return NextResponse.json({ status: historyTaskStatus(entry.status), files });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '状态查询失败' }, { status: 400 }); }
}

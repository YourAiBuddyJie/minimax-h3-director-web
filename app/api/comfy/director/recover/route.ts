import { NextResponse } from 'next/server';
import { localComfyBase } from '@/lib/comfy';

// Read only the configured local Director output. Never accept a filesystem root from the client.
export async function POST(request: Request) {
  try {
    const body = await request.json() as { directorUrl: string; label: string; beatIds: string[]; automatic?: boolean };
    const base = localComfyBase(body.directorUrl);
    if (base.port !== '8189') throw new Error('本地分段找回仅支持配置的8189 Director');
    if (!body.label || /[\\/:]|\.\./.test(body.label) || !Array.isArray(body.beatIds) || !body.beatIds.length || body.beatIds.length > 120 || new Set(body.beatIds).size !== body.beatIds.length) throw new Error('项目名称或分段列表无效');
    const inventory = await fetch(new URL('/__local/director-output-index', request.url), { signal: AbortSignal.timeout(10000) });
    if (!inventory.ok) throw new Error('文件找回需要本地开发服务；部署环境请使用逐段备份');
    const { videos, frames, recoveryPlan } = await inventory.json() as { videos: string[]; frames: string[]; recoveryPlan?: { label: string; resumeIndex: number; expectedVideos: string[]; constraints: string; style: string; promptPrefix: string } };
    const plan = recoveryPlan?.label === body.label ? recoveryPlan : undefined;
    if (body.automatic && !plan) throw new Error('当前项目没有指定的自动恢复计划');
    const segments = [];
    for (const [index, id] of body.beatIds.entries()) {
      const prefix = `${body.label}-beat-${index + 1}`;
      const matches = videos.filter((name) => name.startsWith(`${prefix}_`) && /^\d+_\.mp4$/.test(name.slice(prefix.length + 1)));
      if (!matches.length) break;
      if (matches.length > 1) throw new Error(`第${index + 1}段有多个版本，请使用导出的逐段记录确认版本，不能自动猜测`);
      const counter = matches[0].slice(prefix.length + 1, -5);
      const frame = `${prefix}-last_${counter}_.png`;
      if (!frames.includes(frame)) throw new Error(`第${index + 1}段缺少对应末帧，无法安全恢复接续`);
      const files = [{ filename: matches[0], subfolder: 'h3-director-web/director', type: 'output' }, { filename: frame, subfolder: 'h3-director-web/checkpoints', type: 'output' }];
      for (const file of files) {
        const target = new URL('/view', base);
        Object.entries(file).forEach(([key, value]) => target.searchParams.set(key, value));
        const response = await fetch(target, { signal: AbortSignal.timeout(15000) });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`Director无法读取第${index + 1}段素材`);
      }
      segments.push({ id, status: 'completed', files, attempt: 1, recipe: 'recovered', note: '从输出文件找回；请重新观看并确认验收。' });
    }
    if (!segments.length) throw new Error('没有找到当前项目的逐段视频，请核对项目名称及Director输出目录');
    if (plan && (!Number.isInteger(plan.resumeIndex) || plan.resumeIndex < 0 || plan.resumeIndex >= segments.length || JSON.stringify(segments.map((s) => s.files[0].filename)) !== JSON.stringify(plan.expectedVideos))) throw new Error('恢复计划与现有视频版本不同，请人工核对');
    return NextResponse.json({ segments, recoveryPlan: plan });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '恢复失败' }, { status: 400 }); }
}

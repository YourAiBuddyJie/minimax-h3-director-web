import { NextResponse } from 'next/server';
import { localComfyBase } from '@/lib/comfy';
import { imageInputPath, type OutputFile } from '@/lib/asset-binding';
export async function POST(request: Request) {
  let submitting = false;
  try {
    const body = await request.json() as { directorUrl: string; files: OutputFile[] };
    const base = localComfyBase(body.directorUrl);
    if (!Array.isArray(body.files) || !body.files.length || body.files.length > 120) throw new Error('请选择1–120个已通过的分段视频');
    for (const file of body.files) { imageInputPath(file); if (file.type !== 'output' || !file.filename?.endsWith('.mp4')) throw new Error('合片仅支持Director输出MP4'); }
    if (new Set(body.files.map((file) => `${file.subfolder}/${file.filename}`)).size !== body.files.length) throw new Error('合片视频重复');
    const info = await fetch(new URL('/object_info', base), { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!info.ok || !((await info.json()) as Record<string, unknown>).MiniMaxH3ReviewedJoin) throw new Error('请安装新版Web Bridge并重启Director，缺少逐段验收合片节点');
    submitting = true;
    const response = await fetch(new URL('/prompt', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ prompt: {
      '1': { class_type: 'MiniMaxH3ReviewedJoin', inputs: { files_json: JSON.stringify(body.files) } },
      '2': { class_type: 'SaveVideo', inputs: { video: ['1', 0], filename_prefix: 'h3-director-web/reviewed-film', format: 'mp4', codec: 'h264' } },
    } }) });
    const result = await response.json() as { prompt_id?: string; error?: { message?: string } };
    submitting = false;
    if (!response.ok || !result.prompt_id) throw new Error(result.error?.message || '合片提交失败；请查看队列，勿重复提交');
    return NextResponse.json({ promptId: result.prompt_id });
  } catch (error) { return NextResponse.json({ uncertain: submitting, error: error instanceof Error ? error.message : '合片失败' }, { status: 400 }); }
}

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { localComfyBase } from '@/lib/comfy';
import { imageInputPath, type OutputFile } from '@/lib/asset-binding';
import type { DirectorBeat } from '@/lib/director';
import { compileDirectorTimeline, type DirectorOptions, type TimelineImage } from '@/lib/director-timeline';
import { checkDirectorEnvironment, type NodeInfo } from '@/lib/director-preflight';

async function directorFetch(url: URL, init: RequestInit, stage: string) {
  try { return await fetch(url, init); }
  catch { throw new Error(stage + '失败：无法连接 ' + url.origin + '。请确认对应 ComfyUI 服务已启动，且地址、端口正确。'); }
}

type AssetInput = { id: string; title: string; kind: TimelineImage['kind']; file: OutputFile };
export async function POST(request: Request) {
  try {
    const body = await request.json() as { sourceUrl: string; directorUrl: string; beats: DirectorBeat[]; assets: AssetInput[]; options: DirectorOptions; dryRun?: boolean };
    const source = localComfyBase(body.sourceUrl);
    const target = localComfyBase(body.directorUrl);
    if (!Array.isArray(body.beats) || !Array.isArray(body.assets)) throw new Error('分镜或素材数据无效');
    const referenced = new Set(body.beats.flatMap((beat) => beat.referenceAssetIds || []));
    const inputAssets = body.assets.filter((asset) => referenced.has(asset.id));
    const images: Record<string, TimelineImage> = {};
    for (const asset of inputAssets) {
      imageInputPath(asset.file);
      if (!/\.(png|jpe?g|webp)$/i.test(asset.file.filename || '')) throw new Error('仅支持 PNG/JPEG/WebP 参考图');
      images[asset.id] = { id: asset.id, title: asset.title, kind: asset.kind, file: `h3-director-web/transfer/${createHash('sha256').update(asset.id).digest('hex').slice(0, 16)}.png` };
    }
    // Compile and check *before* copying files or submitting any GPU work.
    const preview = compileDirectorTimeline(body.beats, images, body.options);
    const infoResponse = await directorFetch(new URL('/object_info', target), { signal: AbortSignal.timeout(15000), cache: 'no-store' }, 'Director 节点检测');
    if (!infoResponse.ok) throw new Error(`Director 节点检测失败：HTTP ${infoResponse.status}`);
    const info = await infoResponse.json() as Record<string, NodeInfo>;
    const missing = checkDirectorEnvironment(preview.workflow, info);
    if (missing.length) return NextResponse.json({ error: `Director 环境不完整：${missing.join('、')}`, missing }, { status: 422 });
    const downloaded: Array<{ asset: AssetInput; bytes: ArrayBuffer; mime: string; filename: string }> = [];
    for (const asset of inputAssets) {
      const view = new URL('/view', source);
      view.searchParams.set('filename', asset.file.filename!); view.searchParams.set('subfolder', asset.file.subfolder || ''); view.searchParams.set('type', asset.file.type || 'output');
      const response = await directorFetch(view, { signal: AbortSignal.timeout(15000), cache: 'no-store' }, '读取素材 ' + asset.title);
      if (!response.ok) throw new Error(`素材不可读取：${asset.title}（HTTP ${response.status}）`);
      const mime = response.headers.get('content-type') || '';
      if (!mime.startsWith('image/')) throw new Error(`素材不是图片：${asset.title}`);
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error(`素材为空或超过20MB：${asset.title}`);
      const ext = asset.file.filename!.split('.').pop()!.toLowerCase();
      const filename = `${createHash('sha256').update(new Uint8Array(bytes)).digest('hex')}.${ext}`;
      downloaded.push({ asset, bytes, mime, filename });
    }
    if (body.dryRun) return NextResponse.json({ ok: true, rows: preview.rows, totalSeconds: preview.totalSeconds, assetsChecked: downloaded.length, message: '环境、素材与时间线检查通过；未提交生成' });
    for (const item of downloaded) {
      const form = new FormData(); form.append('image', new Blob([item.bytes], { type: item.mime }), item.filename); form.append('subfolder', 'h3-director-web/transfer'); form.append('type', 'input'); form.append('overwrite', 'false');
      const response = await directorFetch(new URL('/upload/image', target), { method: 'POST', body: form, signal: AbortSignal.timeout(30000) }, '转存素材 ' + item.asset.title);
      const result = await response.json() as { name?: string; subfolder?: string; type?: string };
      if (!response.ok || !result.name || result.type !== 'input') throw new Error(`转存素材失败：${item.asset.title}`);
      const path = imageInputPath({ filename: result.name, subfolder: result.subfolder, type: 'input' }).replace(/ \[input\]$/, '');
      images[item.asset.id].file = path;
    }
    const compiled = compileDirectorTimeline(body.beats, images, body.options);
    const finalMissing = checkDirectorEnvironment(compiled.workflow, info);
    if (finalMissing.length) throw new Error(finalMissing.join('、'));
    const response = await directorFetch(new URL('/prompt', target), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: compiled.workflow }), signal: AbortSignal.timeout(30000) }, '提交任务（若连接中断，请先查看 Director 队列，避免重复提交）');
    const result = await response.json() as { prompt_id?: string; error?: { message?: string; details?: string }; node_errors?: unknown };
    if (!response.ok || !result.prompt_id) return NextResponse.json({ error: result.error?.message || result.error?.details || 'ComfyUI 拒绝了 Director 工作流', nodeErrors: result.node_errors }, { status: 422 });
    return NextResponse.json({ promptId: result.prompt_id, timeline: compiled.timeline, rows: compiled.rows, totalSeconds: compiled.totalSeconds });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Director 请求失败' }, { status: 400 }); }
}

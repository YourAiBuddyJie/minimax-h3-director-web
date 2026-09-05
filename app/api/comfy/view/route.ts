import { localComfyBase } from '@/lib/comfy';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  try {
    const base = localComfyBase(query.get('url') || '');
    const filename = query.get('filename') || '';
    const subfolder = query.get('subfolder') || '';
    const type = query.get('type') || 'output';
    if (!filename || filename.includes('..') || subfolder.includes('..')) throw new Error('输出路径无效');
    const target = new URL('/view', base); target.searchParams.set('filename', filename); target.searchParams.set('subfolder', subfolder); target.searchParams.set('type', type);
    const response = await fetch(target);
    if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`);
    return new Response(response.body, { headers: { 'Content-Type': response.headers.get('content-type') || 'video/mp4', 'Content-Disposition': `inline; filename="${filename.replace(/[^\w.-]/g, '_')}"` } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '下载失败' }, { status: 400 }); }
}

import { NextResponse } from 'next/server';
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get('url');
  if (!value) return NextResponse.json({ ok: false, error: '缺少 ComfyUI 地址' }, { status: 400 });
  try {
    const base = new URL(value);
    if (!localHosts.has(base.hostname)) return NextResponse.json({ ok: false, error: '本地版暂时只允许 localhost' }, { status: 400 });
    const response = await fetch(new URL('/system_stats', base), { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return NextResponse.json({ ok: true, stats: await response.json() });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '连接失败' }, { status: 502 }); }
}

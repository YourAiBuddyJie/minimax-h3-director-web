import { NextResponse } from 'next/server';
import { testProvider } from '@/lib/provider-server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { providerConfig?: unknown } | null;
  try { return NextResponse.json(await testProvider(body?.providerConfig)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '连接测试失败' }, { status: 502 }); }
}

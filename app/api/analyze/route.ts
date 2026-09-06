import { NextResponse } from 'next/server';
import { createLocalDraft } from '@/lib/director';
import { analyzeWithProvider } from '@/lib/provider-server';
import { providerPresets } from '@/lib/providers';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { script?: string; providerConfig?: unknown } | null;
  const script = body?.script?.trim();
  if (!script) return NextResponse.json({ error: '剧本不能为空' }, { status: 400 });
  if (script.length > 120_000) return NextResponse.json({ error: '当前版本单次最多分析 12 万字符' }, { status: 413 });

  const envKey = process.env.OPENAI_API_KEY?.trim();
  const providerConfig = body?.providerConfig || (envKey ? { ...providerPresets.openai, apiKey: envKey, model: process.env.OPENAI_MODEL || providerPresets.openai.model } : null);
  if (!providerConfig) return NextResponse.json(createLocalDraft(script));
  try { return NextResponse.json(await analyzeWithProvider(script, providerConfig)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '模型分析失败' }, { status: 502 }); }
}

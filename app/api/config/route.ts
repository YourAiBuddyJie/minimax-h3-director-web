import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
    fallback: 'local-rules',
  });
}

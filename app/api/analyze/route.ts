import { NextResponse } from 'next/server';
import { createLocalDraft } from '@/lib/director';

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    projectTitle: { type: 'string' },
    characters: { type: 'array', items: { type: 'string' } },
    spaces: { type: 'array', items: { type: 'string' } },
    conflicts: { type: 'array', items: { type: 'string' } },
    beats: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string' }, title: { type: 'string' }, duration: { type: 'string' },
      mode: { type: 'string', enum: ['Ref2VA', 'FL2VA', 'T2V'] },
      status: { type: 'string', enum: ['ready', 'review', 'draft'] }, summary: { type: 'string' },
    }, required: ['id', 'title', 'duration', 'mode', 'status', 'summary'] } },
  }, required: ['projectTitle', 'characters', 'spaces', 'conflicts', 'beats'],
} as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { script?: string } | null;
  const script = body?.script?.trim();
  if (!script) return NextResponse.json({ error: '剧本不能为空' }, { status: 400 });
  if (script.length > 120_000) return NextResponse.json({ error: '当前版本单次最多分析 12 万字符' }, { status: 413 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json(createLocalDraft(script));

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini', store: false,
      instructions: '你是短剧导演。保持对白原文、顺序和对象；按剧情状态和信息切点拆 Beat，不固定时长；检查人物、连续空间、服装、道具和身体状态冲突；为每个 Beat 选择 Ref2VA、FL2VA 或 T2V。只输出符合结构的 JSON。',
      input: script,
      text: { format: { type: 'json_schema', name: 'director_analysis', strict: true, schema } },
    }),
  });
  if (!response.ok) return NextResponse.json({ error: `OpenAI API ${response.status}`, details: await response.text() }, { status: 502 });
  const data = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
  if (!outputText) return NextResponse.json({ error: '模型没有返回可解析的导演数据' }, { status: 502 });
  return NextResponse.json({ ...JSON.parse(outputText), source: 'openai' });
}

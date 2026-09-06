import type { DirectorAnalysis } from '@/lib/director';
import { providerEndpoint, validateProviderConfig, type ProviderConfig } from '@/lib/providers';

const directorInstruction = '你是短剧导演。保持对白原文、顺序和对象；按剧情状态和信息切点拆 Beat，不固定时长；检查人物、连续空间、服装、道具和身体状态冲突；为每个 Beat 选择 Ref2VA、FL2VA 或 T2V。只输出 JSON，不要 Markdown。';

export const directorSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    projectTitle: { type: 'string' },
    characters: { type: 'array', items: { type: 'string' } },
    spaces: { type: 'array', items: { type: 'string' } },
    conflicts: { type: 'array', items: { type: 'string' } },
    beats: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string' }, title: { type: 'string' }, duration: { type: 'string' },
      mode: { type: 'string', enum: ['Ref2VA', 'FL2VA', 'T2V'] },
      status: { type: 'string', enum: ['ready', 'review', 'draft'] }, summary: { type: 'string' }, prompt: { type: 'string' },
    }, required: ['id', 'title', 'duration', 'mode', 'status', 'summary', 'prompt'] } },
  }, required: ['projectTitle', 'characters', 'spaces', 'conflicts', 'beats'],
} as const;

async function upstreamError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } | string; message?: string } | null;
  const detail = typeof body?.error === 'string' ? body.error : body?.error?.message || body?.message;
  return detail ? `上游返回 ${response.status}：${detail.slice(0, 240)}` : `上游返回 HTTP ${response.status}`;
}

function parseDirectorJson(text: string): DirectorAnalysis {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回可解析的 JSON');
  const value = JSON.parse(cleaned.slice(start, end + 1)) as Partial<DirectorAnalysis>;
  if (!value.projectTitle || !Array.isArray(value.characters) || !Array.isArray(value.spaces) || !Array.isArray(value.conflicts) || !Array.isArray(value.beats) || !value.beats.length) throw new Error('模型返回的导演数据结构不完整');
  return { ...value, source: 'ai' } as DirectorAnalysis;
}

async function analyzeWithOpenAI(script: string, config: ProviderConfig) {
  const response = await fetch(providerEndpoint(config, 'responses'), {
    method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model, store: false, instructions: directorInstruction, input: script,
      text: { format: { type: 'json_schema', name: 'director_analysis', strict: true, schema: directorSchema } },
    }),
  });
  if (!response.ok) throw new Error(await upstreamError(response));
  const data = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
  if (!outputText) throw new Error('模型没有返回导演数据');
  return parseDirectorJson(outputText);
}

async function analyzeWithCompatibleChat(script: string, config: ProviderConfig) {
  const response = await fetch(providerEndpoint(config), {
    method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model, stream: false, temperature: 0.2,
      messages: [
        { role: 'system', content: `${directorInstruction}\nJSON Schema：${JSON.stringify(directorSchema)}` },
        { role: 'user', content: script },
      ],
    }),
  });
  if (!response.ok) throw new Error(await upstreamError(response));
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const outputText = data.choices?.[0]?.message?.content;
  if (!outputText) throw new Error('模型没有返回导演数据');
  return parseDirectorJson(outputText);
}

export async function analyzeWithProvider(script: string, rawConfig: unknown) {
  const config = validateProviderConfig(rawConfig);
  const result = config.provider === 'openai' ? await analyzeWithOpenAI(script, config) : await analyzeWithCompatibleChat(script, config);
  return { ...result, provider: config.provider, model: config.model };
}

export async function testProvider(rawConfig: unknown) {
  const config = validateProviderConfig(rawConfig);
  const isOpenAI = config.provider === 'openai';
  const response = await fetch(providerEndpoint(config, isOpenAI ? 'responses' : 'chat'), {
    method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(isOpenAI
      ? { model: config.model, input: '仅回复 OK', max_output_tokens: 16, store: false }
      : { model: config.model, messages: [{ role: 'user', content: '仅回复 OK' }], stream: false, max_tokens: 8 }),
  });
  if (!response.ok) throw new Error(await upstreamError(response));
  return { ok: true, provider: config.provider, model: config.model };
}

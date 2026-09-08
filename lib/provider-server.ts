import { resolveBeatDurations, type DirectorAnalysis } from '@/lib/director';
import { providerEndpoint, validateProviderConfig, type ProviderConfig } from '@/lib/providers';
import { normalizeBeatDuration } from '@/lib/h3-video-prompt';

const directorInstruction = `你是短剧导演与视觉设定师。保持对白原文、顺序和对象；按剧情状态和信息切点拆 Beat，不固定时长；检查人物、连续空间、服装、道具和身体状态冲突；为每个 Beat 选择 Ref2VA、FL2VA 或 T2V。
每个 Beat 必须独立估算时长，禁止把 6 秒或任何相同默认值批量复制给全部 Beat。先按中文对白约每秒 3.5–4.5 字计算净口播时间，再加入动作完成、听者反应、停顿与镜头建立时间；简单单动作通常 4–6 秒，多轮对白或连续动作通常 7–12 秒，复杂转折可到 15 秒。时长必须真实反映该 Beat 的表演量和信息量；只有确实等量时才允许偶然相同。
characters 数组只能填写纯角色姓名，不得包含 Markdown 符号、括号表演说明、对白、镜头术语或“特写/近景/场景/旁白”等标签。
生成去重后的参考图素材清单：人物身份母版、每个单一连续空间、关键服装/道具/身体状态，以及每个 FL2VA Beat 的字面首帧和尾帧。每条素材同时输出 sourceAssetIds：身份母版和场景母版为空数组；其他派生素材列出 1–3 个必须继承的母版 id。人物/服装/身体状态优先绑定对应身份母版和一个场景母版；首帧绑定相关人物与场景；尾帧优先绑定同 Beat 首帧，再补相关人物母版。后续动作若依赖已经建立的中毒、受伤、湿衣、换装或关键道具状态，应优先引用该 Beat 专用状态图，再补另一人物身份；状态图自身必须已经继承正确人物与连续空间。不得形成循环依赖。每条图片 prompt 都必须从剧本提取本项目的可见证据，明确时代/题材、人物年龄段与性别呈现、相貌气质、发型、服装形制与当前状态、伤势或中毒征象、相关道具、场景材质、天气和光线；没有明写的细节可以做一致的导演设定，但不得使用与剧本时代冲突的现代西装、证件照或通用素材照。人物身份母版必须是一名成年角色的一张单画面、腰部以上三分之二侧身定妆照，脸部清晰且双眼睁开；禁止四宫格、设定板、拼贴、分屏、重复人脸和多视角合成，并说明其基础服装与需要长期保持的身份特征。身体状态和相反道具状态必须另建 Beat 专用素材，不得污染基础身份母版。场景素材每张只表现一个连续空间。
图片提示词只描述可见画面，不写声音、对白内容或抽象关系；首尾帧必须保持机位、轴线、身份、服装、地标和光线，仅改变剧情要求的动作、道具或身体状态。所有参考图 width 和 height 必须在 512 到 1536 之间，并且必须是 32 的整数倍；人物身份母版优先 768×1024，竖屏场景和首尾帧优先 768×1344。每个 Beat 的 duration 是必填的实际视频秒数，必须使用 4.0s–15.0s 格式；不得填写“不定长”、节奏、状态或剧情文字。视频 prompt 必须包含主体、动作节奏、摄影机、空间连续性、表演、原文对白及声音设计。Ref2VA 必须按 referenceAssetIds 的输入顺序使用稳定图片标签，并明确每张图片只负责人物身份、身体/服装/道具状态或连续空间中的哪一项；FL2VA 必须明确第 1 张是 0 秒首帧、第 2 张是 duration 对应的尾帧。图片引用同时写成 <Picture N> 与 @素材id，禁止使用未定义引用。只输出 JSON，不要 Markdown。`;

export const directorSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    projectTitle: { type: 'string' },
    characters: { type: 'array', items: { type: 'string' } },
    spaces: { type: 'array', items: { type: 'string' } },
    conflicts: { type: 'array', items: { type: 'string' } },
    referenceAssets: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: ['identity', 'location', 'prop', 'costume', 'body_state', 'first_frame', 'last_frame'] }, beatId: { type: 'string' }, prompt: { type: 'string' }, negativePrompt: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' }, sourceAssetIds: { type: 'array', items: { type: 'string' } },
    }, required: ['id', 'title', 'kind', 'beatId', 'prompt', 'negativePrompt', 'width', 'height', 'sourceAssetIds'] } },
    beats: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string' }, title: { type: 'string' }, duration: { type: 'string', pattern: '^(?:[4-9](?:\\.\\d)?|1[0-4](?:\\.\\d)?|15(?:\\.0)?)s$', description: '4.0s–15.0s 的实际视频时长' },
      mode: { type: 'string', enum: ['Ref2VA', 'FL2VA', 'T2V'] },
      status: { type: 'string', enum: ['ready', 'review', 'draft'] }, summary: { type: 'string' }, prompt: { type: 'string' },
      referenceAssetIds: { type: 'array', items: { type: 'string' }, description: '按视频输入顺序引用 referenceAssets 的 id。T2V 空数组；FL2VA 首帧、尾帧；Ref2VA 两张与本 Beat 直接相关的素材，不得选无关人物或空间。' },
    }, required: ['id', 'title', 'duration', 'mode', 'status', 'summary', 'prompt', 'referenceAssetIds'] } },
  }, required: ['projectTitle', 'characters', 'spaces', 'conflicts', 'beats', 'referenceAssets'],
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
  if (!value.projectTitle || !Array.isArray(value.characters) || !Array.isArray(value.spaces) || !Array.isArray(value.conflicts) || !Array.isArray(value.beats) || !value.beats.length || !Array.isArray(value.referenceAssets)) throw new Error('模型返回的导演数据结构不完整');
  const normalized = value.beats.map((beat) => ({ ...beat, duration: normalizeBeatDuration(beat.duration) })) as DirectorAnalysis['beats'];
  return { ...value, beats: resolveBeatDurations(normalized), source: 'ai' } as DirectorAnalysis;
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

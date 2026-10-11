import { videoPromptWritingRules } from '@/lib/video-prompt-rules';
import { analysisRequest } from '@/lib/analysis-request';
import { qwenImagePromptInstruction } from '@/lib/qwen-image-prompt';
import type { DirectorAnalysis } from '@/lib/director';
import { storyboardInstruction, storyboardSchema, promptPlanSchema, normalizeStoryboard, normalizePromptPlan } from '@/lib/two-stage-analysis';
import { providerEndpoint, validateProviderConfig, promptWritingOptions } from '@/lib/providers';

async function upstreamError(response: Response, parsed?: unknown) {
  const body = (parsed === undefined ? await response.json().catch(() => null) : parsed) as { error?: { message?: string } | string; message?: string } | null;
  const detail = typeof body?.error === 'string' ? body.error : body?.error?.message || body?.message;
  return detail ? `上游返回 ${response.status}：${detail.slice(0, 240)}` : `上游返回 HTTP ${response.status}`;
}

function parseJson(text: string) {
 const cleaned=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');
 if(start<0||end<=start) throw new Error('模型没有返回可解析的JSON');
 return JSON.parse(cleaned.slice(start,end+1));
}
async function requestPlan(input: string, rawConfig: unknown, instruction: string, schema: object, name: string, signal?: AbortSignal) {
 const config=validateProviderConfig(rawConfig);
 const openai=config.provider==='openai';
 const promptStage=name==='reference_prompt_plan';
 const started=Date.now();
 const requestId=crypto.randomUUID();
 console.info('[analysis request]',JSON.stringify({requestId,stage:name,provider:config.provider,model:config.model,event:'started'}));
 try {
 const {response,data}=await analysisRequest<{output?:Array<{content?:Array<{type?:string;text?:string}>}>;choices?:Array<{message?:{content?:string}}>}>(providerEndpoint(config,openai?'responses':'chat'),{
  method:'POST',signal,headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},
  body:JSON.stringify(openai ? {model:config.model,store:false,instructions:instruction,input,text:{format:{type:'json_schema',name,strict:true,schema}}} : {model:config.model,stream:false,temperature:0.2,...(promptStage?promptWritingOptions(config):{}),messages:[{role:'system',content:`${instruction}\nJSON Schema：${JSON.stringify(schema)}`},{role:'user',content:input}]})
 },promptStage?270000:300000,promptStage?'提示词分析':'剧本分析');
 if(!response.ok) throw new Error(await upstreamError(response,data));
 const text=openai?data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text:data.choices?.[0]?.message?.content;
 if(!text) throw new Error('模型没有返回分析数据');
 const raw=parseJson(text);
 console.info('[analysis request]',JSON.stringify({requestId,stage:name,event:'completed',elapsedSeconds:Math.round((Date.now()-started)/1000)}));
 return {raw,provider:config.provider,model:config.model};
 } catch(error) {
 console.info('[analysis request]',JSON.stringify({requestId,stage:name,event:'failed',elapsedSeconds:Math.round((Date.now()-started)/1000)}));
 throw error;
 }
}
export async function analyzeWithProvider(script: string, rawConfig: unknown) {
 const result=await requestPlan(script,rawConfig,storyboardInstruction,storyboardSchema,'storyboard_analysis');
 return {...normalizeStoryboard(result.raw,script),provider:result.provider,model:result.model};
}
export async function analyzePromptPlan(script: string, story: DirectorAnalysis, rawConfig: unknown, signal?: AbortSignal) {
 const instruction=`你只负责已采纳分镜的提示词和参考图规划，不拆段、不改原文、不改时长、动作、人物或起止状态。全部使用Ref2VA多参考工作流，不写首尾帧绑定，不要求从图片精确开场或收敛到图片。每段输出中文prompt及1–9张直接相关referenceAssetIds，图片职责清楚，人物、场景、必要道具/状态分别约束。图片只供外观或状态参考，不把定妆姿态固定到全段。${videoPromptWritingRules}
参考图去重共用：人物identity、场景location、独立道具prop母版sourceAssetIds为空；costume/body_state只有确需状态区别才生成，并引用必要人物母版，场景仅在确有空间状态需求时引用。禁止机械生成逐段首尾图，不输出first_frame/last_frame。单画面，不拼图；人物年龄忠实原剧本（儿童不改成人），保持统一画风、服装和空间设定。道具母版可以独立生成，按不同道具分别建图。sourceAssetIds必须指向本清单已声明图，无循环，最多10张。参考图width/height为512–1536内32倍数。${qwenImagePromptInstruction}
对白歌词逐字一次，明确说话或演唱者，用(S1)、(S2)和<d>[Chinese]原句</d>，保持原文要求的演唱/对话区别，不承诺无输入音频时精确复刻歌曲。时间块覆盖本段全部时长，机位服务动作可见性，站位道具状态与分镜一致。系统会添加H3协议章节与实际图片编号，你只写中文作者内容，不预写图片标签。只输出Schema JSON。`;
 const result=await requestPlan(JSON.stringify({script,projectTitle:story.projectTitle,characters:story.characters,spaces:story.spaces,beats:story.beats.map(({id,title,duration,summary,sourceText,scene,startState,endState,reviewNotes})=>({id,title,duration,summary,sourceText,scene,startState,endState,reviewNotes}))}),rawConfig,instruction,promptPlanSchema,'reference_prompt_plan',signal);
 return {...normalizePromptPlan(result.raw,story,script),provider:result.provider,model:result.model};
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

import type { DirectorAnalysis, DirectorBeat } from './director.ts';
import { normalizeDirectorAnalysis } from './director-analysis.ts';
import { dialogueLines } from './director-review.ts';
import { isStoryboardApproved, storyboardSignature } from './storyboard-approval.ts';

const strings = { type: 'array', items: { type: 'string' } };
const text = { type: 'string' };
const shotFields = { id: text, title: text, duration: { type: 'string', pattern: '^(?:[3-9](?:\\.\\d)?|1[01](?:\\.\\d)?|12(?:\\.0)?)s$' }, sourceText: text, scene: text, summary: text, startState: text, endState: text, reviewNotes: strings };
export const storyboardSchema = { type: 'object', additionalProperties: false, properties: { projectTitle: text, characters: strings, spaces: strings, conflicts: strings, beats: { type: 'array', minItems: 1, maxItems: 120, items: { type: 'object', additionalProperties: false, properties: shotFields, required: Object.keys(shotFields) } } }, required: ['projectTitle', 'characters', 'spaces', 'conflicts', 'beats'] };
const imageFields = { id: text, title: text, kind: { type: 'string', enum: ['identity', 'location', 'prop', 'costume', 'body_state'] }, beatId: text, prompt: text, negativePrompt: text, width: { type: 'integer' }, height: { type: 'integer' }, sourceAssetIds: strings };
export const promptPlanSchema = { type: 'object', additionalProperties: false, properties: { beats: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: text, prompt: text, referenceAssetIds: strings }, required: ['id', 'prompt', 'referenceAssetIds'] } }, referenceAssets: { type: 'array', items: { type: 'object', additionalProperties: false, properties: imageFields, required: Object.keys(imageFields) } } }, required: ['beats', 'referenceAssets'] };
export const storyboardInstruction = `你只负责剧本分镜分析，不负责提示词、图片或工作流。按核心事件、信息切点和可完成动作拆分3–12秒镜头，duration用3.0s–12.0s格式，不能默认等长，若作者明确给出可行的分段/时长则优先保留。对白歌词逐字保留、不改说话对象、不漏段；长对白拆分，不压缩。sourceText逐字摘录连续原文，不伪造。summary写可拍摄的分镜内容和原对白，不写生成指令；scene、startState、endState保持连续空间、人物左右站位、道具归属和动作因果，换位需可行路线。characters只填角色姓名；保留年龄、风格和演唱要求，不把儿童改为成人。仅输出符合Schema的JSON，不输出mode、prompt或参考图计划。`;
export function normalizeStoryboard(raw: unknown, script: string): DirectorAnalysis {
 const value = raw as DirectorAnalysis;
 if (!value || !Array.isArray(value.beats) || !value.beats.length || value.beats.length > 120 || typeof value.projectTitle !== 'string' || !['characters','spaces','conflicts'].every(k => Array.isArray(value[k as 'characters']) && value[k as 'characters'].every(x => typeof x === 'string'))) throw new Error('分镜分析结构不完整');
 const ids = new Set<string>();
 const beats = value.beats.map(b => {
  if (!b.id || ids.has(b.id) || ![b.title,b.sourceText,b.scene,b.summary,b.startState,b.endState].every(x => typeof x === 'string') || !b.sourceText?.trim() || !script.includes(b.sourceText) || !Array.isArray(b.reviewNotes) || b.reviewNotes.some(x=>typeof x !== 'string')) throw new Error('分镜原文、状态或编号无效');
  ids.add(b.id); const seconds = Number.parseFloat(b.duration);
  if (!/^\d+(?:\.\d+)?s$/.test(b.duration) || !Number.isFinite(seconds) || seconds < 3 || seconds > 12) throw new Error(`分镜${b.id}必须为3–12秒，超长内容请拆段`);
  return { id:b.id,title:b.title,sourceText:b.sourceText,scene:b.scene,summary:b.summary,startState:b.startState,endState:b.endState,reviewNotes:b.reviewNotes,duration:`${seconds.toFixed(1)}s`,mode:'Ref2VA' as const,continuityFromPrevious:false,referenceAssetIds:[],prompt:'',status:'draft' as const,pipelineVersion:2 as const };
 });
 for (const line of dialogueLines(script)) if (!beats.some(b => b.sourceText.includes(line))) throw new Error(`分镜遗漏原文对白/歌词：${line}`);
 return { projectTitle:value.projectTitle,characters:value.characters,spaces:value.spaces,conflicts:value.conflicts,beats,referenceAssets:[],source:'ai',pipelineVersion:2 };
}
export function normalizePromptPlan(raw: unknown, story: DirectorAnalysis, script: string): DirectorAnalysis {
 if (!story.beats.every(isStoryboardApproved)) throw new Error('请先采纳全部分镜，再分析提示词');
 const plan = raw as { beats?: Array<{id:string;prompt:string;referenceAssetIds:string[]}>; referenceAssets?: DirectorAnalysis['referenceAssets'] };
 if (!Array.isArray(plan.beats) || plan.beats.length !== story.beats.length || new Set(plan.beats.map(b=>b.id)).size !== story.beats.length || !Array.isArray(plan.referenceAssets)) throw new Error('提示词计划必须覆盖全部已采纳分镜');
 const beats = story.beats.map(b => {
  const generated = plan.beats!.find(x=>x.id===b.id);
  if (!generated || typeof generated.prompt !== 'string' || !generated.prompt.trim() || !Array.isArray(generated.referenceAssetIds) || generated.referenceAssetIds.length < 1 || generated.referenceAssetIds.length > 9 || new Set(generated.referenceAssetIds).size !== generated.referenceAssetIds.length) throw new Error(`${b.id}缺少提示词或1–9张参考图`);
  for (const line of dialogueLines(b.sourceText || '')) if (!generated.prompt.includes(line)) throw new Error(`${b.id}提示词遗漏原对白/歌词：${line}`);
  return {...b,mode:'Ref2VA' as const,modeReason:'统一多参考工作流',continuityFromPrevious:false,prompt:generated.prompt,promptWorkflow:'Ref2VA' as const,referenceAssetIds:generated.referenceAssetIds,promptStorySignature:storyboardSignature(b),promptApproval:undefined,status:'review' as const};
 });
 const assets = plan.referenceAssets.map(a => {
  if (!['identity','location','prop','costume','body_state'].includes(a.kind) || !a.prompt?.trim() || !Number.isInteger(a.width) || !Number.isInteger(a.height) || [a.width,a.height].some(n=>n<512||n>1536||n%32!==0)) throw new Error('参考图类型、描述或尺寸无效；新版不生成首尾帧链');
  if (['identity','location','prop'].includes(a.kind) && a.sourceAssetIds?.length) throw new Error('人物、场景、道具基础母版应独立生成');
  return a;
 });
 const normalized = normalizeDirectorAnalysis({...story,beats,referenceAssets:assets},script);
 const ids = new Set(assets.map(a=>a.id));
 if (beats.some(b=>b.referenceAssetIds?.some(id=>!ids.has(id)))) throw new Error('提示词引用不存在的参考图');
 return {...normalized,beats,pipelineVersion:2};
}
export function storyboardIssues(beat: DirectorBeat) {
 const seconds=Number.parseFloat(beat.duration);
 return !beat.summary.trim() || !beat.sourceText?.trim() ? [{severity:'error' as const,message:'请补充分镜内容和对应原文'}] : !Number.isFinite(seconds)||seconds<3||seconds>12 ? [{severity:'error' as const,message:'分镜时长必须为3–12秒'}] : [];
}

import type { DirectorAnalysis, DirectorBeat } from './director.ts';

export type ReviewIssue = { severity: 'error' | 'warning'; message: string; beatId?: string };
export function dialogueLines(text: string): string[] {
  const quoted = [...text.matchAll(/[“「『"]([^”」』"\n]+)[”」』"]/g)].map((m) => m[1]);
  const metadataLabels = new Set(['开始状态', '起始状态', '结束状态', '起止状态', '场景', '场景与构图', '风格', '人物', '时长', '总时长', '目标时长', '构图', '镜头', '声音', '音效', '提示词', '模式', '模式理由', '接续', '结束画面', '起始画面']);
  const spoken = [...text.matchAll(/^[ \t]*(?:\*\*)?([\p{Script=Han}A-Za-z·]{1,12})(?:\*\*)?(?:[（(][^）)\n]*[）)])?[：:]([^\n]+)/gmu)]
    .filter((m) => !metadataLabels.has(m[1]))
    .map((m) => m[2].replace(/\*\*/g, '').trim()).filter((line) => !line.includes('【') && !/[“「『"]/.test(line));
  return [...new Set([...quoted, ...spoken])];
}

export function reviewBeat(beat: DirectorBeat, previous?: DirectorBeat): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const add = (severity: ReviewIssue['severity'], message: string) => issues.push({ severity, message, beatId: beat.id });
  if (!beat.prompt?.trim()) add('error', '生成描述为空');
  if (/<Picture\s+\d+>|@[\w-]+/.test(beat.prompt || '')) add('warning', '动作描述含预写图片标签；切换选图后请核对，图片编号应由系统统一生成');
  if (/subject_definitions:|integrated_multimodal_description:/.test(beat.prompt || '')) add('warning', '动作描述已含完整 H3 章节，建议仅保留镜头描述，避免重复包装');
  if ((beat.startState || '') === (beat.endState || '') && beat.startState) add('warning', '起止状态相同，请确认动作变化是否已描述清楚');
  const seconds = Number.parseFloat(beat.duration);
  if (!Number.isFinite(seconds) || seconds < 4 || seconds > 15) add('error', '时长必须为 4–15 秒');
  for (const line of dialogueLines(beat.sourceText || '')) if (!beat.prompt?.includes(line)) add('error', `原文对白未完整保留：${line}`);
  const count = dialogueLines(beat.sourceText || beat.prompt || '').join('').length;
  if (count / 4.2 + 1.5 > seconds) add('warning', '对白加停顿可能超出本段时长，建议拆段或延长');
  const actions = new Set((beat.sourceText || beat.summary).match(/站起|转身|走到|解开|脱下|穿上|递给|接过|喝|打开|关闭|倒下|攻击|闪避/g) || []);
  if (actions.size > 4) add('warning', '本段动作较多，建议拆成可完成的动作单元');
  if (beat.continuityFromPrevious) {
    if (!previous) add('error', '首段不能依赖上一段末帧');
    if (beat.mode !== 'I2V') add('error', '末帧接续必须使用 I2V 模式');
    if (beat.referenceAssetIds?.some(Boolean)) add('error', '接续段不能同时绑定独立参考图；请选择接续或新首帧');
    if (previous?.scene && beat.scene && previous.scene !== beat.scene) add('error', '场景已变化，不能直接沿用上一段末帧');
    if (previous?.endState && beat.startState && previous.endState !== beat.startState) add('warning', '前段结束状态与本段开始状态描述不同，请人工确认能够衔接');
  }
  for (const note of beat.reviewNotes || []) add('warning', note);
  return issues;
}

export function reviewAnalysis(analysis: DirectorAnalysis, script: string): ReviewIssue[] {
  const issues = analysis.beats.flatMap((beat, index) => reviewBeat(beat, analysis.beats[index - 1]));
  const sources = analysis.beats.map((beat) => beat.sourceText || '').join('\n');
  if (analysis.beats.some((beat) => !beat.sourceText)) issues.push({ severity: 'warning', message: '部分分镜没有原文对应关系，请核查覆盖范围' });
  for (const line of dialogueLines(script)) if (!sources.includes(line)) issues.push({ severity: 'warning', message: `分镜原文中未找到对白：${line}` });
  const ids = new Set(analysis.referenceAssets.map((asset) => asset.id));
  for (const beat of analysis.beats) {
    for (const id of beat.referenceAssetIds || []) if (id && !ids.has(id)) issues.push({ severity: 'error', beatId: beat.id, message: `引用的素材不存在：${id}` });
  }
  return issues;
}

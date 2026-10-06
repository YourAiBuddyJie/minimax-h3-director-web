export type DirectorBeat = {
  id: string;
  title: string;
  duration: string;
  mode: 'Ref2VA' | 'FL2VA' | 'I2V' | 'T2V';
  status: 'ready' | 'review' | 'draft';
  summary: string;
  prompt: string;
  referenceAssetIds?: string[];
  sourceText?: string;
  scene?: string;
  modeReason?: string;
  continuityFromPrevious?: boolean;
  startState?: string;
  endState?: string;
  reviewNotes?: string[];
};

export type ReferenceAssetKind = 'identity' | 'location' | 'prop' | 'costume' | 'body_state' | 'first_frame' | 'last_frame';

export type ReferenceAssetSpec = {
  id: string;
  title: string;
  kind: ReferenceAssetKind;
  beatId: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  promptVersion?: number;
  sourceAssetIds?: string[];
};

export type DirectorAnalysis = {
  projectTitle: string;
  characters: string[];
  spaces: string[];
  conflicts: string[];
  beats: DirectorBeat[];
  referenceAssets: ReferenceAssetSpec[];
  source: 'ai' | 'local-draft';
};

const actionSignals = /醒来|睁眼|起身|站起|坐起|跪下|倒下|转身|回头|走|跑|进入|离开|靠近|退后|抬手|伸手|抓|握|解开|脱下|穿上|打开|关闭|拔出|放下|挣扎|攻击|闪避|拥抱|扶起|背起|抱起|看向|对视|说|问|答|喊|低语|反应|发现|确认|递给|接过|破碎|坠落/g;

function durationScore(beat: Pick<DirectorBeat, 'summary' | 'prompt'>) {
  const summary = beat.summary?.trim() || '';
  const prompt = beat.prompt?.trim() || '';
  const source = `${summary}\n${prompt}`;
  const dialogue = [...source.matchAll(/[“「『"]([^”」』"]{1,120})[”」』"]/g)]
    .map((match) => match[1].replace(/\s/g, ''));
  const dialogueChars = [...new Set(dialogue)].reduce((total, line) => total + line.length, 0);
  const actionCount = new Set(source.match(actionSignals) || []).size;
  const clauses = summary.split(/[，。！？；,.!?;]/).filter((part) => part.trim().length > 1).length;
  const visibleChars = summary.replace(/[\s\p{P}\p{S}]/gu, '').length;
  return 3.4
    + Math.min(2.4, clauses * 0.42)
    + Math.min(2.8, actionCount * 0.34)
    + Math.min(6.2, dialogueChars / 4.2)
    + Math.min(1.6, visibleChars / 55);
}

/** Estimate playable screen time from dialogue, action beats and information density. */
export function estimateBeatDuration(beat: Pick<DirectorBeat, 'summary' | 'prompt'>): string {
  const seconds = Math.min(15, Math.max(4, Math.round(durationScore(beat) * 2) / 2));
  return `${seconds.toFixed(1)}s`;
}

/** Keep genuine director timings, but repair a model batch filled with one default value. */
export function resolveBeatDurations(beats: DirectorBeat[]): DirectorBeat[] {
  if (beats.length < 3) return beats;
  const parsed = beats.map((beat) => Number.parseFloat(beat.duration));
  const valid = parsed.every((value) => Number.isFinite(value) && value >= 4 && value <= 15);
  const suspiciouslyUniform = valid && new Set(parsed.map((value) => value.toFixed(2))).size === 1;
  if (!suspiciouslyUniform) return beats;

  const scores = beats.map(durationScore);
  const estimates = beats.map(estimateBeatDuration);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return beats.map((beat, index) => {
    let duration = Number.parseFloat(estimates[index]);
    if (max > min && new Set(estimates).size === 1) {
      duration = Math.round((5 + ((scores[index] - min) / (max - min)) * 4) * 2) / 2;
    }
    return { ...beat, duration: `${duration.toFixed(1)}s` };
  });
}

const nonCharacterLabels = new Set(['特写', '近景', '中景', '远景', '全景', '镜头', '场景', '黑屏', '字幕', '画外音', '旁白']);

function cleanMarkdown(value: string) {
  return value.replace(/\*\*/g, '').replace(/^#+\s*/, '').replace(/^[-—]{3,}\s*$/, '').trim();
}

export function extractDialogueCharacters(script: string): string[] {
  const names = [...script.matchAll(/^[ \t]*(?:\*\*)?([\p{Script=Han}A-Za-z·]{1,12})(?:\*\*)?[ \t]*(?:[（(][^）)\n]{0,48}[）)])?[ \t]*[：:]/gmu)]
    .map((match) => match[1].trim())
    .filter((name) => !nonCharacterLabels.has(name));
  return [...new Set(names)].slice(0, 12);
}

function visualContextForCharacter(script: string, character: string) {
  if (!script.trim()) return '剧本未提供更多外观信息，请依据故事时代设计统一造型。';
  const lines = script.split(/\r?\n/).map(cleanMarkdown).filter(Boolean);
  const direct = lines.filter((line) => line.includes(character) && !line.startsWith('【镜头') && !line.startsWith('【黑屏'));
  const storySignals = lines.filter((line) => /古装|仙侠|玄幻|宗|南疆|真气|蛊|衬衫|针织|书房|桌|白天|衣衫|外袍|中衣|玉带|伤|血|发|眉|唇|脸|肩|背|胸|水雾|山洞/.test(line));
  return [...new Set([...direct, ...storySignals])].slice(0, 8).join('；').slice(0, 900) || '依据原剧本世界观设计角色，保持服装、身体状态与剧情一致。';
}

function storyWorldContext(script: string) {
  const cleaned = script.split(/\r?\n/).map(cleanMarkdown).filter((line) => line && !line.startsWith('【镜头'));
  return cleaned.filter((line) => /场景|书房|桌|白天|夜晚|室内|室外|山洞|瀑布|水雾|石台|火光|古装|仙侠|玄幻|宗|南疆|真气|蛊/.test(line)).slice(0, 6).join('；').slice(0, 700);
}

function extractSpaces(script: string): string[] {
  const declared = [...script.matchAll(/【场景】\s*([^\n]+)/g)].map((match) => cleanMarkdown(match[1]));
  return [...new Set(declared)].filter(Boolean).slice(0, 8);
}

function extractShotBlocks(script: string): string[] {
  const marker = /^(?:\*\*)?【镜头[ \t]*\d+】(?:\*\*)?[ \t]*$/gmu;
  const matches = [...script.matchAll(marker)];
  if (matches.length) return matches.map((match, index) => script.slice((match.index || 0) + match[0].length, matches[index + 1]?.index ?? script.length).trim()).filter(Boolean);
  return script.split(/\n\s*\n|(?<=[。！？!?])\s*\n/).map(cleanMarkdown).filter((value) => value && !/^(?:#|【(?:场景|黑屏))/.test(value));
}

export function createReferenceAssetPlan(characters: string[], spaces: string[], beats: DirectorBeat[], script = ''): ReferenceAssetSpec[] {
  const negativePrompt = '多人混脸，重复人物，额外肢体，错误服装，错误道具，拼贴场景，多个不连续空间，字幕，水印，标志，可读文字，低清晰度';
  const world = storyWorldContext(script);
  const assets: ReferenceAssetSpec[] = [];
  characters.forEach((character, index) => assets.push({
    id: `character-${index + 1}`, title: `${character} · 身份母版`, kind: 'identity', beatId: '', width: 768, height: 1024, promptVersion: 3, sourceAssetIds: [],
    prompt: `影视人物身份参考图，只出现一个成年角色：${character}。必须忠于原剧本，服装与风格服从剧本，不添加无关时代造型。剧本世界与角色视觉依据：${visualContextForCharacter(script, character)}。单人、单画面、腰部以上三分之二侧身定妆照，脸部清晰且双眼睁开，完整显示发型、头饰、肩颈和基础服装材质；此图建立基础服装与稳定身份，剧情中的湿衣、伤势或中毒状态另建状态图。背景简洁但光色属于本剧世界观，写实电影定妆摄影。禁止设定板、四宫格、拼贴、分屏、重复人脸、文字标签。`, negativePrompt,
  }));
  spaces.forEach((space, index) => assets.push({
    id: `location-${index + 1}`, title: `${space} · 连续空间`, kind: 'location', beatId: '', width: 768, height: 1344, promptVersion: 2, sourceAssetIds: [],
    prompt: `竖屏影视场景参考图：${space}。原剧本世界依据：${world || space}。只表现一个连续且物理合理的空间，清楚展示出入口、行走路线、固定地标、家具或岩体位置与光线方向；场景时代、材质、气候和光色必须忠于剧本；无人，无剧情动作，无拼贴，无分屏，写实电影美术设定。`, negativePrompt,
  }));
  beats.filter((beat) => beat.mode === 'FL2VA' || (beat.mode === 'I2V' && !beat.continuityFromPrevious)).forEach((beat) => {
    const baseSources = [...characters.map((_, index) => `character-${index + 1}`), ...spaces.map((_, index) => `location-${index + 1}`)].slice(0, 3);
    assets.push({ id: `beat-${beat.id}-first`, title: `Beat ${beat.id} · 首帧`, kind: 'first_frame', beatId: beat.id, width: 768, height: 1344, promptVersion: 2, sourceAssetIds: baseSources, prompt: `竖屏影视完整构图，作为首尾帧视频的字面首帧。剧本世界：${world}。静止画面状态：${beat.startState || beat.summary}。表现动作触发前的明确初始状态；人物站位、视线、身体高度、服装、伤势、道具位置、空间地标与光线均清晰可见，单一连续空间，写实电影画面，无字幕。`, negativePrompt });
    if (beat.mode === 'FL2VA') assets.push({ id: `beat-${beat.id}-last`, title: `Beat ${beat.id} · 尾帧`, kind: 'last_frame', beatId: beat.id, width: 768, height: 1344, promptVersion: 2, sourceAssetIds: [`beat-${beat.id}-first`, ...baseSources].slice(0, 3), prompt: `竖屏影视完整构图，作为首尾帧视频的字面尾帧。剧本世界：${world}。静止画面状态：${beat.endState || beat.summary}。表现动作完成后的明确结束状态；保持与首帧相同机位、轴线、人物身份、服装、空间地标与光线，只改变剧情要求的动作、道具或身体状态，写实电影画面，无字幕。`, negativePrompt });
  });
  return assets;
}

export function createLocalDraft(script: string): DirectorAnalysis {
  const blocks = extractShotBlocks(script);
  const characters = extractDialogueCharacters(script);
  const sourceBlocks = blocks.length ? blocks : [script.trim() || '尚未输入剧本'];
  const beats = sourceBlocks.map((block, index): DirectorBeat => {
    const hasDialogue = extractDialogueCharacters(block).length > 0;
    const hasStateChange = /打开|关闭|破碎|倒下|站起|醒来|进入|离开|拔出|放下/.test(block);
    const explicitEnd = /首尾帧|结束画面|最终构图|尾帧/.test(block);
    return {
      id: String(index + 1).padStart(2, '0'),
      title: block.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').slice(0, 8) || `剧情段落 ${index + 1}`,
      duration: estimateBeatDuration({ summary: block.slice(0, 72), prompt: block }),
      mode: explicitEnd ? 'FL2VA' : hasDialogue ? 'Ref2VA' : hasStateChange ? 'I2V' : 'T2V',
      sourceText: block, scene: extractSpaces(block)[0] || '', continuityFromPrevious: false,
      modeReason: explicitEnd ? '原文明确约束结束画面，需要首尾帧' : hasDialogue ? '具名角色对白，建议人物参考；需人工核实素材' : hasStateChange ? '从明确起始状态发展动作，建议单图图生' : '未检测到固定画面约束，暂用文生草稿',
      startState: '', endState: '', reviewNotes: ['离线规则未推断完整起止状态与接续关系，请检查'],
      status: index === 0 ? 'review' : 'draft',
      summary: block.slice(0, 72),
      prompt: `单一连续空间，镜头围绕以下剧情行动展开：${block}。保持人物身份、服装、空间轴线、道具状态和身体状态连续；对白必须保持原文、顺序与说话对象；不要字幕、水印或额外文字。`,
    };
  });
  const spaces = extractSpaces(script);
  const title = script.match(/^#\s*(.+)$/m)?.[1]?.replace(/[《》*]/g, '').trim() || '未命名短剧';
  const referenceAssets = createReferenceAssetPlan(characters, spaces, beats, script);
  for (const beat of beats) {
    beat.referenceAssetIds = beat.mode === 'T2V' ? [] : beat.mode === 'I2V' ? [`beat-${beat.id}-first`] : beat.mode === 'FL2VA' ? [`beat-${beat.id}-first`, `beat-${beat.id}-last`] : referenceAssets.filter((asset) => asset.kind === 'identity' && beat.sourceText?.includes(asset.title.split(' · ')[0])).map((asset) => asset.id).slice(0, 2);
  }
  return { projectTitle: title, characters, spaces, conflicts: ['本地规则已提取剧本视觉证据，但仍需 AI 完成深层人物关系与连续性判断'], beats, referenceAssets, source: 'local-draft' };
}

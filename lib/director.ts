export type DirectorBeat = {
  id: string;
  title: string;
  duration: string;
  mode: 'Ref2VA' | 'FL2VA' | 'T2V';
  status: 'ready' | 'review' | 'draft';
  summary: string;
  prompt: string;
};

export type DirectorAnalysis = {
  projectTitle: string;
  characters: string[];
  spaces: string[];
  conflicts: string[];
  beats: DirectorBeat[];
  source: 'ai' | 'local-draft';
};

export function createLocalDraft(script: string): DirectorAnalysis {
  const blocks = script.split(/\n\s*\n|(?<=[。！？!?])\s*\n/).map((value) => value.trim()).filter(Boolean);
  const dialogueNames = [...script.matchAll(/^\s*([^：:\n]{1,12})[：:]/gm)].map((match) => match[1].trim());
  const characters = [...new Set(dialogueNames)].slice(0, 8);
  const sourceBlocks = blocks.length ? blocks : [script.trim() || '尚未输入剧本'];
  const beats = sourceBlocks.slice(0, 12).map((block, index): DirectorBeat => {
    const hasDialogue = /[^：:\n]{1,12}[：:]/.test(block);
    const hasStateChange = /打开|关闭|破碎|倒下|站起|醒来|进入|离开|拔出|放下/.test(block);
    return {
      id: String(index + 1).padStart(2, '0'),
      title: block.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').slice(0, 8) || `剧情段落 ${index + 1}`,
      duration: `${Math.min(12, Math.max(5, Math.round(block.length / 8)))}.0s`,
      mode: hasStateChange ? 'FL2VA' : hasDialogue ? 'Ref2VA' : 'T2V',
      status: index === 0 ? 'review' : 'draft',
      summary: block.slice(0, 72),
      prompt: `单一连续空间，镜头围绕以下剧情行动展开：${block}。保持人物身份、服装、空间轴线、道具状态和身体状态连续；对白必须保持原文、顺序与说话对象；不要字幕、水印或额外文字。`,
    };
  });
  return { projectTitle: '未命名短剧', characters, spaces: [], conflicts: ['本地草稿尚未完成素材与连续性语义检查'], beats, source: 'local-draft' };
}

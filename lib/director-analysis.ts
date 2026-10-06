import type { DirectorAnalysis, DirectorBeat, ReferenceAssetSpec } from './director.ts';
import { normalizeBeatDuration } from './h3-video-prompt.ts';

export function normalizeDirectorAnalysis(value: unknown, script: string): DirectorAnalysis {
  const data = value as Partial<DirectorAnalysis>;
  if (!data || typeof data.projectTitle !== 'string' || !['characters', 'spaces', 'conflicts'].every((key) => Array.isArray(data[key as 'characters']) && data[key as 'characters']!.every((item) => typeof item === 'string')) || !Array.isArray(data.beats) || !data.beats.length || !Array.isArray(data.referenceAssets)) throw new Error('模型返回的导演数据结构不完整');
  if (data.beats.length > 120) throw new Error('分镜超过120段，请拆分项目；不会静默截断');
  const beatIds = new Set<string>();
  const beats = data.beats.map((beat): DirectorBeat => {
    if (!beat || typeof beat.id !== 'string' || !beat.id || beatIds.has(beat.id) || !['T2V', 'I2V', 'FL2VA', 'Ref2VA'].includes(beat.mode) || typeof beat.prompt !== 'string' || typeof beat.summary !== 'string' || typeof beat.title !== 'string') throw new Error('分镜 ID、模式或描述无效');
    beatIds.add(beat.id);
    if (typeof beat.sourceText !== 'string' || !beat.sourceText.trim() || !script.includes(beat.sourceText)) throw new Error(`Beat ${beat.id} 的 sourceText 不是剧本原文，请重新分析`);
    if (!Array.isArray(beat.referenceAssetIds) || beat.referenceAssetIds.some((id) => typeof id !== 'string')) throw new Error(`Beat ${beat.id} 素材引用无效`);
    if (typeof beat.continuityFromPrevious !== 'boolean' || typeof beat.modeReason !== 'string' || typeof beat.scene !== 'string' || typeof beat.startState !== 'string' || typeof beat.endState !== 'string' || !Array.isArray(beat.reviewNotes) || beat.reviewNotes.some((note) => typeof note !== 'string')) throw new Error(`Beat ${beat.id} 缺少模式理由或连续性分析`);
    const duration = normalizeBeatDuration(beat.duration);
    return { ...beat, duration, status: ['ready', 'review', 'draft'].includes(beat.status) ? beat.status : 'review', reviewNotes: [...beat.reviewNotes, ...(duration !== beat.duration ? ['模型时长格式已规范化，请检查表演是否能完成'] : [])] };
  });
  const assetIds = new Set<string>();
  const referenceAssets = data.referenceAssets.map((asset): ReferenceAssetSpec => {
    if (!asset || typeof asset.id !== 'string' || !asset.id || assetIds.has(asset.id) || !['identity', 'location', 'prop', 'costume', 'body_state', 'first_frame', 'last_frame'].includes(asset.kind) || typeof asset.prompt !== 'string' || typeof asset.title !== 'string' || !Array.isArray(asset.sourceAssetIds) || asset.sourceAssetIds.some((id) => typeof id !== 'string')) throw new Error('素材 ID、类型或继承关系无效');
    assetIds.add(asset.id);
    return asset;
  });
  const visiting = new Set<string>(); const visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error(`素材继承出现循环：${id}`);
    if (visited.has(id)) return;
    const asset = referenceAssets.find((asset) => asset.id === id);
    if (!asset) throw new Error(`素材继承引用不存在：${id}`);
    visiting.add(id); for (const source of asset.sourceAssetIds || []) visit(source); visiting.delete(id); visited.add(id);
  }
  referenceAssets.forEach((asset) => visit(asset.id));
  return { projectTitle: data.projectTitle, characters: data.characters!, spaces: data.spaces!, conflicts: data.conflicts!, beats, referenceAssets, source: 'ai' };
}

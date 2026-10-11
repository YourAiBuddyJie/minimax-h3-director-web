import type { DirectorBeat } from './director.ts';
import type { DirectorOptions } from './director-timeline.ts';
export type SegmentConfig = { workflow?: DirectorBeat['mode']; referenceAssetIds?: string[]; keyframeId?: string; endKeyframeId?: string; acceleration?: 'standard' | 'turbo8'; steps?: number; promptOverride?: string };
export function checkpointBeat(beat: DirectorBeat, previousFrameId: string | undefined, config: SegmentConfig, constraints: string, style: string): DirectorBeat {
  const authoredMode = beat.promptWorkflow || beat.mode;
  if ((config.workflow || beat.mode) !== authoredMode) throw new Error(`${beat.id} 的提示词按 ${authoredMode} 编写，不能直接用于 ${config.workflow || beat.mode}。请在「02 分镜」切换模式、重写提示词并重新采纳。`);
  if (beat.pipelineVersion===2) {
    const ids=config.referenceAssetIds||beat.referenceAssetIds||[];
    if (!ids.length||ids.length>9) throw new Error('多参考请选择1–9张已采用参考图');
    if (constraints.trim()||style.trim()||config.promptOverride?.trim()) throw new Error('新版提示词请统一在03提示词修改并采纳，不能在生成阶段叠加旧约束');
    return {...beat,mode:'Ref2VA',continuityFromPrevious:false,referenceAssetIds:ids};
  }
  const result = resolveCheckpointBeat(beat, previousFrameId, config, constraints, style);
  if (result.mode !== authoredMode) throw new Error(`${beat.id} 的素材配置将工作流改为 ${result.mode}，但提示词属于 ${authoredMode}。请在「02 分镜」重写并重新采纳。`);
  return result;
}
function resolveCheckpointBeat(beat: DirectorBeat, previousFrameId: string | undefined, config: SegmentConfig, constraints: string, style: string): DirectorBeat {
  const result = { ...beat, visualStyle: style.trim() || beat.visualStyle, prompt: [config.promptOverride?.trim() || beat.prompt, constraints.trim() ? `Continuity requirements for the entire shot: ${constraints.trim()}` : ''].filter(Boolean).join('\n') };
  if (config.workflow === 'Ref2VA') {
    const ids = config.referenceAssetIds || (beat.mode === 'Ref2VA' ? beat.referenceAssetIds : []) || [];
    if (!ids.length || ids.length > 9) throw new Error('多图参考请选择 1–9 张已采用参考图');
    return { ...result, mode: 'Ref2VA', continuityFromPrevious: false, referenceAssetIds: ids };
  }
  if (config.workflow === 'T2V') return { ...result, mode: 'T2V', continuityFromPrevious: false, referenceAssetIds: [] };
  if (config.workflow === 'I2V' || config.workflow === 'FL2VA' || (!config.workflow && beat.mode === 'I2V')) {
    const opening = config.keyframeId || (beat.continuityFromPrevious ? previousFrameId : beat.referenceAssetIds?.[0]);
    if (!opening) throw new Error('请选择完整首帧参考图');
    if (config.workflow === 'I2V' || (!config.workflow && beat.mode === 'I2V')) return { ...result, mode: 'I2V', continuityFromPrevious: false, referenceAssetIds: [opening] };
    const ending = config.endKeyframeId || (beat.mode === 'FL2VA' ? beat.referenceAssetIds?.[1] : undefined);
    if (!ending) throw new Error('首尾帧工作流需要选择尾帧参考图');
    return { ...result, mode: 'FL2VA', continuityFromPrevious: false, referenceAssetIds: [opening, ending] };
  }
  if (config.endKeyframeId) {
    const opening = config.keyframeId || (beat.continuityFromPrevious ? previousFrameId : beat.referenceAssetIds?.[0]);
    if (!opening) throw new Error('首尾帧纠偏需要正确的完整首帧');
    return { ...result, mode: 'FL2VA', continuityFromPrevious: false, referenceAssetIds: [opening, config.endKeyframeId] };
  }
  if (config.keyframeId) return { ...result, mode: 'I2V', continuityFromPrevious: false, referenceAssetIds: [config.keyframeId] };
  if (beat.continuityFromPrevious) {
    if (!previousFrameId) throw new Error('上一段必须通过验收并保存末帧，才能继续');
    return { ...result, mode: 'I2V', continuityFromPrevious: false, referenceAssetIds: [previousFrameId] };
  }
  return result;
}
export function checkpointOptions(options: DirectorOptions, config: SegmentConfig, index: number): DirectorOptions {
  return { ...options, acceleration: config.acceleration || options.acceleration, steps: config.steps ?? options.steps, seed: options.seed + index, checkpoint: true, label: `${options.label}-beat-${index + 1}` };
}
export function canJoinSegments(segments: Array<{ status: string; qc?: string }>, count: number) {
  return count > 0 && segments.length === count && segments.every((segment) => segment.status === 'completed' && segment.qc === 'passed');
}

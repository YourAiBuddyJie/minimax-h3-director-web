import type { DirectorBeat } from './director.ts';
import type { DirectorOptions } from './director-timeline.ts';
export type SegmentConfig = { keyframeId?: string; acceleration?: 'standard' | 'turbo8'; steps?: number };
export function checkpointBeat(beat: DirectorBeat, previousFrameId: string | undefined, config: SegmentConfig, constraints: string, style: string): DirectorBeat {
  const result = { ...beat, visualStyle: style.trim(), prompt: [beat.prompt, constraints.trim() ? `Continuity requirements for the entire shot: ${constraints.trim()}` : ''].filter(Boolean).join('\n') };
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

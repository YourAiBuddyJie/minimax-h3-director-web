import type { DirectorBeat } from './director.ts';
import { reviewBeat } from './director-review.ts';

// Image selection happens after storyboard review and does not alter the approved story.
export function storyboardSignature(beat: DirectorBeat): string {
  if (beat.pipelineVersion === 2) return JSON.stringify([beat.id,beat.title,beat.summary,beat.sourceText,beat.scene,Number.parseFloat(beat.duration),beat.startState,beat.endState,beat.reviewNotes || []]);
  return JSON.stringify([beat.id, beat.title, beat.summary, beat.sourceText || '', beat.scene || '', Number.parseFloat(beat.duration) || beat.duration,
    beat.mode, Boolean(beat.continuityFromPrevious), beat.startState || '', beat.endState || '',
    beat.prompt, beat.modeReason || '', beat.visualStyle || '', beat.reviewNotes || []]);
}

export function isStoryboardApproved(beat: DirectorBeat): boolean {
  if (beat.pipelineVersion !== 2 && beat.promptWorkflow && beat.promptWorkflow !== beat.mode) return false;
  return Boolean(beat.storyboardApproval && beat.storyboardApproval === storyboardSignature(beat));
}

export function withoutStoryboardApproval(beat: DirectorBeat): DirectorBeat {
  const { storyboardApproval: _approval, ...content } = beat;
  return content;
}

export function storyboardBlockReason(beats: DirectorBeat[]): string {
  const missing = beats.filter((beat) => !isStoryboardApproved(beat));
  const promptMissing=beats.filter(beat=>beat.pipelineVersion===2&&!isPromptApproved(beat));
  if (!missing.length && promptMissing.length) return `请等待「03 提示词」生成完成或修正提示词：${promptMissing.map(b=>b.id).join('、')}`;
  return missing.length ? `请先在「02 分镜」采纳：${missing.map((beat) => beat.id).join('、')}` : '';
}

export function storyboardPromptBlockReason(beat: DirectorBeat, override?: string): string {
  return override?.trim() && override.trim() !== beat.prompt.trim()
    ? `${beat.id} 有未采纳的旧重做描述，请先沿用已采纳分镜提示词；修改描述请到「02 分镜」确认并重新采纳。`
    : '';
}

export function promptSignature(beat: DirectorBeat): string { return JSON.stringify([storyboardSignature(beat),beat.mode,beat.prompt,beat.promptWorkflow]); }
export function isPromptApproved(beat: DirectorBeat): boolean { return beat.pipelineVersion!==2 || Boolean(isStoryboardApproved(beat)&&beat.prompt?.trim()&&beat.mode==='Ref2VA'&&beat.promptWorkflow==='Ref2VA'&&beat.promptStorySignature===storyboardSignature(beat)&&!reviewBeat(beat).some(issue=>issue.severity==='error')); }

import type { ReferenceAssetSpec } from './director';

// Adapted from Qwen's 2.1 PE-T2I / PE-I2I guidance. No image inspection or PE model call is implied.
export const qwenImagePromptInstruction = `本地 Qwen Image 2.1 图片提示词按任务分别编写。无参考图的身份和场景母版：prompt 用中文单段描述完成后的静态画面，先说明媒介、主体与背景，再说明数量、空间位置、姿态、视线、服装颜色材质、道具状态和光源方向；保留剧本指定细节，不堆叠 masterpiece、8K 等质量词。不把分辨率或比例写进 prompt，它们由 width/height 传递。有 sourceAssetIds 的派生图：prompt 用中文单段写明确可执行的编辑目标、最终可见状态及未编辑内容的保留范围；不要重新用文字设计参考人物的五官。具体图片编号由提交时按实际输入顺序注入，分析时不预写编号。图片prompt中禁止使用上一帧、上一段、首帧、尾帧或末帧作为模型指令，也不写本Beat或时间轴；统一称参考图，明确最终可见状态与保留范围。首尾帧职责只放kind/title/sourceAssetIds元数据，提交时按实际图片顺序标注参考图1、参考图2。不声称已看过输入图。图片只表达一个静止时刻，不能写对白、声音或先后动作过程。新增人物、换装、机位变化若为目标，不得同时要求这些属性不变。可见文字只有剧本要求时才添加，原文用双引号逐字保留。单画面定妆、首尾状态连续等属于项目制作要求，不是模型官方限制。`;

/** Image models receive pictures, not the director's timeline or frame metadata. */
export function normalizeImageReferenceLanguage(prompt: string): string {
  return prompt
    .replace(/(?:本\s*Beat|本段|该段|上一段|上段|前一段|前段|上一|前一|上一个|前一个)?\s*(?:首尾帧|首帧|尾帧|末帧|结束帧|起始帧)/gi, '参考图')
    .replace(/(?:上一帧|前一帧)/g, '参考图')
    .replace(/\b(?:previous|preceding|prior|first|last|final|opening|ending)[ -]+frame\b/gi, 'reference image')
    .replace(/作为参考图视频的字面参考图[。；]?/g, '')
    .trim();
}

export function orderImageSources<T extends Pick<ReferenceAssetSpec, 'kind'>>(sources: T[]): T[] {
  const priority = (source: T) => ['first_frame', 'last_frame', 'body_state', 'costume'].includes(source.kind) ? 0 : source.kind === 'identity' ? 1 : source.kind === 'location' ? 2 : 3;
  return [...sources].sort((a, b) => priority(a) - priority(b));
}

export function buildQwenImagePrompt(asset: Pick<ReferenceAssetSpec, 'kind' | 'prompt'>, sources: Pick<ReferenceAssetSpec, 'kind' | 'title'>[], modelTags = true): string {
  const prompt = normalizeImageReferenceLanguage(asset.prompt);
  if (!prompt) throw new Error('图片提示词不能为空');
  if (sources.length > 10) throw new Error('Qwen Image 2.1 最多支持 10 张参考图');
  if (!sources.length) return prompt;
  const tag = (i: number) => `参考图${i + 1}${modelTags ? sources.length === 1 ? '（输入图像）' : `（<image${i + 1}>）` : ''}`;
  const canvas = sources[0];
  const stateCanvas = ['first_frame', 'last_frame', 'body_state', 'costume'].includes(canvas.kind);
  const roles = sources.map((source, i) => {
    const role = source.kind === 'identity' ? '人物身份来源，继承该角色的面部身份；服装按本次目标决定' : source.kind === 'location' ? '场景来源，继承空间地标、材质与光线，按目标放置人物和道具' : source.kind === 'prop' ? '道具来源，继承道具外形与材质，位置和开合状态按目标决定' : '已有画面或状态来源，目标之外的可见内容保持一致';
    return `${tag(i)}：${normalizeImageReferenceLanguage(source.title)}，${role}`;
  }).join('；');
  const preservation = stateCanvas
    ? `以${tag(0)}为编辑画布，执行本次指定变化，保留未涉及的构图、空间与人物身份；目标明确要求变化的姿态、服装或道具状态以目标为准。`
    : canvas.kind === 'location'
      ? `以${tag(0)}的空间为基础合成目标画面，添加目标中明确要求的角色与道具；场景母版中的空场景不约束最终人物数量。`
      : '参考图提供身份或道具素材，按目标组成新画面，不沿用身份定妆照的站位与背景。';
  return `编辑目标：${prompt.replace(/\s*\n\s*/g, ' ')} 参考职责：${roles}。${preservation}`;
}

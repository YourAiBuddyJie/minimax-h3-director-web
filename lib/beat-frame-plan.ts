import type { DirectorBeat, ReferenceAssetSpec } from './director.ts';
export function planBeatFrames(beats: DirectorBeat[], assets: ReferenceAssetSpec[], _world: string) {
  assets = assets.map((asset) => ({ ...asset, sourceAssetIds: [...(asset.sourceAssetIds || [])] }));
  const added: ReferenceAssetSpec[] = [];
  const bindings: Record<string, { keyframeId: string; endKeyframeId: string }> = {};
  const masters = assets.filter((a) => ['identity', 'location', 'costume'].includes(a.kind)).map((a) => a.id);
  let previousEnd = '';
  for (const [index, beat] of beats.entries()) {
    const existingFirst = assets.find((a) => a.beatId === beat.id && a.kind === 'first_frame');
    const existingLast = assets.find((a) => a.beatId === beat.id && a.kind === 'last_frame');
    const firstId = index > 0 && beat.continuityFromPrevious ? previousEnd : existingFirst?.id || `planned-${beat.id}-first`;
    const lastId = existingLast?.id || `planned-${beat.id}-last`;
    // Generated model prompts remain beat-specific; normalize only their actual canvas dependency.
    if (existingLast) existingLast.sourceAssetIds = [firstId, ...(existingLast.sourceAssetIds || []).filter((id) => id !== firstId && !assets.some((a) => a.id === id && ['first_frame', 'last_frame'].includes(a.kind)))];
    const base = `单张完整连续画面，人物各出现一次。画风：${beat.visualStyle || '严格继承采用的参考图画风'}。场景：${beat.scene || '继承参考图场景'}。保持基准图人物身份、服装颜色和形制、场景地标、机位、轴线与构图。不增加人物，无文字、字幕。只表现一个静止时刻，不画分镜拼图、网格或多视图。`;
    if (!assets.some((a) => a.id === firstId) && !added.some((a) => a.id === firstId)) added.push({ id: firstId, beatId: beat.id, kind: 'first_frame', title: `${beat.id} · 计划首帧`, width: existingFirst?.width || 768, height: existingFirst?.height || 1344, promptVersion: 3, sourceAssetIds: masters, negativePrompt: '拼图，字幕，人物变形，服装变化，场景变化', prompt: `${base} 当前段开始状态：${beat.startState || beat.summary}。` });
    if (!existingLast) added.push({ id: lastId, beatId: beat.id, kind: 'last_frame', title: `${beat.id} · 计划尾帧${beats[index + 1]?.continuityFromPrevious ? ' / 下一段首帧' : ''}`, width: existingFirst?.width || 768, height: existingFirst?.height || 1344, promptVersion: 4, sourceAssetIds: [firstId], negativePrompt: '拼图，网格，多视图，字幕，重复人物，人物变形，服装变化，场景变化', prompt: `${base} 以参考图中的完整画面为基础编辑，保留未涉及的内容。最终可见状态：${beat.endState || beat.summary}。只调整本段要求的表情、视线、姿态与道具状态。` });
    bindings[beat.id] = { keyframeId: firstId, endKeyframeId: lastId };
    previousEnd = lastId;
  }
  return { added, bindings, assets };
}

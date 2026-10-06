import type { ApiWorkflow } from './comfy.ts';

export type NodeInfo = { input?: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> } };
export function checkDirectorEnvironment(workflow: ApiWorkflow, info: Record<string, NodeInfo>) {
  const needsRefs = Object.values(workflow).some((node) => node.inputs?.ref_model);
  const required = ['MiniMaxH3Director', 'MiniMaxH3ImageToVideo', 'MiniMaxH3Join', 'MiniMaxH3FreeMemory', 'UNETLoader', 'CLIPLoader', 'VAELoader', 'BasicGuider', 'BasicScheduler', 'RandomNoise', 'KSamplerSelect', 'SamplerCustomAdvanced', 'VAEDecode', 'VAEDecodeAudio', 'ImageFromBatch', 'ImageScale', 'SaveVideo'];
  if (needsRefs) required.push('MiniMaxH3ReferenceToVideo');
  if (Object.values(workflow).some((node) => node.class_type === 'LoraLoaderModelOnly')) required.push('LoraLoaderModelOnly');
  const missing = required.filter((name) => !info[name]);
  if (needsRefs && !info.MiniMaxH3DirectorWeb) missing.push('MiniMaxH3DirectorWeb（安装网页独立适配节点后重启8189）');
  for (const node of Object.values(workflow)) {
    for (const key of ['unet_name', 'clip_name', 'vae_name', 'lora_name']) {
      const file = node.inputs?.[key];
      if (typeof file !== 'string') continue;
      const choices = info[node.class_type || '']?.input?.required?.[key]?.[0];
      if (!Array.isArray(choices) || !choices.includes(file)) missing.push(file);
    }
  }
  const directorInputs = { ...info.MiniMaxH3Director?.input?.required, ...info.MiniMaxH3Director?.input?.optional };
  for (const input of ['timeline_json', 'model', 'audio_vae', 'continuity', 'vram_staging']) if (!directorInputs[input]) missing.push(`Director 接口 ${input}（需要新版）`);
  if (needsRefs) {
    if (!directorInputs.ref_model) missing.push('Director ref_model 接口');
    const refInputs = { ...info.MiniMaxH3ReferenceToVideo?.input?.required, ...info.MiniMaxH3ReferenceToVideo?.input?.optional };
    const slots = Object.keys(refInputs).filter((name) => /^(?:image|ref_image|reference|ref)_?\d+$/.test(name));
    // The installed Director dynamically binds native reference slots; do not truncate silently.
    const timelineText = workflow['5']?.inputs?.timeline_json;
    const timeline = JSON.parse(typeof timelineText === 'string' ? timelineText : '{}') as { clips?: Array<{ media?: { refs?: unknown[] } }> };
    const maxRefs = Math.max(0, ...(timeline.clips || []).map((clip) => clip.media?.refs?.length || 0));
    const listBinding = Object.keys(refInputs).some((name) => ['references', 'ref_images', 'reference_images', 'images'].includes(name));
    if (!listBinding && (!slots.length || maxRefs > slots.length)) missing.push(`原生多图节点仅提供 ${slots.length} 个图片槽位，当前需要 ${maxRefs} 个`);
  }
  const resolutionChoices = directorInputs.resolution?.[0];
  if (Array.isArray(resolutionChoices)) {
    const requested = Number.parseFloat(String(workflow['5']?.inputs?.resolution));
    const choice = resolutionChoices.find((value) => typeof value === 'string' && Number.parseFloat(value) === requested);
    if (choice) workflow['5'].inputs!.resolution = choice;
    else missing.push(`Director 分辨率 ${requested} MP`);
  }
  return [...new Set(missing)];
}

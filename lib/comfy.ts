import { h3Timing } from './director-timeline.ts';
export type ApiWorkflow = Record<string, { class_type?: string; inputs?: Record<string, unknown>; _meta?: Record<string, unknown> }>;

export function localComfyBase(value: string) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('本地版只允许 localhost ComfyUI');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('ComfyUI 地址协议无效');
  return url;
}

function safePrefix(value: string) { return value.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 80) || 'beat'; }

export function normalizeImageCanvas(width: number, height: number) {
  let safeWidth = Number.isFinite(width) && width > 0 ? width : 768;
  let safeHeight = Number.isFinite(height) && height > 0 ? height : 1344;
  const scale = Math.min(1536 / Math.max(safeWidth, safeHeight), Math.max(512 / Math.min(safeWidth, safeHeight), 1));
  safeWidth *= scale;
  safeHeight *= scale;
  const round32 = (value: number) => Math.min(1536, Math.max(512, Math.round(value / 32) * 32));
  return { width: round32(safeWidth), height: round32(safeHeight) };
}

export function prepareWorkflow(source: ApiWorkflow, options: { prompt: string; duration: number; steps: number; seed: number; megapixels: number; aspect: string; label: string; images?: string[] }) {
  const workflow = structuredClone(source);
  let promptTargets = 0;
  let saveTargets = 0;
  let imageIndex = 0;
  for (const node of Object.values(workflow)) {
    const inputs = node.inputs ?? (node.inputs = {});
    if (node.class_type === 'PrimitiveStringMultiline' && typeof inputs.value === 'string') { inputs.value = options.prompt; promptTargets++; }
    if (['MiniMaxH3ImageToVideo', 'MiniMaxH3ReferenceToVideo'].includes(node.class_type ?? '') && typeof inputs.prompt === 'string') { inputs.prompt = options.prompt; promptTargets++; }
    if (node.class_type === 'PrimitiveFloat' && typeof inputs.value === 'number' && inputs.value >= 4 && inputs.value <= 15) inputs.value = options.duration;
    if (['MiniMaxH3ImageToVideo', 'MiniMaxH3ReferenceToVideo'].includes(node.class_type ?? '') && typeof inputs.length === 'number') inputs.length = h3Timing(options.duration).frames;
    if (node.class_type === 'BasicScheduler') inputs.steps = options.steps;
    if (node.class_type === 'RandomNoise') inputs.noise_seed = options.seed;
    if (node.class_type === 'ResolutionSelector') { inputs.megapixels = options.megapixels; inputs.aspect_ratio = options.aspect; inputs.multiple = 32; }
    if (node.class_type === 'LoadImage' && options.images?.[imageIndex]) inputs.image = options.images[imageIndex++];
    if (node.class_type === 'SaveVideo') { inputs.filename_prefix = `h3-director-web/${safePrefix(options.label)}`; saveTargets++; }
  }
  if (!promptTargets) throw new Error('工作流中未找到可注入的 H3 提示词节点');
  if (!saveTargets) throw new Error('工作流中未找到 SaveVideo 节点');
  return workflow;
}

// Based on Comfy-Org Qwen Image 2.1 native templates (2026-09-23).
export function prepareQwen21Workflow(options: { prompt: string; negativePrompt?: string; width: number; height: number; steps: number; seed: number; label: string; images?: string[] }) {
  const images = options.images || [];
  if (images.length > 10) throw new Error('Qwen Image 2.1 最多支持 10 张参考图，请精简素材绑定');
  if (!Number.isInteger(options.steps) || options.steps < 1 || options.steps > 50) throw new Error('生图步数必须为 1–50');
  const canvas = normalizeImageCanvas(options.width, options.height);
  const workflow: ApiWorkflow = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_2.1_int8_convrot.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_8b_int8_convrot.safetensors', type: 'qwen_image', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' } },
    '4': { class_type: 'QwenImage21Cache', inputs: { model: ['1', 0], device: 'auto', dtype: 'default' } },
    '5': { class_type: 'TextEncodeQwenImage21', inputs: { clip: ['2', 0], vae: ['3', 0], prompt: options.prompt + (options.negativePrompt ? `\n画面约束：避免${options.negativePrompt}` : ''), negative_prompt: options.negativePrompt || '', resolution: 1024 } },
    '6': { class_type: 'EmptyLatentImage', inputs: { ...canvas, batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { model: ['4', 0], seed: options.seed, steps: options.steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', positive: ['5', 0], negative: ['5', 1], latent_image: images.length ? ['5', 2] : ['6', 0], denoise: 1 } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: `h3-director-web/assets/${safePrefix(options.label)}`, images: ['8', 0] } },
  };
  images.forEach((image, index) => {
    const id = String(20 + index);
    workflow[id] = { class_type: 'LoadImage', inputs: { image } };
    workflow['5'].inputs![`images.image_${index + 1}`] = [id, 0];
  });
  if (images.length) delete workflow['6'];
  return workflow;
}

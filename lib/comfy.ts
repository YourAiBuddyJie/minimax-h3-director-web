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
    if (['MiniMaxH3ImageToVideo', 'MiniMaxH3ReferenceToVideo'].includes(node.class_type ?? '') && typeof inputs.length === 'number') inputs.length = Math.round(options.duration * 24) + 4;
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

export function prepareImageWorkflow(source: ApiWorkflow, options: { prompt: string; negativePrompt: string; width: number; height: number; steps: number; seed: number; label: string }) {
  const workflow = structuredClone(source);
  const canvas = normalizeImageCanvas(options.width, options.height);
  let positiveId = '';
  let negativeId = '';
  let saveTargets = 0;
  for (const node of Object.values(workflow)) {
    if (node.class_type !== 'KSampler') continue;
    const positive = node.inputs?.positive;
    const negative = node.inputs?.negative;
    if (Array.isArray(positive) && typeof positive[0] === 'string') positiveId = positive[0];
    if (Array.isArray(negative) && typeof negative[0] === 'string') negativeId = negative[0];
    if (node.inputs) { node.inputs.seed = options.seed; node.inputs.steps = options.steps; }
  }
  for (const [id, node] of Object.entries(workflow)) {
    const inputs = node.inputs ?? (node.inputs = {});
    if (node.class_type === 'CLIPTextEncode' && id === positiveId) inputs.text = options.prompt;
    if (node.class_type === 'CLIPTextEncode' && id === negativeId) inputs.text = options.negativePrompt;
    if (node.class_type === 'EmptySD3LatentImage') { inputs.width = canvas.width; inputs.height = canvas.height; inputs.batch_size = 1; }
    if (node.class_type === 'SaveImage') { inputs.filename_prefix = `h3-director-web/assets/${safePrefix(options.label)}`; saveTargets++; }
  }
  if (!positiveId || !negativeId) throw new Error('生图工作流中未找到正向与负向提示词连接');
  if (!saveTargets) throw new Error('生图工作流中未找到 SaveImage 节点');
  return workflow;
}

export function prepareFlux2ImageEdit(options: { prompt: string; width: number; height: number; seed: number; label: string; images: string[] }) {
  if (!options.images.length || options.images.length > 3) throw new Error('FLUX.2 图生图需要 1–3 张参考图');
  const canvas = normalizeImageCanvas(options.width, options.height);
  const workflow: ApiWorkflow = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'flux-2-klein-4b-fp8.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b_fp4_mixed.safetensors', type: 'flux2', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'flux2-vae.safetensors' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: options.prompt } },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': { class_type: 'EmptyFlux2LatentImage', inputs: { width: canvas.width, height: canvas.height, batch_size: 1 } },
    '7': { class_type: 'Flux2Scheduler', inputs: { steps: 4, width: canvas.width, height: canvas.height } },
    '8': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '9': { class_type: 'RandomNoise', inputs: { noise_seed: options.seed } },
  };
  let positive: unknown = ['4', 0];
  let negative: unknown = ['5', 0];
  options.images.forEach((image, index) => {
    const load = String(20 + index);
    const scale = String(30 + index);
    const encode = String(40 + index);
    const positiveRef = String(50 + index);
    const negativeRef = String(60 + index);
    workflow[load] = { class_type: 'LoadImage', inputs: { image } };
    workflow[scale] = { class_type: 'ImageScaleToTotalPixels', inputs: { image: [load, 0], upscale_method: 'nearest-exact', megapixels: 1, resolution_steps: 1 } };
    workflow[encode] = { class_type: 'VAEEncode', inputs: { pixels: [scale, 0], vae: ['3', 0] } };
    workflow[positiveRef] = { class_type: 'ReferenceLatent', inputs: { conditioning: positive, latent: [encode, 0] } };
    workflow[negativeRef] = { class_type: 'ReferenceLatent', inputs: { conditioning: negative, latent: [encode, 0] } };
    positive = [positiveRef, 0];
    negative = [negativeRef, 0];
  });
  workflow['10'] = { class_type: 'CFGGuider', inputs: { model: ['1', 0], positive, negative, cfg: 1 } };
  workflow['11'] = { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['9', 0], guider: ['10', 0], sampler: ['8', 0], sigmas: ['7', 0], latent_image: ['6', 0] } };
  workflow['12'] = { class_type: 'VAEDecode', inputs: { samples: ['11', 0], vae: ['3', 0] } };
  workflow['13'] = { class_type: 'SaveImage', inputs: { filename_prefix: `h3-director-web/assets/${safePrefix(options.label)}`, images: ['12', 0] } };
  return workflow;
}

export function prepareQwenImageEdit(options: { prompt: string; negativePrompt: string; seed: number; label: string; images: string[]; steps?: number }) {
  if (!options.images.length || options.images.length > 3) throw new Error('Qwen 图生图需要 1–3 张参考图');
  const workflow: ApiWorkflow = {
    '1': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'qwen-image-edit-2511-Q4_K_M.gguf' } },
    '6': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', strength_model: 1 } },
    '2': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['6', 0], shift: 3.1 } },
    '3': { class_type: 'CFGNorm', inputs: { model: ['2', 0], strength: 1, pre_cfg: false } },
    '4': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' } },
    '5': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
    '20': { class_type: 'LoadImage', inputs: { image: options.images[0] } },
    '30': { class_type: 'FluxKontextImageScale', inputs: { image: ['20', 0] } },
    '31': { class_type: 'VAEEncode', inputs: { pixels: ['30', 0], vae: ['5', 0] } },
  };
  const referenceInputs: Record<string, unknown> = { clip: ['4', 0], vae: ['5', 0], image1: ['30', 0] };
  options.images.slice(1).forEach((image, index) => {
    const id = String(21 + index);
    workflow[id] = { class_type: 'LoadImage', inputs: { image } };
    referenceInputs[`image${index + 2}`] = [id, 0];
  });
  workflow['40'] = { class_type: 'TextEncodeQwenImageEditPlus', inputs: { ...referenceInputs, prompt: options.prompt } };
  workflow['41'] = { class_type: 'TextEncodeQwenImageEditPlus', inputs: { ...referenceInputs, prompt: options.negativePrompt || '低质量，身份漂移，错误肢体，多余手指，现代服装，文字，水印' } };
  workflow['42'] = { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['40', 0], reference_latents_method: 'index_timestep_zero' } };
  workflow['43'] = { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['41', 0], reference_latents_method: 'index_timestep_zero' } };
  workflow['50'] = { class_type: 'KSampler', inputs: { model: ['3', 0], seed: options.seed, steps: options.steps ?? 4, cfg: 4, sampler_name: 'euler', scheduler: 'simple', positive: ['42', 0], negative: ['43', 0], latent_image: ['31', 0], denoise: 1 } };
  workflow['60'] = { class_type: 'VAEDecode', inputs: { samples: ['50', 0], vae: ['5', 0] } };
  workflow['61'] = { class_type: 'SaveImage', inputs: { filename_prefix: `h3-director-web/assets/${safePrefix(options.label)}`, images: ['60', 0] } };
  return workflow;
}

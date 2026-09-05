export type ApiWorkflow = Record<string, { class_type?: string; inputs?: Record<string, unknown>; _meta?: Record<string, unknown> }>;

export function localComfyBase(value: string) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('本地版只允许 localhost ComfyUI');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('ComfyUI 地址协议无效');
  return url;
}

function safePrefix(value: string) { return value.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 80) || 'beat'; }

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

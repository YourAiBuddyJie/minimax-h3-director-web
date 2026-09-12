export type WorkflowMode = 'T2V' | 'Ref2VA' | 'FL2VA' | 'IMAGE_T2I' | 'IMAGE_EDIT';

export type BuiltInWorkflow = {
  id: string;
  mode: WorkflowMode;
  name: string;
  description: string;
  file: string;
  requiredImages: number;
  imageLabel: string;
  requiredNodes: string[];
  requiredModels: Array<{ classType: string; input: string; filename: string }>;
};

export const builtInWorkflows: BuiltInWorkflow[] = [
  {
    id: 'h3-t2v',
    mode: 'T2V',
    name: 'H3 文生视频',
    description: '纯文本生成，不需要参考图。',
    file: '/workflows/h3-t2v.json',
    requiredImages: 0,
    imageLabel: '无需参考图',
    requiredNodes: ['MiniMaxH3ImageToVideo', 'MiniMaxH3TurboSampler', 'MiniMaxH3TurboLoRA'],
    requiredModels: [
      { classType: 'UNETLoader', input: 'unet_name', filename: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors' },
      { classType: 'CLIPLoader', input: 'clip_name', filename: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors' },
      { classType: 'VAELoader', input: 'vae_name', filename: 'minimax_h3_video_vae_fp16.safetensors' },
      { classType: 'VAELoader', input: 'vae_name', filename: 'minimax_h3_audio_vae_fp32.safetensors' },
      { classType: 'MiniMaxH3TurboLoRA', input: 'lora_name', filename: 'minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors' },
    ],
  },
  {
    id: 'h3-ref2va',
    mode: 'Ref2VA',
    name: 'H3 多参考图视频',
    description: '使用两张角色、场景或道具参考图保持一致性。',
    file: '/workflows/h3-ref2va.json',
    requiredImages: 2,
    imageLabel: '选择 2 张参考图',
    requiredNodes: ['MiniMaxH3ReferenceToVideo', 'LoraLoaderBypassModelOnly'],
    requiredModels: [
      { classType: 'UNETLoader', input: 'unet_name', filename: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors' },
      { classType: 'CLIPLoader', input: 'clip_name', filename: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors' },
      { classType: 'VAELoader', input: 'vae_name', filename: 'minimax_h3_video_vae_fp16.safetensors' },
      { classType: 'VAELoader', input: 'vae_name', filename: 'minimax_h3_audio_vae_fp32.safetensors' },
      { classType: 'LoraLoaderBypassModelOnly', input: 'lora_name', filename: 'minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors' },
    ],
  },
  {
    id: 'h3-fl2va',
    mode: 'FL2VA',
    name: 'H3 首尾帧视频',
    description: '用两张图分别锁定开场与结尾状态，适合道具或身体状态变化。',
    file: '/workflows/h3-fl2va.json',
    requiredImages: 2,
    imageLabel: '依次选择首帧、尾帧',
    requiredNodes: ['MiniMaxH3ImageToVideo', 'ImageScale'],
    requiredModels: [
      { classType: 'UNETLoader', input: 'unet_name', filename: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors' },
      { classType: 'CLIPLoader', input: 'clip_name', filename: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors' },
      { classType: 'VAELoader', input: 'vae_name', filename: 'minimax_h3_video_vae_fp16.safetensors' },
      { classType: 'VAELoader', input: 'vae_name', filename: 'minimax_h3_audio_vae_fp32.safetensors' },
    ],
  },
  {
    id: 'z-image-t2i',
    mode: 'IMAGE_T2I',
    name: 'Z-Image Turbo 参考图',
    description: '本地生成角色、场景、道具、身体状态及首尾帧素材。',
    file: '/workflows/z-image-t2i.json',
    requiredImages: 0,
    imageLabel: '无需输入图片',
    requiredNodes: ['KSampler', 'EmptySD3LatentImage', 'UNETLoader', 'CLIPLoader', 'VAELoader', 'SaveImage'],
    requiredModels: [
      { classType: 'UNETLoader', input: 'unet_name', filename: 'z_image_turbo_nvfp4.safetensors' },
      { classType: 'CLIPLoader', input: 'clip_name', filename: 'qwen_3_4b_fp4_mixed.safetensors' },
      { classType: 'VAELoader', input: 'vae_name', filename: 'ae.safetensors' },
    ],
  },
  {
    id: 'flux2-klein-edit',
    mode: 'IMAGE_EDIT',
    name: 'FLUX.2 Klein 多参考图编辑',
    description: '从已采用的人物、场景或首帧母版派生一致的状态图和首尾帧。',
    file: '/workflows/flux2-klein-edit.json',
    requiredImages: 1,
    imageLabel: '使用 1–3 张已采用母版',
    requiredNodes: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'EmptyFlux2LatentImage', 'Flux2Scheduler', 'ReferenceLatent', 'SamplerCustomAdvanced'],
    requiredModels: [
      { classType: 'UNETLoader', input: 'unet_name', filename: 'flux-2-klein-4b-fp8.safetensors' },
      { classType: 'CLIPLoader', input: 'clip_name', filename: 'qwen_3_4b_fp4_mixed.safetensors' },
      { classType: 'VAELoader', input: 'vae_name', filename: 'flux2-vae.safetensors' },
    ],
  },
  {
    id: 'qwen-edit-2511',
    mode: 'IMAGE_EDIT',
    name: 'Qwen Image Edit 2511 多人物一致性编辑',
    description: '以场景或首帧为主画布，同时融合最多两张人物身份母版，强化多人身份和肢体关系。',
    file: '/workflows/qwen-edit-2511.json',
    requiredImages: 1,
    imageLabel: '使用 1–3 张已采用母版',
    requiredNodes: ['UnetLoaderGGUF', 'LoraLoaderModelOnly', 'TextEncodeQwenImageEditPlus', 'ModelSamplingAuraFlow', 'CFGNorm', 'FluxKontextImageScale', 'FluxKontextMultiReferenceLatentMethod'],
    requiredModels: [
      { classType: 'UnetLoaderGGUF', input: 'unet_name', filename: 'qwen-image-edit-2511-Q4_K_M.gguf' },
      { classType: 'LoraLoaderModelOnly', input: 'lora_name', filename: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors' },
      { classType: 'CLIPLoader', input: 'clip_name', filename: 'qwen_2.5_vl_7b_fp8_scaled.safetensors' },
      { classType: 'VAELoader', input: 'vae_name', filename: 'qwen_image_vae.safetensors' },
    ],
  },
];

export function matchBuiltInWorkflow(mode: string) {
  return builtInWorkflows.find((workflow) => workflow.mode === mode) ?? builtInWorkflows[0];
}

export function getBuiltInWorkflow(id: string | null) {
  return builtInWorkflows.find((workflow) => workflow.id === id);
}

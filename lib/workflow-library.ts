export type WorkflowMode = 'T2V' | 'I2V' | 'Ref2VA' | 'FL2VA' | 'IMAGE_T2I' | 'IMAGE_EDIT';

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
  { id: 'h3-i2v', mode: 'I2V', name: 'H3 单图图生', description: '一张完整首帧规定镜头起点，向后发展动作。', file: '/workflows/h3-i2v.json', requiredImages: 1, imageLabel: '选择一张字面首帧', requiredNodes: ['MiniMaxH3ImageToVideo', 'ImageScale'], requiredModels: [
    { classType: 'UNETLoader', input: 'unet_name', filename: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors' },
    { classType: 'CLIPLoader', input: 'clip_name', filename: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors' },
    { classType: 'VAELoader', input: 'vae_name', filename: 'minimax_h3_video_vae_fp16.safetensors' },
    { classType: 'VAELoader', input: 'vae_name', filename: 'minimax_h3_audio_vae_fp32.safetensors' },
  ] },
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
  { id: 'qwen-image-21-t2i', mode: 'IMAGE_T2I', name: 'Qwen Image 2.1 文生图', description: '统一生成身份、场景和连续分镜素材。', file: '/workflows/qwen-image-21-t2i.json', requiredImages: 0, imageLabel: '无需参考图', requiredNodes: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'QwenImage21Cache', 'TextEncodeQwenImage21', 'KSampler', 'VAEDecode', 'SaveImage', 'EmptyLatentImage'], requiredModels: [
    { classType: 'UNETLoader', input: 'unet_name', filename: 'qwen_image_2.1_int8_convrot.safetensors' },
    { classType: 'CLIPLoader', input: 'clip_name', filename: 'qwen3vl_8b_int8_convrot.safetensors' },
    { classType: 'VAELoader', input: 'vae_name', filename: 'qwen_image_2.1_vae_bf16.safetensors' },
  ] },
  { id: 'qwen-image-21-edit', mode: 'IMAGE_EDIT', name: 'Qwen Image 2.1 多参考图编辑', description: '统一生成身份、场景和连续分镜素材。', file: '/workflows/qwen-image-21-edit.json', requiredImages: 1, imageLabel: '使用 1–10 张已采用素材，第一张为编辑画布', requiredNodes: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'QwenImage21Cache', 'TextEncodeQwenImage21', 'KSampler', 'VAEDecode', 'SaveImage', 'LoadImage'], requiredModels: [
    { classType: 'UNETLoader', input: 'unet_name', filename: 'qwen_image_2.1_int8_convrot.safetensors' },
    { classType: 'CLIPLoader', input: 'clip_name', filename: 'qwen3vl_8b_int8_convrot.safetensors' },
    { classType: 'VAELoader', input: 'vae_name', filename: 'qwen_image_2.1_vae_bf16.safetensors' },
  ] },
];

export function matchBuiltInWorkflow(mode: string) {
  return builtInWorkflows.find((workflow) => workflow.mode === mode) ?? builtInWorkflows.find((workflow) => workflow.mode === 'T2V')!;
}

export function getBuiltInWorkflow(id: string | null) {
  return builtInWorkflows.find((workflow) => workflow.id === id);
}

export type WorkflowMode = 'T2V' | 'Ref2VA' | 'FL2VA';

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
      { classType: 'CLIPLoader', input: 'clip_name', filename: 'qwen3vl_32b_minimax_h3_int8_convrot_uncensored-by-linjian257.safetensors' },
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
];

export function matchBuiltInWorkflow(mode: string) {
  return builtInWorkflows.find((workflow) => workflow.mode === mode) ?? builtInWorkflows[0];
}

export function getBuiltInWorkflow(id: string | null) {
  return builtInWorkflows.find((workflow) => workflow.id === id);
}

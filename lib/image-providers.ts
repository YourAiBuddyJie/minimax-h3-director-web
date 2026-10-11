export type ImageProviderId = 'local' | 'aliyun' | 'volcengine';

export type ImageProviderConfig = {
  provider: ImageProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  enableThinking: boolean;
};

export const imageProviderPresets = {
  local: {
    name: '本地 ComfyUI',
    model: 'Qwen Image 2.1',
    baseUrl: '',
    description: '本地文生图与多参考图编辑统一使用 Qwen Image 2.1，最多 10 张参考图。',
  },
  aliyun: {
    name: '阿里云百炼',
    model: 'qwen-image-3.0-pro',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    description: '线上文生图/图生图，最多同时参考 3 张人物与场景母版。',
  },
  volcengine: {
    name: '火山方舟 Seedream',
    model: 'doubao-seedream-5-0-260128',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    description: 'Seedream 线上文生图与多参考图生图，适合人物、场景和连续分镜。',
  },
} satisfies Record<ImageProviderId, { name: string; model: string; baseUrl: string; description: string }>;

export const defaultImageProviderConfig: ImageProviderConfig = {
  provider: 'local', apiKey: '', model: imageProviderPresets.local.model, baseUrl: '', enableThinking: false,
};

export function isAliyunImageEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'dashscope.aliyuncs.com' || url.hostname.endsWith('.maas.aliyuncs.com')) && url.pathname.endsWith('/api/v1/services/aigc/multimodal-generation/generation');
  } catch { return false; }
}

export function isVolcengineImageEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'ark.cn-beijing.volces.com' && url.pathname === '/api/v3/images/generations';
  } catch { return false; }
}

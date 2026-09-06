export type ProviderId = 'openai' | 'aliyun' | 'doubao' | 'kimi' | 'deepseek';

export type ProviderConfig = {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
};

export type ProviderPreset = Omit<ProviderConfig, 'apiKey'> & {
  name: string;
  keyLabel: string;
  helpUrl: string;
};

export const providerPresets: Record<ProviderId, ProviderPreset> = {
  openai: {
    provider: 'openai', name: 'OpenAI', keyLabel: 'OpenAI API Key',
    model: 'gpt-5.4-mini', baseUrl: 'https://api.openai.com/v1',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  aliyun: {
    provider: 'aliyun', name: '阿里云百炼', keyLabel: 'DashScope API Key',
    model: 'qwen3.8-max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    helpUrl: 'https://bailian.console.aliyun.com/',
  },
  doubao: {
    provider: 'doubao', name: '豆包·火山方舟', keyLabel: 'ARK API Key',
    model: 'doubao-seed-2-0-lite-260215', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    helpUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apikey',
  },
  kimi: {
    provider: 'kimi', name: 'Kimi', keyLabel: 'Moonshot API Key',
    model: 'kimi-k2.6', baseUrl: 'https://api.moonshot.cn/v1',
    helpUrl: 'https://platform.kimi.com/',
  },
  deepseek: {
    provider: 'deepseek', name: 'DeepSeek', keyLabel: 'DeepSeek API Key',
    model: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com',
    helpUrl: 'https://platform.deepseek.com/api_keys',
  },
};

const allowedHosts: Record<ProviderId, (hostname: string) => boolean> = {
  openai: (hostname) => hostname === 'api.openai.com',
  aliyun: (hostname) => hostname === 'dashscope.aliyuncs.com' || hostname === 'dashscope-intl.aliyuncs.com' || hostname.endsWith('.maas.aliyuncs.com'),
  doubao: (hostname) => /^ark\.[a-z0-9-]+\.volces\.com$/.test(hostname),
  kimi: (hostname) => hostname === 'api.moonshot.cn' || hostname === 'api.moonshot.ai',
  deepseek: (hostname) => hostname === 'api.deepseek.com',
};

export function validateProviderConfig(value: unknown): ProviderConfig {
  if (!value || typeof value !== 'object') throw new Error('模型配置无效');
  const candidate = value as Partial<ProviderConfig>;
  if (!candidate.provider || !(candidate.provider in providerPresets)) throw new Error('不支持的模型供应商');
  const apiKey = candidate.apiKey?.trim() || '';
  const model = candidate.model?.trim() || '';
  const baseUrl = candidate.baseUrl?.trim().replace(/\/+$/, '') || '';
  if (!apiKey) throw new Error('请填写 API Key');
  if (!model || model.length > 160) throw new Error('请填写有效的模型名称');
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { throw new Error('接口地址格式无效'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) throw new Error('接口地址必须是受支持的 HTTPS 地址');
  if (!allowedHosts[candidate.provider](parsed.hostname.toLowerCase())) throw new Error('该供应商的接口域名不在安全白名单中');
  return { provider: candidate.provider, apiKey, model, baseUrl };
}

export function providerEndpoint(config: ProviderConfig, kind: 'chat' | 'responses' = 'chat') {
  return `${config.baseUrl}/${kind === 'responses' ? 'responses' : 'chat/completions'}`;
}

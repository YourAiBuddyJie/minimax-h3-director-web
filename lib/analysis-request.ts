export const ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000;

// Cover both waiting for headers and reading the complete JSON body.
export async function analysisRequest<T>(url: string, init: RequestInit, timeoutMs = ANALYSIS_TIMEOUT_MS, label = '剧本分析') {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    const fail = (message: string) => { reject(new Error(message)); controller.abort(); };
    onAbort = () => fail(`已取消${label}，原有结果已保留。`);
    if (init.signal?.aborted) onAbort();
    else init.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => fail(`${label}超过${timeoutMs === ANALYSIS_TIMEOUT_MS ? '5分钟' : `${Math.ceil(timeoutMs / 1000)}秒`}，已停止等待。请检查模型服务或网络后重试；原有结果已保留。`), timeoutMs);
  });
  try {
    if (init.signal?.aborted) return await deadline;
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const data = await response.json().catch((error: unknown) => {
          if (!response.ok) return { error: `模型服务返回 HTTP ${response.status}` };
          throw error;
        }) as T;
        return { response, data };
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) init.signal?.removeEventListener('abort', onAbort);
  }
}

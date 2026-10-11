export type VisualReview = { passed: boolean; confidence: number; identity: boolean; wardrobe: boolean; scene: boolean; composition: boolean; style: boolean; reasons: string[] };
export function parseVisualReview(raw: string): VisualReview {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(text) as VisualReview;
  if (typeof value.passed !== 'boolean' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1 || !['identity', 'wardrobe', 'scene', 'composition', 'style'].every((key) => typeof value[key as keyof VisualReview] === 'boolean') || !Array.isArray(value.reasons) || value.reasons.some((s) => typeof s !== 'string')) throw new Error('视觉模型未返回有效验收结果，暂停自动接续');
  return { ...value, reasons: value.reasons.slice(0, 10).map((reason) => reason.slice(0, 500)), passed: value.passed && value.confidence >= 0.8 && value.identity && value.wardrobe && value.scene && value.composition && value.style };
}

export function decideAutomaticAction(input: { enabled: boolean; busy: boolean; blocked: boolean; next: number; count: number; status?: string; qc?: string; joined: boolean; joinStatus?: string }) {
  if (!input.enabled || input.busy || input.blocked) return 'wait';
  if (input.next >= input.count) {
    if (['error', 'uncertain'].includes(input.joinStatus || '')) return 'stop';
    if (['pending', 'running'].includes(input.joinStatus || '')) return 'wait';
    return input.joinStatus === 'completed' || (!input.joinStatus && input.joined) ? 'done' : 'join';
  }
  if (input.qc === 'failed' || ['error', 'uncertain'].includes(input.status || '')) return 'stop';
  return input.status === 'completed' ? 'inspect' : 'submit';
}

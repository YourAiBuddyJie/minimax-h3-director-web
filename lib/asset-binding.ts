import type { DirectorBeat, ReferenceAssetSpec } from './director.ts';

export type OutputFile = { filename?: string; subfolder?: string; type?: string };
export type AssetTask = ReferenceAssetSpec & {
  status: 'draft' | 'submitting' | 'pending' | 'running' | 'review' | 'approved' | 'error';
  promptId?: string;
  files?: OutputFile[];
  error?: string;
  generator?: 'z-image-t2i' | 'flux2-klein' | 'qwen-edit-2511' | 'hybrid-flux2-qwen2511' | 'aliyun-qwen-image-3' | 'volcengine-seedream';
  imageProvider?: 'project' | 'local' | 'aliyun' | 'volcengine';
  phase?: 'blocking' | 'refining';
  draftFiles?: OutputFile[];
};

export function imageInputPath(file: OutputFile): string {
  const parts = [...(file.subfolder || '').replaceAll('\\', '/').split('/').filter(Boolean), file.filename || ''];
  if (parts.some((part) => !part || part === '..' || part === '.' || [':', '[', ']', '\\', '/'].some((character) => part.includes(character)))) throw new Error('参考图路径无效');
  if (!['output', 'input', 'temp'].includes(file.type || 'output')) throw new Error('参考图目录类型无效');
  return `${parts.join('/')} [${file.type || 'output'}]`;
}

export function resolveBeatAssets(beat: DirectorBeat, assets: AssetTask[]): (AssetTask | undefined)[] {
  if (beat.mode === 'T2V') return [];
  const approved = assets.filter((asset) => asset.status === 'approved' && asset.files?.some((f) => /\.(png|jpe?g|webp)$/i.test(f.filename || '')));
  // Never guess global identities or locations. Older projects must bind them explicitly.
  return [0, 1].map((slot) => {
    const explicitId = beat.referenceAssetIds?.[slot];
    if (explicitId !== undefined) return approved.find((asset) => asset.id === explicitId);
    const kind = beat.mode === 'FL2VA' ? (slot === 0 ? 'first_frame' : 'last_frame') : (slot === 0 ? 'identity' : 'location');
    const candidates = approved.filter((asset) => asset.beatId === beat.id && asset.kind === kind);
    return candidates.length === 1 ? candidates[0] : undefined;
  });
}

function hasUsableImage(asset: AssetTask) {
  return asset.status === 'approved' && asset.files?.some((file) => /\.(png|jpe?g|webp)$/i.test(file.filename || ''));
}

function assetSubject(asset: AssetTask) {
  return asset.title.replace(/[\s*_#`]/g, '').split(/[·（(]/)[0].replace(/(?:人物)?身份母版.*$/, '').replace(/连续空间.*$/, '');
}

export function resolveAssetSources(target: AssetTask, assets: AssetTask[]): AssetTask[] {
  if (target.kind === 'identity' || target.kind === 'location') return [];
  const approved = assets.filter((asset) => asset.id !== target.id && hasUsableImage(asset));
  const explicit = (target.sourceAssetIds || []).map((id) => approved.find((asset) => asset.id === id)).filter((asset): asset is AssetTask => Boolean(asset));
  const haystack = `${target.title} ${target.prompt}`;
  const firstFrame = target.kind === 'last_frame' ? approved.find((asset) => asset.kind === 'first_frame' && asset.beatId === target.beatId) : undefined;
  const identities = approved.filter((asset) => asset.kind === 'identity' && assetSubject(asset) && haystack.replace(/\s/g, '').includes(assetSubject(asset)));
  const explicitIdentities = explicit.filter((asset) => asset.kind === 'identity');
  const explicitLocations = explicit.filter((asset) => asset.kind === 'location');
  const explicitOther = explicit.filter((asset) => !['identity', 'location', 'first_frame'].includes(asset.kind));
  const mentionedLocations = approved.filter((asset) => asset.kind === 'location' && assetSubject(asset) && haystack.replace(/\s/g, '').includes(assetSubject(asset)));
  const allLocations = approved.filter((asset) => asset.kind === 'location');
  const location = explicitLocations[0] || mentionedLocations[0] || (allLocations.length === 1 ? allLocations[0] : undefined);
  const ordered = target.kind === 'last_frame'
    ? [firstFrame, ...explicitOther, ...identities, ...explicitIdentities, location]
    : [...explicitOther, ...identities, ...explicitIdentities, location];
  return [...new Map(ordered.filter((asset): asset is AssetTask => Boolean(asset)).map((asset) => [asset.id, asset])).values()].slice(0, 3);
}

export function resolveIdentityMasters(target: AssetTask, assets: AssetTask[]): AssetTask[] {
  const haystack = `${target.title} ${target.prompt}`.replace(/\s/g, '');
  const explicitIds = new Set(target.sourceAssetIds || []);
  return assets.filter((asset) => asset.kind === 'identity' && hasUsableImage(asset) &&
    (explicitIds.has(asset.id) || (assetSubject(asset) && haystack.includes(assetSubject(asset))))).slice(0, 2);
}

export function assetSourceIssue(target: AssetTask, sources: AssetTask[], assets: AssetTask[]) {
  if (target.kind === 'identity' || target.kind === 'location') return '';
  const haystack = `${target.title} ${target.prompt}`.replace(/\s/g, '');
  const intendedIdentities = assets.filter((asset) => asset.kind === 'identity' && ((target.sourceAssetIds || []).includes(asset.id) || (assetSubject(asset) && haystack.includes(assetSubject(asset)))));
  const inheritedIds = new Set<string>();
  const queue = [...sources];
  while (queue.length) {
    const source = queue.shift()!;
    if (inheritedIds.has(source.id)) continue;
    inheritedIds.add(source.id);
    for (const id of source.sourceAssetIds || []) {
      const ancestor = assets.find((asset) => asset.id === id);
      if (ancestor) queue.push(ancestor);
    }
  }
  const missingIdentity = intendedIdentities.find((asset) => !inheritedIds.has(asset.id));
  if (missingIdentity) return `缺少人物母版：请先采用“${missingIdentity.title}”`;
  if (!assets.some((asset) => inheritedIds.has(asset.id) && (asset.kind === 'location' || asset.kind === 'first_frame'))) return '缺少场景母版：请先采用对应连续空间';
  return '';
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { StudioWorkspace } from '@/components/studio-workspace';
import { Aperture, Check, CheckCircle2, Download, ImagePlus, LoaderCircle, Play, RefreshCw, Upload, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ModelSettingsDialog } from '@/components/model-settings-dialog';
import { ImageSettingsDialog } from '@/components/image-settings-dialog';
import { SystemLogPanel } from '@/components/system-log-panel';
import { AnalysisInspector } from '@/components/analysis-inspector';
import { createLocalDraft, createReferenceAssetPlan, resolveBeatDurations, type DirectorAnalysis, type DirectorBeat } from '@/lib/director';
import type { ApiWorkflow } from '@/lib/comfy';
import { providerPresets, type ProviderConfig, type ProviderId } from '@/lib/providers';
import { defaultImageProviderConfig, imageProviderPresets, type ImageProviderConfig, type ImageProviderId } from '@/lib/image-providers';
import type { SystemLogCategory, SystemLogEntry, SystemLogLevel } from '@/lib/system-log';
import { matchBuiltInWorkflow } from '@/lib/workflow-library';
import { assetSourceIssue, imageInputPath, resolveAssetSources, resolveBeatAssets, resolveIdentityMasters, type AssetTask, type OutputFile } from '@/lib/asset-binding';
import { buildH3VideoPrompt, normalizeBeatDuration, parseBeatDuration, type H3PromptReference } from '@/lib/h3-video-prompt';

const initialBeats: DirectorBeat[] = [
  { id: '01', title: '寒池醒转', duration: '7.5s', mode: 'Ref2VA', status: 'ready', summary: '沈昭从寒水中惊醒，确认陌生环境与身体伤势。', prompt: '单一寒池空间，沈昭从寒水中惊醒，确认手腕勒痕；保持人物、服装、空间与伤势连续，无字幕。' },
  { id: '02', title: '脚步逼近', duration: '5.8s', mode: 'FL2VA', status: 'review', summary: '走廊脚步由远及近，门闩从闭合转为松动。', prompt: '同一走廊空间，脚步逼近，门闩从闭合到松动；首尾帧保持构图兼容并体现门闩状态变化。' },
  { id: '03', title: '身份揭示', duration: '9.2s', mode: 'Ref2VA', status: 'draft', summary: '来人进入画面，以一句称谓改变双方关系。', prompt: '人物进入同一空间，以明确视线对沈昭说出原文对白，保留听者反应和情绪余波，无字幕。' },
];
const labels = { ready: '可测试', review: '待检查', draft: '草稿' } as const;
const assetLabels = { draft: '待生成', submitting: '提交中', pending: '排队中', running: '生成中', review: '待验收', approved: '已采用', error: '失败' } as const;
const defaultProviderConfig: ProviderConfig = { ...providerPresets.deepseek, apiKey: '' };

function restoreAsset(asset: AssetTask): AssetTask {
  if (asset.status === 'submitting') return { ...asset, status: 'error', error: '上次提交被中断，请先查看 ComfyUI 队列再重试。' };
  if (asset.kind === 'identity' && (asset.promptVersion || 0) < 3) {
    const legacyPrompt = asset.prompt.replace(/制作?2[×xX*]2[\s\S]*?(?=不添加文字标签。|$)/, '').replace(/不添加文字标签。/g, '');
    return { ...asset, width: 768, height: 1024, promptVersion: 3, status: 'review', prompt: `${legacyPrompt} 单人、单画面、腰部以上三分之二侧身定妆照，脸部清晰且双眼睁开，完整显示发型、头饰、肩颈和基础服装。禁止设定板、四宫格、拼贴、分屏、重复人脸和多视角合成。`, error: '旧版四宫格身份图会诱发重复人脸，请按新的单画面母版描述重做。' };
  }
  const derived = !['identity', 'location'].includes(asset.kind);
  if (derived && asset.files?.length && !['hybrid-flux2-qwen2511', 'aliyun-qwen-image-3', 'volcengine-seedream'].includes(asset.generator || '')) return { ...asset, status: 'review', error: '这是旧版单阶段派生图；人物或场景一致性未经校正，请重做后再采用。' };
  return asset;
}

export default function Home() {
  const [beats, setBeats] = useState<DirectorBeat[]>(initialBeats);
  const [selected, setSelected] = useState('01');
  const [comfyUrl, setComfyUrl] = useState('http://127.0.0.1:8188');
  const [connection, setConnection] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [script, setScript] = useState('寒夜。沈昭在结冰的水池边醒来，手腕有新鲜勒痕。\n\n门外传来脚步声。\n\n萧彻：你终于醒了。');
  const [analysis, setAnalysis] = useState<DirectorAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([]);
  const [logStorageReady, setLogStorageReady] = useState(false);
  const previousAssetStates = useRef(new Map<string, string>());
  const previousJobState = useRef('');
  const previousConnectionState = useRef('idle');
  const [aiConfig, setAiConfig] = useState<{ aiConfigured: boolean; model: string } | null>(null);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(defaultProviderConfig);
  const [providerReady, setProviderReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imageSettingsOpen, setImageSettingsOpen] = useState(false);
  const [imageProviderConfig, setImageProviderConfig] = useState<ImageProviderConfig>(defaultImageProviderConfig);
  const [imageProviderReady, setImageProviderReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const workflowInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualWorkflow, setManualWorkflow] = useState<ApiWorkflow | null>(null);
  const [manualWorkflowName, setManualWorkflowName] = useState('');
  const [builtInWorkflow, setBuiltInWorkflow] = useState<{ id: string; value: ApiWorkflow } | null>(null);
  const [workflowSource, setWorkflowSource] = useState<'auto' | 'manual'>('auto');
  const [compatibility, setCompatibility] = useState<{ state: 'idle' | 'checking' | 'compatible' | 'incompatible'; missing: string[] }>({ state: 'idle', missing: [] });
  const [imageWorkflow, setImageWorkflow] = useState<ApiWorkflow | null>(null);
  const [imageError, setImageError] = useState('');
  const imageCheck = useRef<Promise<boolean> | null>(null);
  const [imageCompatibility, setImageCompatibility] = useState<{ state: 'idle' | 'checking' | 'compatible' | 'incompatible'; missing: string[] }>({ state: 'idle', missing: [] });
  const [assets, setAssets] = useState<AssetTask[]>([]);
  const [generatingAssets, setGeneratingAssets] = useState(false);
  const assetSubmissionLocks = useRef(new Set<string>());
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [megapixels, setMegapixels] = useState(0.4);
  const [steps, setSteps] = useState(20);
  const [job, setJob] = useState<{ promptId: string; status: 'pending' | 'running' | 'completed' | 'error'; files?: Array<{ filename?: string; subfolder?: string; type?: string }> } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qc, setQc] = useState<'pending' | 'passed' | 'failed'>('pending');
  const [qcFrames, setQcFrames] = useState<string[]>([]);
  const appendLog = useCallback((level: SystemLogLevel, category: SystemLogCategory, action: string, detail?: string) => {
    const entry: SystemLogEntry = { id: crypto.randomUUID(), time: new Date().toISOString(), level, category, action, detail: detail?.slice(0, 500) };
    setSystemLogs((current) => [...current, entry].slice(-500));
  }, []);
  const beat = useMemo(() => beats.find((item) => item.id === selected) ?? beats[0] ?? initialBeats[0], [beats, selected]);
  const matchedWorkflow = useMemo(() => matchBuiltInWorkflow(beat.mode), [beat.mode]);
  const workflow = workflowSource === 'manual' ? manualWorkflow : builtInWorkflow?.id === matchedWorkflow.id ? builtInWorkflow.value : null;
  const workflowName = workflowSource === 'manual' ? manualWorkflowName : matchedWorkflow.name;
  const boundAssets = useMemo(() => resolveBeatAssets(beat, assets), [assets, beat]);
  const promptReferences = useMemo<H3PromptReference[]>(() => referenceFiles.length ? referenceFiles.map((file, index) => ({ id: `uploaded-image-${index + 1}`, title: file.name, role: 'the visual identity, state, composition, and environment anchors explicitly selected by the user from this uploaded image' })) : boundAssets.filter((asset): asset is AssetTask => Boolean(asset)).map((asset) => ({ id: asset.id, title: asset.title, kind: asset.kind })), [boundAssets, referenceFiles]);
  const finalBeatPrompt = useMemo(() => buildH3VideoPrompt(beat, promptReferences), [beat, promptReferences]);
  const validBeatDuration = parseBeatDuration(beat.duration);
  const autoAssetImages = useMemo(() => boundAssets.filter((asset): asset is AssetTask => Boolean(asset)).map((asset) => imageInputPath(asset.files!.find((file) => /\.(png|jpe?g|webp)$/i.test(file.filename || ''))!)), [boundAssets]);
  useEffect(() => { const timer = window.setTimeout(() => setReferenceFiles([]), 0); return () => window.clearTimeout(timer); }, [selected]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let restored: SystemLogEntry[] = [];
      const saved = window.localStorage.getItem('h3-director-system-log');
      if (saved) try { const value = JSON.parse(saved); if (Array.isArray(value)) restored = value.filter((entry) => entry && typeof entry.time === 'string' && typeof entry.action === 'string').slice(-499); } catch { /* ignore damaged log storage */ }
      setSystemLogs([...restored, { id: crypto.randomUUID(), time: new Date().toISOString(), level: 'info', category: 'system', action: '导演台已启动', detail: '开始实时记录本次会话。' }]);
      setLogStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (logStorageReady) window.localStorage.setItem('h3-director-system-log', JSON.stringify(systemLogs.slice(-500))); }, [logStorageReady, systemLogs]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem('h3-director-project');
      if (saved) try { const value = JSON.parse(saved) as { script?: string; analysis?: DirectorAnalysis; beats?: DirectorBeat[]; assets?: AssetTask[]; workflow?: ApiWorkflow; workflowName?: string; workflowSource?: 'auto' | 'manual'; comfyUrl?: string; job?: typeof job; megapixels?: number; steps?: number; qc?: typeof qc }; if (value.script && value.analysis?.source === 'local-draft' && value.assets?.some((asset) => asset.promptVersion !== 2)) { const migrated = createLocalDraft(value.script); setScript(value.script); setAnalysis(migrated); setBeats(migrated.beats); setSelected(migrated.beats[0]?.id || '01'); setAssets(migrated.referenceAssets.map((asset) => ({ ...asset, status: 'draft' }))); setMessage('已修复旧版素材提示词：重新识别人名、镜头、场景并注入剧本视觉设定；原错误参考图已取消采用。'); setStorageReady(true); return; } if (value.script) setScript(value.script); if (value.analysis) setAnalysis(value.analysis); const savedBeats = value.beats?.length ? value.beats : value.analysis?.beats; if (savedBeats?.length) { const normalizedBeats = savedBeats.map((item) => ({ ...item, duration: normalizeBeatDuration(item.duration) })); setBeats(normalizedBeats); setSelected(normalizedBeats[0].id); } if (value.assets?.length) setAssets(value.assets.map(restoreAsset)); else if (value.analysis) setAssets((value.analysis.referenceAssets?.length ? value.analysis.referenceAssets : createReferenceAssetPlan(value.analysis.characters, value.analysis.spaces, value.analysis.beats, value.script)).map((asset) => ({ ...asset, status: 'draft' }))); if (value.workflow) setManualWorkflow(value.workflow); if (value.workflowName) setManualWorkflowName(value.workflowName); if (value.workflowSource === 'manual' && value.workflow) setWorkflowSource('manual'); if (value.comfyUrl) setComfyUrl(value.comfyUrl); if (value.job) setJob(value.job); if (value.megapixels) setMegapixels(value.megapixels); if (value.steps) setSteps(value.steps); if (value.qc) setQc(value.qc); } catch { /* ignore damaged local draft */ }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    setBeats((current) => {
      const resolved = resolveBeatDurations(current);
      return resolved.some((item, index) => item.duration !== current[index]?.duration) ? resolved : current;
    });
  }, [storageReady]);
  useEffect(() => {
    fetch('/api/config')
      .then(async (response) => {
        const value = await response.json() as { aiConfigured: boolean; model: string };
        setAiConfig(value);
      })
      .catch(() => setAiConfig({ aiConfigured: false, model: '配置检测失败' }));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem('h3-director-provider');
      let next = defaultProviderConfig;
      if (saved) try {
        const value = JSON.parse(saved) as { provider?: ProviderId; model?: string; baseUrl?: string };
        if (value.provider && providerPresets[value.provider]) next = { ...providerPresets[value.provider], model: value.model || providerPresets[value.provider].model, baseUrl: value.baseUrl || providerPresets[value.provider].baseUrl, apiKey: '' };
      } catch { /* ignore damaged provider preference */ }
      next = { ...next, apiKey: window.sessionStorage.getItem(`h3-director-api-key:${next.provider}`) || '' };
      setProviderConfig(next); setProviderReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!providerReady) return;
    window.localStorage.setItem('h3-director-provider', JSON.stringify({ provider: providerConfig.provider, model: providerConfig.model, baseUrl: providerConfig.baseUrl }));
    const keyName = `h3-director-api-key:${providerConfig.provider}`;
    if (providerConfig.apiKey) window.sessionStorage.setItem(keyName, providerConfig.apiKey); else window.sessionStorage.removeItem(keyName);
  }, [providerConfig, providerReady]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let next = defaultImageProviderConfig;
      const saved = window.localStorage.getItem('h3-director-image-provider');
      if (saved) try {
        const value = JSON.parse(saved) as Partial<Omit<ImageProviderConfig, 'apiKey'>>;
        if (value.provider && imageProviderPresets[value.provider]) next = { ...next, ...value, apiKey: '' };
      } catch { /* ignore damaged image provider preference */ }
      if (next.provider !== 'local') next = { ...next, apiKey: window.sessionStorage.getItem(`h3-director-image-api-key:${next.provider}`) || '' };
      setImageProviderConfig(next); setImageProviderReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!imageProviderReady) return;
    const { apiKey: _apiKey, ...safeConfig } = imageProviderConfig;
    window.localStorage.setItem('h3-director-image-provider', JSON.stringify(safeConfig));
    if (imageProviderConfig.provider !== 'local') {
      const keyName = `h3-director-image-api-key:${imageProviderConfig.provider}`;
      if (imageProviderConfig.apiKey) window.sessionStorage.setItem(keyName, imageProviderConfig.apiKey);
      else window.sessionStorage.removeItem(keyName);
    }
  }, [imageProviderConfig, imageProviderReady]);
  useEffect(() => { if (storageReady) window.localStorage.setItem('h3-director-project', JSON.stringify({ script, analysis, beats, assets, workflow: manualWorkflow, workflowName: manualWorkflowName, workflowSource, comfyUrl, job, megapixels, steps, qc })); }, [script, analysis, beats, assets, manualWorkflow, manualWorkflowName, workflowSource, comfyUrl, job, megapixels, steps, qc, storageReady]);
  useEffect(() => { fetch('/workflows/z-image-t2i.json').then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<ApiWorkflow>; }).then(setImageWorkflow).catch((error) => setMessage(`内置生图工作流加载失败：${error instanceof Error ? error.message : '未知错误'}`)); }, []);
  useEffect(() => {
    let active = true;
    fetch(matchedWorkflow.file).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<ApiWorkflow>;
    }).then((value) => { if (active) setBuiltInWorkflow({ id: matchedWorkflow.id, value }); }).catch((error) => { if (active) setMessage(`内置工作流加载失败：${error instanceof Error ? error.message : '未知错误'}`); });
    return () => { active = false; };
  }, [matchedWorkflow]);
  useEffect(() => {
    if (!job || !['pending', 'running'].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/comfy/status?url=${encodeURIComponent(comfyUrl)}&promptId=${encodeURIComponent(job.promptId)}`);
        const data = await response.json() as { status?: 'pending' | 'running' | 'completed' | 'error'; files?: Array<{ filename?: string; subfolder?: string; type?: string }> };
        if (data.status) setJob((current) => current ? { ...current, status: data.status!, files: data.files } : current);
      } catch { /* keep polling; transient ComfyUI failures are recoverable */ }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [comfyUrl, job]);
  useEffect(() => {
    if (!assets.some((asset) => asset.promptId && ['pending', 'running'].includes(asset.status))) return;
    const timer = window.setInterval(async () => {
      const activeAssets = assets.filter((asset) => asset.promptId && ['pending', 'running'].includes(asset.status));
      const updates = await Promise.all(activeAssets.map(async (asset) => {
        try {
          const response = await fetch(`/api/comfy/status?url=${encodeURIComponent(comfyUrl)}&promptId=${encodeURIComponent(asset.promptId!)}`);
          const data = await response.json() as { status?: 'pending' | 'running' | 'completed' | 'error'; files?: OutputFile[]; messages?: unknown[] };
          return { id: asset.id, status: data.status === 'completed' ? 'review' as const : data.status, files: data.files, error: data.status === 'error' ? JSON.stringify(data.messages ?? []).slice(0, 240) : undefined };
        } catch { return null; }
      }));
      const blockingFinished = updates.flatMap((update) => {
        if (!update || update.status !== 'review' || !update.files?.length) return [];
        const asset = activeAssets.find((item) => item.id === update.id);
        return asset?.phase === 'blocking' ? [{ asset, files: update.files }] : [];
      });
      setAssets((current) => current.map((asset) => {
        const update = updates.find((item) => item?.id === asset.id);
        if (!update?.status) return asset;
        if (asset.phase === 'blocking' && update.status === 'review' && update.files?.length) return { ...asset, status: 'submitting', promptId: undefined, draftFiles: update.files, files: undefined, error: undefined };
        return { ...asset, status: update.status, files: update.files ?? asset.files, error: update.error, ...(update.status === 'review' ? { phase: undefined } : {}) };
      }));
      for (const item of blockingFinished) void submitAssetRefinement(item.asset, item.files);
    }, 4000);
    return () => window.clearInterval(timer);
  // The interval deliberately restarts from the latest asset snapshot; the helper reads that same snapshot.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, comfyUrl, imageWorkflow]);

  useEffect(() => {
    if (!logStorageReady) return;
    const next = new Map(assets.map((asset) => [asset.id, `${asset.status}|${asset.phase || ''}|${asset.promptId || ''}|${asset.error || ''}`]));
    if (!previousAssetStates.current.size) { previousAssetStates.current = next; return; }
    for (const asset of assets) {
      const signature = next.get(asset.id)!;
      const previous = previousAssetStates.current.get(asset.id);
      if (!previous || previous === signature) continue;
      const level: SystemLogLevel = asset.status === 'error' ? 'error' : ['review', 'approved'].includes(asset.status) ? 'success' : 'info';
      const detail = asset.status === 'error' ? asset.error || '任务失败' : asset.phase === 'blocking' ? '正在生成动作构图草图。' : asset.phase === 'refining' ? '正在校正人物和场景一致性。' : `当前状态：${assetLabels[asset.status]}`;
      appendLog(level, 'image', `${asset.title} · ${assetLabels[asset.status]}`, detail);
    }
    previousAssetStates.current = next;
  }, [appendLog, assets, logStorageReady]);

  useEffect(() => {
    if (!logStorageReady || !job) return;
    const signature = `${job.promptId}|${job.status}`;
    if (signature === previousJobState.current) return;
    previousJobState.current = signature;
    const level: SystemLogLevel = job.status === 'error' ? 'error' : job.status === 'completed' ? 'success' : 'info';
    appendLog(level, 'video', `视频任务 · ${{ pending: '排队中', running: '生成中', completed: '已完成', error: '失败' }[job.status]}`, `任务 ID：${job.promptId}`);
  }, [appendLog, job, logStorageReady]);

  useEffect(() => {
    if (!logStorageReady || connection === previousConnectionState.current) return;
    previousConnectionState.current = connection;
    if (connection === 'idle') return;
    appendLog(connection === 'online' ? 'success' : connection === 'offline' ? 'error' : 'info', 'connection', connection === 'checking' ? '正在检测 ComfyUI' : connection === 'online' ? 'ComfyUI 已连接' : 'ComfyUI 连接失败', comfyUrl);
  }, [appendLog, comfyUrl, connection, logStorageReady]);

  async function submitAssetRefinement(asset: AssetTask, draftFiles: OutputFile[]) {
    if (assetSubmissionLocks.current.has(asset.id)) return;
    assetSubmissionLocks.current.add(asset.id);
    try {
      const draft = draftFiles.find((file) => /\.(png|jpe?g|webp)$/i.test(file.filename || ''));
      if (!draft) throw new Error('动作构图阶段没有返回图片');
      const identities = resolveIdentityMasters(asset, assets);
      const sourceLocations = resolveAssetSources(asset, assets).filter((source) => source.kind === 'location');
      const approvedLocations = assets.filter((source) => source.kind === 'location' && source.status === 'approved' && source.files?.length);
      const location = sourceLocations[0] || (approvedLocations.length === 1 ? approvedLocations[0] : undefined);
      const anchors = [...identities, ...(identities.length < 2 && location ? [location] : [])].slice(0, 2);
      if (!anchors.length) throw new Error('一致性精修缺少已采用的人物或场景母版');
      const images = [imageInputPath(draft), ...anchors.map((source) => imageInputPath(source.files!.find((file) => /\.(png|jpe?g|webp)$/i.test(file.filename || ''))!))].slice(0, 3);
      const anchorRoles = anchors.map((source, index) => `image${index + 2} 是“${source.title}”的${source.kind === 'identity' ? '人物身份' : '连续空间'}母版`).join('；');
      const prompt = `这是影视连续性精修，不要重新设计画面。image1 是已经确定的动作构图草图，必须保留其人物数量、人物站位、身体朝向、镜头景别、洞穴瀑布、岩壁、石台、火光位置与光线方向。${anchorRoles}。把草图中对应人物校正为人物母版中的同一张脸、年龄、发型、头饰与服装设计，并把场景地标校正为连续空间母版；保留剧本要求的伤势、湿发、血迹、包裹和动作状态。严禁交换身份、改变性别、改变场景结构、增加人物、增加火堆、增加肢体或手指。${asset.prompt}`;
      const response = await fetch('/api/comfy/image/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comfyUrl, workflow: imageWorkflow, engine: 'qwen2511', prompt, negativePrompt: `${asset.negativePrompt || ''}，身份漂移，场景漂移，服装漂移，错误手部，多余手指，多余人物，多余人脸，多余火堆，改变构图`, width: asset.width, height: asset.height, steps: 4, seed: Math.floor(Math.random() * 2_147_483_647), label: `${asset.id}-refined`, images }) });
      const data = await response.json() as { promptId?: string; error?: string; nodeErrors?: unknown };
      if (!response.ok || !data.promptId) throw new Error(`${data.error || '精修提交失败'}${data.nodeErrors ? `：${JSON.stringify(data.nodeErrors).slice(0, 180)}` : ''}`);
      setAssets((current) => current.map((item) => item.id === asset.id ? { ...item, status: 'pending', phase: 'refining', promptId: data.promptId, files: undefined, error: undefined, generator: 'hybrid-flux2-qwen2511' } : item));
    } catch (error) {
      setAssets((current) => current.map((item) => item.id === asset.id ? { ...item, status: 'error', phase: undefined, error: `身份精修失败：${error instanceof Error ? error.message : '未知错误'}` } : item));
    } finally { assetSubmissionLocks.current.delete(asset.id); }
  }
  async function checkImageEnvironment(): Promise<boolean> {
    if (imageCheck.current) return imageCheck.current;
    const operation = (async () => {
      setImageError(''); setImageCompatibility({ state: 'checking', missing: [] });
      appendLog('info', 'connection', '正在检测本地生图环境', '检查 Z-Image、FLUX.2 与 Qwen Edit 节点和模型。');
      try {
        const checks = await Promise.all(['z-image-t2i', 'flux2-klein-edit', 'qwen-edit-2511'].map(async (workflowId) => {
          const response = await fetch(`/api/comfy?url=${encodeURIComponent(comfyUrl)}&workflow=${workflowId}`, { signal: AbortSignal.timeout(15000) });
          return { workflowId, response, data: await response.json() as { error?: string; nodesChecked?: boolean; missingNodes?: string[]; missingModels?: string[] } };
        }));
        const failed = checks.find((check) => !check.response.ok || !check.data.nodesChecked);
        if (failed) throw new Error(failed.data.error || `无法检查 ${failed.workflowId}，请确认 ComfyUI 已启动。`);
        const missing = [...new Set(checks.flatMap((check) => [...(check.data.missingNodes || []), ...(check.data.missingModels || [])]))];
        if (missing.length) { setImageCompatibility({ state: 'incompatible', missing }); setImageError(`缺少生图节点或模型：${missing.join('、')}。请安装后重新检测。`); appendLog('warning', 'connection', '本地生图环境不完整', `缺少：${missing.join('、')}`); return false; }
        setImageCompatibility({ state: 'compatible', missing: [] });
        appendLog('success', 'connection', '本地生图环境检查通过');
        return true;
      } catch (error) { const detail = error instanceof Error ? error.message : '连接失败'; setImageCompatibility({ state: 'idle', missing: [] }); setImageError(`无法开启生图：${detail}。请先启动本机 ComfyUI，再点重新检测。`); appendLog('error', 'connection', '本地生图环境检查失败', detail); return false; }
    })();
    imageCheck.current = operation;
    try { return await operation; } finally { imageCheck.current = null; }
  }
  async function checkComfy() {
    setConnection('checking'); setCompatibility({ state: 'checking', missing: [] });
    setImageCompatibility({ state: 'checking', missing: [] });
    try {
      const workflowQuery = workflowSource === 'auto' ? `&workflow=${encodeURIComponent(matchedWorkflow.id)}` : '';
      const [response, ...imageResponses] = await Promise.all([
        fetch(`/api/comfy?url=${encodeURIComponent(comfyUrl)}${workflowQuery}`),
        ...['z-image-t2i', 'flux2-klein-edit', 'qwen-edit-2511'].map((id) => fetch(`/api/comfy?url=${encodeURIComponent(comfyUrl)}&workflow=${id}`)),
      ]);
      const data = await response.json() as { missingNodes?: string[]; missingModels?: string[] };
      const imageData = await Promise.all(imageResponses.map((item) => item.json() as Promise<{ missingNodes?: string[]; missingModels?: string[] }>));
      setConnection(response.ok ? 'online' : 'offline');
      const missing = [...(data.missingNodes ?? []), ...(data.missingModels ?? [])];
      const imageMissing = [...new Set(imageData.flatMap((item) => [...(item.missingNodes ?? []), ...(item.missingModels ?? [])]))];
      setCompatibility(response.ok ? { state: missing.length ? 'incompatible' : 'compatible', missing } : { state: 'idle', missing: [] });
      setImageCompatibility(imageResponses.every((item) => item.ok) ? { state: imageMissing.length ? 'incompatible' : 'compatible', missing: imageMissing } : { state: 'idle', missing: [] });
      if (response.ok) setMessage(imageMissing.length ? `视频环境可用；参考图两阶段环境仍缺少：${imageMissing.join('、')}` : workflowSource === 'manual' ? 'ComfyUI 与参考图两阶段环境正常；手动视频工作流将在提交时完整校验。' : missing.length ? `ComfyUI 已连接，但当前视频模板缺少：${missing.join('、')}` : `${matchedWorkflow.name} 与参考图两阶段环境检查通过。`);
    } catch { setConnection('offline'); setCompatibility({ state: 'idle', missing: [] }); setImageCompatibility({ state: 'idle', missing: [] }); }
  }
  async function analyzeScript() {
    setAnalyzing(true); setMessage(providerConfig.apiKey.trim() ? `正在调用 ${providerPresets[providerConfig.provider].name} · ${providerConfig.model}，请稍候…` : '正在生成离线规则草稿…');
    appendLog('info', 'analysis', '开始分析剧本', providerConfig.apiKey.trim() ? `${providerPresets[providerConfig.provider].name} · ${providerConfig.model}` : '离线规则模式');
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script, providerConfig: providerConfig.apiKey.trim() ? providerConfig : undefined }) });
      const data = await response.json() as DirectorAnalysis & { error?: string; provider?: ProviderId; model?: string };
      if (!response.ok) throw new Error(data.error || '分析失败');
      const plannedAssets = (data.referenceAssets?.length ? data.referenceAssets : createReferenceAssetPlan(data.characters, data.spaces, data.beats, script)).map((asset) => ({ ...asset, promptVersion: 3 }));
      setAnalysis({ ...data, referenceAssets: plannedAssets }); setBeats(data.beats); setAssets(plannedAssets.map((asset) => ({ ...asset, status: 'draft' }))); setSelected(data.beats[0]?.id || '01');
      setMessage(data.source === 'ai' ? `${data.provider ? providerPresets[data.provider].name : 'AI'} · ${data.model || aiConfig?.model || '模型'} 导演分析已完成。` : '当前为离线规则模式：已生成可编辑草稿，不等同于 AI 深度导演分析。');
      appendLog('success', 'analysis', '剧本分析完成', `${data.beats.length} 个 Beat · ${plannedAssets.length} 张素材 · ${data.conflicts.length} 项待检查`);
    } catch (error) { const detail = error instanceof Error ? error.message : '分析失败'; setMessage(detail); appendLog('error', 'analysis', '剧本分析失败', detail); } finally { setAnalyzing(false); }
  }
  async function importScript(file?: File) { if (!file) return; if (!/\.(md|txt)$/i.test(file.name)) { setMessage('当前支持 .md 和 .txt 剧本文件。'); appendLog('warning', 'analysis', '剧本导入被拒绝', `不支持的文件：${file.name}`); return; } setScript(await file.text()); setMessage(`已导入 ${file.name}`); appendLog('success', 'analysis', '剧本文件已导入', file.name); }
  async function importWorkflow(file?: File) { if (!file) return; try { const value = JSON.parse(await file.text()) as ApiWorkflow; const nodes = Object.values(value); if (!nodes.length || !nodes.every((node) => node && typeof node.class_type === 'string')) throw new Error('这不是 ComfyUI API Format JSON'); setManualWorkflow(value); setManualWorkflowName(file.name); setWorkflowSource('manual'); setCompatibility({ state: 'idle', missing: [] }); setMessage(`已切换为手动工作流：${file.name}`); appendLog('success', 'video', '手动工作流已导入', `${file.name} · ${nodes.length} 个节点`); } catch (error) { const detail = error instanceof Error ? error.message : '工作流读取失败'; setMessage(detail); appendLog('error', 'video', '工作流导入失败', detail); } }
  function updateBeat(patch: Partial<DirectorBeat>) { setBeats((items) => items.map((item) => item.id === beat.id ? { ...item, ...patch } : item)); if (patch.mode) { setReferenceFiles([]); setCompatibility({ state: 'idle', missing: [] }); } }
  function newProject() { setScript(''); setAnalysis(null); setBeats(initialBeats); setAssets([]); setSelected('01'); setManualWorkflow(null); setManualWorkflowName(''); setWorkflowSource('auto'); setReferenceFiles([]); setJob(null); setQc('pending'); setQcFrames([]); setMessage('已建立新的本地项目。'); appendLog('info', 'system', '已建立新项目', '执行日志继续保留。'); }
  function exportProject() { const data = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), script, analysis, beats, assets, workflowName, comfyUrl, job, qc }, null, 2); const href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = href; anchor.download = `${(analysis?.projectTitle || 'h3-director-project').replace(/[^\w\u4e00-\u9fa5-]/g, '_')}.json`; anchor.click(); URL.revokeObjectURL(href); }
  async function submitAsset(asset: AssetTask) {
    const selectedProvider: ImageProviderId = asset.imageProvider && asset.imageProvider !== 'project' ? asset.imageProvider : imageProviderConfig.provider;
    const selectedPreset = imageProviderPresets[selectedProvider];
    const selectedProviderConfig: ImageProviderConfig = selectedProvider === imageProviderConfig.provider ? imageProviderConfig : { provider: selectedProvider, apiKey: selectedProvider === 'local' ? '' : window.sessionStorage.getItem(`h3-director-image-api-key:${selectedProvider}`) || '', model: selectedPreset.model, baseUrl: selectedPreset.baseUrl, enableThinking: false };
    if ((selectedProvider === 'local' && !imageWorkflow) || assetSubmissionLocks.current.has(asset.id) || ['submitting', 'pending', 'running'].includes(asset.status)) return false;
    assetSubmissionLocks.current.add(asset.id);
    updateAsset(asset.id, { status: 'submitting', error: undefined });
    appendLog('info', 'image', `提交参考图：${asset.title}`, `${imageProviderPresets[selectedProvider].name} · ${asset.kind}${asset.beatId ? ` · Beat ${asset.beatId}` : ''}`);
    try {
      const sources = resolveAssetSources(asset, assets);
      const derived = !['identity', 'location'].includes(asset.kind);
      const sourceIssue = assetSourceIssue(asset, sources, assets);
      if (derived && sourceIssue) throw new Error(sourceIssue);
      if (selectedProvider !== 'local') {
        if (!selectedProviderConfig.apiKey.trim()) throw new Error(`这张图选择了${imageProviderPresets[selectedProvider].name}，请先打开“参考图生成方式”填写 API Key`);
        const sourcePriority = (source: AssetTask) => source.kind === 'first_frame' ? 0 : source.kind === 'identity' ? 1 : source.kind === 'location' ? 2 : 3;
        const generationSources = [...sources].sort((left, right) => sourcePriority(left) - sourcePriority(right)).slice(0, 3);
        const referenceInstruction = generationSources.length ? `这是短剧连续性图生图任务。输入参考图按顺序承担以下职责：${generationSources.map((source, index) => `第${index + 1}张是“${source.title}”，必须继承其${source.kind === 'identity' ? '人物脸型、五官、年龄、发型、头饰和基础服装' : source.kind === 'location' ? '空间结构、地标、材质、光线方向和机位关系' : '构图、人物站位和动作状态'}`).join('；')}。同一人物和同一场景不得重设计；只执行本素材要求的身体状态、道具状态和镜头变化。` : '';
        const response = await fetch(selectedProvider === 'aliyun' ? '/api/image/aliyun/generate' : '/api/image/volcengine/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comfyUrl, apiKey: selectedProviderConfig.apiKey, model: selectedProviderConfig.model, baseUrl: selectedProviderConfig.baseUrl, enableThinking: selectedProviderConfig.enableThinking, prompt: `${referenceInstruction}${asset.prompt}`, negativePrompt: `${asset.negativePrompt || ''}，人物身份漂移，脸型改变，场景结构漂移，服装漂移，多余人物，多余人脸，多余肢体，多余手指，文字，水印`, width: asset.width, height: asset.height, seed: Math.floor(Math.random() * 2_147_483_647), label: asset.id, images: generationSources.map((source) => source.files!.find((file) => /\.(png|jpe?g|webp)$/i.test(file.filename || ''))!) }) });
        const data = await response.json() as { files?: OutputFile[]; error?: string; requestId?: string };
        if (!response.ok || !data.files?.length) throw new Error(data.error || '百炼没有返回图片');
        setAssets((current) => current.map((item) => item.id === asset.id ? { ...item, status: 'review', phase: undefined, promptId: undefined, files: data.files, draftFiles: undefined, error: undefined, generator: selectedProvider === 'aliyun' ? 'aliyun-qwen-image-3' : 'volcengine-seedream' } : item));
        return true;
      }
      if (!(await checkImageEnvironment())) { updateAsset(asset.id, { status: asset.status }); return false; }
      if (sources.length) {
        const environments = await Promise.all(['flux2-klein-edit', 'qwen-edit-2511'].map(async (id) => {
          const response = await fetch(`/api/comfy?url=${encodeURIComponent(comfyUrl)}&workflow=${id}`);
          return { id, response, result: await response.json() as { missingNodes?: string[]; missingModels?: string[]; error?: string } };
        }));
        for (const environment of environments) {
          const missing = [...(environment.result.missingNodes || []), ...(environment.result.missingModels || [])];
          if (!environment.response.ok || missing.length) throw new Error(environment.result.error || `${environment.id} 环境缺少：${missing.join('、')}`);
        }
      }
      const sourcePriority = (source: AssetTask) => source.kind === 'first_frame' ? 0 : source.kind === 'location' ? 1 : source.kind === 'identity' ? 3 : 2;
      const generationSources = [...sources].sort((left, right) => sourcePriority(left) - sourcePriority(right));
      const images = generationSources.map((source) => imageInputPath(source.files!.find((file) => /\.(png|jpe?g|webp)$/i.test(file.filename || ''))!));
      const referenceInstruction = generationSources.length ? `只制作影视动作构图草图。参考图职责：${generationSources.map((source, index) => `image${index + 1} 是“${source.title}”`).join('；')}。执行指定动作并保持人物数量、场景地标、镜头方位和空间关系；不要新增人物、肢体、火堆或建筑。` : '';
      const response = await fetch('/api/comfy/image/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comfyUrl, workflow: imageWorkflow, engine: derived ? 'flux2' : undefined, prompt: `${referenceInstruction}${asset.prompt}`, negativePrompt: asset.negativePrompt, width: asset.width, height: asset.height, steps: derived ? 4 : 9, seed: Math.floor(Math.random() * 2_147_483_647), label: derived ? `${asset.id}-blocking` : asset.id, images }) });
      const data = await response.json() as { promptId?: string; error?: string; nodeErrors?: unknown };
      if (!response.ok || !data.promptId) throw new Error(`${data.error || '提交失败'}${data.nodeErrors ? `：${JSON.stringify(data.nodeErrors).slice(0, 180)}` : ''}`);
      setAssets((current) => current.map((item) => item.id === asset.id ? { ...item, status: 'pending', phase: derived ? 'blocking' : undefined, promptId: data.promptId, files: undefined, draftFiles: undefined, error: undefined, generator: derived ? 'hybrid-flux2-qwen2511' : 'z-image-t2i' } : item));
      return true;
    } catch (error) { setAssets((current) => current.map((item) => item.id === asset.id ? { ...item, status: 'error', error: error instanceof Error ? error.message : '提交失败' } : item)); return false; }
    finally { assetSubmissionLocks.current.delete(asset.id); }
  }
  async function generateMissingAssets() {
    setGeneratingAssets(true); let submitted = 0;
    const candidates = assets.filter((item) => ['draft', 'error'].includes(item.status));
    const ready = candidates.filter((asset) => { const sources = resolveAssetSources(asset, assets); return !assetSourceIssue(asset, sources, assets); });
    for (const asset of ready) if (await submitAsset(asset)) submitted++;
    const waiting = candidates.length - ready.length;
    setGeneratingAssets(false); setMessage(submitted ? `已提交 ${submitted} 个可执行任务。${waiting ? `另有 ${waiting} 张派生图等待你先采用人物/场景母版。` : ''}` : waiting ? `还有 ${waiting} 张派生图：请先采用人物和场景母版，再继续生成。` : '没有可提交的缺失素材。'); appendLog(waiting ? 'warning' : 'info', 'image', '批量提交检查完成', `已提交 ${submitted} 个，等待母版 ${waiting} 个。`);
  }
  async function submitBeat() {
    if (!workflow || !beat) return;
    setSubmitting(true); setMessage(''); setQc('pending'); appendLog('info', 'video', `提交 Beat ${beat.id}`, `${beat.mode} · ${beat.duration} · ${megapixels} MP · ${steps} 步`);
    try {
      const requiredImages = workflowSource === 'auto' ? matchedWorkflow.requiredImages : Object.values(workflow).filter((node) => node.class_type === 'LoadImage').length;
      const selectedImageCount = referenceFiles.length || autoAssetImages.length;
      if (selectedImageCount !== requiredImages) throw new Error(requiredImages ? `当前工作流需要 ${requiredImages} 张已通过素材：${workflowSource === 'auto' ? matchedWorkflow.imageLabel : '请按工作流输入顺序选择'}` : 'T2V 工作流不需要参考图，请清空已选图片');
      let images: string[] = referenceFiles.length ? [] : autoAssetImages;
      if (referenceFiles.length) {
        const form = new FormData(); form.append('comfyUrl', comfyUrl); referenceFiles.forEach((file) => form.append('files', file));
        const uploadResponse = await fetch('/api/comfy/upload', { method: 'POST', body: form });
        const uploadData = await uploadResponse.json() as { uploaded?: string[]; error?: string };
        if (!uploadResponse.ok) throw new Error(uploadData.error || '参考图上传失败'); images = uploadData.uploaded ?? [];
      }
      const response = await fetch('/api/comfy/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comfyUrl, workflow, prompt: finalBeatPrompt, duration: Number.parseFloat(beat.duration), steps, seed: Math.floor(Math.random() * 2_147_483_647), megapixels, aspect: '9:16 (Portrait Widescreen)', label: `beat-${beat.id}`, images }) });
      const data = await response.json() as { promptId?: string; error?: string; nodeErrors?: unknown };
      if (!response.ok || !data.promptId) throw new Error(`${data.error || '提交失败'}${data.nodeErrors ? `：${JSON.stringify(data.nodeErrors).slice(0, 240)}` : ''}`);
      setJob({ promptId: data.promptId, status: 'pending' }); setMessage(`Beat ${beat.id} 已提交，正在等待 ComfyUI。`);
    } catch (error) { const detail = error instanceof Error ? error.message : '提交失败'; setMessage(detail); appendLog('error', 'video', `Beat ${beat.id} 提交失败`, detail); } finally { setSubmitting(false); }
  }
  const videoFile = job?.files?.find((file) => file.filename?.toLowerCase().endsWith('.mp4'));
  const videoUrl = videoFile?.filename ? `/api/comfy/view?url=${encodeURIComponent(comfyUrl)}&filename=${encodeURIComponent(videoFile.filename)}&subfolder=${encodeURIComponent(videoFile.subfolder || '')}&type=${encodeURIComponent(videoFile.type || 'output')}` : '';
  const sessionProvider = providerConfig.apiKey.trim() ? providerPresets[providerConfig.provider] : null;
  async function extractQcFrames() {
    const video = videoRef.current; if (!video || !Number.isFinite(video.duration)) return;
    const frames: string[] = [];
    for (const ratio of [0.08, 0.5, 0.92]) {
      video.currentTime = Math.max(0, video.duration * ratio);
      await new Promise<void>((resolve) => video.addEventListener('seeked', () => resolve(), { once: true }));
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0); frames.push(canvas.toDataURL('image/jpeg', 0.82));
    }
    setQcFrames(frames); setMessage('已抽取首、中、尾三帧，请逐项检查连续性。');
    appendLog('success', 'qc', `Beat ${beat.id} 已抽取质检帧`, '首帧、中帧、尾帧');
  }
  function markQc(result: 'passed' | 'failed') { setQc(result); appendLog(result === 'passed' ? 'success' : 'warning', 'qc', `Beat ${beat.id} ${result === 'passed' ? '质检通过' : '需要重做'}`, '检查项：人物、空间、道具、表演、台词、连续性。'); }
  function assetImageUrl(asset: AssetTask) { const file = asset.files?.find((item) => /\.(png|jpe?g|webp)$/i.test(item.filename ?? '')); return file?.filename ? `/api/comfy/view?url=${encodeURIComponent(comfyUrl)}&filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder || '')}&type=${encodeURIComponent(file.type || 'output')}` : ''; }
  function updateAsset(id: string, patch: Partial<AssetTask>) { setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, ...patch, ...(patch.prompt !== undefined && asset.files?.length ? { status: 'review' as const } : {}) } : asset)); }

  const requiredImageCount = workflowSource === 'auto' ? matchedWorkflow.requiredImages : Object.values(workflow || {}).filter((node) => node.class_type === 'LoadImage').length;
  const blockedReason = submitting || job?.status === 'pending' || job?.status === 'running' ? '视频正在生成，请等待当前任务完成。' : !validBeatDuration ? '时长是必填参数，请填写 4–15 秒。' : connection !== 'online' ? '请打开连接与设置，检测本机 ComfyUI。' : !workflow ? '生成工作流还未加载完成，请稍候。' : workflowSource === 'auto' && compatibility.state !== 'compatible' ? '请检测当前段落需要的视频模型与节点。' : (referenceFiles.length || autoAssetImages.length) !== requiredImageCount ? '当前段落需要 ' + requiredImageCount + ' 张参考图，请先采用素材并在下方选择。' : '';
  const busy = submitting || analyzing || assets.some((a) => ['submitting','pending','running'].includes(a.status)) || job?.status === 'pending' || job?.status === 'running';
  return <StudioWorkspace title={analysis?.projectTitle || '未命名项目'} analyzed={Boolean(analysis)} analyzing={analyzing} canAnalyze={Boolean(script.trim())} aiReady={Boolean(sessionProvider || aiConfig?.aiConfigured)} assetCount={assets.length} approvedCount={assets.filter((a) => a.status === 'approved').length} reviewCount={assets.filter((a) => a.status === 'review').length} beatCount={beats.length} message={message} blockedReason={blockedReason} comfyNeedsAttention={connection !== 'online' || compatibility.state === 'incompatible'} busy={Boolean(busy)} onAnalyze={analyzeScript} onSettings={() => setSettingsOpen(true)} onImageSettings={() => setImageSettingsOpen(true)} onNew={newProject} onExport={exportProject} conflicts={analysis?.conflicts || []}
    analysisResult={analysis ? <AnalysisInspector analysis={{ ...analysis, beats }} assets={assets} aiReady={Boolean(sessionProvider || aiConfig?.aiConfigured)} onSettings={() => setSettingsOpen(true)} /> : null}
    settings={<><ModelSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} config={providerConfig} onChange={setProviderConfig} /><ImageSettingsDialog open={imageSettingsOpen} onOpenChange={setImageSettingsOpen} config={imageProviderConfig} onChange={setImageProviderConfig} /></>}
    logs={<SystemLogPanel logs={systemLogs} onClear={() => { setSystemLogs([]); previousAssetStates.current = new Map(assets.map((asset) => [asset.id, `${asset.status}|${asset.phase || ''}|${asset.promptId || ''}|${asset.error || ''}`])); previousJobState.current = job ? `${job.promptId}|${job.status}` : ''; }} />}
    script={<article id="script-input" className="mt-5 scroll-mt-20 rounded-2xl border border-white/8 bg-card p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-medium">剧本输入</h2><p className="text-xs text-muted-foreground">支持粘贴或导入 Markdown/TXT，内容和分析结果只保存在当前浏览器</p></div><input ref={fileInput} type="file" accept=".md,.txt,text/plain,text/markdown" className="hidden" onChange={(event) => importScript(event.target.files?.[0])} /><Button onClick={() => fileInput.current?.click()} variant="outline" size="sm"><Upload />导入文件</Button></div><Textarea value={script} onChange={(e) => setScript(e.target.value)} className="min-h-36 resize-y border-white/10 bg-background/60 leading-6" /></article>}
    imageAction={imageProviderConfig.provider === 'local' ? <Button onClick={checkImageEnvironment} disabled={imageCompatibility.state === 'checking'}>{imageCompatibility.state === 'checking' ? '正在检测…' : imageCompatibility.state === 'compatible' ? '本地生图已就绪' : '检测本地生图'}</Button> : <Button onClick={() => setImageSettingsOpen(true)}>{imageProviderConfig.apiKey ? '线上生图已配置' : '配置线上生图'}</Button>}
    assets={<article id="asset-center" className="mt-5 scroll-mt-20 rounded-2xl border border-white/8 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3"><div><h2 className="font-medium">一致性参考图</h2><p className="text-xs text-muted-foreground">本地、百炼与 Seedream 可随时切换；人物、场景和 Beat 派生图仍按同一套母版继承关系生成。</p></div><div className="asset-toolbar flex flex-wrap items-center gap-2"><label className="text-xs text-muted-foreground">项目默认 <select aria-label="项目默认生图方式" value={imageProviderConfig.provider} onChange={(event) => { const provider = event.target.value as ImageProviderId; const preset = imageProviderPresets[provider]; setImageProviderConfig({ provider, apiKey: provider !== 'local' ? window.sessionStorage.getItem(`h3-director-image-api-key:${provider}`) || '' : '', model: preset.model, baseUrl: preset.baseUrl, enableThinking: false }); }} className="toolbar-control toolbar-select ml-1 text-foreground"><option value="local">本地 ComfyUI</option><option value="aliyun">阿里云百炼</option><option value="volcengine">火山方舟 Seedream</option></select></label><Badge className="toolbar-control toolbar-status" variant={imageProviderConfig.provider !== 'local' ? (imageProviderConfig.apiKey ? 'default' : 'outline') : imageCompatibility.state === 'compatible' ? 'default' : 'outline'}>{imageProviderConfig.provider !== 'local' ? imageProviderConfig.apiKey ? '线上已配置' : '线上待配置' : imageCompatibility.state === 'compatible' ? '本地可用' : '本地待检测'}</Badge><Button className="toolbar-control toolbar-settings" variant="outline" onClick={() => setImageSettingsOpen(true)}>生图设置</Button>{imageProviderConfig.provider === 'local' && <Button className="toolbar-control toolbar-warning" variant="outline" onClick={checkImageEnvironment} disabled={imageCompatibility.state === 'checking'}>{imageCompatibility.state === 'checking' ? '检测中…' : '检测本地环境'}</Button>}<Button className="toolbar-control toolbar-primary" onClick={generateMissingAssets} disabled={!assets.length || generatingAssets || (imageProviderConfig.provider === 'local' ? imageCompatibility.state !== 'compatible' : !imageProviderConfig.apiKey.trim())}><ImagePlus />{generatingAssets ? '生成中…' : '生成全部图片'}</Button></div></div>
          {imageError && <div role="alert" className="m-4 rounded-lg border border-red-400/40 p-3 text-sm text-red-200">{imageError}</div>}
          <p className="px-4 pt-3 text-sm text-amber-200">制作顺序：①生成并采用身份/场景母版；②派生状态图和首帧；③尾帧优先继承同 Beat 首帧。不要一次盲生成全部素材。</p>
          {!assets.length ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">完成剧本分析后，系统会在这里生成人物、场景和首尾帧提示词。</div> : <div className="divide-y divide-white/6">{assets.map((asset) => { const preview = assetImageUrl(asset); const sources = resolveAssetSources(asset, assets); const sourceIssue = assetSourceIssue(asset, sources, assets); const effectiveProvider = asset.imageProvider && asset.imageProvider !== 'project' ? asset.imageProvider : imageProviderConfig.provider; const effectiveProviderKey = effectiveProvider === 'local' ? '' : effectiveProvider === imageProviderConfig.provider ? imageProviderConfig.apiKey : window.sessionStorage.getItem(`h3-director-image-api-key:${effectiveProvider}`) || ''; return <section key={asset.id} className="grid gap-4 p-4 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
            <div className="aspect-square overflow-hidden rounded-xl border border-white/8 bg-background/70">{preview ? <a href={preview} target="_blank" rel="noreferrer"><Image unoptimized src={preview} width={224} height={224} alt={asset.title} className="size-full object-contain" /></a> : <div className="grid size-full place-items-center"><ImagePlus className="size-6 text-muted-foreground" /></div>}</div>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm font-medium">{asset.title}</strong><Badge variant="outline" className="text-[10px]">{asset.kind}</Badge>{asset.beatId && <Badge variant="outline" className="text-[10px]">Beat {asset.beatId}</Badge>}<Badge variant="outline" className="text-[10px]">{['identity', 'location'].includes(asset.kind) ? '基础母版 · 文生图' : sourceIssue ? '等待人物/场景母版' : '两阶段 · 构图→一致性精修'}</Badge>{asset.phase && <Badge variant="outline" className="text-[10px]">{asset.phase === 'blocking' ? '第 1/2 阶段：动作构图' : '第 2/2 阶段：身份与场景精修'}</Badge>}</div>{sources.length > 0 && <p className="mt-2 text-xs text-emerald-200">同时继承：{sources.map((source) => source.title).join('、')}</p>}{sourceIssue && <p className="mt-2 text-xs text-amber-200">{sourceIssue}</p>}<details className="mt-3"><summary>调整图片描述</summary><Textarea value={asset.prompt} disabled={['submitting', 'pending', 'running'].includes(asset.status)} aria-label={`${asset.title} 提示词`} onChange={(event) => updateAsset(asset.id, { prompt: event.target.value })} className="mt-2 min-h-20 resize-y border-white/10 bg-background/55 text-xs leading-5" /></details>{asset.error && <p className="mt-1 text-[11px] text-destructive">{asset.error}</p>}</div>
            <div className="flex min-w-28 flex-col items-stretch gap-2"><select aria-label={`${asset.title} 生图方式`} value={asset.imageProvider || 'project'} onChange={(event) => updateAsset(asset.id, { imageProvider: event.target.value as AssetTask['imageProvider'] })} disabled={['submitting', 'pending', 'running'].includes(asset.status)} className="rounded-lg border border-white/10 bg-background px-2 py-1.5 text-xs text-foreground"><option value="project">跟随项目（{imageProviderPresets[imageProviderConfig.provider].name}）</option><option value="local">仅本地</option><option value="aliyun">仅阿里云</option><option value="volcengine">仅 Seedream</option></select><Badge variant={asset.status === 'approved' ? 'default' : 'outline'} className="justify-center">{assetLabels[asset.status]}</Badge>{['submitting', 'pending', 'running'].includes(asset.status) ? <Button size="sm" variant="outline" disabled><LoaderCircle className="animate-spin" />处理中</Button> : asset.status === 'review' ? <><Button onClick={() => updateAsset(asset.id, { status: 'approved' })} size="sm" disabled={Boolean(sourceIssue)}><Check />{sourceIssue ? '母版失效' : '采用'}</Button><Button onClick={() => submitAsset(asset)} size="sm" variant="outline" disabled={Boolean(sourceIssue) || (effectiveProvider !== 'local' && !effectiveProviderKey.trim())}><RefreshCw />重做</Button></> : asset.status === 'approved' ? <Button onClick={() => updateAsset(asset.id, { status: 'review' })} size="sm" variant="outline">取消采用</Button> : <Button onClick={() => submitAsset(asset)} size="sm" variant="outline" disabled={(effectiveProvider === 'local' && (!imageWorkflow || imageCompatibility.state === 'checking')) || (effectiveProvider !== 'local' && !effectiveProviderKey.trim()) || Boolean(sourceIssue)}><Play />{sourceIssue ? '先采用母版' : '生成这张图'}</Button>}</div>
          </section>; })}</div>}
        </article>}
    timeline={<article id="beat-timeline" className="mt-5 scroll-mt-20 rounded-2xl border border-white/8 bg-card"><div className="flex items-center justify-between border-b border-white/8 px-4 py-3"><div><h2 className="font-medium">选择剧情段落</h2><p className="text-xs text-muted-foreground">按信息变化和表演动作拆分，不固定时长</p></div></div><div className="divide-y divide-white/6">{beats.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left transition ${selected === item.id ? 'bg-primary/8' : 'hover:bg-white/[.025]'}`}><span className={`grid size-9 place-items-center rounded-lg font-mono text-xs ${selected === item.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{item.id}</span><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-sm font-medium">{item.title}</strong><Badge variant="outline" className="text-[10px]">{item.mode}</Badge></span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.summary}</span></span><span className="text-right"><span className="block font-mono text-xs">{item.duration}</span><span className={`mt-1 block text-[10px] ${item.status === 'ready' ? 'text-emerald-300' : 'text-muted-foreground'}`}>{labels[item.status]}</span></span></button>)}</div></article>}
    editor={<><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-xl font-semibold">段落 {beat.id} · {beat.title}</h2><p className="text-base leading-7 text-muted-foreground">{beat.summary}</p></div><Badge variant="outline" className="gap-1 text-emerald-200"><CheckCircle2 />编辑后自动保存到本机</Badge></div>
      <section className="mt-4 rounded-2xl border border-white/8 bg-card p-4">
        <h3 className="text-sm font-medium">时长与 H3 生成描述</h3>
        <div className="mt-3 grid grid-cols-2 gap-3"><label htmlFor="beat-duration" className="text-xs text-muted-foreground">时长（必填，4–15 秒）<Input id="beat-duration" type="number" required min={4} max={15} step={0.5} value={beat.duration.replace(/[^\d.]/g, '')} onChange={(event) => updateBeat({ duration: event.target.value ? `${event.target.value}s` : '' })} onBlur={() => updateBeat({ duration: normalizeBeatDuration(beat.duration) })} aria-invalid={!validBeatDuration} className="mt-1 border-white/10 bg-background" /></label><label htmlFor="beat-mode" className="text-xs text-muted-foreground">模式<select id="beat-mode" value={beat.mode} onChange={(event) => updateBeat({ mode: event.target.value as DirectorBeat['mode'] })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-background px-2 text-foreground"><option>Ref2VA</option><option>FL2VA</option><option>T2V</option></select></label></div>
        {!validBeatDuration && <p className="mt-2 text-xs text-red-200">必须填写 4–15 秒之间的实际时长。</p>}
        <label htmlFor="beat-prompt" className="mt-3 block text-xs text-muted-foreground">导演动作、表演、对白与声音（可编辑）</label><Textarea id="beat-prompt" value={beat.prompt || beat.summary} onChange={(event) => updateBeat({ prompt: event.target.value })} className="mt-1 min-h-28 border-white/10 bg-background/60 text-sm leading-6" />
        <details className="mt-4 border-t border-white/8 pt-4" open><summary className="text-sm text-emerald-100">最终 H3 提交提示词 · 已自动加入 @图片ID 与图片职责</summary><Textarea readOnly aria-label="最终 H3 提交提示词" value={finalBeatPrompt} className="mt-3 min-h-52 resize-y border-white/10 bg-background/55 font-mono text-xs leading-5" /></details>
      </section></>}
    binding={<section className="mt-4 rounded-2xl border border-white/8 bg-card p-4">
      <h3 className="text-sm font-medium">Beat {beat.id} 参考图绑定</h3>
      {beat.mode !== 'T2V' && workflowSource === 'auto' && <><p className="mt-2 text-sm text-muted-foreground">只使用已采用素材，不会自动套用其他场景的人物。</p>{[0, 1].map((slot) => <label key={slot} className="mt-3 block text-sm">{beat.mode === 'FL2VA' ? (slot === 0 ? '首帧' : '尾帧') : '参考图 ' + (slot + 1)}<select aria-label={'Beat ' + beat.id + ' 参考图 ' + (slot + 1)} className="mt-1 w-full rounded border border-white/10 bg-background p-2" value={boundAssets[slot]?.id || ''} onChange={(event) => { const ids = boundAssets.map((asset) => asset?.id || ''); ids[slot] = event.target.value; updateBeat({ referenceAssetIds: ids }); }}><option value="">请选择已采用素材</option>{assets.filter((asset) => asset.status === 'approved' && asset.files?.length).map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label>)}</>}
      {workflowSource === 'manual' && <p className="mt-2 text-sm text-muted-foreground">当前使用手动 API 工作流，请按工作流图片节点顺序上传 {requiredImageCount} 张图片。</p>}
      {workflowSource === 'auto' && matchedWorkflow.requiredImages === 0 && <p className="mt-2 text-sm text-muted-foreground">当前 T2V 模式不需要参考图片。</p>}
      {(workflowSource === 'manual' || matchedWorkflow.requiredImages > 0) && <div className="manual-image-upload"><h3 className="text-sm font-medium">或使用自己的图片</h3><p className="mt-1 text-xs text-muted-foreground">选择本机图片后会覆盖上面的自动绑定。</p><input ref={imageInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => setReferenceFiles(Array.from(event.target.files ?? []))} />
        <Button onClick={() => imageInput.current?.click()} variant="ghost" className="mt-2 w-full text-muted-foreground"><ImagePlus />{referenceFiles.length ? `${referenceFiles.length} 张本地图片（手动覆盖）` : autoAssetImages.length ? `已自动绑定 ${autoAssetImages.length} 张已采用素材` : workflowSource === 'auto' ? matchedWorkflow.imageLabel : '按节点顺序选择图片'}</Button>
        {referenceFiles.length > 0 && <Button onClick={() => setReferenceFiles([])} variant="ghost" size="sm" className="w-full text-[11px] text-muted-foreground">清空图片，恢复自动绑定</Button>}
      </div>}
    </section>}
    connection={<section className="mt-4 rounded-2xl border border-white/8 bg-card p-4"><div className="mb-3 flex items-center gap-2"><Workflow className="size-4 text-primary" /><h3 className="text-sm font-medium">ComfyUI 连接</h3></div><label className="text-xs text-muted-foreground" htmlFor="comfy-url">服务地址</label><Input id="comfy-url" value={comfyUrl} onChange={(e) => { setComfyUrl(e.target.value); setImageCompatibility({ state: 'idle', missing: [] }); setConnection('idle'); setCompatibility({ state: 'idle', missing: [] }); }} className="mt-2 border-white/10 bg-background/60 font-mono text-xs" /><Button onClick={checkComfy} variant="outline" className="mt-3 w-full" disabled={connection === 'checking'}>{connection === 'checking' ? '正在检测节点与模型…' : compatibility.state === 'incompatible' ? '环境不完整，重新检测' : compatibility.state === 'compatible' ? <><CheckCircle2 />{workflowSource === 'auto' ? '节点与模型正常' : '连接正常'}</> : connection === 'offline' ? '连接失败，重新检测' : workflowSource === 'auto' ? '检测连接、节点与模型' : '检测 ComfyUI 连接'}</Button>{compatibility.state === 'incompatible' && <p className="mt-2 break-words text-[11px] leading-5 text-amber-200">缺少：{compatibility.missing.join('、')}</p>}</section>}
    workflow={<section id="comfy-workflow" className="mt-4 scroll-mt-20 rounded-2xl border border-white/8 bg-card p-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">执行工作流</h3><Badge variant={workflow ? 'default' : 'outline'}>{workflowSource === 'auto' ? '自动匹配' : workflow ? '手动覆盖' : '未绑定'}</Badge></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={() => { setWorkflowSource('auto'); setCompatibility({ state: 'idle', missing: [] }); }} variant={workflowSource === 'auto' ? 'default' : 'outline'} size="sm">自动匹配</Button><Button onClick={() => manualWorkflow && setWorkflowSource('manual')} variant={workflowSource === 'manual' ? 'default' : 'outline'} size="sm" disabled={!manualWorkflow}>手动覆盖</Button></div>
          <div className="mt-3 rounded-lg border border-white/8 bg-background/50 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs font-medium">{workflowName || '工作流加载中…'}</strong><Badge variant="outline" className="text-[10px]">{beat.mode}</Badge></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{workflowSource === 'auto' ? matchedWorkflow.description : '使用你导入的 API Format JSON；系统仍会注入当前 Beat 的提示词、参数与图片。'}</p></div>
          <input ref={workflowInput} type="file" accept=".json,application/json" className="hidden" onChange={(event) => importWorkflow(event.target.files?.[0])} />
          <Button onClick={() => workflowInput.current?.click()} variant="outline" className="mt-3 w-full"><Workflow />导入其他 API 工作流</Button>
          </section>}
    test={<section className="mt-4 rounded-2xl border border-white/8 bg-card p-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">测试参数</h3><Badge className="bg-amber-300/12 text-amber-200">单 Beat</Badge></div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <label htmlFor="megapixels" className="text-xs text-muted-foreground">分辨率<select id="megapixels" value={megapixels} onChange={(event) => setMegapixels(Number(event.target.value))} className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-background px-2 text-foreground"><option value="0.4">快速预览 · 0.4 MP</option><option value="0.7">标准画质 · 0.7 MP</option><option value="1">高画质 · 1.0 MP</option></select></label>
            <label htmlFor="steps" className="text-xs text-muted-foreground">采样步数<Input id="steps" type="number" min={4} max={40} value={steps} onChange={(event) => setSteps(Number(event.target.value))} className="mt-1 border-white/10 bg-background" /></label>
          </div>
          <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">模式</dt><dd>{beat.mode}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">时长</dt><dd>{beat.duration}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">任务</dt><dd>{job ? ({ pending: '排队中', running: '正在生成', completed: '已完成，请检查', error: '失败，请检查后重试' }[job.status]) : '尚未生成'}</dd></div></dl>
          <Button onClick={submitBeat} className="mt-5 h-10 w-full" disabled={Boolean(blockedReason)}>{submitting || job?.status === 'pending' || job?.status === 'running' ? <><LoaderCircle className="animate-spin" />生成中…</> : <><Play />生成这个段落的测试视频</>}</Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">只提交一次；运行中禁止重复提交</p>
        </section>}
    result={videoUrl ? <section className="rounded-2xl border border-emerald-400/15 bg-card p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium">生成结果</h3><a href={videoUrl} download className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs"><Download className="size-3" />下载</a></div><video ref={videoRef} src={videoUrl} controls className="mx-auto aspect-[9/16] max-h-[52dvh] w-full rounded-lg bg-black object-contain"><track kind="captions" srcLang="zh" label="暂无字幕" src="data:text/vtt,WEBVTT" /></video><Button onClick={extractQcFrames} variant="outline" size="sm" className="mt-3 w-full"><Aperture />抽取首中尾帧</Button>{qcFrames.length > 0 && <div className="mt-3 grid grid-cols-3 gap-1">{qcFrames.map((frame, index) => <Image unoptimized width={180} height={320} key={frame.slice(-24)} src={frame} alt={`${['首','中','尾'][index]}帧质检图`} className="aspect-[9/16] rounded object-cover" />)}</div>}<div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={() => markQc('passed')} variant={qc === 'passed' ? 'default' : 'outline'} size="sm">质检通过</Button><Button onClick={() => markQc('failed')} variant={qc === 'failed' ? 'destructive' : 'outline'} size="sm">需要重做</Button></div><p className="mt-2 text-center text-[11px] text-muted-foreground">人物 · 空间 · 道具 · 表演 · 台词 · 连续性</p></section> : <section className="video-result-empty"><div className="video-placeholder-frame" role="img" aria-label={`Beat ${beat.id} 竖屏视频预览占位图`}><span className="video-placeholder-play"><Play /></span><span className="video-placeholder-label">9:16 · VIDEO PREVIEW</span></div><div><h3 className="font-medium">Beat {beat.id} · {beat.title}</h3><p className="mt-1 text-sm text-muted-foreground">视频生成后将在这里自动替换占位图，并提供播放、下载和抽帧质检。</p></div></section>}
  />;
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DirectorVideoCheck } from '@/components/director-video-check';
import type { DirectorBeat } from '@/lib/director';
import type { AssetTask, OutputFile } from '@/lib/asset-binding';
import { h3Timing, compileDirectorTimeline, type DirectorOptions } from '@/lib/director-timeline';
import { checkpointBeat, checkpointOptions, canJoinSegments, type SegmentConfig } from '@/lib/director-checkpoints';
import { planBeatFrames } from '@/lib/beat-frame-plan';
import { withoutStoryboardApproval, storyboardPromptBlockReason } from '@/lib/storyboard-approval';
import { decideAutomaticAction } from '@/lib/automatic-review';
import { sampleVideo } from '@/lib/video-inspection';
import { acceptedTaskId } from '@/lib/task-state';
import { LoaderCircle } from 'lucide-react';

type Segment = { id: string; status: 'pending' | 'running' | 'completed' | 'error' | 'uncertain'; promptId?: string; files?: OutputFile[]; qc?: 'passed' | 'failed'; note?: string; attempt: number; recipe: string };
type Session = { fingerprint: string; url: string; segments: Segment[]; history?: Segment[]; join?: Segment };
export type ProductionPreview = { finalPrompt?: string; effectiveWorkflow?: DirectorBeat['mode']; canReview?: boolean; onReview?: (value: 'passed' | 'failed') => void; inputImages?: { title: string; src: string }[]; selected: string; src: string; filmSrc: string; status: string; changed: boolean; segments: { id: string; status: string; src: string }[] };
type Props = { selected?: string; onPreview?: (value: ProductionPreview) => void; automatic?: boolean; beats: DirectorBeat[]; assets: AssetTask[]; sourceUrl: string; directorUrl: string; options: DirectorOptions; disabled: boolean; onBusy: (busy: boolean) => void; onLog: (message: string, detail: string) => void };
const videoFile = (s?: Segment) => s?.files?.find((f) => /\.mp4$/i.test(f.filename || ''));
const frameFile = (s?: Segment) => s?.files?.find((f) => /\.png$/i.test(f.filename || ''));
function fileUrl(url: string, file?: OutputFile) { return file ? `/api/comfy/view?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(file.filename || '')}&subfolder=${encodeURIComponent(file.subfolder || '')}&type=${encodeURIComponent(file.type || 'output')}` : ''; }

export function DirectorCheckpointPanel(p: Props) {
  const { onBusy, onPreview } = p;
  const [session, setSession] = useState<Session | null>(null);
  const [configs, setConfigs] = useState<Record<string, SegmentConfig>>({});
  const [constraints, setConstraints] = useState('');
  const [style, setStyle] = useState('');
  const [ready, setReady] = useState(false);
  const [workflowTarget, setWorkflowTarget] = useState<HTMLElement | null>(null);
  const [statusTarget, setStatusTarget] = useState<HTMLElement | null>(null);
  const [quickTarget, setQuickTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { const timer = setTimeout(() => { setWorkflowTarget(document.getElementById('production-workflow-settings')); setQuickTarget(document.getElementById('production-quick-actions')); setStatusTarget(document.getElementById('production-runtime-status')); }, 0); return () => clearTimeout(timer); }, []);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [autoRunning, setAutoRunning] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const autoToken = useRef(0);
  const lock = useRef(false);
  const fingerprint = JSON.stringify({ beats: p.beats.map(withoutStoryboardApproval), assets: p.assets.filter((a) => p.beats.some((b) => b.referenceAssetIds?.includes(a.id))).map((a) => ({ id: a.id, files: a.files })), options: p.options, url: p.directorUrl, source: p.sourceUrl });
  const changed = Boolean(session && session.fingerprint !== fingerprint);
  const active = session?.segments.find((s) => ['pending', 'running'].includes(s.status)) || (session?.join && ['pending', 'running'].includes(session.join.status) ? session.join : undefined);
  const busy = pending || Boolean(active) || auditing;
  const uncertain = session?.segments.some((s) => s.status === 'uncertain') || session?.join?.status === 'uncertain';
  const index = session?.segments.findIndex((s) => s.qc !== 'passed') ?? -1;
  const next = index >= 0 ? index : session?.segments.length || 0;
  const current = session?.segments[next];
  const previous = session?.segments[next - 1];
  const approved = p.assets.filter((a) => a.status === 'approved' && a.files?.some((f) => /\.(png|jpe?g|webp)$/i.test(f.filename || '')));
  const approvedFrames = (session?.segments || []).flatMap((s, i) => s.qc === 'passed' && frameFile(s) ? [{ id: `__checkpoint_frame_${i}`, title: `${s.id} 已验收末帧`, kind: 'first_frame' as const, file: frameFile(s)! }] : []);
  let preparationError = '';
  if (next < p.beats.length && !busy && !changed) {
    try {
      const draft = checkpointBeat(p.beats[next], previous?.qc === 'passed' && frameFile(previous) ? '__previous_frame' : undefined, configs[p.beats[next].id] || {}, constraints, style);
      const images = Object.fromEntries(approved.map((a, i) => [a.id, { id: a.id, title: a.title, kind: a.kind, file: `preview/${i}.png` }]));
      images.__previous_frame = { id: '__previous_frame', title: '已验收末帧', kind: 'first_frame', file: 'preview/last.png' };
      approvedFrames.forEach((frame) => { images[frame.id] = { id: frame.id, title: frame.title, kind: frame.kind, file: 'preview/approved.png' }; });
      compileDirectorTimeline([draft], images, checkpointOptions(p.options, configs[p.beats[next].id] || {}, next));
    } catch (error) { preparationError = error instanceof Error ? error.message : '请检查当前段'; }
  }
  if (next < p.beats.length) preparationError = storyboardPromptBlockReason(p.beats[next], configs[p.beats[next].id]?.promptOverride) || preparationError;
  useEffect(() => { const timer = setTimeout(() => { try { const saved = JSON.parse(localStorage.getItem('h3-director-checkpoints') || '{}'); setSession(saved.session || null); setConfigs(saved.configs || {}); setConstraints(saved.constraints || ''); setStyle(saved.style || ''); } catch { /* corrupt cache */ } setReady(true); }, 0); return () => clearTimeout(timer); }, []);
  useEffect(() => { if (ready) localStorage.setItem('h3-director-checkpoints', JSON.stringify({ session, configs, constraints, style })); }, [ready, session, configs, constraints, style]);
  useEffect(() => { onBusy(Boolean(busy || uncertain)); return () => onBusy(false); }, [busy, uncertain, onBusy]);
  const pollingUrl = session?.url;
  const pollingId = active?.promptId;
  useEffect(() => {
    if (!pollingId || !pollingUrl) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/comfy/status?url=${encodeURIComponent(pollingUrl)}&promptId=${encodeURIComponent(pollingId)}`);
        const data = await response.json() as { error?: string; uncertain?: boolean; promptId?: string; status?: Segment['status']; files?: OutputFile[]; messages?: unknown[] }; if (!response.ok) throw new Error(data.error || '状态读取失败');
        if (!alive) return;
        if (['pending', 'running', 'completed', 'error'].includes(data.status || '')) setSession((old) => {
          if (!old) return old;
          const update = (s: Segment) => s.promptId === pollingId ? { ...s, status: data.status!, files: data.files, note: data.status === 'error' ? JSON.stringify(data.messages || []).slice(0, 500) : s.note } : s;
          return { ...old, segments: old.segments.map(update), join: old.join ? update(old.join) : undefined };
        });
      } catch { if (alive) setMessage('暂时无法查询，保留任务ID继续轮询；不会重新提交。'); }
    }, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, [pollingId, pollingUrl]);

  async function submit(dryRun: boolean, target = next) {
    if (!dryRun && target !== next) return;
    const targetPrevious = session?.segments[target - 1];
    if (!ready || (target === next && preparationError) || lock.current || busy || uncertain || changed || p.disabled || target >= p.beats.length || (!dryRun && current?.status === 'completed' && current.qc !== 'failed')) return;
    const beat = p.beats[target], config = configs[beat.id] || {};
    const recipe = JSON.stringify({ config, constraints, style, beat });
    const lastAttempt = current || session?.history?.findLast((segment) => segment.id === beat.id);
    if (!dryRun && lastAttempt && lastAttempt.attempt >= 2 && lastAttempt.recipe === recipe) { setAutoRunning(false); setMessage('同段已尝试两次。请调整描述、关键帧或采样模式后再试，不能仅反复提交。'); return; }
    lock.current = true; setPending(true);
    try {
      setMessage(`正在检查 ${beat.id} 的素材与参数，未提交生成…`);

      const frame = frameFile(targetPrevious);
      const resolved = checkpointBeat(beat, targetPrevious?.qc === 'passed' && frame ? '__previous_frame' : undefined, config, constraints, style);
      const assets = approved.map((a) => ({ id: a.id, title: a.title, kind: a.kind, file: a.files!.find((f) => /\.(png|jpe?g|webp)$/i.test(f.filename || ''))! }));
      const inputs = [...assets, ...approvedFrames.map((item) => ({ ...item, sourceUrl: session?.url || p.directorUrl })), ...(frame ? [{ id: '__previous_frame', title: '已验收上段末帧', kind: 'first_frame', file: frame, sourceUrl: session?.url || p.directorUrl }] : [])];
      const options = checkpointOptions(p.options, config, target);
      // Mark uncertainty before submitting: a lost response must never trigger an automatic retry.
      if (!dryRun) setSession((old) => ({ fingerprint, url: p.directorUrl, history: [...(old?.history || []), ...(current ? [current] : [])], segments: [...(old?.segments || []).slice(0, next), { id: beat.id, status: 'uncertain', attempt: (lastAttempt?.attempt || 0) + 1, recipe }] }));
      const response = await fetch('/api/comfy/director', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUrl: p.sourceUrl, directorUrl: p.directorUrl, beats: [resolved], assets: inputs, options, dryRun }) });
      const data = await response.json() as { error?: string; uncertain?: boolean; promptId?: string; status?: Segment['status']; files?: OutputFile[]; messages?: unknown[] };
      if (!response.ok) { if (!dryRun) setSession((old) => old ? { ...old, segments: old.segments.map((s, i) => i === next ? { ...s, status: data.uncertain ? 'uncertain' : 'error', note: data.error } : s) } : old); throw new Error(data.error || '提交失败'); }
      if (dryRun) setMessage('当前段环境、素材检查通过，未提交生成。');
      else { const promptId = acceptedTaskId(data); setSession((old) => old ? { ...old, segments: old.segments.map((s, i) => i === next ? { ...s, status: 'pending', promptId } : s) } : old); setMessage('只提交当前一段；完成后等待观看验收。'); p.onLog('逐段验收已提交', `${beat.id} · ${promptId}`); }
    } catch (error) { setAutoRunning(false); setMessage(error instanceof Error ? error.message : '请求失败，请查队列'); }
    finally { lock.current = false; setPending(false); }
  }
  async function join() {
    if (!ready || lock.current || busy || uncertain || changed || !session || !canJoinSegments(session.segments, p.beats.length)) return;
    lock.current = true; setPending(true);
    setSession((old) => old ? { ...old, join: { id: 'film', status: 'uncertain', attempt: 1, recipe: '' } } : old);
    try {
      const response = await fetch('/api/comfy/director/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directorUrl: session.url, files: session.segments.map(videoFile) }) });
      const data = await response.json() as { error?: string; uncertain?: boolean; promptId?: string; status?: Segment['status']; files?: OutputFile[]; messages?: unknown[] };
      if (!response.ok) { setSession((old) => old ? { ...old, join: { id: 'film', status: data.uncertain ? 'uncertain' : 'error', attempt: 1, recipe: '', note: data.error } } : old); throw new Error(data.error || '合片失败'); }
      const promptId = acceptedTaskId(data);
      setSession((old) => old ? { ...old, join: { id: 'film', status: 'pending', promptId, attempt: 1, recipe: '' } } : old);
    } catch (error) { setMessage(error instanceof Error ? error.message : '合片请求失败，请查队列'); } finally { lock.current = false; setPending(false); }
  }
  async function recover(automatic = false) {
    if (!ready || session || busy || lock.current) return;
    lock.current = true; setPending(true);
    try {
      const response = await fetch('/api/comfy/director/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directorUrl: p.directorUrl, label: p.options.label, beatIds: p.beats.map((b) => b.id), automatic }) });
      const data = await response.json() as { segments?: Segment[]; error?: string; recoveryPlan?: { resumeIndex: number; constraints: string; style: string; promptPrefix: string } };
      if (!response.ok || !data.segments?.length) throw new Error(data.error || '没有找到分段');
      const plan = data.recoveryPlan;
      if (plan) {
        setSession({ fingerprint, url: p.directorUrl, history: data.segments.slice(plan.resumeIndex + 1), segments: data.segments.slice(0, plan.resumeIndex + 1).map((s, i) => ({ ...s, qc: i < plan.resumeIndex ? 'passed' : 'failed', note: i < plan.resumeIndex ? '依据此前用户验收记录恢复；可下载复查。' : '末帧已偏离固定双人构图，暂停并重做。' })) });
        setConstraints(plan.constraints); setStyle(plan.style);
        setConfigs((old) => ({ ...old, ...Object.fromEntries(p.beats.slice(plan.resumeIndex).map((beat) => [beat.id, { acceleration: 'standard' as const, steps: 20, promptOverride: `${plan.promptPrefix}\n${beat.prompt}` }])) }));
        setMessage(`已恢复前${plan.resumeIndex}段，从第${plan.resumeIndex + 1}段重做。已填写标准20步、双人构图、服装、场景和动画风格要求；旧失败视频保留，未提交生成。`);
      } else {
        setSession({ fingerprint, url: p.directorUrl, segments: data.segments });
        setMessage(`已找回${data.segments.length}段视频和末帧，未运行模型。依次观看确认前段；失败段标为不通过后重做。`);
      }
    } catch (error) { if (!automatic) setMessage(error instanceof Error ? error.message : '找回失败'); }
    finally { lock.current = false; setPending(false); }
  }
  async function inspectAutomatically() {
    if (!current || lock.current) return;
    if (!videoFile(current) || !frameFile(current)) { setAutoRunning(false); setMessage('输出视频或末帧缺失，自动接续已暂停。'); return; }
    lock.current = true; setAuditing(true);
    const token = autoToken.current, inspectedId = current.id, inspectedPrompt = current.promptId;
    try {
      const sample = await sampleVideo(fileUrl(session?.url || p.directorUrl, videoFile(current)), p.options.aspect, h3Timing(Number.parseFloat(p.beats[next].duration)).actualSeconds);
      const passed = sample.passed;
      const reasons = [...sample.reasons];
      if (token !== autoToken.current) return;
      const note = `技术检查（人物、服装、对白需人工验收）：${passed ? '通过' : '不通过'}。${reasons.join('；')} 实际${sample.width}×${sample.height}，${sample.duration.toFixed(2)}秒。声音与完整表演仍需最终观看。`;
      setSession((old) => old ? { ...old, segments: old.segments.map((s) => s.id === inspectedId && s.promptId === inspectedPrompt ? { ...s, qc: passed ? 'passed' : 'failed', note } : s) } : old);
      p.onLog('系统逐段检查', `${inspectedId} · ${note}`);
      if (!passed) { setAutoRunning(false); setMessage(`${inspectedId} 检查不通过，已停止接续。请调整本段或纠偏首尾帧后继续。`); }
    } catch (error) { if (token === autoToken.current) { setAutoRunning(false); setMessage(error instanceof Error ? error.message : '自动检查失败，暂停'); } }
    finally { lock.current = false; setAuditing(false); }
  }
  function startAutomatic() {
    if (!ready || busy || lock.current || changed || uncertain || p.disabled || autoRunning || session?.join?.status === 'completed') return;
    if (p.beats.every(b=>b.pipelineVersion===2)) {
      try {
        const images=Object.fromEntries(approved.map((a,i)=>[a.id,{id:a.id,title:a.title,kind:a.kind,file:`preview/${i}.png`}]));
        p.beats.forEach((beat,i)=>compileDirectorTimeline([checkpointBeat(beat,undefined,configs[beat.id]||{},constraints,style)],images,checkpointOptions(p.options,configs[beat.id]||{},i)));
      } catch(error) { setMessage(error instanceof Error?error.message:'请先采用所需参考图');return; }
    } else {
      const plan=planBeatFrames(p.beats,p.assets,'');
      const missing=Object.entries(plan.bindings).filter(([,binding])=>!approved.some(a=>a.id===binding.keyframeId)||!approved.some(a=>a.id===binding.endKeyframeId));
      if(missing.length){setMessage(`请先生成并采用全部计划首尾帧：${missing.map(([id])=>id).join('、')}`);return;}
      setConfigs(old=>({...old,...Object.fromEntries(Object.entries(plan.bindings).filter(([id])=>session?.segments.find(s=>s.id===id)?.qc!=='passed').map(([id,binding])=>[id,{...old[id],...binding}]))}));
    }
    if (current?.qc === 'failed' || current?.status === 'error') setSession((old) => old ? { ...old, history: [...(old.history || []), ...old.segments.slice(next)], segments: old.segments.slice(0, next), join: undefined } : old);
    else if (session?.join?.status === 'error') setSession((old) => old ? { ...old, join: undefined } : old);
    autoToken.current++; setAutoRunning(true); setMessage('已启动自动逐段执行；检查通过才接续，全部通过后自动合片。请保持当前页面打开。');
  }
  useEffect(() => {
    const action = decideAutomaticAction({ enabled: Boolean(p.automatic && autoRunning), busy: busy || lock.current, blocked: Boolean(!ready || changed || uncertain || p.disabled || preparationError), next, count: p.beats.length, status: current?.status, qc: current?.qc, joined: session?.join?.status === 'completed', joinStatus: session?.join?.status });
    if (action === 'inspect') void inspectAutomatically();
    else if (action === 'submit') void submit(false);
    else if (action === 'join') void join();
    else if (action === 'stop' || action === 'done' || (autoRunning && !busy && !lock.current && (changed || uncertain || p.disabled || preparationError))) { const timer = setTimeout(() => setAutoRunning(false), 0); return () => clearTimeout(timer); }
  });
  const qc = useCallback((value: 'passed' | 'failed') => {
    if (busy || autoRunning || changed || !current || current.status !== 'completed' || !videoFile(current) || !frameFile(current)) return;
    setSession((old) => old ? { ...old, segments: old.segments.map((s, i) => i === next ? { ...s, qc: value } : s) } : old);
  }, [current, next, busy, autoRunning, changed]);
  const selectedSegment = session?.segments.find((segment) => segment.id === p.selected);
  const selectedPreview = fileUrl(session?.url || p.directorUrl, videoFile(selectedSegment));
  const filmPreview = fileUrl(session?.url || p.directorUrl, videoFile(session?.join));
  const previewStatus = selectedSegment?.qc === 'passed' ? '已通过' : selectedSegment?.status || '待生成';
  const previewSegments = JSON.stringify((session?.segments || []).map((segment) => ({ id: segment.id, status: segment.qc === 'passed' ? '已通过' : segment.status, src: fileUrl(session?.url || p.directorUrl, videoFile(segment)) })));
  const inputIndex = p.beats.findIndex((beat) => beat.id === p.selected);
  let finalPrompt = '请选择当前片段';
  let effectiveWorkflow: DirectorBeat['mode'] | undefined;
  let inputImages: { title: string; src: string }[] = [];
  if (inputIndex >= 0) {
    const previousInput = session?.segments.find((segment) => segment.id === p.beats[inputIndex - 1]?.id);
    try {
      const draft = checkpointBeat(p.beats[inputIndex], previousInput?.qc === 'passed' && frameFile(previousInput) ? '__previous_frame' : undefined, configs[p.selected || ''] || {}, constraints, style);
      effectiveWorkflow = draft.mode;
      const images = Object.fromEntries(approved.map((a, i) => [a.id, { id: a.id, title: a.title, kind: a.kind, file: `preview/${i}.png` }]));
      images.__previous_frame = { id: '__previous_frame', title: '已验收上段末帧', kind: 'first_frame', file: 'preview/last.png' };
      approvedFrames.forEach((frame) => { images[frame.id] = { id: frame.id, title: frame.title, kind: frame.kind, file: 'preview/approved.png' }; });
      finalPrompt = compileDirectorTimeline([draft], images, checkpointOptions(p.options, configs[p.selected || ''] || {}, inputIndex)).timeline.clips[0].prompt;
      inputImages = (draft.referenceAssetIds || []).flatMap((id) => {
        if (id === '__previous_frame') return [{ title: `${previousInput!.id} 实际末帧 · 本段首帧`, src: fileUrl(session!.url, frameFile(previousInput)) }];
        const checkpoint = approvedFrames.find((frame) => frame.id === id);
        if (checkpoint) return [{ title: checkpoint.title, src: fileUrl(session?.url || p.directorUrl, checkpoint.file) }];
        const asset = approved.find((item) => item.id === id);
        const file = asset?.files?.find((item) => /\.(png|jpe?g|webp)$/i.test(item.filename || ''));
        return asset && file ? [{ title: asset.title, src: fileUrl(p.sourceUrl, file) }] : [];
      });
    } catch (error) { effectiveWorkflow = configs[p.selected || '']?.workflow || p.beats[inputIndex].mode; finalPrompt = error instanceof Error ? error.message : '当前配置尚不能生成提示词'; }
  }
  const previewInputs = JSON.stringify(inputImages);
  useEffect(() => { onPreview?.({ finalPrompt, effectiveWorkflow, canReview: Boolean(p.beats[next]?.id === p.selected && current?.status === 'completed' && videoFile(current) && frameFile(current) && !busy && !autoRunning && !changed), onReview: qc, selected: p.selected || '', src: selectedPreview, filmSrc: filmPreview, status: previewStatus, changed, inputImages: JSON.parse(previewInputs), segments: JSON.parse(previewSegments) }); }, [onPreview, finalPrompt, effectiveWorkflow, p.selected, selectedPreview, filmPreview, previewStatus, changed, previewSegments, previewInputs, p.beats, next, current, busy, autoRunning, qc]);
  const src = fileUrl(session?.url || p.directorUrl, videoFile(current));
  const selectedIndex = p.beats.findIndex((beat) => beat.id === p.selected);
  const cannotGenerate = (i: number) => !ready || busy || autoRunning || changed || uncertain || p.disabled || i < 0 || i !== next || Boolean(preparationError) || Boolean(session?.segments[i]?.status === 'completed' && session?.segments[i]?.qc !== 'failed');
  const cannotGenerateFilm = !p.automatic || !ready || busy || changed || uncertain || p.disabled || autoRunning || Boolean(preparationError) || session?.join?.status === 'completed';
  const selectedName = p.selected || '当前片段';
  const segmentActionLabel = uncertain ? '任务待核对' : active?.id === selectedName ? `${selectedName} ${active.status === 'running' ? '生成中' : '排队中'}` : active ? `等待${active.id === 'film' ? '合片' : active.id}完成` : auditing ? `${current?.id || selectedName} 验收中` : pending ? '检查 / 提交中' : changed ? '配置已变更' : selectedSegment?.qc === 'passed' ? `${selectedName} 已通过` : selectedSegment?.status === 'completed' && selectedSegment.qc !== 'failed' ? `${selectedName} 待验收` : `生成 ${selectedName}`;
  const filmActionLabel = uncertain ? '整片任务待核对' : active?.id === 'film' ? active.status === 'running' ? '整片合片中' : '整片合片排队中' : active ? `整片制作中 · ${active.id}${active.status === 'running' ? '生成中' : '排队中'}` : auditing ? `整片验收中 · ${current?.id || ''}` : pending ? '整片检查 / 提交中' : changed ? '整片配置已变更' : session?.join?.status === 'completed' ? '整片已完成' : autoRunning ? '整片制作中' : session?.join?.status === 'error' || current?.status === 'error' || current?.qc === 'failed' ? '整片已暂停 · 继续' : session?.segments.length ? '继续制作整片' : '生成整片';
  const showRun = () => document.dispatchEvent(new Event('production-show-run'));
  return <section className="mt-3 space-y-3 text-xs">
    {quickTarget && createPortal(<><Button variant="outline" aria-label="快捷生成当前片段" aria-busy={busy} disabled={cannotGenerate(selectedIndex)} title={selectedSegment?.qc === 'passed' ? '本段已验收；需要重新生成时先进入重做' : '沿用当前片段设置与验收限制'} onClick={() => { showRun(); void submit(false, selectedIndex); }}>{busy && <LoaderCircle className="size-3.5 animate-spin" />}{segmentActionLabel}</Button><Button aria-label="快捷生成整片" aria-busy={busy || autoRunning} disabled={cannotGenerateFilm} title={!p.automatic ? '请在生成设置中选择连续整片' : session?.join?.status === 'completed' ? '整片已完成，结果保留在右侧' : '从未验收片段继续，全部通过后合片'} onClick={() => { showRun(); startAutomatic(); }}>{(busy || autoRunning) && <LoaderCircle className="size-3.5 animate-spin" />}{filmActionLabel}</Button>      <div className="flex flex-wrap gap-2">

        <Button variant="outline" disabled={selectedIndex < 0 || !ready || busy || autoRunning || uncertain || changed || !session?.segments[selectedIndex] || ['pending', 'running', 'uncertain'].includes(session?.segments[selectedIndex]?.status || '')} onClick={() => { autoToken.current++; setAutoRunning(false); setSession((old) => old ? { ...old, history: [...(old.history || []), ...old.segments.slice(selectedIndex + 1)], segments: [...old.segments.slice(0, selectedIndex), { ...old.segments[selectedIndex], qc: 'failed' }], join: undefined } : old); setMessage(`${selectedName} 已进入重做配置。调整后点击时间线“生成 ${selectedName}”；后段记录已归档，前段保留。`); }}>重做 {selectedName}</Button>
      </div>{autoRunning && <Button variant="outline"  onClick={() => { autoToken.current++; setAutoRunning(false); setMessage('已停止自动接续。当前任务会完成，不再提交下一段。'); }}>停止整片接续</Button>}<Button variant="outline" disabled={busy || changed || uncertain || !session || !canJoinSegments(session.segments, p.beats.length) || Boolean(session.join && session.join.status !== 'error')} onClick={() => void join()}>合片</Button></>, quickTarget)}
    <p>当前片段生成后在右侧播放；人工验收请点击“本段通过”。连续模式按检查结果接续，异常会暂停。</p>
    {statusTarget && busy && createPortal(<output className="production-runtime-message block break-words rounded border border-amber-300/30 p-2 text-amber-200">{active ? `${active.id === 'film' ? '合片' : active.id} 已提交，${active.status === 'running' ? '正在生成' : '排队或加载模型中'}。完成后自动显示视频，期间按钮禁用以防重复提交。任务：${active.promptId || '等待任务ID'}` : '正在检查或提交当前段，请稍候。'}</output>, statusTarget)}
    {!session && <Button variant="outline" disabled={!ready || busy || p.disabled} onClick={() => void recover()}>从 Director 找回已生成分段（不重新生成）</Button>}
    {p.beats.map((beat, i) => (!p.selected || beat.id === p.selected) && <div key={beat.id} className="rounded border p-2">
      {workflowTarget && createPortal(<section className="production-workflow-config text-xs">
        {beat.pipelineVersion===2 ? <p className="mb-2">{beat.id} · 多参考 Ref2VA（统一工作流）</p> : <label className="block">{beat.id} · 工作流<select aria-label={`${beat.id}工作流`} disabled={busy || autoRunning || session?.segments[i]?.qc === 'passed'} value={configs[beat.id]?.workflow || ''} onChange={(e) => setConfigs((old) => ({ ...old, [beat.id]: { ...old[beat.id], workflow: (e.target.value || undefined) as SegmentConfig['workflow'], acceleration: e.target.value === 'Ref2VA' ? 'standard' : old[beat.id]?.acceleration, steps: e.target.value === 'Ref2VA' ? (old[beat.id]?.steps ?? 20) : old[beat.id]?.steps, keyframeId: undefined, endKeyframeId: undefined } }))} className="mt-1 w-full rounded border bg-background p-2"><option value="">沿用分镜方案（{beat.continuityFromPrevious ? '已验收末帧接续' : beat.mode}）</option><option value="T2V">文生视频 · T2V</option><option value="I2V">首帧 · I2V</option><option value="FL2VA">首尾帧 · FL2VA</option><option value="Ref2VA">多图参考 · Ref2VA</option></select><p className="mt-2 text-xs text-amber-200">跨模式切换不能共用提示词，请先在02分镜重写并重新采纳。</p></label>}
        {(beat.pipelineVersion===2 || configs[beat.id]?.workflow === 'Ref2VA' || (!configs[beat.id]?.workflow && beat.mode === 'Ref2VA')) ? <div><p>参考图（按勾选顺序绑定，最多 9 张）</p><div className="mt-1 grid max-h-36 grid-cols-2 gap-2 overflow-y-auto">{approved.map((asset) => { const ids = configs[beat.id]?.referenceAssetIds || (beat.mode === 'Ref2VA' ? beat.referenceAssetIds : []) || []; const checked = ids.includes(asset.id); return <label key={asset.id} className="flex items-center gap-2"><input type="checkbox" aria-label={`${beat.id}参考图 ${asset.title}`} checked={checked} disabled={busy || autoRunning || session?.segments[i]?.qc === 'passed' || (!checked && ids.length >= 9)} onChange={() => setConfigs((old) => ({ ...old, [beat.id]: { ...old[beat.id], workflow: 'Ref2VA', acceleration: beat.pipelineVersion===2 ? old[beat.id]?.acceleration : 'standard', steps: beat.pipelineVersion===2 ? 20 : old[beat.id]?.steps ?? 20, referenceAssetIds: checked ? ids.filter((id) => id !== asset.id) : [...ids, asset.id] } }))} />{checked && `${ids.indexOf(asset.id) + 1}. `}{asset.title}</label>; })}</div><p className="mt-1 text-muted-foreground">多参考可选专用8步加速或标准20步，参考图职责保持一致。</p></div> : configs[beat.id]?.workflow !== 'T2V' && <details><summary>{(configs[beat.id]?.workflow || beat.mode) === 'FL2VA' ? '首帧 / 尾帧' : '首帧'}</summary>      <label className="mt-2 block">首帧<select aria-label={`${beat.id}首帧`} disabled={busy || session?.segments[i]?.qc === 'passed'} value={configs[beat.id]?.keyframeId || ''} onChange={(e) => setConfigs((old) => ({ ...old, [beat.id]: { ...old[beat.id], keyframeId: e.target.value || undefined } }))} className="mt-2 w-full border bg-background p-2"><option value="">沿用原方案 / 已验收末帧</option>{[...approved.filter((a) => ['first_frame', 'last_frame'].includes(a.kind)), ...approvedFrames.filter((f) => Number(f.id.split('_').pop()) < i)].map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
      {(configs[beat.id]?.workflow || beat.mode) === 'FL2VA' && <label className="mt-2 block">尾帧<select aria-label={`${beat.id}尾帧`} disabled={busy || session?.segments[i]?.qc === 'passed'} value={configs[beat.id]?.endKeyframeId || ''} onChange={(e) => setConfigs((old) => ({ ...old, [beat.id]: { ...old[beat.id], endKeyframeId: e.target.value || undefined } }))} className="mt-1 w-full border bg-background p-2"><option value="">不指定尾帧</option>{[...approved.filter((a) => ['first_frame', 'last_frame'].includes(a.kind)), ...approvedFrames.filter((f) => Number(f.id.split('_').pop()) < i)].map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>}
      {(configs[beat.id]?.workflow || beat.mode) === 'FL2VA' && configs[beat.id]?.endKeyframeId && <p className="mt-1 text-amber-200">首尾帧会锁定两端构图；中间仍需验收。相同姿态可能减少动作，建议使用同机位、服装一致且仅有轻微表情变化的尾帧。</p>}
      {configs[beat.id]?.keyframeId && <p className="mt-1 text-amber-200">将从此完整首帧重新锁定画面；请确认姿态符合上一段结束状态，避免跳变。</p>}
</details>}
      </section>, workflowTarget)}
      <details className="production-secondary"><summary>本段采样参数</summary>      <select aria-label={`${beat.id}采样模式`} disabled={busy || session?.segments[i]?.qc === 'passed'} value={configs[beat.id]?.acceleration || ''} onChange={(e) => setConfigs((old) => ({ ...old, [beat.id]: { ...old[beat.id], acceleration: (e.target.value || undefined) as SegmentConfig['acceleration'] } }))} className="mt-2 w-full border bg-background p-2"><option value="">跟随整片模式</option><option value="standard">标准模式（复杂动作可对照）</option><option value="turbo8">Turbo 8步</option></select>
      {beat.pipelineVersion!==2 && <Input aria-label={`${beat.id}标准步数`} type="number" min={4} max={40} disabled={busy || session?.segments[i]?.qc === 'passed'} value={configs[beat.id]?.steps ?? p.options.steps} onChange={(e) => setConfigs((old) => ({ ...old, [beat.id]: { ...old[beat.id], steps: Number(e.target.value) } }))} />}
      </details>
      <p className="production-current-title">当前片段：{beat.id} · {beat.title} · {session?.segments[i]?.qc === 'passed' ? '已通过' : session?.segments[i]?.status || '待生成'}</p>
      <p className="mt-1 text-emerald-200">本段有效参数：{(configs[beat.id]?.acceleration || p.options.acceleration) === 'turbo8' ? 'Turbo · 8步' : `标准 · ${beat.pipelineVersion===2 ? 20 : configs[beat.id]?.steps ?? p.options.steps}步`} · {p.options.megapixels} MP · {p.options.aspect}；{configs[beat.id]?.acceleration ? '本段覆盖整片默认' : '跟随整片默认'}</p>
      {storyboardPromptBlockReason(beat, configs[beat.id]?.promptOverride) && <div className="mt-2"><p className="text-amber-200">{storyboardPromptBlockReason(beat, configs[beat.id]?.promptOverride)}</p><Button variant="outline" disabled={busy || autoRunning} onClick={() => setConfigs((old) => ({ ...old, [beat.id]: { ...old[beat.id], promptOverride: undefined } }))}>沿用已采纳分镜提示词</Button></div>}

      {videoFile(session?.segments[i]) && <a className="mt-2 block text-emerald-200" href={fileUrl(session!.url, videoFile(session!.segments[i]))} download>下载本段</a>}
      {frameFile(session?.segments[i]) && <a className="mt-1 block text-emerald-200" href={fileUrl(session!.url, frameFile(session!.segments[i]))} download>查看 / 下载本段末帧</a>}

      {i > next && <p className="mt-2 text-muted-foreground">先完成并验收 {p.beats[next]?.id}，再运行本段。</p>}
      {src && i === next && <div className="mt-3 space-y-2"><DirectorVideoCheck src={src} aspect={p.options.aspect} /><textarea aria-label="本段问题记录" placeholder="记录构图、服装、人物、风格或声音问题" value={current?.note || ''} onChange={(e) => setSession((old) => old ? { ...old, segments: old.segments.map((item, index) => index === next ? { ...item, note: e.target.value } : item) } : old)} className="w-full border bg-background p-2" /></div>}

    </div>)}
    <div className="rounded border border-emerald-300/30 p-3"><strong>技术检查与人工验收</strong><p>每段生成后检查视频能否读取、画幅、时长和输出文件，通过后接续，全部通过后合片。人物、服装、场景、对白及接缝请人工观看确认。刷新后需主动继续，请保持当前页面打开。</p></div>
    <details className="production-secondary"><summary>全片约束与计划首尾帧</summary>    <label className="block">每段持续保持的要求<textarea aria-label="持续约束" disabled={busy} value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder="例如：固定双人中景、男女左右站位；女主酒红礼服，男主深灰西装；机位固定，全程不切特写。" className="mt-1 min-h-24 w-full rounded border bg-background p-2" /></label>
    <label htmlFor="checkpoint-style" className="block">全片视觉风格<Input id="checkpoint-style" aria-label="全片风格" disabled={busy} value={style} onChange={(e) => setStyle(e.target.value)} placeholder="例如：日系二维动画，干净线条、赛璐璐上色，全程保持" /></label>
    <Button variant="outline" disabled={busy || autoRunning || changed} onClick={() => {
      const plan = planBeatFrames(p.beats, p.assets, '');
      const entries = Object.entries(plan.bindings).filter(([id, binding]) => session?.segments.find((s) => s.id === id)?.qc !== 'passed' && approved.some((a) => a.id === binding.keyframeId) && approved.some((a) => a.id === binding.endKeyframeId));
      setConfigs((old) => ({ ...old, ...Object.fromEntries(entries.map(([id, binding]) => [id, { ...old[id], ...binding }])) }));
      setMessage(`已绑定 ${entries.length} 段已采用的计划首尾帧，使用首尾帧模式。未通过图片验收的段不会绑定；前段视频记录保留，未提交生成。`);
    }}>绑定已采用的计划首尾帧</Button>
    </details>
    {preparationError && <p className="text-amber-200">{preparationError}</p>}
    {changed && <p className="text-amber-200">剧本、素材、服务或全局参数已改变。先导出当前记录，再开启新一轮，不能把旧结果与新项目混合。</p>}
    {uncertain && <div className="text-amber-200">提交结果未知，先核对Director队列。若已提交，可填写任务ID恢复查询：<Input aria-label="恢复任务ID" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { const id = e.currentTarget.value.trim(); setSession((old) => old ? { ...old, segments: old.segments.map((s) => s.status === 'uncertain' ? { ...s, status: 'pending', promptId: id } : s), join: old.join?.status === 'uncertain' ? { ...old.join, status: 'pending', promptId: id } : old.join } : old); } }} /><Button variant="outline" disabled={busy} onClick={() => setSession((old) => old ? { ...old, segments: old.segments.map((s) => s.status === 'uncertain' ? { ...s, status: 'error' } : s), join: old.join?.status === 'uncertain' ? { ...old.join, status: 'error' } : old.join } : old)}>我已查队列，确认未提交</Button></div>}

    {session?.join && <p>合片：{session.join.status} {session.join.note}</p>}
    <div className="checkpoint-record-actions">{videoFile(session?.join) && <><a className="checkpoint-download" href={fileUrl(session!.url, videoFile(session!.join))} download>下载已验收分段整片</a></>}
    <Button variant="outline" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ session, configs, constraints, style }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'director-checkpoints.json'; a.click(); URL.revokeObjectURL(url); }}>导出逐段记录（素材另行备份）</Button>
    <Button variant="outline" disabled={busy || uncertain} onClick={() => { autoToken.current++; setAutoRunning(false); setSession(null); setConfigs({}); setConstraints(''); setStyle(''); setMessage('已开启新一轮，旧视频保留；旧持续约束、逐段覆盖和首尾帧绑定已清理。启动连续制作时将绑定当前项目已采用的计划首尾帧。'); }}>开启新一轮验收</Button></div>
    {statusTarget && !busy && message && createPortal(<output className="production-runtime-message block break-words">{message}</output>, statusTarget)}
  </section>;
}

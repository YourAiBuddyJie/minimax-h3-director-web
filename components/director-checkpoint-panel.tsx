'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DirectorVideoCheck } from '@/components/director-video-check';
import type { DirectorBeat } from '@/lib/director';
import type { AssetTask, OutputFile } from '@/lib/asset-binding';
import { compileDirectorTimeline, type DirectorOptions } from '@/lib/director-timeline';
import { checkpointBeat, checkpointOptions, canJoinSegments, type SegmentConfig } from '@/lib/director-checkpoints';

type Segment = { id: string; status: 'pending' | 'running' | 'completed' | 'error' | 'uncertain'; promptId?: string; files?: OutputFile[]; qc?: 'passed' | 'failed'; note?: string; attempt: number; recipe: string };
type Session = { fingerprint: string; url: string; segments: Segment[]; history?: Segment[]; join?: Segment };
type Props = { beats: DirectorBeat[]; assets: AssetTask[]; sourceUrl: string; directorUrl: string; options: DirectorOptions; disabled: boolean; onBusy: (busy: boolean) => void; onLog: (message: string, detail: string) => void };
const videoFile = (s?: Segment) => s?.files?.find((f) => /\.mp4$/i.test(f.filename || ''));
const frameFile = (s?: Segment) => s?.files?.find((f) => /\.png$/i.test(f.filename || ''));
function fileUrl(url: string, file?: OutputFile) { return file ? `/api/comfy/view?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(file.filename || '')}&subfolder=${encodeURIComponent(file.subfolder || '')}&type=${encodeURIComponent(file.type || 'output')}` : ''; }

export function DirectorCheckpointPanel(p: Props) {
  const { onBusy } = p;
  const [session, setSession] = useState<Session | null>(null);
  const [configs, setConfigs] = useState<Record<string, SegmentConfig>>({});
  const [constraints, setConstraints] = useState('');
  const [style, setStyle] = useState('');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const fingerprint = JSON.stringify({ beats: p.beats, assets: p.assets.filter((a) => p.beats.some((b) => b.referenceAssetIds?.includes(a.id))).map((a) => ({ id: a.id, files: a.files })), options: p.options, url: p.directorUrl, source: p.sourceUrl });
  const changed = Boolean(session && session.fingerprint !== fingerprint);
  const active = session?.segments.find((s) => ['pending', 'running'].includes(s.status)) || (session?.join && ['pending', 'running'].includes(session.join.status) ? session.join : undefined);
  const busy = pending || Boolean(active);
  const uncertain = session?.segments.some((s) => s.status === 'uncertain') || session?.join?.status === 'uncertain';
  const index = session?.segments.findIndex((s) => s.qc !== 'passed') ?? -1;
  const next = index >= 0 ? index : session?.segments.length || 0;
  const current = session?.segments[next];
  const previous = session?.segments[next - 1];
  const approved = p.assets.filter((a) => a.status === 'approved' && a.files?.some((f) => /\.(png|jpe?g|webp)$/i.test(f.filename || '')));
  let preparationError = '';
  if (next < p.beats.length && !busy && !changed) {
    try {
      const draft = checkpointBeat(p.beats[next], previous?.qc === 'passed' && frameFile(previous) ? '__previous_frame' : undefined, configs[p.beats[next].id] || {}, constraints, style);
      const images = Object.fromEntries(approved.map((a, i) => [a.id, { id: a.id, title: a.title, kind: a.kind, file: `preview/${i}.png` }]));
      images.__previous_frame = { id: '__previous_frame', title: '已验收末帧', kind: 'first_frame', file: 'preview/last.png' };
      compileDirectorTimeline([draft], images, checkpointOptions(p.options, configs[p.beats[next].id] || {}, next));
    } catch (error) { preparationError = error instanceof Error ? error.message : '请检查当前段'; }
  }
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

  async function submit(dryRun: boolean) {
    if (!ready || preparationError || lock.current || busy || uncertain || changed || p.disabled || next >= p.beats.length || (current?.status === 'completed' && current.qc !== 'failed')) return;
    const beat = p.beats[next], config = configs[beat.id] || {};
    const recipe = JSON.stringify({ config, constraints, style, beat });
    if (!dryRun && current && current.attempt >= 2 && current.recipe === recipe) { setMessage('同段已尝试两次。请调整描述、关键帧或采样模式后再试，不能仅反复提交。'); return; }
    lock.current = true; setPending(true);
    try {
      const frame = frameFile(previous);
      const resolved = checkpointBeat(beat, previous?.qc === 'passed' && frame ? '__previous_frame' : undefined, config, constraints, style);
      const assets = approved.map((a) => ({ id: a.id, title: a.title, kind: a.kind, file: a.files!.find((f) => /\.(png|jpe?g|webp)$/i.test(f.filename || ''))! }));
      const inputs = frame ? [...assets, { id: '__previous_frame', title: '已验收上段末帧', kind: 'first_frame', file: frame, sourceUrl: session?.url || p.directorUrl }] : assets;
      const options = checkpointOptions(p.options, config, next);
      // Mark uncertainty before submitting: a lost response must never trigger an automatic retry.
      if (!dryRun) setSession((old) => ({ fingerprint, url: p.directorUrl, history: [...(old?.history || []), ...(current ? [current] : [])], segments: [...(old?.segments || []).slice(0, next), { id: beat.id, status: 'uncertain', attempt: (current?.attempt || 0) + 1, recipe }] }));
      const response = await fetch('/api/comfy/director', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUrl: p.sourceUrl, directorUrl: p.directorUrl, beats: [resolved], assets: inputs, options, dryRun }) });
      const data = await response.json() as { error?: string; uncertain?: boolean; promptId?: string; status?: Segment['status']; files?: OutputFile[]; messages?: unknown[] };
      if (!response.ok) { if (!dryRun) setSession((old) => old ? { ...old, segments: old.segments.map((s, i) => i === next ? { ...s, status: data.uncertain ? 'uncertain' : 'error', note: data.error } : s) } : old); throw new Error(data.error || '提交失败'); }
      if (dryRun) setMessage('当前段环境、素材检查通过，未提交生成。');
      else { setSession((old) => old ? { ...old, segments: old.segments.map((s, i) => i === next ? { ...s, status: 'pending', promptId: data.promptId } : s) } : old); setMessage('只提交当前一段；完成后等待观看验收。'); p.onLog('逐段验收已提交', `${beat.id} · ${data.promptId}`); }
    } catch (error) { setMessage(error instanceof Error ? error.message : '请求失败，请查队列'); }
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
      setSession((old) => old ? { ...old, join: { id: 'film', status: 'pending', promptId: data.promptId, attempt: 1, recipe: '' } } : old);
    } catch (error) { setMessage(error instanceof Error ? error.message : '合片请求失败，请查队列'); } finally { lock.current = false; setPending(false); }
  }
  function qc(value: 'passed' | 'failed') {
    if (!current || current.status !== 'completed' || !videoFile(current) || !frameFile(current)) return;
    setSession((old) => old ? { ...old, segments: old.segments.map((s, i) => i === next ? { ...s, qc: value } : s) } : old);
  }
  const src = fileUrl(session?.url || p.directorUrl, videoFile(current));
  return <section className="mt-3 space-y-3 text-xs">
    <p>每段生成后停住，完整观看人物、服装、构图、风格、声音和接缝，再决定接续。检测工具仅检查尺寸与疑似黑边，不会自动判定人物或服装合格。</p>
    <label className="block">每段持续保持的要求<textarea aria-label="持续约束" disabled={busy} value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder="例如：固定双人中景、男女左右站位；女主酒红礼服，男主深灰西装；机位固定，全程不切特写。" className="mt-1 min-h-24 w-full rounded border bg-background p-2" /></label>
    <label htmlFor="checkpoint-style" className="block">全片视觉风格<Input id="checkpoint-style" aria-label="全片风格" disabled={busy} value={style} onChange={(e) => setStyle(e.target.value)} placeholder="例如：日系二维动画，干净线条、赛璐璐上色，全程保持" /></label>
    {p.beats.map((beat, i) => <div key={beat.id} className="rounded border p-2">
      <p>{beat.id} · {beat.title} · {session?.segments[i]?.qc === 'passed' ? '已通过' : session?.segments[i]?.status || '待生成'}</p>
      <select aria-label={`${beat.id}采样模式`} disabled={busy || session?.segments[i]?.qc === 'passed'} value={configs[beat.id]?.acceleration || ''} onChange={(e) => setConfigs((old) => ({ ...old, [beat.id]: { ...old[beat.id], acceleration: (e.target.value || undefined) as SegmentConfig['acceleration'] } }))} className="mt-2 w-full border bg-background p-2"><option value="">跟随整片模式</option><option value="standard">标准模式（复杂动作可对照）</option><option value="turbo8">Turbo 8步</option></select>
      <Input aria-label={`${beat.id}标准步数`} type="number" min={4} max={40} disabled={busy || session?.segments[i]?.qc === 'passed'} value={configs[beat.id]?.steps ?? p.options.steps} onChange={(e) => setConfigs((old) => ({ ...old, [beat.id]: { ...old[beat.id], steps: Number(e.target.value) } }))} />
      <select aria-label={`${beat.id}纠偏关键帧`} disabled={busy || session?.segments[i]?.qc === 'passed'} value={configs[beat.id]?.keyframeId || ''} onChange={(e) => setConfigs((old) => ({ ...old, [beat.id]: { ...old[beat.id], keyframeId: e.target.value || undefined } }))} className="mt-2 w-full border bg-background p-2"><option value="">沿用原方案 / 已验收末帧</option>{approved.filter((a) => a.kind === 'first_frame').map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select>
      {configs[beat.id]?.keyframeId && <p className="mt-1 text-amber-200">将从此完整首帧重新锁定画面；请确认姿态符合上一段结束状态，避免跳变。</p>}
      {videoFile(session?.segments[i]) && <a className="mt-2 block text-emerald-200" href={fileUrl(session!.url, videoFile(session!.segments[i]))} download>下载本段</a>}
      {frameFile(session?.segments[i]) && <a className="mt-1 block text-emerald-200" href={fileUrl(session!.url, frameFile(session!.segments[i]))} download>查看 / 下载本段末帧</a>}
      {session?.segments[i]?.qc === 'passed' && <Button variant="outline" disabled={busy || Boolean(uncertain) || changed} onClick={() => setSession((old) => old ? { ...old, history: [...(old.history || []), ...old.segments.slice(i + 1)], segments: [...old.segments.slice(0, i), { ...old.segments[i], qc: 'failed' }], join: undefined } : old)}>从此段重做（后段需重新生成验收）</Button>}
    </div>)}
    {preparationError && <p className="text-amber-200">{preparationError}</p>}
    {changed && <p className="text-amber-200">剧本、素材、服务或全局参数已改变。先导出当前记录，再开启新一轮，不能把旧结果与新项目混合。</p>}
    {uncertain && <div className="text-amber-200">提交结果未知，先核对Director队列。若已提交，可填写任务ID恢复查询：<Input aria-label="恢复任务ID" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { const id = e.currentTarget.value.trim(); setSession((old) => old ? { ...old, segments: old.segments.map((s) => s.status === 'uncertain' ? { ...s, status: 'pending', promptId: id } : s), join: old.join?.status === 'uncertain' ? { ...old.join, status: 'pending', promptId: id } : old.join } : old); } }} /><Button variant="outline" disabled={busy} onClick={() => setSession((old) => old ? { ...old, segments: old.segments.map((s) => s.status === 'uncertain' ? { ...s, status: 'error' } : s), join: old.join?.status === 'uncertain' ? { ...old.join, status: 'error' } : old.join } : old)}>我已查队列，确认未提交</Button></div>}
    <Button className="w-full" variant="outline" disabled={!ready || Boolean(preparationError) || busy || changed || uncertain || p.disabled || next >= p.beats.length} onClick={() => void submit(true)}>只检查下一段，不生成</Button>
    <Button className="w-full" disabled={!ready || Boolean(preparationError) || busy || changed || uncertain || p.disabled || next >= p.beats.length || (current?.status === 'completed' && current.qc !== 'failed')} onClick={() => void submit(false)}>{current?.qc === 'failed' || current?.status === 'error' ? '调整后重做当前段' : `生成第${next + 1}段，完成后暂停`}</Button>
    {src && <><DirectorVideoCheck src={src} aspect={p.options.aspect} /><video controls src={src} className="max-h-80 w-full"><track kind="captions" srcLang="zh" src="data:text/vtt,WEBVTT" /></video><textarea aria-label="本段问题记录" placeholder="记录构图、服装、人物、风格或声音问题" value={current?.note || ''} onChange={(e) => setSession((old) => old ? { ...old, segments: old.segments.map((s, i) => i === next ? { ...s, note: e.target.value } : s) } : old)} className="w-full border bg-background p-2" /><Button disabled={busy || !frameFile(current)} onClick={() => qc('passed')}>完整观看后通过，允许下一段</Button><Button variant="outline" disabled={busy} onClick={() => qc('failed')}>不通过，暂停并调整</Button></>}
    <Button className="w-full" disabled={busy || changed || uncertain || !session || !canJoinSegments(session.segments, p.beats.length) || Boolean(session.join && session.join.status !== 'error')} onClick={() => void join()}>全部通过后合片（不重新采样）</Button>
    {session?.join && <p>合片：{session.join.status} {session.join.note}</p>}
    {videoFile(session?.join) && <><video controls src={fileUrl(session!.url, videoFile(session!.join))} className="max-h-80 w-full"><track kind="captions" srcLang="zh" src="data:text/vtt,WEBVTT" /></video><a href={fileUrl(session!.url, videoFile(session!.join))} download>下载已验收分段整片</a></>}
    <Button variant="outline" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ session, configs, constraints, style }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'director-checkpoints.json'; a.click(); URL.revokeObjectURL(url); }}>导出逐段记录（素材另行备份）</Button>
    <Button variant="outline" disabled={busy || uncertain} onClick={() => { setSession(null); setMessage('已开启新一轮，旧视频仍保存在Director输出目录。'); }}>开启新一轮验收</Button>
    {message && <output className="block break-words">{message}</output>}
  </section>;
}

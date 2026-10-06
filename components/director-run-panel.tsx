'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DirectorVideoCheck } from '@/components/director-video-check';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DirectorBeat } from '@/lib/director';
import type { AssetTask, OutputFile } from '@/lib/asset-binding';
import { compileDirectorTimeline, h3Timing, requiredBeatImages, type TimelineImage } from '@/lib/director-timeline';
import { reviewBeat } from '@/lib/director-review';

type Job = { aspect?: string; promptId: string; url: string; title: string; status: 'pending' | 'running' | 'completed' | 'error'; files?: OutputFile[]; totalSeconds: number; error?: string; qc?: 'pending' | 'passed' | 'failed'; qcNote?: string };
type Props = { beats: DirectorBeat[]; assets: AssetTask[]; selected: string; sourceUrl: string; title: string; steps: number; megapixels: number; disabled: boolean; onBusy: (busy: boolean) => void; onLog: (message: string, detail: string) => void };
export function DirectorRunPanel(p: Props) {
  const { onBusy, onLog } = p;
  const [url, setUrl] = useState('http://127.0.0.1:8189');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [aspect, setAspect] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [megapixels, setMegapixels] = useState(p.megapixels);
  const [steps, setSteps] = useState(p.steps);
  const [acceleration, setAcceleration] = useState<'standard' | 'turbo8'>('standard');
  const [seed, setSeed] = useState(2026100601);
  const [pending, setPending] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const lock = useRef(false);
  const running = pending || job?.status === 'pending' || job?.status === 'running';
  const chosen = useMemo(() => scope === 'all' ? p.beats : p.beats.filter((beat) => beat.id === p.selected), [p.beats, p.selected, scope]);
  const issues = useMemo(() => chosen.flatMap((beat, index) => {
    const result = reviewBeat(beat, chosen[index - 1]);
    const expected = requiredBeatImages(beat);
    if ((beat.referenceAssetIds || []).length !== expected) result.push({ severity: 'error', beatId: beat.id, message: `请绑定 ${expected} 张素材` });
    for (const id of beat.referenceAssetIds || []) if (!p.assets.some((asset) => asset.id === id && asset.status === 'approved' && asset.files?.some((file) => /\.(png|jpe?g|webp)$/i.test(file.filename || '')))) result.push({ severity: 'error', beatId: beat.id, message: `素材未采用或未选择：${id || '空槽位'}` });
    return result;
  }), [chosen, p.assets]);
  if (chosen[0]?.mode === 'Ref2VA' && chosen.some((beat) => beat.continuityFromPrevious)) issues.push({ severity: 'warning', beatId: chosen[0].id, message: '首段使用多图参考，未锁定完整起始构图；后段末帧接续会继承首段构图和黑边。请先用当前分镜范围验证首段，或绑定已验收的完整首帧使用 I2V。' });
  if (acceleration === 'turbo8' && chosen.some((beat) => beat.mode === 'Ref2VA')) issues.push({ severity: 'error', message: 'Turbo 8步不适用于 Ref2VA，请切回标准模式。' });
  const errors = issues.filter((issue) => issue.severity === 'error');
  const rows = chosen.map((beat) => { try { return { beat, ...h3Timing(Number.parseFloat(beat.duration)) }; } catch { return { beat, frames: 0, actualSeconds: 0 }; } });
  const total = rows.reduce((sum, row) => sum + row.actualSeconds, 0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = JSON.parse(window.localStorage.getItem('h3-director-run') || '{}'); if (saved.url) setUrl(saved.url); if (['standard', 'turbo8'].includes(saved.acceleration)) setAcceleration(saved.acceleration); if (saved.aspect) setAspect(saved.aspect); if ([0.4, 0.7, 1].includes(saved.megapixels)) setMegapixels(saved.megapixels); if (Number.isInteger(saved.steps) && saved.steps >= 4 && saved.steps <= 40) setSteps(saved.steps); if (saved.job) setJob(saved.job); } catch { /* damaged cache */ }
      setReady(true);
    }, 0); return () => clearTimeout(timer);
  }, []);
  useEffect(() => { if (ready) window.localStorage.setItem('h3-director-run', JSON.stringify({ url, aspect, megapixels, steps, acceleration, job })); }, [ready, url, aspect, megapixels, steps, acceleration, job]);
  useEffect(() => { onBusy(Boolean(running)); return () => onBusy(false); }, [running, onBusy]);
  useEffect(() => {
    if (!job || !['pending', 'running'].includes(job.status)) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/comfy/status?url=${encodeURIComponent(job.url)}&promptId=${encodeURIComponent(job.promptId)}`);
        const data = await response.json() as { status?: Job['status']; files?: OutputFile[]; messages?: unknown[]; error?: string };
        if (!active) return;
        if (!response.ok) { setMessage(data.error || '暂时无法读取任务状态，将继续查询'); return; }
        const status = data.status;
        if (status) setJob((current) => current?.promptId === job.promptId ? { ...current, status, files: data.files, error: status === 'error' ? JSON.stringify(data.messages || []).slice(0, 500) : undefined } : current);
        if (status && ['completed', 'error'].includes(status)) onLog(`Director ${status === 'completed' ? '出片完成，待观看' : '任务失败'}`, `任务 ${job.promptId} · ${job.title} · 预计 ${job.totalSeconds.toFixed(2)} 秒`);
      } catch { if (active) setMessage('暂时无法读取 Director 状态，将继续查询'); }
    }, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [job, onLog]);

  function payload() {
    return { sourceUrl: p.sourceUrl, directorUrl: url, beats: chosen, assets: p.assets.filter((asset) => asset.status === 'approved').map((asset) => ({ id: asset.id, title: asset.title, kind: asset.kind, file: asset.files?.find((file) => /\.(png|jpe?g|webp)$/i.test(file.filename || '')) })), options: { steps, seed, megapixels, aspect, acceleration, label: scope === 'all' ? p.title : `beat-${p.selected}` } };
  }
  async function run(dryRun: boolean) {
    if (lock.current || running || errors.length || p.disabled) return;
    lock.current = true; setPending(true); setMessage(dryRun ? '正在检查节点、模型、素材与时间线…' : '正在转存素材并提交 Director…');
    try {
      const response = await fetch('/api/comfy/director', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload(), dryRun }) });
      const data = await response.json() as { error?: string; nodeErrors?: unknown; totalSeconds: number; assetsChecked: number; promptId: string };
      if (!response.ok) throw new Error(`${data.error || '请求失败'}${data.nodeErrors ? ` ${JSON.stringify(data.nodeErrors).slice(0, 500)}` : ''}`);
      if (dryRun) setMessage(`检查通过：${chosen.length} 段，${data.totalSeconds.toFixed(2)} 秒，${data.assetsChecked} 张素材可读取；未提交生成。`);
      else { setJob({ aspect, promptId: data.promptId, url, title: p.title, status: 'pending', totalSeconds: data.totalSeconds }); setMessage(`已提交一次任务：${chosen.length} 段，${data.totalSeconds.toFixed(2)} 秒。`); }
      p.onLog(dryRun ? 'Director 预检通过' : 'Director 已提交', `${chosen.length} 段 · ${data.totalSeconds.toFixed(2)} 秒 · ${aspect} · ${megapixels} MP`);
    } catch (error) { const detail = error instanceof Error ? error.message : 'Director 请求失败'; const readable = /Network connection lost|Failed to fetch|Load failed|fetch failed/i.test(detail) ? '网页与本地服务连接中断。请确认网页服务和 Director 服务（' + url + '）正在运行；若刚点击生成，请先查看 Director 队列，确认是否已提交，避免重复生成。' : detail; setMessage(readable); p.onLog('Director 请求失败', readable); }
    finally { lock.current = false; setPending(false); }
  }
  function exportPlan() {
    const images: Record<string, TimelineImage> = {};
    for (const asset of p.assets) images[asset.id] = { id: asset.id, title: asset.title, kind: asset.kind, file: `h3-director-web/needs-transfer/${asset.id.replace(/[^\w-]/g, '_')}.png` };
    try {
      const compiled = compileDirectorTimeline(chosen, images, payload().options);
      const href = URL.createObjectURL(new Blob([JSON.stringify({ ...compiled, note: '素材路径为待转存占位，不能直接提交；请从网页执行生成。' }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = href; link.download = 'director-plan-review.json'; link.click(); URL.revokeObjectURL(href);
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法导出'); }
  }
  const file = job?.files?.find((file) => /\.mp4$/i.test(file.filename || ''));
  const videoUrl = file?.filename && job ? `/api/comfy/view?url=${encodeURIComponent(job.url)}&filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder || '')}&type=${encodeURIComponent(file.type || 'output')}` : '';
  return <section className="mt-4 rounded-2xl border border-emerald-400/30 bg-card p-4">
    <h3 className="font-medium">新 Director · 多段与整片</h3>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">画幅控制输出画布，系统同时要求满幅构图；出片后可检测尺寸与疑似黑边。检查每段模式、接续与素材后，一次提交自动逐段生成并合片。</p>
    <label htmlFor="director-url" className="mt-3 block text-xs">Director 服务地址<Input id="director-url" aria-label="Director 服务地址" value={url} disabled={Boolean(running)} onChange={(event) => setUrl(event.target.value)} className="mt-1" /></label>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><label>生成范围<select aria-label="Director 生成范围" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} className="mt-1 w-full rounded border bg-background p-2"><option value="all">整片 · 全部分镜</option><option value="selected">当前选中分镜</option></select></label><label>画幅<select aria-label="Director 画幅" value={aspect} onChange={(event) => setAspect(event.target.value as typeof aspect)} className="mt-1 w-full rounded border bg-background p-2"><option>9:16</option><option>16:9</option><option>1:1</option></select></label></div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><label>整片分辨率<select aria-label="Director 整片分辨率" value={megapixels} disabled={Boolean(running)} onChange={(event) => setMegapixels(Number(event.target.value))} className="mt-1 w-full rounded border bg-background p-2">{[0.4, 0.7, 1].map((mp) => { const [w, h] = aspect.split(':').map(Number); const width = Math.round(Math.sqrt(mp * 2 ** 20 * w / h) / 32) * 32; const height = Math.round(Math.sqrt(mp * 2 ** 20 * h / w) / 32) * 32; return <option key={mp} value={mp}>{mp} MP · {width}×{height}</option>; })}</select></label><label htmlFor="director-steps">整片采样步数<Input id="director-steps" aria-label="Director 整片采样步数" type="number" min={4} max={40} value={acceleration === 'turbo8' ? 8 : steps} disabled={Boolean(running || acceleration === 'turbo8')} onChange={(event) => setSteps(Number(event.target.value))} className="mt-1" /></label></div>
    <label className="mt-3 block text-xs">生成模式<select aria-label="Director 加速模式" value={acceleration} disabled={Boolean(running)} onChange={(event) => setAcceleration(event.target.value as typeof acceleration)} className="mt-1 w-full rounded border bg-background p-2"><option value="standard">标准质量</option><option value="turbo8">Turbo 快速 · 专用 LoRA / 8步</option></select></label>
    {acceleration === 'turbo8' && <p className="mt-2 text-xs text-amber-200">自动加载匹配 LoRA，实际使用8步；声音与动作质量需对照验收，缺少模型时预检会阻止提交。</p>}
    <label htmlFor="director-seed" className="mt-3 block text-xs">基础种子<Input id="director-seed" aria-label="Director 基础种子" type="number" min={0} value={seed} onChange={(event) => setSeed(Number(event.target.value))} className="mt-1" /></label>
    <p className="mt-3 text-sm">{chosen.length} 段 · {total.toFixed(2)} 秒 · {megapixels} MP · {acceleration === 'turbo8' ? 8 : steps} 步</p>
    <details className="mt-3 text-xs" open><summary>逐段执行计划</summary><ol className="mt-2 space-y-2">{rows.map(({ beat, frames, actualSeconds }) => <li key={beat.id}>{beat.id} · {beat.continuityFromPrevious ? 'I2V / 上段末帧' : beat.mode} · {frames} 帧 / {actualSeconds.toFixed(2)} 秒<br /><span className="text-muted-foreground">{beat.modeReason || '旧项目未记录模式理由，请在描述页检查'}</span></li>)}</ol></details>
    {!!issues.length && <details className="mt-3 text-xs text-amber-200" open={errors.length > 0}><summary>{errors.length} 项阻塞 · {issues.length - errors.length} 项提醒</summary><ul className="mt-2 space-y-2">{issues.map((issue, index) => <li key={index}>{issue.beatId ? `Beat ${issue.beatId}：` : ''}{issue.message}</li>)}</ul></details>}
    <Button className="mt-4 w-full" variant="outline" disabled={Boolean(running || p.disabled || errors.length)} onClick={() => void run(true)}>检查 Director 与素材</Button>
    <Button className="mt-2 w-full" disabled={Boolean(running || p.disabled || errors.length)} onClick={() => void run(false)}>{running ? 'Director 任务处理中…' : scope === 'all' ? '生成整片' : '生成当前分镜'}</Button>
    <Button className="mt-2 w-full" variant="outline" onClick={exportPlan}>导出时间线审阅文件</Button>
    {message && <output className="mt-3 block break-words text-xs leading-5">{message}</output>}
    {job && <p className="mt-3 break-words text-xs">任务：{job.promptId}<br />{({ pending: '排队中', running: '逐段生成中', completed: '出片完成，待观看质检', error: '失败，请检查' })[job.status]}{job.error && <span className="block text-red-200">{job.error}</span>}</p>}
    {videoUrl && <><DirectorVideoCheck key={videoUrl} src={videoUrl} aspect={job?.aspect || aspect} /><video src={videoUrl} controls className="mt-3 max-h-80 w-full rounded bg-black"><track kind="captions" srcLang="zh" src="data:text/vtt,WEBVTT" /></video><a href={videoUrl} download className="mt-2 block text-xs text-emerald-200">下载 Director 整片</a><p className="mt-2 text-xs text-muted-foreground">请完整观看人物、动作、对白、声音与接缝。任务成功不代表质量通过。</p><label htmlFor="director-qc-note" className="mt-3 block text-xs">整片观感与问题记录<textarea id="director-qc-note" aria-label="Director 整片观感" value={job?.qcNote || ''} onChange={(event) => setJob((current) => current ? { ...current, qcNote: event.target.value } : current)} className="mt-1 min-h-20 w-full rounded border bg-background p-2" /></label><div className="mt-2 flex gap-2"><Button variant="outline" onClick={() => { setJob((current) => current ? { ...current, qc: 'passed' } : current); onLog('Director 人工质检通过', job?.qcNote || '未填写详细观感'); }}>观看后通过</Button><Button variant="outline" onClick={() => { setJob((current) => current ? { ...current, qc: 'failed' } : current); onLog('Director 需要重做', job?.qcNote || '请补充问题维度'); }}>需要重做</Button></div><p className="mt-2 text-xs">质检：{job?.qc === 'passed' ? '人工确认通过' : job?.qc === 'failed' ? '需要重做' : '待完整观看'}</p></>}
  </section>;
}

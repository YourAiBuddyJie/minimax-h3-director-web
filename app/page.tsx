'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Activity, Aperture, BookOpenText, CheckCircle2, ChevronRight, CircleDot, Clapperboard, Download, FileText, FolderOpen, ImagePlus, KeyRound, LayoutGrid, LoaderCircle, Play, Plus, Sparkles, Upload, Users, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import type { DirectorAnalysis, DirectorBeat } from '@/lib/director';
import type { ApiWorkflow } from '@/lib/comfy';

const initialBeats: DirectorBeat[] = [
  { id: '01', title: '寒池醒转', duration: '7.5s', mode: 'Ref2VA', status: 'ready', summary: '沈昭从寒水中惊醒，确认陌生环境与身体伤势。', prompt: '单一寒池空间，沈昭从寒水中惊醒，确认手腕勒痕；保持人物、服装、空间与伤势连续，无字幕。' },
  { id: '02', title: '脚步逼近', duration: '5.8s', mode: 'FL2VA', status: 'review', summary: '走廊脚步由远及近，门闩从闭合转为松动。', prompt: '同一走廊空间，脚步逼近，门闩从闭合到松动；首尾帧保持构图兼容并体现门闩状态变化。' },
  { id: '03', title: '身份揭示', duration: '9.2s', mode: 'Ref2VA', status: 'draft', summary: '来人进入画面，以一句称谓改变双方关系。', prompt: '人物进入同一空间，以明确视线对沈昭说出原文对白，保留听者反应和情绪余波，无字幕。' },
];
const labels = { ready: '可测试', review: '待检查', draft: '草稿' } as const;

export default function Home() {
  const [beats, setBeats] = useState<DirectorBeat[]>(initialBeats);
  const [selected, setSelected] = useState('01');
  const [comfyUrl, setComfyUrl] = useState('http://127.0.0.1:8188');
  const [connection, setConnection] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [script, setScript] = useState('寒夜。沈昭在结冰的水池边醒来，手腕有新鲜勒痕。\n\n门外传来脚步声。\n\n萧彻：你终于醒了。');
  const [analysis, setAnalysis] = useState<DirectorAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [aiConfig, setAiConfig] = useState<{ aiConfigured: boolean; model: string } | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const workflowInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [workflow, setWorkflow] = useState<ApiWorkflow | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [megapixels, setMegapixels] = useState(0.4);
  const [steps, setSteps] = useState(20);
  const [job, setJob] = useState<{ promptId: string; status: 'pending' | 'running' | 'completed' | 'error'; files?: Array<{ filename?: string; subfolder?: string; type?: string }> } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qc, setQc] = useState<'pending' | 'passed' | 'failed'>('pending');
  const [qcFrames, setQcFrames] = useState<string[]>([]);
  const beat = useMemo(() => beats.find((item) => item.id === selected) ?? beats[0] ?? initialBeats[0], [beats, selected]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem('h3-director-project');
      if (saved) try { const value = JSON.parse(saved) as { script?: string; analysis?: DirectorAnalysis; beats?: DirectorBeat[]; workflow?: ApiWorkflow; workflowName?: string; comfyUrl?: string; job?: typeof job; megapixels?: number; steps?: number; qc?: typeof qc }; if (value.script) setScript(value.script); if (value.analysis) setAnalysis(value.analysis); const savedBeats = value.beats?.length ? value.beats : value.analysis?.beats; if (savedBeats?.length) { setBeats(savedBeats); setSelected(savedBeats[0].id); } if (value.workflow) setWorkflow(value.workflow); if (value.workflowName) setWorkflowName(value.workflowName); if (value.comfyUrl) setComfyUrl(value.comfyUrl); if (value.job) setJob(value.job); if (value.megapixels) setMegapixels(value.megapixels); if (value.steps) setSteps(value.steps); if (value.qc) setQc(value.qc); } catch { /* ignore damaged local draft */ }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    fetch('/api/config')
      .then(async (response) => {
        const value = await response.json() as { aiConfigured: boolean; model: string };
        setAiConfig(value);
      })
      .catch(() => setAiConfig({ aiConfigured: false, model: '配置检测失败' }));
  }, []);
  useEffect(() => { if (storageReady) window.localStorage.setItem('h3-director-project', JSON.stringify({ script, analysis, beats, workflow, workflowName, comfyUrl, job, megapixels, steps, qc })); }, [script, analysis, beats, workflow, workflowName, comfyUrl, job, megapixels, steps, qc, storageReady]);
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
  async function checkComfy() { setConnection('checking'); try { const response = await fetch(`/api/comfy?url=${encodeURIComponent(comfyUrl)}`); setConnection(response.ok ? 'online' : 'offline'); } catch { setConnection('offline'); } }
  async function analyzeScript() {
    setAnalyzing(true); setMessage('');
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script }) });
      const data = await response.json() as DirectorAnalysis & { error?: string };
      if (!response.ok) throw new Error(data.error || '分析失败');
      setAnalysis(data); setBeats(data.beats); setSelected(data.beats[0]?.id || '01');
      setMessage(data.source === 'openai' ? 'AI 导演分析已完成并保存在本机。' : '当前为离线规则模式：已生成可编辑草稿，不等同于 AI 深度导演分析。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '分析失败'); } finally { setAnalyzing(false); }
  }
  async function importScript(file?: File) { if (!file) return; if (!/\.(md|txt)$/i.test(file.name)) { setMessage('当前支持 .md 和 .txt 剧本文件。'); return; } setScript(await file.text()); setMessage(`已导入 ${file.name}`); }
  async function importWorkflow(file?: File) { if (!file) return; try { const value = JSON.parse(await file.text()) as ApiWorkflow; const nodes = Object.values(value); if (!nodes.length || !nodes.every((node) => node && typeof node.class_type === 'string')) throw new Error('这不是 ComfyUI API Format JSON'); setWorkflow(value); setWorkflowName(file.name); setMessage(`已绑定工作流 ${file.name}`); } catch (error) { setMessage(error instanceof Error ? error.message : '工作流读取失败'); } }
  function updateBeat(patch: Partial<DirectorBeat>) { setBeats((items) => items.map((item) => item.id === beat.id ? { ...item, ...patch } : item)); }
  function newProject() { setScript(''); setAnalysis(null); setBeats(initialBeats); setSelected('01'); setWorkflow(null); setWorkflowName(''); setReferenceFiles([]); setJob(null); setQc('pending'); setQcFrames([]); setMessage('已建立新的本地项目。'); }
  function exportProject() { const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), script, analysis, beats, workflowName, comfyUrl, job, qc }, null, 2); const href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = href; anchor.download = `${(analysis?.projectTitle || 'h3-director-project').replace(/[^\w\u4e00-\u9fa5-]/g, '_')}.json`; anchor.click(); URL.revokeObjectURL(href); }
  async function submitBeat() {
    if (!workflow || !beat) return;
    setSubmitting(true); setMessage(''); setQc('pending');
    try {
      let images: string[] = [];
      if (referenceFiles.length) {
        const form = new FormData(); form.append('comfyUrl', comfyUrl); referenceFiles.forEach((file) => form.append('files', file));
        const uploadResponse = await fetch('/api/comfy/upload', { method: 'POST', body: form });
        const uploadData = await uploadResponse.json() as { uploaded?: string[]; error?: string };
        if (!uploadResponse.ok) throw new Error(uploadData.error || '参考图上传失败'); images = uploadData.uploaded ?? [];
      }
      const response = await fetch('/api/comfy/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comfyUrl, workflow, prompt: beat.prompt || beat.summary, duration: Number.parseFloat(beat.duration), steps, seed: Math.floor(Math.random() * 2_147_483_647), megapixels, aspect: '9:16 (Portrait Widescreen)', label: `beat-${beat.id}`, images }) });
      const data = await response.json() as { promptId?: string; error?: string; nodeErrors?: unknown };
      if (!response.ok || !data.promptId) throw new Error(`${data.error || '提交失败'}${data.nodeErrors ? `：${JSON.stringify(data.nodeErrors).slice(0, 240)}` : ''}`);
      setJob({ promptId: data.promptId, status: 'pending' }); setMessage(`Beat ${beat.id} 已提交，正在等待 ComfyUI。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '提交失败'); } finally { setSubmitting(false); }
  }
  const videoFile = job?.files?.[0];
  const videoUrl = videoFile?.filename ? `/api/comfy/view?url=${encodeURIComponent(comfyUrl)}&filename=${encodeURIComponent(videoFile.filename)}&subfolder=${encodeURIComponent(videoFile.subfolder || '')}&type=${encodeURIComponent(videoFile.type || 'output')}` : '';
  const readiness = (analysis ? 35 : 0) + (connection === 'online' ? 20 : 0) + (workflow ? 25 : 0) + (job?.status === 'completed' ? 20 : 0);
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
  }

  return <main className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/8 bg-background/90 px-5 backdrop-blur-xl lg:px-8">
      <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_24px_rgba(222,86,61,.22)]"><Aperture className="size-5" /></div><div><p className="font-semibold tracking-tight">寒渊导演台</p><p className="text-[11px] text-muted-foreground">MiniMax H3 · Local Studio</p></div></div>
      <div className="flex items-center gap-2"><Badge variant="outline" className="hidden border-emerald-400/20 bg-emerald-400/8 text-emerald-300 sm:flex"><CircleDot className="size-3" /> 本地模式</Badge><Badge variant="outline" className={aiConfig?.aiConfigured ? 'border-sky-400/20 bg-sky-400/8 text-sky-300' : 'border-amber-400/20 bg-amber-400/8 text-amber-200'}><KeyRound className="size-3" />{aiConfig?.aiConfigured ? `AI · ${aiConfig.model}` : '离线规则'}</Badge><Button onClick={exportProject} variant="outline" size="sm"><Download />导出项目</Button></div>
    </header>

    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[230px_minmax(0,1fr)_340px]">
      <aside className="border-r border-white/8 p-4 max-lg:hidden">
        <Button onClick={newProject} className="mb-6 h-10 w-full justify-start"><Plus />新建项目</Button>
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">工作区</p>
        <nav className="space-y-1"><Button variant="secondary" className="w-full justify-start"><LayoutGrid />导演总览</Button><Button variant="ghost" className="w-full justify-start text-muted-foreground"><BookOpenText />剧本分析</Button><Button variant="ghost" className="w-full justify-start text-muted-foreground"><Clapperboard />Beat 与镜头</Button><Button variant="ghost" className="w-full justify-start text-muted-foreground"><Users />素材与角色</Button><Button variant="ghost" className="w-full justify-start text-muted-foreground"><Workflow />ComfyUI 工作流</Button></nav>
        <div className="mt-8 rounded-xl border border-white/8 bg-card/50 p-3"><div className="mb-2 flex items-center justify-between text-xs"><span>项目准备度</span><span className="text-primary">{readiness}%</span></div><Progress value={readiness} /><p className="mt-3 text-xs leading-5 text-muted-foreground">{analysis ? `${beats.length} 个 Beat，${analysis.conflicts.length} 项冲突待检查。` : '导入剧本并完成导演分析后开始。'}</p></div>
      </aside>

      <section className="min-w-0 p-5 lg:p-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><FolderOpen className="size-3.5" />项目 / {analysis?.projectTitle || '本地未命名项目'}</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">导演总览</h1><p className="mt-1 text-sm text-muted-foreground">从剧本状态到单 Beat 测试，所有关键决策集中在这里。</p></div><Button onClick={analyzeScript} disabled={analyzing || !script.trim()} className="h-10 px-4"><Sparkles />{analyzing ? '导演分析中…' : '分析并生成导演数据'}</Button></div>
        {aiConfig && !aiConfig.aiConfigured && <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-3 text-xs leading-5 text-amber-100"><strong className="font-medium">当前使用离线规则模式。</strong> 如需 AI 深度分析，请在项目目录的 <code>.env.local</code> 中填写 <code>OPENAI_API_KEY</code>，保存后关闭启动窗口并重新双击 <code>start-local.cmd</code>。密钥不会进入浏览器或项目导出文件。</div>}
        {message && <output className="mb-4 block rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-primary">{message}</output>}
        <div className="grid gap-3 sm:grid-cols-3">{[['人物与关系',analysis ? `${analysis.characters.length} 人` : '等待分析',Users],['连续空间',analysis ? `${analysis.spaces.length} 个` : '等待分析',Aperture],['素材冲突',analysis ? `${analysis.conflicts.length} 项` : '等待分析',Activity]].map(([label,value,Icon]) => <article key={label as string} className="rounded-2xl border border-white/8 bg-card p-4"><Icon className="mb-5 size-5 text-primary" /><p className="text-xs text-muted-foreground">{label as string}</p><p className="mt-1 font-medium">{value as string}</p></article>)}</div>
        <article className="mt-5 rounded-2xl border border-white/8 bg-card"><div className="flex items-center justify-between border-b border-white/8 px-4 py-3"><div><h2 className="font-medium">Beat 时间线</h2><p className="text-xs text-muted-foreground">按信息变化和表演动作拆分，不固定时长</p></div><Button variant="ghost" size="sm">查看分镜 <ChevronRight /></Button></div><div className="divide-y divide-white/6">{beats.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left transition ${selected === item.id ? 'bg-primary/8' : 'hover:bg-white/[.025]'}`}><span className={`grid size-9 place-items-center rounded-lg font-mono text-xs ${selected === item.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{item.id}</span><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-sm font-medium">{item.title}</strong><Badge variant="outline" className="text-[10px]">{item.mode}</Badge></span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.summary}</span></span><span className="text-right"><span className="block font-mono text-xs">{item.duration}</span><span className={`mt-1 block text-[10px] ${item.status === 'ready' ? 'text-emerald-300' : 'text-muted-foreground'}`}>{labels[item.status]}</span></span></button>)}</div></article>
        <article className="mt-5 rounded-2xl border border-white/8 bg-card p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-medium">剧本输入</h2><p className="text-xs text-muted-foreground">支持粘贴或导入 Markdown/TXT，内容和分析结果只保存在当前浏览器</p></div><input ref={fileInput} type="file" accept=".md,.txt,text/plain,text/markdown" className="hidden" onChange={(event) => importScript(event.target.files?.[0])} /><Button onClick={() => fileInput.current?.click()} variant="outline" size="sm"><Upload />导入文件</Button></div><Textarea value={script} onChange={(e) => setScript(e.target.value)} className="min-h-36 resize-y border-white/10 bg-background/60 leading-6" /></article>
      </section>

      <aside className="border-l border-white/8 bg-card/35 p-5 lg:p-6">
        <div className="mb-6"><p className="text-xs font-medium text-primary">当前选择 · BEAT {beat.id}</p><h2 className="mt-1 text-xl font-semibold">{beat.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{beat.summary}</p></div>
        <section className="rounded-2xl border border-white/8 bg-card p-4"><h3 className="text-sm font-medium">Beat 导演数据</h3><div className="mt-3 grid grid-cols-2 gap-3"><label htmlFor="beat-duration" className="text-xs text-muted-foreground">时长<Input id="beat-duration" value={beat.duration} onChange={(event) => updateBeat({ duration: event.target.value })} className="mt-1 border-white/10 bg-background" /></label><label htmlFor="beat-mode" className="text-xs text-muted-foreground">模式<select id="beat-mode" value={beat.mode} onChange={(event) => updateBeat({ mode: event.target.value as DirectorBeat['mode'] })} className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-background px-2 text-foreground"><option>Ref2VA</option><option>FL2VA</option><option>T2V</option></select></label></div><label htmlFor="beat-prompt" className="mt-3 block text-xs text-muted-foreground">H3 提示词</label><Textarea id="beat-prompt" value={beat.prompt || beat.summary} onChange={(event) => updateBeat({ prompt: event.target.value })} className="mt-1 min-h-24 border-white/10 bg-background/60 text-xs leading-5" /></section>
        <section className="mt-4 rounded-2xl border border-white/8 bg-card p-4"><div className="mb-3 flex items-center gap-2"><Workflow className="size-4 text-primary" /><h3 className="text-sm font-medium">ComfyUI 连接</h3></div><label className="text-xs text-muted-foreground" htmlFor="comfy-url">服务地址</label><Input id="comfy-url" value={comfyUrl} onChange={(e) => setComfyUrl(e.target.value)} className="mt-2 border-white/10 bg-background/60 font-mono text-xs" /><Button onClick={checkComfy} variant="outline" className="mt-3 w-full" disabled={connection === 'checking'}>{connection === 'checking' ? '正在检测…' : connection === 'online' ? <><CheckCircle2 />连接正常</> : connection === 'offline' ? '连接失败，重新检测' : '检测连接与节点'}</Button></section>
        <section className="mt-4 rounded-2xl border border-white/8 bg-card p-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">执行工作流</h3><Badge variant={workflow ? 'default' : 'outline'}>{workflow ? '已绑定' : '未绑定'}</Badge></div>
          <input ref={workflowInput} type="file" accept=".json,application/json" className="hidden" onChange={(event) => importWorkflow(event.target.files?.[0])} />
          <Button onClick={() => workflowInput.current?.click()} variant="outline" className="mt-3 w-full"><Workflow />{workflowName || '导入 API 工作流 JSON'}</Button>
          <input ref={imageInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => setReferenceFiles(Array.from(event.target.files ?? []))} />
          <Button onClick={() => imageInput.current?.click()} variant="ghost" className="mt-1 w-full text-muted-foreground"><ImagePlus />{referenceFiles.length ? `${referenceFiles.length} 张参考图` : '添加参考图（可选）'}</Button>
        </section>
        <section className="mt-4 rounded-2xl border border-white/8 bg-card p-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">测试参数</h3><Badge className="bg-amber-300/12 text-amber-200">单 Beat</Badge></div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <label htmlFor="megapixels" className="text-xs text-muted-foreground">分辨率<select id="megapixels" value={megapixels} onChange={(event) => setMegapixels(Number(event.target.value))} className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-background px-2 text-foreground"><option value="0.4">0.4 MP</option><option value="0.7">0.7 MP</option><option value="1">1.0 MP</option></select></label>
            <label htmlFor="steps" className="text-xs text-muted-foreground">采样步数<Input id="steps" type="number" min={4} max={40} value={steps} onChange={(event) => setSteps(Number(event.target.value))} className="mt-1 border-white/10 bg-background" /></label>
          </div>
          <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">模式</dt><dd>{beat.mode}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">时长</dt><dd>{beat.duration}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">任务</dt><dd>{job?.status || '未提交'}</dd></div></dl>
          <Button onClick={submitBeat} className="mt-5 h-10 w-full" disabled={connection !== 'online' || !workflow || submitting || job?.status === 'pending' || job?.status === 'running'}>{submitting || job?.status === 'pending' || job?.status === 'running' ? <><LoaderCircle className="animate-spin" />生成中…</> : <><Play />测试这个 Beat</>}</Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">只提交一次；运行中禁止重复提交</p>
        </section>
        {videoUrl && <section className="mt-4 rounded-2xl border border-emerald-400/15 bg-card p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium">生成结果</h3><a href={videoUrl} download className="inline-flex h-6 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs"><Download className="size-3" />下载</a></div><video ref={videoRef} src={videoUrl} controls className="aspect-[9/16] max-h-80 w-full rounded-lg bg-black object-contain"><track kind="captions" srcLang="zh" label="暂无字幕" src="data:text/vtt,WEBVTT" /></video><Button onClick={extractQcFrames} variant="outline" size="sm" className="mt-3 w-full"><Aperture />抽取首中尾帧</Button>{qcFrames.length > 0 && <div className="mt-3 grid grid-cols-3 gap-1">{qcFrames.map((frame, index) => <Image unoptimized width={180} height={320} key={frame.slice(-24)} src={frame} alt={`${['首','中','尾'][index]}帧质检图`} className="aspect-[9/16] rounded object-cover" />)}</div>}<div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={() => setQc('passed')} variant={qc === 'passed' ? 'default' : 'outline'} size="sm">质检通过</Button><Button onClick={() => setQc('failed')} variant={qc === 'failed' ? 'destructive' : 'outline'} size="sm">需要重做</Button></div><p className="mt-2 text-center text-[11px] text-muted-foreground">人物 · 空间 · 道具 · 表演 · 台词 · 连续性</p></section>}
        <section className="mt-4 rounded-2xl border border-dashed border-primary/25 bg-primary/5 p-4"><div className="flex gap-3"><FileText className="mt-0.5 size-4 shrink-0 text-primary" /><div><h3 className="text-sm font-medium">本地闭环</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">导入剧本 → 导演分析 → 绑定已跑通的 API 工作流 → 上传参考图 → 单 Beat 生成 → 播放、下载与质检。</p></div></div></section>
      </aside>
    </div>
  </main>;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Aperture, BookOpenText, CheckCircle2, ChevronRight, CircleDot, Clapperboard, FileText, FolderOpen, LayoutGrid, Play, Plus, Settings2, Sparkles, Upload, Users, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import type { DirectorAnalysis, DirectorBeat } from '@/lib/director';

const initialBeats: DirectorBeat[] = [
  { id: '01', title: '寒池醒转', duration: '7.5s', mode: 'Ref2VA', status: 'ready', summary: '沈昭从寒水中惊醒，确认陌生环境与身体伤势。' },
  { id: '02', title: '脚步逼近', duration: '5.8s', mode: 'FL2VA', status: 'review', summary: '走廊脚步由远及近，门闩从闭合转为松动。' },
  { id: '03', title: '身份揭示', duration: '9.2s', mode: 'Ref2VA', status: 'draft', summary: '来人进入画面，以一句称谓改变双方关系。' },
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
  const [storageReady, setStorageReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const beat = useMemo(() => beats.find((item) => item.id === selected) ?? beats[0] ?? initialBeats[0], [beats, selected]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem('h3-director-project');
      if (saved) try { const value = JSON.parse(saved) as { script?: string; analysis?: DirectorAnalysis }; if (value.script) setScript(value.script); if (value.analysis?.beats?.length) { setAnalysis(value.analysis); setBeats(value.analysis.beats); setSelected(value.analysis.beats[0].id); } } catch { /* ignore damaged local draft */ }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (storageReady) window.localStorage.setItem('h3-director-project', JSON.stringify({ script, analysis })); }, [script, analysis, storageReady]);
  async function checkComfy() { setConnection('checking'); try { const response = await fetch(`/api/comfy?url=${encodeURIComponent(comfyUrl)}`); setConnection(response.ok ? 'online' : 'offline'); } catch { setConnection('offline'); } }
  async function analyzeScript() {
    setAnalyzing(true); setMessage('');
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script }) });
      const data = await response.json() as DirectorAnalysis & { error?: string };
      if (!response.ok) throw new Error(data.error || '分析失败');
      setAnalysis(data); setBeats(data.beats); setSelected(data.beats[0]?.id || '01');
      setMessage(data.source === 'openai' ? 'AI 导演分析已完成并保存在本机。' : '未配置 API Key，已生成本地规则草稿。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '分析失败'); } finally { setAnalyzing(false); }
  }
  async function importScript(file?: File) { if (!file) return; if (!/\.(md|txt)$/i.test(file.name)) { setMessage('当前支持 .md 和 .txt 剧本文件。'); return; } setScript(await file.text()); setMessage(`已导入 ${file.name}`); }

  return <main className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/8 bg-background/90 px-5 backdrop-blur-xl lg:px-8">
      <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_24px_rgba(222,86,61,.22)]"><Aperture className="size-5" /></div><div><p className="font-semibold tracking-tight">寒渊导演台</p><p className="text-[11px] text-muted-foreground">MiniMax H3 · Local Studio</p></div></div>
      <div className="flex items-center gap-2"><Badge variant="outline" className="hidden border-emerald-400/20 bg-emerald-400/8 text-emerald-300 sm:flex"><CircleDot className="size-3" /> 本地模式</Badge><Button variant="outline" size="sm"><Settings2 />设置</Button></div>
    </header>

    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[230px_minmax(0,1fr)_340px]">
      <aside className="border-r border-white/8 p-4 max-lg:hidden">
        <Button className="mb-6 h-10 w-full justify-start"><Plus />新建项目</Button>
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">工作区</p>
        <nav className="space-y-1"><Button variant="secondary" className="w-full justify-start"><LayoutGrid />导演总览</Button><Button variant="ghost" className="w-full justify-start text-muted-foreground"><BookOpenText />剧本分析</Button><Button variant="ghost" className="w-full justify-start text-muted-foreground"><Clapperboard />Beat 与镜头</Button><Button variant="ghost" className="w-full justify-start text-muted-foreground"><Users />素材与角色</Button><Button variant="ghost" className="w-full justify-start text-muted-foreground"><Workflow />ComfyUI 工作流</Button></nav>
        <div className="mt-8 rounded-xl border border-white/8 bg-card/50 p-3"><div className="mb-2 flex items-center justify-between text-xs"><span>项目准备度</span><span className="text-primary">68%</span></div><Progress value={68} /><p className="mt-3 text-xs leading-5 text-muted-foreground">3 个 Beat 已拆分，1 个素材冲突需要确认。</p></div>
      </aside>

      <section className="min-w-0 p-5 lg:p-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><FolderOpen className="size-3.5" />项目 / {analysis?.projectTitle || '本地未命名项目'}</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">导演总览</h1><p className="mt-1 text-sm text-muted-foreground">从剧本状态到单 Beat 测试，所有关键决策集中在这里。</p></div><Button onClick={analyzeScript} disabled={analyzing || !script.trim()} className="h-10 px-4"><Sparkles />{analyzing ? '导演分析中…' : '分析并生成导演数据'}</Button></div>
        {message && <output className="mb-4 block rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-primary">{message}</output>}
        <div className="grid gap-3 sm:grid-cols-3">{[['人物与关系',analysis ? `${analysis.characters.length} 人` : '等待分析',Users],['连续空间',analysis ? `${analysis.spaces.length} 个` : '等待分析',Aperture],['素材冲突',analysis ? `${analysis.conflicts.length} 项` : '等待分析',Activity]].map(([label,value,Icon]) => <article key={label as string} className="rounded-2xl border border-white/8 bg-card p-4"><Icon className="mb-5 size-5 text-primary" /><p className="text-xs text-muted-foreground">{label as string}</p><p className="mt-1 font-medium">{value as string}</p></article>)}</div>
        <article className="mt-5 rounded-2xl border border-white/8 bg-card"><div className="flex items-center justify-between border-b border-white/8 px-4 py-3"><div><h2 className="font-medium">Beat 时间线</h2><p className="text-xs text-muted-foreground">按信息变化和表演动作拆分，不固定时长</p></div><Button variant="ghost" size="sm">查看分镜 <ChevronRight /></Button></div><div className="divide-y divide-white/6">{beats.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left transition ${selected === item.id ? 'bg-primary/8' : 'hover:bg-white/[.025]'}`}><span className={`grid size-9 place-items-center rounded-lg font-mono text-xs ${selected === item.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{item.id}</span><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-sm font-medium">{item.title}</strong><Badge variant="outline" className="text-[10px]">{item.mode}</Badge></span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.summary}</span></span><span className="text-right"><span className="block font-mono text-xs">{item.duration}</span><span className={`mt-1 block text-[10px] ${item.status === 'ready' ? 'text-emerald-300' : 'text-muted-foreground'}`}>{labels[item.status]}</span></span></button>)}</div></article>
        <article className="mt-5 rounded-2xl border border-white/8 bg-card p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-medium">剧本输入</h2><p className="text-xs text-muted-foreground">支持粘贴或导入 Markdown/TXT，内容和分析结果只保存在当前浏览器</p></div><input ref={fileInput} type="file" accept=".md,.txt,text/plain,text/markdown" className="hidden" onChange={(event) => importScript(event.target.files?.[0])} /><Button onClick={() => fileInput.current?.click()} variant="outline" size="sm"><Upload />导入文件</Button></div><Textarea value={script} onChange={(e) => setScript(e.target.value)} className="min-h-36 resize-y border-white/10 bg-background/60 leading-6" /></article>
      </section>

      <aside className="border-l border-white/8 bg-card/35 p-5 lg:p-6">
        <div className="mb-6"><p className="text-xs font-medium text-primary">当前选择 · BEAT {beat.id}</p><h2 className="mt-1 text-xl font-semibold">{beat.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{beat.summary}</p></div>
        <section className="rounded-2xl border border-white/8 bg-card p-4"><div className="mb-3 flex items-center gap-2"><Workflow className="size-4 text-primary" /><h3 className="text-sm font-medium">ComfyUI 连接</h3></div><label className="text-xs text-muted-foreground" htmlFor="comfy-url">服务地址</label><Input id="comfy-url" value={comfyUrl} onChange={(e) => setComfyUrl(e.target.value)} className="mt-2 border-white/10 bg-background/60 font-mono text-xs" /><Button onClick={checkComfy} variant="outline" className="mt-3 w-full" disabled={connection === 'checking'}>{connection === 'checking' ? '正在检测…' : connection === 'online' ? <><CheckCircle2 />连接正常</> : connection === 'offline' ? '连接失败，重新检测' : '检测连接与节点'}</Button></section>
        <section className="mt-4 rounded-2xl border border-white/8 bg-card p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-medium">测试参数</h3><Badge className="bg-amber-300/12 text-amber-200">代表性 Beat</Badge></div><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">模式</dt><dd>{beat.mode}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">分辨率</dt><dd>0.4 MP</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">时长</dt><dd>{beat.duration}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">状态</dt><dd>{labels[beat.status]}</dd></div></dl><Button className="mt-5 h-10 w-full" disabled={connection !== 'online'}><Play />测试这个 Beat</Button><p className="mt-2 text-center text-[11px] text-muted-foreground">连接通过后启用 · 提交前仍会执行素材审计</p></section>
        <section className="mt-4 rounded-2xl border border-dashed border-primary/25 bg-primary/5 p-4"><div className="flex gap-3"><FileText className="mt-0.5 size-4 shrink-0 text-primary" /><div><h3 className="text-sm font-medium">本地部署状态</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">剧本导入、浏览器本地保存、AI/规则分析与 ComfyUI 检测已接通；视频提交将在工作流绑定完成后开放。</p></div></div></section>
      </aside>
    </div>
  </main>;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Radio, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logCategoryLabels, logLevelLabels, type SystemLogCategory, type SystemLogEntry, type SystemLogLevel } from '@/lib/system-log';

type Props = { logs: SystemLogEntry[]; onClear: () => void };
const levelColor: Record<SystemLogLevel, string> = { info: 'text-sky-200', success: 'text-emerald-200', warning: 'text-amber-200', error: 'text-red-200' };

export function SystemLogPanel({ logs, onClear }: Props) {
  const [level, setLevel] = useState<'all' | SystemLogLevel>('all');
  const [category, setCategory] = useState<'all' | SystemLogCategory>('all');
  const [query, setQuery] = useState('');
  const [follow, setFollow] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => [...logs].reverse().sort((a, b) => b.time.localeCompare(a.time)).filter((entry) => (level === 'all' || entry.level === level) && (category === 'all' || entry.category === category) && (!query.trim() || `${entry.action} ${entry.detail || ''}`.toLowerCase().includes(query.trim().toLowerCase()))), [category, level, logs, query]);
  useEffect(() => { if (follow) listRef.current?.scrollTo({ top: 0 }); }, [filtered.length, follow]);

  function download() {
    const text = filtered.map((entry) => `${entry.time}\t${logLevelLabels[entry.level]}\t${logCategoryLabels[entry.category]}\t${entry.action}${entry.detail ? `\t${entry.detail}` : ''}`).join('\n');
    const href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = href; anchor.download = `h3-director-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`; anchor.click(); URL.revokeObjectURL(href);
  }

  return <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3"><div><div className="flex items-center gap-2"><h2 className="font-medium">系统执行日志</h2><Badge className="gap-1 bg-emerald-400/10 text-emerald-200"><Radio className="size-3 animate-pulse" />实时更新</Badge></div><p className="mt-1 text-xs text-muted-foreground">仅记录任务状态和错误摘要，不记录 API Key 或完整剧本、提示词。</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={download} disabled={!filtered.length}><Download />导出</Button><Button size="sm" variant="outline" onClick={onClear} disabled={!logs.length}><Trash2 />清空</Button></div></header>
    <div className="grid gap-2 border-b border-white/8 p-3 sm:grid-cols-[minmax(180px,1fr)_150px_150px_auto]">
      <label className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="搜索日志" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索动作或错误…" className="pl-9" /></label>
      <select aria-label="日志级别" value={level} onChange={(event) => setLevel(event.target.value as typeof level)} className="rounded-lg border border-white/10 bg-background px-3 text-sm"><option value="all">全部级别</option>{Object.entries(logLevelLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="日志分类" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="rounded-lg border border-white/10 bg-background px-3 text-sm"><option value="all">全部分类</option>{Object.entries(logCategoryLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
      <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 text-sm"><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />跟随最新</label>
    </div>
    <div ref={listRef} className="pane-scroll flex-1 bg-black/15 font-mono text-xs" aria-live="polite" aria-relevant="additions">
      {!filtered.length ? <div className="grid h-full min-h-48 place-items-center text-muted-foreground">暂无符合条件的执行记录</div> : <ol className="divide-y divide-white/6">{filtered.map((entry) => <li key={entry.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[170px_72px_90px_minmax(0,1fr)]"><time className="text-muted-foreground">{new Date(entry.time).toLocaleString('zh-CN', { hour12: false })}</time><span className={levelColor[entry.level]}>[{logLevelLabels[entry.level]}]</span><span className="text-muted-foreground">{logCategoryLabels[entry.category]}</span><span className="min-w-0 break-words text-foreground"><strong className="font-medium">{entry.action}</strong>{entry.detail && <span className="ml-2 text-muted-foreground">{entry.detail}</span>}</span></li>)}</ol>}
    </div>
    <footer className="flex justify-between border-t border-white/8 px-4 py-2 text-xs text-muted-foreground"><span>显示 {filtered.length} / {logs.length} 条</span><span>本机最多保留最近 500 条</span></footer>
  </article>;
}

'use client';
import { useState } from 'react';
import type { DirectorBeat } from '@/lib/director';
import { isStoryboardApproved } from '@/lib/storyboard-approval';
import { storyboardIssues } from '@/lib/two-stage-analysis';
import { reviewBeat } from '@/lib/director-review';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Props = { beats: DirectorBeat[]; disabled: boolean; stale: boolean; onEdit: (id: string, patch: Partial<DirectorBeat>) => void; onApproveAll: () => void; onApprove: (id: string, approved: boolean) => void };
export function StoryboardPanel(p: Props) {
  const [selectedId, setSelectedId] = useState<string>('');
  const index = Math.max(0, p.beats.findIndex((beat) => beat.id === selectedId));
  const beat = p.beats[index];
  if (!beat) return <section className="studio-panel">暂无分镜，请先分析剧本。</section>;
  const approved = isStoryboardApproved(beat);
  const issues = beat.pipelineVersion===2 ? storyboardIssues(beat) : reviewBeat(beat, p.beats[index - 1]);
  const errors = issues.some((issue) => issue.severity === 'error');
  const allApproved = p.beats.every(isStoryboardApproved);
  const anyErrors = p.beats.some((item, i) => (item.pipelineVersion===2 ? storyboardIssues(item) : reviewBeat(item,p.beats[i-1])).some((issue) => issue.severity === 'error'));
  const textField = (key: 'title' | 'summary' | 'scene' | 'startState' | 'endState' | 'prompt', label: string) => <label className={`storyboard-field storyboard-field-${key}`}>{label}<textarea aria-label={`${beat.id} ${label}`} value={beat[key] || ''} disabled={p.disabled || p.stale} onChange={(event) => p.onEdit(beat.id, { [key]: event.target.value })} /></label>;
  return <section className="storyboard-workspace">
    <nav className="storyboard-menu" aria-label="分镜选择">
      <header><h2 className="font-semibold">分镜确认 · {p.beats.length} 段</h2><p className="text-xs text-muted-foreground">上下滚动选择，核对后采纳</p></header>
      <div className="storyboard-menu-items">{p.beats.map((item, i) => <button key={item.id} type="button" aria-current={item.id === beat.id ? 'true' : undefined} className="storyboard-menu-item" onClick={() => setSelectedId(item.id)}><span className="storyboard-menu-number">{i + 1}</span><span className="min-w-0"><strong className="block truncate">{item.id} · {item.title}</strong><span className="text-xs text-muted-foreground">{item.duration} · {item.pipelineVersion!==2 && `${item.mode} · `} {isStoryboardApproved(item) ? '已采纳' : '待采纳'}</span></span></button>)}</div>

    </nav>
    <article className="storyboard-detail" aria-label={`${beat.id} 分镜详情`}>
      <header className="storyboard-detail-header"><div><h3 className="font-semibold">{index + 1}. {beat.id} · {beat.title}</h3><p className="text-xs text-muted-foreground">核对原文、镜头内容和起止状态；修改后需重新采纳。</p></div><Badge variant={approved ? 'default' : 'outline'}>{approved ? '已采纳' : '待采纳'}</Badge></header>
      {p.stale && <p role="alert" className="text-sm text-amber-200">剧本已修改，请先重新分析后再采纳分镜。</p>}
      <div className="storyboard-content">
        <div className="storyboard-fields">{textField('title', '分镜标题')}{beat.pipelineVersion!==2 && textField('summary', '分镜内容')}{textField('scene', '场景')}{textField('startState', '开始状态')}{textField('endState', '结束状态')}</div>
        <div className="storyboard-generation"><div className="grid grid-cols-2 gap-3"><label className="storyboard-field">时长（秒）<input aria-label={`${beat.id} 时长`} type="number" min={beat.pipelineVersion===2 ? 3 : 4} max={beat.pipelineVersion===2 ? 12 : 15} step={0.1} value={Number.parseFloat(beat.duration) || ''} disabled={p.disabled || p.stale} onChange={(e) => p.onEdit(beat.id, { duration: e.target.value ? `${e.target.value}s` : '' })} /></label>{beat.pipelineVersion!==2 && <label className="storyboard-field">视频模式<select aria-label={`${beat.id} 视频模式`} value={beat.mode} disabled={p.disabled || p.stale} onChange={(e) => p.onEdit(beat.id, { mode: e.target.value as DirectorBeat['mode'], continuityFromPrevious: false, referenceAssetIds: [] })}>{['T2V', 'I2V', 'FL2VA', 'Ref2VA'].map((mode) => <option key={mode}>{mode}</option>)}</select></label>}</div><p className="storyboard-mode-reason">{beat.pipelineVersion===2 ? '这里只确认分镜内容、动作和时长；提示词在下一阶段分析。' : `${beat.continuityFromPrevious ? '连续接续上一段' : '独立起始画面'} · ${beat.modeReason}`}</p>{beat.pipelineVersion===2 ? textField('summary','分镜动作与对白') : textField('prompt', '视频提示词')}</div>
        <section className="storyboard-source"><h4>对应剧本原文</h4><div className="storyboard-source-text">{beat.sourceText || '未提供原文引用，请核对剧本。'}</div><section className="storyboard-review-notes"><h3>核对提醒</h3><div className="storyboard-issues" aria-live="polite"><div>{issues.length ? issues.map((issue, i) => <p key={i}>{issue.severity === 'error' ? '需修正：' : '请确认：'}{issue.message}</p>) : <p>暂无额外提醒，请核对本段内容。</p>}</div></div></section></section>
      </div>
      <footer className="storyboard-detail-footer"><p className="text-xs text-muted-foreground">{approved ? '当前分镜已采纳；修改后需重新确认。' : beat.pipelineVersion===2 ? '确认分镜内容与原文一致后采纳。' : '确认提示词与原文一致后采纳。'}</p><div className="flex shrink-0 gap-2"><Button disabled={p.disabled || p.stale || allApproved || anyErrors} title={anyErrors ? '请先修正分镜中的错误' : undefined} onClick={p.onApproveAll}>全部采纳</Button><Button disabled={p.disabled || p.stale || (!approved && errors)} variant={approved ? 'outline' : 'default'} onClick={() => p.onApprove(beat.id, !approved)}>{approved ? '取消采纳' : '采纳分镜'}</Button></div></footer>
    </article>
  </section>;
}

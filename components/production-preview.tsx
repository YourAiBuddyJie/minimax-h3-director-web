'use client';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Play } from 'lucide-react';
import type { ProductionPreview } from '@/components/director-checkpoint-panel';
export function ProductionVideoPreview({ value, title }: { value: ProductionPreview; title: string }) {
  const [film, setFilm] = useState(false);
  const src = film ? value.filmSrc : value.src;
  const status = ({ pending: '排队中', running: '生成中', completed: '已生成，待验收', error: '生成失败', uncertain: '提交结果待确认' } as Record<string, string>)[value.status] || value.status;
  return <section className="production-video-result"><div className="production-result-toggle"><button aria-pressed={!film} onClick={() => setFilm(false)}>当前片段</button><button aria-pressed={film} onClick={() => setFilm(true)}>整片</button></div>{src ? <><video key={src} controls src={src}><track kind="captions" srcLang="zh" src="data:text/vtt,WEBVTT" /></video></> : <div className="production-video-empty"><Play /><p>{film ? '全部片段通过后，在这里查看合片' : status === '待生成' ? '生成后在这里播放' : status}</p></div>}<div className="production-preview-actions">{src ? <a href={src} download>下载{film ? '整片' : '片段'} ↓</a> : <Button variant="outline" disabled>下载片段 ↓</Button>}{!film && <><Button disabled={!value.canReview} onClick={() => value.onReview?.('passed')}>本段通过</Button><Button variant="outline" disabled={!value.canReview} onClick={() => value.onReview?.('failed')}>本段不通过</Button></>}</div><h3>{film ? '整片结果' : title}</h3>{!film && <><p>{status}</p></>}{value.changed && <p className="text-amber-200">这里保留的是上一轮结果；当前设置已变化，请先处理生成区的记录提示。</p>}<p className="text-xs text-muted-foreground">观看人物、服装、对白和接缝后，确认本段是否通过。</p></section>;
}

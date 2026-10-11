 'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { DirectorBeat } from '@/lib/director';
import type { AssetTask } from '@/lib/asset-binding';
import { isStoryboardApproved,isPromptApproved,storyboardSignature } from '@/lib/storyboard-approval';
export function PromptPlanPanel(p:{beats:DirectorBeat[];assets:AssetTask[];busy:boolean;stale:boolean;generating:boolean;error:string;onGenerate:()=>void;onCancel:()=>void;onEdit:(id:string,prompt:string)=>void}) {
 const [selected,setSelected]=useState('');
 const beat=p.beats.find(b=>b.id===selected)||p.beats[0];
 const storyReady=Boolean(p.beats.length&&p.beats.every(isStoryboardApproved)&&!p.stale);
 return <section className="studio-panel h-full overflow-y-auto p-5"><div className="mb-4 flex flex-wrap items-center gap-3"><h2>多参考提示词分析</h2><Button disabled={p.busy||!storyReady} onClick={p.onGenerate}>{p.generating?'分析中…':p.beats.some(b=>b.prompt)?'重新分析提示词与参考图':'分析提示词与参考图'}</Button>{p.generating&&<Button variant="outline" onClick={p.onCancel}>取消分析</Button>}</div>
 <p className="mb-3 text-sm text-muted-foreground">全部分镜确认后自动生成，可查看和编辑，无需再次确认。统一Ref2VA，参考图只约束各自职责；生成时选择8步或20步。</p>
 {!storyReady&&<p className="text-amber-200">请先完成并采纳02分镜；剧本修改后需重新分析。</p>}{p.error&&<p role="alert" className="text-amber-200">{p.error}</p>}
 {p.generating&&<PromptAnalysisProgress />}
 <div className="mt-4 flex flex-wrap gap-2">{p.beats.map(b=><Button key={b.id} variant={b.id===beat?.id?'default':'outline'} onClick={()=>setSelected(b.id)}>{b.id} · {isPromptApproved(b)?'已生成':b.prompt?'需更新':'待生成'}</Button>)}</div>
 {beat&&<article className="mt-4"><h3>{beat.title} · {beat.duration}</h3><p className="mt-2 whitespace-pre-wrap text-sm">{beat.summary}</p><label className="mt-4 block">Ref2VA视频提示词<textarea aria-label={`${beat.id} 多参考视频提示词`} disabled={p.busy||!storyReady||!beat.promptStorySignature||beat.promptStorySignature!==storyboardSignature(beat)} value={beat.prompt} onChange={e=>p.onEdit(beat.id,e.target.value)} className="mt-2 min-h-[420px] h-[52dvh] resize-y w-full rounded border bg-background p-3" placeholder="全部分镜确认后自动生成提示词" /></label>
 <p className="mt-3 text-sm">本段参考图：{(beat.referenceAssetIds||[]).map(id=>p.assets.find(a=>a.id===id)?.title||id).join('、')||'尚未规划'}</p>
 <details className="mt-4"><summary>本段参考图描述</summary>{p.assets.filter(a=>beat.referenceAssetIds?.includes(a.id)).map(a=><div key={a.id} className="mt-3"><strong>{a.title}</strong><p className="whitespace-pre-wrap text-sm">{a.prompt}</p></div>)}</details></article>}
 </section>;
}
function PromptAnalysisProgress() {
 const [startedAt]=useState(()=>Date.now());
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=> { const timer=window.setInterval(()=>setElapsed(Math.floor((Date.now()-startedAt)/1000)),1000);return ()=>window.clearInterval(timer);},[startedAt]);
 return <output className="block" aria-live="off">提示词请求进行中 · 已用 {Math.floor(elapsed/60)}分{elapsed%60}秒 · 最多等待5分钟。{elapsed<60?'正在等待模型完整结果。':'尚未收到完整结果，可取消后重试；到时会自动结束等待。'}原有分镜与结果保留。</output>;
}

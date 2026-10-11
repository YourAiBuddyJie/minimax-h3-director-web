'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Film, SlidersHorizontal, FileText, Settings2, ChevronDown, BookOpen, Download, Plus } from 'lucide-react';
import { ModelStatusLights, type ModelLight } from '@/components/model-status-lights';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
type Props = {
  scriptModelStatus: ModelLight; imageModelStatus: ModelLight; onCheckImageModel: () => void;
  title: string; analyzed: boolean; analyzing: boolean; analysisStartedAt: number; canAnalyze: boolean; aiReady: boolean;
  assetCount: number; approvedCount: number; reviewCount: number; beatCount: number; adoptedBeatCount: number; storyboard: ReactNode; promptPlan: ReactNode;
  message: string; analysisError: string; analysisModel: string; blockedReason: string; comfyNeedsAttention: boolean; busy: boolean;
  onCancelAnalysis: () => void; onAnalyze: () => void; onSettings: () => void; onImageSettings: () => void; onNew: () => void; onExport: () => void;
  script: ReactNode; assets: ReactNode; timeline: ReactNode; editor: ReactNode; videoPrompt: ReactNode;
  binding: ReactNode; connection: ReactNode; workflow: ReactNode; test: ReactNode; result: ReactNode; logs: ReactNode;
  conflicts: string[]; settings: ReactNode; imageAction: ReactNode; analysisResult: ReactNode;
};
export function StudioWorkspace(p: Props) {
  const [stage, setStage] = useState('script');
  const [productionTab, setProductionTab] = useState('prompt');
  useEffect(() => { const show = () => setProductionTab('run'); document.addEventListener('production-show-run', show); return () => document.removeEventListener('production-show-run', show); }, []);
  const [settings, setSettings] = useState(false);
  const [confirm, setConfirm] = useState<'new' | 'analyze' | null>(null);
  return <main className="studio-workspace desktop-workspace">
    {p.settings}

    <Tabs className="workspace-tabs" value={stage} onValueChange={(v) => setStage(String(v))}>
      <header className="studio-header workspace-main-header">
        <div className="workspace-navigation"><TabsList className="workspace-stepbar"><TabsTrigger value="script">01 剧本分析</TabsTrigger><TabsTrigger value="storyboard">02 分镜（{p.adoptedBeatCount}/{p.beatCount}）</TabsTrigger><TabsTrigger value="prompts">03 提示词</TabsTrigger><TabsTrigger value="assets">04 参考图（{p.approvedCount}/{p.assetCount}）</TabsTrigger><TabsTrigger value="video">05 视频制作</TabsTrigger><TabsTrigger value="logs">06 系统日志</TabsTrigger></TabsList>
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" className="workspace-more" />}>更多<ChevronDown size={14} /></DropdownMenuTrigger><DropdownMenuContent align="end" className="workspace-more-menu"><DropdownMenuItem render={<a aria-label="使用教程" href="/tutorial" target="_blank" rel="noreferrer" />}><BookOpen />使用教程 ↗</DropdownMenuItem><DropdownMenuItem onClick={() => setSettings(true)}><Settings2 />连接与设置</DropdownMenuItem><DropdownMenuItem onClick={p.onExport}><Download />导出项目</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={p.busy} onClick={() => setConfirm('new')}><Plus />新建项目</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        <ModelStatusLights script={p.scriptModelStatus} onScriptSettings={p.onSettings} image={p.imageModelStatus} onCheckImage={p.onCheckImageModel} /><div className="studio-header-brand"><div className="studio-brand-copy"><strong>智能搭子导演工作台</strong><small>本地 AI 视频创作</small></div><span className="studio-brand-icon"><Film size={19} /></span></div>
      </header>
      {p.message && !p.analyzing && <output aria-live="polite" className="workspace-message">{p.message}</output>}
      <TabsContent value="script" className="workspace-stage"><div className="workspace-body script-layout"><div className="script-pane">{p.script}</div><aside className="studio-panel analysis-side-panel">{p.analyzing ? <AnalysisProgress model={p.analysisModel} startedAt={p.analysisStartedAt} onCancel={p.onCancelAnalysis} /> : p.analysisError ? <div className="analysis-feedback"><span className="analysis-feedback-tag error">分析未完成</span><h2>这次分析失败了</h2><p role="alert" className="analysis-error-detail">{p.analysisError}</p><Button onClick={p.onAnalyze} disabled={p.busy || !p.canAnalyze}>重新分析</Button>{p.analyzed && <div className="analysis-previous-result"><h3>上次分析结果</h3>{p.analysisResult}</div>}</div> : p.analyzed ? p.analysisResult : <><h2>从剧本开始</h2><p>导入剧本 → 拆分3–12秒分镜 → 确认 → 分析提示词与参考图。</p><Button className="my-4 w-full" variant="outline" onClick={p.onSettings}>{p.aiReady ? '大模型已配置' : '配置大模型 API'}</Button><p>{p.aiReady ? '分析完成后，这里会显示分镜内容、人物和场景；参考图在提示词阶段规划。' : '未配置时只能生成简单规则草稿。'}</p></>}</aside></div><footer className="workspace-footer"><span>{p.analyzing ? '正在等待模型返回，右侧会持续显示用时' : '左侧编辑剧本 · 右侧检查分析结果'}</span><div className="flex gap-2"><Button disabled={!p.canAnalyze || p.busy} onClick={() => p.analyzed ? setConfirm('analyze') : p.onAnalyze()}>{p.analyzing ? '分析中…' : p.analyzed ? '重新分析' : p.aiReady ? '分析剧本' : '生成规则草稿'}</Button><Button disabled={!p.analyzed || p.analyzing} onClick={() => setStage('storyboard')}>下一步：分镜确认</Button></div></footer></TabsContent>
      <TabsContent value="storyboard" className="workspace-stage"><div className="workspace-body storyboard-stage">{p.analyzed ? p.storyboard : <div className="studio-panel"><h2>请先分析剧本</h2><Button onClick={() => setStage('script')}>返回剧本</Button></div>}</div><footer className="workspace-footer"><span>{p.adoptedBeatCount}/{p.beatCount} 段已采纳 · 只有已采纳分镜可以生成视频</span><Button disabled={!p.analyzed} onClick={() => setStage('prompts')}>下一步：提示词分析</Button></footer></TabsContent>
      <TabsContent value="prompts" className="workspace-stage"><div className="workspace-body min-h-0">{p.promptPlan}</div><footer className="workspace-footer"><span>分镜确认 → 自动生成提示词 → 参考图</span><Button disabled={!p.analyzed||p.busy} onClick={()=>setStage('assets')}>下一步：参考图</Button></footer></TabsContent>
      <TabsContent value="assets" className="workspace-stage"><div className="workspace-body pane-scroll">{p.analyzed ? p.assets : <div className="studio-panel"><h2>请先分析剧本</h2><p>系统会自动整理需要制作的图片。</p><Button onClick={() => setStage('script')}>返回剧本</Button></div>}</div><footer className="workspace-footer"><span>{p.reviewCount} 张待验收 · 打开原图检查后采用</span><div className="flex gap-2">{p.imageAction}<Button disabled={!p.analyzed} onClick={() => setStage('video')}>下一步：视频测试</Button></div></footer></TabsContent>
      <TabsContent value="video" keepMounted className="workspace-stage">{!p.analyzed ? <div className="studio-panel"><h2>请先分析剧本</h2><Button onClick={() => setStage('script')}>返回第一步</Button></div> : <div className="workspace-body production-layout"><aside className="production-assets pane-scroll"><header><h2>本段素材</h2><p>选择已采用的首帧或参考图</p></header>{p.binding}<Button variant="outline" className="m-3" onClick={() => setStage('assets')}>管理参考图 →</Button></aside><Tabs className="production-editor" value={productionTab} onValueChange={(value) => setProductionTab(String(value))}><TabsList className="!w-full shrink-0"><TabsTrigger value="prompt"><FileText size={14} />提示词</TabsTrigger><TabsTrigger value="run"><SlidersHorizontal size={14} />参数配置</TabsTrigger><TabsTrigger value="segments"><Settings2 size={14} />分段设置</TabsTrigger><TabsTrigger value="advanced"><Settings2 size={14} />高级工具</TabsTrigger></TabsList><TabsContent value="prompt" className="pane-scroll production-prompt">{p.videoPrompt}<div className="production-prompt-actions"><Button variant="outline" onClick={() => setStage('storyboard')}>修改分镜</Button><Button variant="outline" onClick={() => setStage('prompts')}>修改提示词</Button></div></TabsContent><TabsContent value="segments" keepMounted className="pane-scroll production-segments"><div id="production-segment-settings" /></TabsContent><TabsContent value="run" keepMounted className="pane-scroll production-run">{p.test}</TabsContent><TabsContent value="advanced" className="pane-scroll production-advanced"><details><summary>手动工作流与旧版单段工具</summary>{p.workflow}{p.editor}</details></TabsContent></Tabs><aside className="production-preview pane-scroll"><header><h2>视频预览</h2><p>当前片段与整片结果</p></header>{p.result}</aside><section className="production-timeline">{p.timeline}</section></div>}</TabsContent>
      <TabsContent value="logs" className="workspace-stage"><div className="workspace-body min-h-0">{p.logs}</div></TabsContent>
    </Tabs>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="!max-w-xl max-h-[85dvh] overflow-y-auto"><DialogTitle>连接与设置</DialogTitle><DialogDescription>剧本分析、生图和视频是三个独立服务，可以分别选择。</DialogDescription><div className="grid grid-cols-2 gap-2"><Button onClick={() => { setSettings(false); p.onSettings(); }}>剧本分析 API</Button><Button variant="outline" onClick={() => { setSettings(false); p.onImageSettings(); }}>参考图生成方式</Button></div>{p.connection}</DialogContent></Dialog>
    <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}><DialogContent><DialogTitle>替换当前内容？</DialogTitle><DialogDescription>建议先导出项目。此操作会替换当前项目或分析计划，不删除 ComfyUI 图片文件。</DialogDescription><Button variant="outline" onClick={() => setConfirm(null)}>取消</Button><Button onClick={() => { const action = confirm; setConfirm(null); if (action === 'new') { p.onNew(); setStage('script'); } else p.onAnalyze(); }}>确认继续</Button></DialogContent></Dialog>
  </main>;
}

function AnalysisProgress({ model, startedAt, onCancel }: { model: string; startedAt: number; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  return <output className="analysis-feedback" aria-live="polite">
    <span className="analysis-feedback-tag">正在分析剧本</span>
    <h2>正在整理导演方案</h2>
    <p className="analysis-feedback-intro">{model} 正在处理剧本。结果返回后，这里会直接显示分镜、人物、场景和参考图计划。</p>
    <div className="analysis-time"><span>已用时间</span><strong aria-label={`已用时间 ${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒`}>{time}</strong></div>
    <Button variant="outline" onClick={onCancel}>取消分析</Button>
    <div className="analysis-activity" aria-hidden="true"><span /></div>
    <div className="analysis-steps"><div className="done"><span>✓</span>请求已发送</div><div className="active"><span className="analysis-step-spinner" />等待模型返回结果</div><div><span>3</span>展示分析结果</div></div>
    <p className="analysis-feedback-note">最多等待5分钟；超时会结束并保留原有结果。</p>
  </output>;
}

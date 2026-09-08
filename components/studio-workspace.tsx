'use client';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
type Props = {
  title: string; analyzed: boolean; analyzing: boolean; canAnalyze: boolean; aiReady: boolean;
  assetCount: number; approvedCount: number; reviewCount: number; beatCount: number;
  message: string; blockedReason: string; comfyNeedsAttention: boolean; busy: boolean;
  onAnalyze: () => void; onSettings: () => void; onImageSettings: () => void; onNew: () => void; onExport: () => void;
  script: ReactNode; assets: ReactNode; timeline: ReactNode; editor: ReactNode;
  binding: ReactNode; connection: ReactNode; workflow: ReactNode; test: ReactNode; result: ReactNode; logs: ReactNode;
  conflicts: string[]; settings: ReactNode; imageAction: ReactNode; analysisResult: ReactNode;
};
export function StudioWorkspace(p: Props) {
  const [stage, setStage] = useState('script');
  const [settings, setSettings] = useState(false);
  const [confirm, setConfirm] = useState<'new' | 'analyze' | null>(null);
  return <main className="studio-workspace desktop-workspace">
    {p.settings}
    <header className="studio-header"><strong>智能搭子导演工作台</strong><div className="studio-header-actions flex flex-wrap gap-2"><a href="/tutorial" target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', className: 'toolbar-control toolbar-help' })}>使用教程 ↗</a><Button className="toolbar-control toolbar-settings" variant="outline" onClick={() => setSettings(true)}>连接与设置</Button><Button className="toolbar-control toolbar-export" variant="outline" onClick={p.onExport}>导出项目</Button><Button className="toolbar-control toolbar-primary" variant="outline" disabled={p.busy} onClick={() => setConfirm('new')}>新建</Button></div></header>
    <Tabs className="workspace-tabs" value={stage} onValueChange={(v) => setStage(String(v))}>
      <TabsList className="workspace-stepbar"><TabsTrigger value="script">01 剧本</TabsTrigger><TabsTrigger value="assets">02 参考图（{p.approvedCount}/{p.assetCount}）</TabsTrigger><TabsTrigger value="video">03 视频测试</TabsTrigger><TabsTrigger value="logs">04 系统日志</TabsTrigger></TabsList>
      {p.message && <output aria-live="polite" className="workspace-message">{p.message}</output>}
      <TabsContent value="script" className="workspace-stage"><div className="workspace-body script-layout"><div className="script-pane">{p.script}</div><aside className="studio-panel min-h-0 overflow-hidden">{p.analyzed ? p.analysisResult : <><h2>从剧本开始</h2><p>导入剧本 → 分析剧情 → 准备参考图。</p><Button className="my-4 w-full" variant="outline" onClick={p.onSettings}>{p.aiReady ? '大模型已配置' : '配置大模型 API'}</Button><p>{p.aiReady ? '分析完成后，这里会显示分镜、人物、场景和生图计划。' : '未配置时只能生成简单规则草稿。'}</p></>}</aside></div><footer className="workspace-footer"><span>左侧编辑剧本 · 右侧检查分析结果</span><div className="flex gap-2"><Button disabled={!p.canAnalyze || p.busy} onClick={() => p.analyzed ? setConfirm('analyze') : p.onAnalyze()}>{p.analyzing ? '分析中…' : p.analyzed ? '重新分析' : p.aiReady ? '分析剧本' : '生成规则草稿'}</Button><Button disabled={!p.analyzed} onClick={() => setStage('assets')}>下一步：参考图</Button></div></footer></TabsContent>
      <TabsContent value="assets" className="workspace-stage"><div className="workspace-body pane-scroll">{p.analyzed ? p.assets : <div className="studio-panel"><h2>请先分析剧本</h2><p>系统会自动整理需要制作的图片。</p><Button onClick={() => setStage('script')}>返回剧本</Button></div>}</div><footer className="workspace-footer"><span>{p.reviewCount} 张待验收 · 打开原图检查后采用</span><div className="flex gap-2">{p.imageAction}<Button disabled={!p.analyzed} onClick={() => setStage('video')}>下一步：视频测试</Button></div></footer></TabsContent>
      <TabsContent value="video" className="workspace-stage">{!p.analyzed ? <div className="studio-panel"><h2>请先分析剧本</h2><Button onClick={() => setStage('script')}>返回第一步</Button></div> : <div className="workspace-body video-layout"><aside className="pane-scroll">{p.timeline}</aside><Tabs className="video-detail" defaultValue="binding"><TabsList className="video-detail-tabs !w-full shrink-0"><TabsTrigger value="binding">选图</TabsTrigger><TabsTrigger value="description">描述</TabsTrigger><TabsTrigger value="result">结果</TabsTrigger><TabsTrigger value="advanced">高级</TabsTrigger></TabsList><TabsContent value="binding" className="pane-scroll">{p.binding}</TabsContent><TabsContent value="description" className="pane-scroll">{p.editor}</TabsContent><TabsContent value="result" className="pane-scroll">{p.result}</TabsContent><TabsContent value="advanced" className="pane-scroll">{p.workflow}</TabsContent></Tabs><aside className="video-run-panel">{p.blockedReason && (p.comfyNeedsAttention ? <Button title={p.blockedReason} className="video-connection-button toolbar-control toolbar-warning w-full" variant="outline" onClick={() => setSettings(true)}>本地 ComfyUI 连接测试/设置</Button> : <div className="studio-notice"><p>{p.blockedReason}</p></div>)}{p.test}</aside></div>}</TabsContent>
      <TabsContent value="logs" className="workspace-stage"><div className="workspace-body min-h-0">{p.logs}</div></TabsContent>
    </Tabs>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="!max-w-xl max-h-[85dvh] overflow-y-auto"><DialogTitle>连接与设置</DialogTitle><DialogDescription>剧本分析、生图和视频是三个独立服务，可以分别选择。</DialogDescription><div className="grid grid-cols-2 gap-2"><Button onClick={() => { setSettings(false); p.onSettings(); }}>剧本分析 API</Button><Button variant="outline" onClick={() => { setSettings(false); p.onImageSettings(); }}>参考图生成方式</Button></div>{p.connection}</DialogContent></Dialog>
    <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}><DialogContent><DialogTitle>替换当前内容？</DialogTitle><DialogDescription>建议先导出项目。此操作会替换当前项目或分析计划，不删除 ComfyUI 图片文件。</DialogDescription><Button variant="outline" onClick={() => setConfirm(null)}>取消</Button><Button onClick={() => { const action = confirm; setConfirm(null); if (action === 'new') { p.onNew(); setStage('script'); } else p.onAnalyze(); }}>确认继续</Button></DialogContent></Dialog>
  </main>;
}

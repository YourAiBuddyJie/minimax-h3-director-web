'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DirectorAnalysis, ReferenceAssetKind } from '@/lib/director';
import type { AssetTask } from '@/lib/asset-binding';

type Props = {
  analysis: DirectorAnalysis;
  assets: AssetTask[];
  aiReady: boolean;
  onSettings: () => void;
};

const kindLabels: Record<ReferenceAssetKind, string> = {
  identity: '人物母版',
  location: '场景母版',
  prop: '关键道具',
  costume: '服装状态',
  body_state: '身体状态',
  first_frame: 'Beat 首帧',
  last_frame: 'Beat 尾帧',
};

const statusLabels: Record<AssetTask['status'], string> = {
  draft: '待生成',
  submitting: '提交中',
  pending: '排队中',
  running: '生成中',
  review: '待验收',
  approved: '已采用',
  error: '失败',
};

function ResultCard({ children }: { children: ReactNode }) {
  return <article className="rounded-xl border border-white/8 bg-background/45 p-3">{children}</article>;
}

export function AnalysisInspector({ analysis, assets, aiReady, onSettings }: Props) {
  const identityAssets = assets.filter((asset) => asset.kind === 'identity');
  const locationAssets = assets.filter((asset) => asset.kind === 'location');
  const derivedAssets = assets.filter((asset) => !['identity', 'location'].includes(asset.kind));

  return <section className="analysis-inspector">
    <header className="analysis-inspector-header">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate">{analysis.projectTitle}</h2>
          <Badge variant={analysis.source === 'ai' ? 'default' : 'outline'}>{analysis.source === 'ai' ? 'AI 导演分析' : '规则草稿'}</Badge>
        </div>
        <p>分析结果已保存，可逐项检查并展开查看完整描述。</p>
      </div>
      {!aiReady && <Button size="sm" variant="outline" onClick={onSettings}>配置 AI</Button>}
    </header>

    <Tabs defaultValue="beats" className="analysis-inspector-tabs">
      <TabsList className="analysis-result-tabs">
        <TabsTrigger value="overview">剧情概览</TabsTrigger>
        <TabsTrigger value="beats">分镜 Beat</TabsTrigger>
        <TabsTrigger value="world">人物场景</TabsTrigger>
        <TabsTrigger value="images">生图计划</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="analysis-result-content">
        <div className="grid grid-cols-2 gap-2">
          {[['分镜', analysis.beats.length], ['人物', analysis.characters.length], ['连续空间', analysis.spaces.length], ['生图任务', assets.length]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-white/8 bg-background/45 p-2"><strong className="block text-lg text-primary">{value}</strong><span className="text-xs text-muted-foreground">{label}</span></div>)}
        </div>
        <h3 className="mt-4 text-sm font-medium">连续性与冲突检查（{analysis.conflicts.length}）</h3>
        {analysis.conflicts.length ? <ol className="mt-2 space-y-2">{analysis.conflicts.map((item, index) => <li key={`${index}-${item}`} className="rounded-lg border border-amber-300/15 bg-amber-300/5 p-2 text-sm leading-6"><span className="mr-2 text-amber-200">{index + 1}.</span>{item}</li>)}</ol> : <p className="rounded-lg border border-emerald-300/15 bg-emerald-300/5 p-3 text-sm text-emerald-100">未发现需要人工确认的素材冲突。</p>}
      </TabsContent>

      <TabsContent value="beats" className="analysis-result-content">
        <div className="space-y-2">{analysis.beats.map((beat, index) => <ResultCard key={beat.id}>
          <div className="flex items-start gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">{String(index + 1).padStart(2, '0')}</span>
            <div className="min-w-0 flex-1"><strong className="block text-sm">{beat.title}</strong><div className="mt-1 flex flex-wrap gap-1"><Badge variant="outline">{beat.duration}</Badge><Badge variant="outline">{beat.mode}</Badge><Badge variant="outline">{beat.status === 'ready' ? '可测试' : beat.status === 'review' ? '待检查' : '草稿'}</Badge></div></div>
          </div>
          <p className="mt-2 text-sm leading-6 text-foreground/90">{beat.summary}</p>
          <details className="mt-2"><summary>查看 H3 导演描述</summary><p className="mt-2 whitespace-pre-wrap rounded-lg bg-card p-2 text-xs leading-6 text-foreground/80">{beat.prompt}</p></details>
        </ResultCard>)}</div>
      </TabsContent>

      <TabsContent value="world" className="analysis-result-content">
        <h3 className="text-sm font-medium">人物（{analysis.characters.length}）</h3>
        <div className="mt-2 space-y-2">{analysis.characters.length ? analysis.characters.map((character, index) => {
          const asset = identityAssets[index];
          return <ResultCard key={`${index}-${character}`}><strong className="text-sm">{character}</strong>{asset ? <><div className="mt-2 flex flex-wrap gap-1"><Badge variant="outline">{kindLabels[asset.kind]}</Badge><Badge variant="outline">{asset.width}×{asset.height}</Badge><Badge variant={asset.status === 'approved' ? 'default' : 'outline'}>{statusLabels[asset.status]}</Badge></div><details className="mt-2"><summary>查看人物生图描述</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-foreground/80">{asset.prompt}</p></details></> : <p className="text-xs text-muted-foreground">尚未建立人物母版任务。</p>}</ResultCard>;
        }) : <p className="text-sm text-muted-foreground">未识别到具名人物。</p>}</div>
        <h3 className="mt-4 text-sm font-medium">连续空间（{analysis.spaces.length}）</h3>
        <div className="mt-2 space-y-2">{analysis.spaces.length ? analysis.spaces.map((space, index) => {
          const asset = locationAssets[index];
          return <ResultCard key={`${index}-${space}`}><strong className="text-sm">{space}</strong>{asset ? <><div className="mt-2 flex flex-wrap gap-1"><Badge variant="outline">{kindLabels[asset.kind]}</Badge><Badge variant="outline">{asset.width}×{asset.height}</Badge><Badge variant={asset.status === 'approved' ? 'default' : 'outline'}>{statusLabels[asset.status]}</Badge></div><details className="mt-2"><summary>查看场景生图描述</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-foreground/80">{asset.prompt}</p></details></> : <p className="text-xs text-muted-foreground">尚未建立场景母版任务。</p>}</ResultCard>;
        }) : <p className="text-sm text-muted-foreground">未识别到明确的连续空间。</p>}</div>
      </TabsContent>

      <TabsContent value="images" className="analysis-result-content">
        <p className="mb-3 text-xs leading-5 text-muted-foreground">先制作人物与场景母版，再生成身体、服装、道具与 Beat 首尾帧。这里展示的是分析得到的任务和提示词。</p>
        <div className="space-y-2">{[...identityAssets, ...locationAssets, ...derivedAssets].map((asset, index) => <ResultCard key={asset.id}>
          <div className="flex items-start justify-between gap-2"><strong className="text-sm leading-5">{index + 1}. {asset.title}</strong><Badge variant={asset.status === 'approved' ? 'default' : 'outline'}>{statusLabels[asset.status]}</Badge></div>
          <div className="mt-2 flex flex-wrap gap-1"><Badge variant="outline">{kindLabels[asset.kind]}</Badge>{asset.beatId && <Badge variant="outline">Beat {asset.beatId}</Badge>}<Badge variant="outline">{asset.width}×{asset.height}</Badge></div>
          {asset.sourceAssetIds?.length ? <p className="mt-2 text-xs text-emerald-200">继承素材：{asset.sourceAssetIds.map((id) => assets.find((item) => item.id === id)?.title || id).join('、')}</p> : null}
          <details className="mt-2"><summary>查看生图提示词</summary><p className="mt-2 whitespace-pre-wrap rounded-lg bg-card p-2 text-xs leading-6 text-foreground/80">{asset.prompt}</p>{asset.negativePrompt && <><strong className="mt-2 block text-xs">排除项</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">{asset.negativePrompt}</p></>}</details>
        </ResultCard>)}</div>
      </TabsContent>
    </Tabs>
  </section>;
}

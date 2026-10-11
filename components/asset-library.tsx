'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { ArrowLeft, ChevronLeft, ChevronRight, ImagePlus, LayoutGrid, List, Search } from 'lucide-react';
import type { AssetTask } from '@/lib/asset-binding';

type Props = { assets: AssetTask[]; previewUrl: (asset: AssetTask) => string; renderDetail: (asset: AssetTask, expanded?: boolean) => ReactNode; statusLabels: Record<AssetTask['status'], string> };
const groups = [{ id: 'all', title: '全部' }, { id: 'identity', title: '人物' }, { id: 'location', title: '场景' }, { id: 'frames', title: '首尾帧' }, { id: 'other', title: '其他' }];
function matchesGroup(asset: AssetTask, group: string) {
  if (group === 'all') return true;
  if (group === 'frames') return ['first_frame', 'last_frame'].includes(asset.kind);
  if (group === 'other') return !['identity', 'location', 'first_frame', 'last_frame'].includes(asset.kind);
  return asset.kind === group;
}
export function AssetLibrary(p: Props) {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [ready, setReady] = useState(false);
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { try { if (localStorage.getItem('h3-director-asset-view') === 'list') setView('list'); } catch { /* View preference is optional. */ } setReady(true); }, []);
  useEffect(() => { if (ready) try { localStorage.setItem('h3-director-asset-view', view); } catch { /* View preference is optional. */ } }, [ready, view]);
  const filtered = p.assets.filter((asset) => matchesGroup(asset, group) && `${asset.title} ${asset.beatId || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = p.assets.find((asset) => asset.id === selectedId);
  const selectedIndex = filtered.findIndex((asset) => asset.id === selectedId);
  if (selected) return <section className="asset-detail-page" aria-label="参考图详情页面">
    <header className="asset-detail-header"><div><button type="button" className="asset-detail-back" onClick={() => setSelectedId(null)}><ArrowLeft size={16} />返回素材库</button><h2>{selected.title}</h2></div><div className="asset-detail-navigation"><span>{selectedIndex + 1} / {filtered.length}</span><button type="button" disabled={selectedIndex <= 0} onClick={() => setSelectedId(filtered[selectedIndex - 1].id)}><ChevronLeft size={16} />上一张</button><button type="button" disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} onClick={() => setSelectedId(filtered[selectedIndex + 1].id)}>下一张<ChevronRight size={16} /></button></div></header>
    {p.renderDetail(selected, true)}
  </section>;
  return <section className="asset-library" aria-label="参考图素材库">
    <div className="asset-library-controls"><div className="asset-library-groups" role="group" aria-label="素材类别">{groups.map((item) => <button key={item.id} type="button" aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>{item.title}<span>{p.assets.filter((asset) => matchesGroup(asset, item.id)).length}</span></button>)}</div><div className="asset-library-tools"><label className="asset-library-search"><Search size={15} /><input aria-label="搜索参考图" placeholder="搜索名称或 Beat" value={query} onChange={(e) => setQuery(e.target.value)} /></label><div className="asset-library-switch" role="group" aria-label="参考图显示方式"><button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={15} />卡片</button><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={15} />列表</button></div></div></div>
    {!filtered.length ? <p className="p-8 text-center text-sm text-muted-foreground">{p.assets.length ? '没有匹配的参考图，请调整分类或搜索条件。' : '完成剧本分析后，这里会显示人物、场景和首尾帧。'}</p> : view === 'grid' ? <div className="asset-library-grid">{filtered.map((asset) => { const preview = p.previewUrl(asset); return <button key={asset.id} type="button" className="asset-library-card" aria-label={`打开素材：${asset.title}`} onClick={() => setSelectedId(asset.id)}><div className="asset-library-thumbnail">{preview ? <Image unoptimized src={preview} width={240} height={300} alt={asset.title} /> : <div className="asset-library-placeholder"><ImagePlus size={28} /><span>{p.statusLabels[asset.status]}</span></div>}<span className={`asset-library-status ${asset.status === 'approved' ? 'approved' : ''}`}>{p.statusLabels[asset.status]}</span></div><div className="asset-library-caption"><strong>{asset.title}</strong><span>{groups.find((g) => g.id !== 'all' && matchesGroup(asset, g.id))?.title} {asset.beatId && asset.beatId !== 'global' ? ` · ${asset.beatId}` : ' · 全局母版'}</span>{asset.error && <span className="text-destructive" title={asset.error}>有问题，打开查看</span>}</div></button>; })}</div> : <div className="asset-library-list divide-y divide-white/6">{filtered.map((asset) => p.renderDetail(asset))}</div>}

  </section>;
}

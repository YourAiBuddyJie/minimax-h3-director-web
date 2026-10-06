'use client';

import { useState } from 'react';
import { Cloud, Cpu, Eye, EyeOff, ImagePlus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { imageProviderPresets, type ImageProviderConfig, type ImageProviderId } from '@/lib/image-providers';

type Props = { open: boolean; onOpenChange: (open: boolean) => void; config: ImageProviderConfig; onChange: (config: ImageProviderConfig) => void };

export function ImageSettingsDialog({ open, onOpenChange, config, onChange }: Props) {
  const preset = imageProviderPresets[config.provider];
  const [showKey, setShowKey] = useState(false);
  function choose(provider: ImageProviderId) {
    const next = imageProviderPresets[provider];
    const apiKey = provider !== 'local' ? window.sessionStorage.getItem(`h3-director-image-api-key:${provider}`) || '' : '';
    onChange({ provider, apiKey, model: next.model, baseUrl: next.baseUrl, enableThinking: false });
  }
  const ready = config.provider === 'local' || Boolean(config.apiKey.trim() && config.model.trim() && config.baseUrl.trim());
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><ImagePlus className="size-5 text-primary" />参考图生成方式</DialogTitle><DialogDescription>项目默认方式可随时切换；每张素材还可以单独覆盖。切换不会删除已经生成的图片。</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3">{(['local', 'aliyun', 'volcengine'] as ImageProviderId[]).map((id) => <button type="button" key={id} onClick={() => choose(id)} className={`rounded-xl border p-4 text-left transition ${config.provider === id ? 'border-primary/55 bg-primary/10' : 'border-white/10 bg-background/45 hover:border-white/25'}`}><span className="flex items-center gap-2 font-medium">{id === 'local' ? <Cpu className="size-4" /> : <Cloud className="size-4" />}{imageProviderPresets[id].name}</span><span className="mt-2 block text-xs leading-5 text-muted-foreground">{imageProviderPresets[id].description}</span></button>)}</div>
      {config.provider !== 'local' && <div className="grid gap-4 rounded-xl border border-white/8 bg-background/45 p-4">
        <label className="text-xs text-muted-foreground">{config.provider === 'aliyun' ? '百炼' : '火山方舟'} API Key<div className="relative mt-1.5"><Input type={showKey ? 'text' : 'password'} value={config.apiKey} onChange={(event) => onChange({ ...config, apiKey: event.target.value })} autoComplete="off" placeholder="仅保存在当前标签页" className="pr-10 font-mono" /><button type="button" onClick={() => setShowKey((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1" aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>{showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>
        <label className="text-xs text-muted-foreground">模型<Input value={config.model} onChange={(event) => onChange({ ...config, model: event.target.value })} className="mt-1.5 font-mono" /></label>
        <label className="text-xs text-muted-foreground">接口地址<Input value={config.baseUrl} onChange={(event) => onChange({ ...config, baseUrl: event.target.value })} className="mt-1.5 font-mono text-xs" /><span className="mt-1 block">系统只允许当前供应商的官方生图接口。</span></label>
        {config.provider === 'aliyun' && <label className="flex items-start gap-3 rounded-lg border border-white/8 p-3 text-sm"><input type="checkbox" checked={config.enableThinking} onChange={(event) => onChange({ ...config, enableThinking: event.target.checked })} className="mt-1" /><span>开启深度思考<span className="mt-1 block text-xs text-muted-foreground">可能提升复杂构图理解，但会增加生成时间。默认关闭。</span></span></label>}
        {config.provider === 'volcengine' && <p className="rounded-lg border border-white/8 p-3 text-xs leading-5 text-muted-foreground">默认使用 Seedream 5.0。也可按方舟控制台实际开通情况改为 <code>doubao-seedream-5-0-lite-260128</code> 或 <code>doubao-seedream-4-5-251128</code>。</p>}
      </div>}
      <div className="flex gap-2 rounded-xl border border-sky-400/15 bg-sky-400/5 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-sky-300" /><p>线上方式会产生供应商费用。API Key 仅保存在当前标签页，不会进入项目草稿或导出文件；生成结果会立即保存回本机 ComfyUI，避免临时链接过期。</p></div>
      <DialogFooter><span className="mr-auto self-center text-xs text-muted-foreground">当前：{preset.name}</span><Button onClick={() => onOpenChange(false)} disabled={!ready}>保存并使用</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

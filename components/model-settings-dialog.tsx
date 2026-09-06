'use client';

import { useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { providerPresets, type ProviderConfig, type ProviderId } from '@/lib/providers';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ProviderConfig;
  onChange: (config: ProviderConfig) => void;
};

export function ModelSettingsDialog({ open, onOpenChange, config, onChange }: Props) {
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const preset = providerPresets[config.provider];

  function chooseProvider(provider: ProviderId) {
    const next = providerPresets[provider];
    const savedKey = window.sessionStorage.getItem(`h3-director-api-key:${provider}`) || '';
    onChange({ provider, apiKey: savedKey, model: next.model, baseUrl: next.baseUrl });
    setTestResult(null);
  }

  async function testConnection() {
    setTesting(true); setTestResult(null);
    try {
      const response = await fetch('/api/providers/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerConfig: config }) });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || '连接测试失败');
      setTestResult({ ok: true, message: `${preset.name} · ${config.model} 连接成功` });
    } catch (error) { setTestResult({ ok: false, message: error instanceof Error ? error.message : '连接测试失败' }); }
    finally { setTesting(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><div className="flex items-center gap-2"><div className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary"><KeyRound className="size-4" /></div><div><DialogTitle>大模型 API 设置</DialogTitle><DialogDescription>选择国内或国际模型供应商，用于剧本与导演数据分析。</DialogDescription></div></div></DialogHeader>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{(Object.keys(providerPresets) as ProviderId[]).map((id) => <button type="button" key={id} onClick={() => chooseProvider(id)} className={`rounded-xl border px-3 py-3 text-left text-xs transition ${config.provider === id ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-white/8 bg-background/45 text-muted-foreground hover:border-white/20'}`}><span className="block font-medium">{providerPresets[id].name}</span><span className="mt-1 block text-[10px] opacity-70">{id === 'openai' ? 'Responses' : '兼容接口'}</span></button>)}</div>
      <div className="grid gap-4 rounded-xl border border-white/8 bg-background/40 p-4 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground sm:col-span-2">{preset.keyLabel}<div className="relative mt-1.5"><Input type={showKey ? 'text' : 'password'} value={config.apiKey} onChange={(event) => { onChange({ ...config, apiKey: event.target.value }); setTestResult(null); }} autoComplete="off" placeholder="仅保存在当前浏览器会话" className="h-10 pr-10 font-mono" /><button type="button" onClick={() => setShowKey((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>{showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>
        <label className="text-xs text-muted-foreground">模型名称<Input value={config.model} onChange={(event) => { onChange({ ...config, model: event.target.value }); setTestResult(null); }} className="mt-1.5 h-10 font-mono" /></label>
        <div className="text-xs text-muted-foreground">供应商<a href={preset.helpUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', className: 'mt-1.5 h-10 w-full justify-between' })}>打开控制台<ExternalLink className="size-3.5" /></a></div>
        <label className="text-xs text-muted-foreground sm:col-span-2">兼容接口地址<Input value={config.baseUrl} onChange={(event) => { onChange({ ...config, baseUrl: event.target.value }); setTestResult(null); }} className="mt-1.5 h-10 font-mono text-xs" /></label>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-sky-400/15 bg-sky-400/5 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-sky-300" /><p>API Key 只保存在当前标签页的会话存储中，关闭标签页后清除；不会写入项目草稿、导出文件或 Git。请求只会发送到当前所选供应商的官方白名单域名。</p></div>
      {testResult && <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${testResult.ok ? 'bg-emerald-400/10 text-emerald-200' : 'bg-destructive/10 text-red-200'}`}>{testResult.ok && <CheckCircle2 className="size-4" />}{testResult.message}</div>}
      <DialogFooter><Badge variant="outline" className="mr-auto self-center">{preset.name}</Badge><Button variant="outline" onClick={testConnection} disabled={testing || !config.apiKey.trim() || !config.model.trim()}>{testing ? <><LoaderCircle className="animate-spin" />测试中…</> : '测试连接'}</Button><Button onClick={() => onOpenChange(false)} disabled={!config.apiKey.trim()}>保存并使用</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

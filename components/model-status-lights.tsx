'use client';
import { useEffect, useState } from 'react';
export type ModelLight = { state: 'idle' | 'checking' | 'ready' | 'error'; detail: string; statusLabel?: string };
export function ModelStatusLights({ script, onScriptSettings, image, onCheckImage }: { script: ModelLight; onScriptSettings: () => void; image: ModelLight; onCheckImage: () => void }) {
  const [video, setVideo] = useState<ModelLight>({ state: 'idle', detail: '尚未检测视频环境' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function check() {
      let url = 'http://127.0.0.1:8189';
      try { url = JSON.parse(localStorage.getItem('h3-director-run') || '{}').url || url; } catch { /* default local service */ }
      setVideo({ state: 'checking', detail: `正在检查 ${url} 的 H3 节点和模型` });
      try {
        const response = await fetch(`/api/comfy?url=${encodeURIComponent(url)}&workflow=h3-i2v`, { signal: controller.signal });
        const data = await response.json() as { nodesChecked?: boolean; error?: string; missingNodes?: string[]; missingModels?: string[] };
        const missing = [...(data.missingNodes || []), ...(data.missingModels || [])];
        if (!response.ok || !data.nodesChecked || missing.length) throw Error(data.error || (missing.length ? `缺少：${missing.join('、')}` : '无法读取模型信息'));
        if (active) setVideo({ state: 'ready', detail: `${url} · H3 基础节点与模型可用；具体生成参数仍需预检` });
      } catch (error) { if (active) setVideo({ state: 'error', detail: `${url} · ${error instanceof Error ? error.message : '检测失败'}` }); }
    }
    const initial = setTimeout(() => { void check(); }, 0);
    const timer = setInterval(() => { void check(); }, 60000);
    return () => { active = false; controller.abort(); clearTimeout(initial); clearInterval(timer); };
  }, [retry]);
  return <div className="model-status-lights" aria-label="模型环境状态">{[{ label: '剧本模型', value: script, check: onScriptSettings }, { label: '生图模型', value: image, check: onCheckImage }, { label: '视频模型', value: video, check: () => setRetry((v) => v + 1) }].map(({label,value,check}) => {
    const status = value.statusLabel || { idle: '未检测', checking: '检测中', ready: '可用', error: '异常' }[value.state];
    return <button key={label} data-state={value.state} type="button" disabled={value.state === 'checking'} onClick={check} title={`${value.detail}；${label === '剧本模型' ? '点击打开模型设置，可测试连接' : '点击重新检测'}`} aria-label={`${label}：${status}`}><span className="model-status-dot" data-state={value.state} aria-hidden="true" /><span className="model-status-copy"><strong>{label}</strong><small>{status}</small></span></button>;
  })}</div>;
}

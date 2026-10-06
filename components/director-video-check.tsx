'use client';
import { useState } from 'react';
import { measureFrameBars } from '@/lib/frame-quality';

export function DirectorVideoCheck({ src, aspect }: { src: string; aspect: string }) {
  const [result, setResult] = useState('待检测：点击检查成片尺寸与黑边');
  const [busy, setBusy] = useState(false);
  async function inspect() {
    setBusy(true);
    const video = document.createElement('video');
    video.preload = 'auto'; video.muted = true;
    const event = (name: string, action: () => void) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => done(new Error('读取视频超时')), 15000);
      const ok = () => done(); const fail = () => done(new Error('无法读取视频'));
      function done(error?: Error) { clearTimeout(timer); video.removeEventListener(name, ok); video.removeEventListener('error', fail); if (error) reject(error); else resolve(); }
      video.addEventListener(name, ok, { once: true }); video.addEventListener('error', fail, { once: true }); action();
    });
    try {
      await event('loadeddata', () => { video.src = src; video.load(); });
      const [w, h] = aspect.split(':').map(Number);
      const ratioOk = Math.abs(video.videoWidth / video.videoHeight / (w / h) - 1) < 0.06;
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = Math.max(32, Math.round(160 * video.videoHeight / video.videoWidth));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context || !Number.isFinite(video.duration)) throw new Error('视频尚不可检测');
      let bars = 0, dark = 0;
      for (const position of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        await event('seeked', () => { video.currentTime = video.duration * position; });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = measureFrameBars(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (frame.suspectedBars) bars++; if (frame.darkFrame) dark++;
      }
      setResult(`实际 ${video.videoWidth}×${video.videoHeight} · ${video.duration.toFixed(2)} 秒；${ratioOk ? '画布比例符合提交画幅' : '画布比例与提交画幅不符'}。${bars >= 3 ? `5 个采样点中 ${bars} 个疑似存在黑边，请检查满幅构图。` : `黑边采样未形成持续异常（${bars}/5），仍需人工观看。`}${dark ? ` ${dark} 个暗帧无法可靠判断。` : ''} 检测不代表人物、动作与对白质检通过。`);
    } catch (error) { setResult(error instanceof Error ? error.message : '检测失败，请人工观看'); }
    finally { video.removeAttribute('src'); video.load(); setBusy(false); }
  }
  return <div className="mt-3 text-xs leading-5"><button type="button" className="rounded border px-3 py-2" disabled={busy} onClick={() => void inspect()}>{busy ? '正在采样检测…' : '检查成片尺寸与黑边'}</button><p className="mt-2">{result}</p></div>;
}

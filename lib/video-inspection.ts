import { measureFrameBars } from './frame-quality';
export async function sampleVideo(src: string, aspect: string, expectedSeconds: number) {
  const video = document.createElement('video'); video.preload = 'auto'; video.muted = true;
  const wait = (name: string, action: () => void) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('自动验收读取视频超时')), 20000);
    const ok = () => done(); const fail = () => done(new Error('自动验收无法解码视频'));
    function done(error?: Error) { clearTimeout(timer); video.removeEventListener(name, ok); video.removeEventListener('error', fail); if (error) reject(error); else resolve(); }
    video.addEventListener(name, ok, { once: true }); video.addEventListener('error', fail, { once: true }); action();
  });
  try {
    await wait('loadeddata', () => { video.src = src; video.load(); });
    if (!Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) throw new Error('视频元数据无效');
    const [w, h] = aspect.split(':').map(Number);
    const reasons: string[] = [];
    if (Math.abs(video.videoWidth / video.videoHeight / (w / h) - 1) > 0.06) reasons.push('视频宽高比不符合提交画幅');
    if (Math.abs(video.duration - expectedSeconds) > Math.max(0.5, expectedSeconds * 0.08)) reasons.push('视频实际时长与分镜时长不符');
    const canvas = document.createElement('canvas'); canvas.width = Math.min(512, video.videoWidth); canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('无法抽取视频帧');
    const frames: string[] = []; let bars = 0, dark = 0;
    for (const position of [0.01, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.99]) {
      await wait('seeked', () => { video.currentTime = video.duration * position; });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const finding = measureFrameBars(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if (finding.suspectedBars) bars++; if (finding.darkFrame) dark++;
      frames.push(canvas.toDataURL('image/jpeg', 0.8));
    }
    if (bars >= 3) reasons.push(`8个采样点中${bars}个疑似存在黑边`);
    if (dark >= 4) reasons.push('过多暗帧，不能可靠自动验收');
    return { passed: !reasons.length, reasons, frames, width: video.videoWidth, height: video.videoHeight, duration: video.duration };
  } finally { video.removeAttribute('src'); video.load(); }
}

export async function imageDataUrl(src: string): Promise<string> {
  const response = await fetch(src); if (!response.ok) throw new Error('无法读取验收参考图');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/') || blob.size > 20 * 1024 * 1024) throw new Error('验收参考图格式或大小无效');
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法缩放验收参考图');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/jpeg', 0.85);
  } finally { bitmap.close(); }
}

'use client';

import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('导演台页面渲染失败', error); }, [error]);
  return <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
    <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-card p-6">
      <h1 className="text-xl font-semibold">页面显示遇到问题</h1>
      <p className="mt-3 text-sm text-muted-foreground">当前项目会继续保存在本机。请重试显示；如果仍失败，记下方错误信息。</p>
      <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs text-red-200">{error.message || '未知页面错误'}</pre>
      <button type="button" onClick={reset} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">重试显示</button>
    </section>
  </main>;
}

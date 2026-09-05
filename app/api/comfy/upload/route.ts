import { NextResponse } from 'next/server';
import { localComfyBase } from '@/lib/comfy';

export async function POST(request: Request) {
  try {
    const input = await request.formData();
    const comfyValue = input.get('comfyUrl');
    const comfyUrl = typeof comfyValue === 'string' ? comfyValue : '';
    const base = localComfyBase(comfyUrl);
    const files = input.getAll('files').filter((item): item is File => item instanceof File);
    if (!files.length) return NextResponse.json({ error: '没有选择参考图' }, { status: 400 });
    const uploaded: string[] = [];
    for (const file of files.slice(0, 8)) {
      if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error(`${file.name} 不是有效的 20MB 以内图片`);
      const form = new FormData(); form.append('image', file, file.name); form.append('type', 'input'); form.append('subfolder', 'h3-director-web'); form.append('overwrite', 'true');
      const response = await fetch(new URL('/upload/image', base), { method: 'POST', body: form });
      if (!response.ok) throw new Error(`上传 ${file.name} 失败：HTTP ${response.status}`);
      const result = await response.json() as { name: string; subfolder?: string };
      uploaded.push(result.subfolder ? `${result.subfolder}/${result.name}` : result.name);
    }
    return NextResponse.json({ uploaded });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '上传失败' }, { status: 502 }); }
}

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
    if (files.length > 8) return NextResponse.json({ error: '单次最多上传 8 张参考图' }, { status: 400 });
    const uploaded: string[] = [];
    const filesForProject: Array<{ filename: string; subfolder: string; type: string }> = [];
    for (const [index, file] of files.entries()) {
      if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error(`${file.name} 不是有效的 20MB 以内图片`);
      const extension = file.name.match(/\.(png|jpe?g|webp)$/i)?.[0]?.toLowerCase() || '.png';
      const uniqueName = `${crypto.randomUUID()}-picture-${index + 1}${extension}`;
      const form = new FormData(); form.append('image', file, uniqueName); form.append('type', 'input'); form.append('subfolder', 'h3-director-web'); form.append('overwrite', 'false');
      const response = await fetch(new URL('/upload/image', base), { method: 'POST', body: form });
      if (!response.ok) throw new Error(`上传 ${file.name} 失败：HTTP ${response.status}`);
      const result = await response.json() as { name: string; subfolder?: string; type?: string };
      if (!result.name) throw new Error(`上传 ${file.name} 后没有收到文件名`);
      const saved = { filename: result.name, subfolder: result.subfolder || 'h3-director-web', type: result.type || 'input' };
      filesForProject.push(saved);
      uploaded.push(saved.subfolder ? `${saved.subfolder}/${saved.filename}` : saved.filename);
    }
    return NextResponse.json({ uploaded, files: filesForProject });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '上传失败' }, { status: 502 }); }
}

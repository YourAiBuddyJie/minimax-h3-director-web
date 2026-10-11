import WordExtractor from 'word-extractor';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !/\.(doc|docx)$/i.test(file.name)) {
      return Response.json({ error: '请选择 .doc 或 .docx Word 文档。' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return Response.json({ error: 'Word 文档不能超过 10 MB。' }, { status: 413 });
    }
    const document = await new WordExtractor().extract(Buffer.from(await file.arrayBuffer()));
    const text = document.getBody().replace(/\r\n?/g, '\n').trim();
    if (!text) return Response.json({ error: '文档中没有可导入的正文文字，请检查是否为扫描图片。' }, { status: 422 });
    return Response.json({ text });
  } catch {
    return Response.json({ error: '无法读取 Word 文档。请确认文件未损坏或加密，或另存为 .docx 后再导入。' }, { status: 422 });
  }
}

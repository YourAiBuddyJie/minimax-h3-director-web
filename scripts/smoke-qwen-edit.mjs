// Local integration test: one difficult two-person, one-location Qwen 2511 edit.
import { prepareQwenImageEdit } from '../lib/comfy.ts';

const comfyUrl = 'http://127.0.0.1:8188';
const prompt = prepareQwenImageEdit({
  prompt: '参考图职责不可互换：image1 是唯一的山洞连续空间与竖屏构图基准；image2 是云初的唯一身份母版；image3 是陆承渊的唯一身份母版。生成一张东方古装写实电影剧照：同一山洞石台前，陆承渊以双臂横抱因中蛊而虚弱昏迷的云初，男人双脚稳定站立，右臂托住她的肩背，左臂托住她的双膝；云初身体完整自然，双臂自然下垂。严格复制两人的脸、发型、年龄、服装形制；严格复制洞口、瀑布、岩壁、石台、火光位置和光线方向。画面中只出现这两名人物，每人只有两只手和两条腿，手指、手腕、肘部和肩部连接正确，不融合身体，不增加人物，不出现文字。',
  negativePrompt: '身份漂移，换脸，男女融合，同一张脸，第三个人，多余手臂，多余手指，断肢，扭曲手腕，错误抱姿，现代服装，场景漂移，拼贴，分屏，文字，水印，低质量',
  seed: 9212511,
  label: 'qwen2511-two-person-test',
  images: [
    'h3-director-web/assets/as_cave_inner_00001_.png [output]',
    'h3-director-web/assets/as_yunchu_identity_00001_.png [output]',
    'h3-director-web/assets/as_luchengyuan_identity_00001_.png [output]',
  ],
});
const response = await fetch(`${comfyUrl}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, client_id: 'director-qwen-edit-smoke' }) });
const submitted = await response.json();
if (!response.ok || !submitted.prompt_id) throw new Error(JSON.stringify(submitted));
console.log('Submitted:', submitted.prompt_id);
for (let index = 0; index < 600; index++) {
  const history = await fetch(`${comfyUrl}/history/${submitted.prompt_id}`).then((result) => result.json());
  const entry = history[submitted.prompt_id];
  if (entry?.status?.status_str === 'error') throw new Error(JSON.stringify(entry.status.messages));
  if (entry?.status?.completed) {
    const files = Object.values(entry.outputs || {}).flatMap((output) => output.images || []);
    console.log('PASS:', JSON.stringify(files));
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
throw new Error('Timed out; inspect ComfyUI queue before rerunning');

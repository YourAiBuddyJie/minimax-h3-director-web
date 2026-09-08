// Stage-two test: preserve a successful action composition, then repair both identities.
import { prepareQwenImageEdit } from '../lib/comfy.ts';

const comfyUrl = 'http://127.0.0.1:8188';
const prompt = prepareQwenImageEdit({
  prompt: '这是精准局部身份修复，不是重新构图。image1 是最终构图底图：必须完整保留它的竖屏画幅、相机位置、山洞瀑布、岩壁、火光、地面、两人横抱姿势、每条手臂和腿的位置、白色包裹及湿发状态。image2 是被抱女子云初的唯一身份母版：只把 image1 中女子的脸部骨相、眼鼻唇比例和发饰校正为 image2 的同一成年女子，同时保留闭眼虚弱表情和湿发。image3 是抱人男子陆承渊的唯一身份母版：只把 image1 中男子的脸部骨相、年龄、发型、冠饰及白灰古装形制校正为 image3 的同一成年男子。人物必须仍处在 image1 的原位置和原姿势；不要移动、缩放或增加任何人物，不要改变场景和光线。',
  negativePrompt: '重新构图，改变姿势，站上石台，放下女子，换脸失败，男女同脸，第三个人，多余手臂，多余手指，断肢，扭曲手腕，现代服装，场景漂移，文字，水印，低质量',
  seed: 9212512,
  steps: 4,
  label: 'qwen2511-lightning-4step-test',
  images: [
    'h3-director-web/assets/as_carry_wrapped_00004_.png [output]',
    'h3-director-web/assets/as_yunchu_identity_00001_.png [output]',
    'h3-director-web/assets/as_luchengyuan_identity_00001_.png [output]',
  ],
});
const response = await fetch(`${comfyUrl}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, client_id: 'director-qwen-identity-fix-smoke' }) });
const submitted = await response.json();
if (!response.ok || !submitted.prompt_id) throw new Error(JSON.stringify(submitted));
console.log('Submitted:', submitted.prompt_id);
for (let index = 0; index < 500; index++) {
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

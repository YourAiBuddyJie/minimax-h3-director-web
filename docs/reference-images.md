# 本地参考图制作：Qwen Image 2.1

本地人物、场景母版和所有派生分镜图统一使用 Qwen Image 2.1。云端百炼、Seedream 保持独立。

## 准备

更新 ComfyUI 至支持 `TextEncodeQwenImage21` 和 `QwenImage21Cache` 的版本，将模型放入对应目录：

- `models/diffusion_models/qwen_image_2.1_int8_convrot.safetensors`
- `models/text_encoders/qwen3vl_8b_int8_convrot.safetensors`
- `models/vae/qwen_image_2.1_vae_bf16.safetensors`

[Comfy-Org 官方模型包](https://huggingface.co/Comfy-Org/Qwen-Image-2.1)
[官方编辑模板](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_image_edit.json)

无需旧版 Z-Image、FLUX.2、Qwen Edit 2511 或其 Lightning LoRA。导演台不会自动下载模型。

## 使用

1. 启动 ComfyUI，在导演台检测本地模型与节点。
2. 先生成并采用单人单画面的身份母版和单一连续空间母版。
3. 生成派生图时，一次输入已采用的角色、场景、道具和状态图，最多 10 张；超出时明确报错，不截断本地参考素材。
4. 首帧或状态合成图优先作为编辑画布，其次是场景母版；提示词通过 `<image1>` 等编号说明职责。编辑输出沿用第一张图的画幅，以约 1024×1024 的像素预算对齐到 32 倍数；文生图按素材宽高归一化。
5. 默认 25 步、Euler/simple、CFG 1，沿用官方 ComfyUI 模板起点。CFG 1 不单独应用负向引导，因此画面约束也写入正向描述；未沿用旧版 4 步 LoRA。
6. 打开结果核对身份、服装、空间、手部、道具和首尾状态，验收后采用。

## 保存和迁移

已有采用图片保留；旧版尚未结束的两阶段任务不会自动进入精修，需查看 ComfyUI 队列后手动重做。
项目数据保存在浏览器，图片保存在 ComfyUI；导出 JSON 不打包图片。

## 验证

开发检查：`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`。
启动两个服务后，用 `node scripts/smoke-image.mjs` 做一次真实文生图测试；编辑测试通过 `node --experimental-strip-types scripts/smoke-image-edit.mjs "参考图路径 [output]"` 指定 1–10 张 ComfyUI 素材。

本次接入时本机 8188 未启动，尚未验证真实出图、12GB 显存峰值和耗时。模型检测通过不等于推理验收通过。

## 提示词校准

本地文生图与编辑指令已按 Qwen 2.1 官方 PE 指南分开适配，见 [校准依据、示例与限制](QWEN_IMAGE_PROMPT_CALIBRATION.md)。已有采用图和缓存描述不自动改写。

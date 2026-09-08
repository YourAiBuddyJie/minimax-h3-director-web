# 本地参考图制作

模型与 ComfyUI 独立安装，不包含在导演台发布包中。导演台只内置工作流 JSON，通过本机 HTTP 接口提交任务。

## 使用顺序

1. 启动 ComfyUI，在导演台填写本机地址，点击“检测连接、节点与模型”。生图和视频环境分别检查。
2. 导入剧本并分析。配置大模型 API 才能做语义导演分析；离线结果只是规则草稿。
3. 在“参考图素材中心”检查提示词。先建立并采用人物、场景母版，再生成派生图。派生图会自动运行 FLUX.2 动作构图和 Qwen 2511 一致性精修两个阶段。
4. 核对人物、服装、道具、身体状态、单一连续空间，点击“采用”。未采用素材不会送给视频工作流。
5. 选择 Beat，在“参考图绑定”中指定图片。FL2VA 输入顺序是首帧、尾帧；Ref2VA 当前内置模板支持两张参考图。不要为多个角色随意省略关键参考图。
6. 先做单 Beat 低分辨率视频测试，再抽帧、播放并验收。此版本不会自动批量生成视频。

剧本分析返回明确的素材 ID 时可自动绑定；旧项目或没有明确对应关系时，必须手动选择，系统不会猜测全局第一张人物图就是当前人物。手动上传会覆盖素材选择，切换 Beat 后清除手动图片。

## 模型要求

- diffusion_models/z_image_turbo_nvfp4.safetensors
- text_encoders/qwen_3_4b_fp4_mixed.safetensors
- vae/ae.safetensors
- diffusion_models/flux-2-klein-4b-fp8.safetensors
- vae/flux2-vae.safetensors
- diffusion_models/qwen-image-edit-2511-Q4_K_M.gguf
- text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors
- vae/qwen_image_vae.safetensors
- loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors

人物身份母版必须是单人单画面定妆照，禁止四宫格、设定板、拼贴或多视角合成。基础母版使用 Z-Image；派生图中 FLUX.2 Klein 4B 只生成动作构图草图，Qwen-Image-Edit-2511 Q4_K_M 配合官方 Lightning 4 步 LoRA 输出最终一致性图片。GGUF 模型需要 ComfyUI-GGUF 的 `UnetLoaderGGUF` 节点。导演台的环境检测会同时核对三套模板。

## 当前限制

- 双阶段流程会把动作构图草图与人物/场景母版一起送入最终精修，但仍不能保证绝对一致。必须对照原图人工验收；包含背景人物在内的动作差异也需要检查。
- 提示词修改后取消原来的采用状态，但预览仍是旧图；请重做后再采用。
- 项目数据保存在当前浏览器；图片保存在 ComfyUI output。导出项目 JSON 不会打包图片，迁移时需另行复制。
- 任务丢失、ComfyUI 重启或历史被清空会显示失败，不会偷偷重复提交。提交中刷新页面后，先检查 ComfyUI 队列再手动重试。
- 本轮验证生图提交、结果查询和预览，以及绑定规则；未执行新的完整视频生成测试。

开发验证：`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`。运行中的本地服务可用 `node scripts/smoke-image.mjs` 做一次真实生图接口测试（占用本机 GPU，生成一张测试图片）。

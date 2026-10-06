# 0.3.0 Director接入与验证

新增模块：director-analysis负责模型数据校验，director-review检查原文/对白/动作负荷/接续，director-timeline编译H3时间线与工作流，director-preflight检查节点和模型，DirectorRunPanel提供执行与人工质检界面，/api/comfy/director提供只读预检和手动生成。

接续只将明确选择的段落编译成mode=auto，其余段落固定t2v/i2v/flf2v/r2v，防止全局continuity把独立文生段悄悄改为图生。分镜顺序不可跳过依赖前段的接续输入。

源图由源ComfyUI的/view读取，正式生成时转存到目标/upload/image的input目录。Director本地素材读取不支持源output注解，因此不直接传旧路径。预检只读取图片，不上传、不提交任务。

多图参考使用独立MiniMaxH3DirectorWeb节点，在上游Director展开图中将ref_images列表变成原生V3 Autogrow动态槽位；原节点及上游源码保持不变。桥接节点只负责当前本机已核对的图像参考，未加入视频/音频参考。

可复核命令：

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
node --experimental-strip-types scripts/director-fixtures.mjs fixtures.json
```

本机静态检查使用scripts/validate-director-native.py，参数依次为目标ComfyUI目录、fixtures.json与报告路径，需要使用该ComfyUI已有Python运行时。注册和展开节点但不执行模型或提交/prompt。

scripts/smoke-director.mjs以本地HTTP模拟服务验证网页接口，需要已启动网页开发服务，以及上述fixtures和静态生成的接口元数据；全部/prompt仅发送至临时模拟服务，真实ComfyUI提交为0。

本轮27项测试、类型、lint、构建、原图/展开图静态检查及模拟HTTP链路通过。真实云端分析、GPU运行、多模式混合显存与完整视频质量尚未验证。

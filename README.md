# MiniMax H3 Director Web

无需 Codex 客户端即可使用的 MiniMax H3 本地短剧导演台。本仓库与 `minimax-h3-director-suite` 完全独立，不会修改或覆盖现有 Skills。

## 当前版本

这是本地 MVP 的第一阶段，已经包含：

- 中文导演工作台与响应式三栏界面
- 剧本文本输入及 `.md`/`.txt` 文件导入
- 浏览器本地自动保存项目草稿
- 人物关系、空间和素材冲突概览
- 可选择的 Beat 时间线
- Ref2VA、FL2VA 和 T2V 模式展示
- 本地 ComfyUI `/system_stats` 连接检测
- OpenAI 结构化导演分析；未配置密钥时自动使用本地规则生成草稿
- Beat 时长、模式和 H3 提示词编辑
- ComfyUI API Format 工作流导入与浏览器本地保存
- 参考图上传及 `LoadImage` 顺序绑定
- 按节点类型注入提示词、时长、步数、种子和 0.4/0.7/1MP 参数
- 单 Beat 提交、任务轮询、视频播放与下载
- 浏览器内抽取首、中、尾三帧并记录质检结论

当前版本已经完成从剧本到单 Beat 视频质检的本地闭环。批量逐 Beat 调度、Python Director v2 编译器和剪辑工程导出留在后续版本；当前界面会明确标记本地规则草稿，避免把它误认为完整 AI 导演结果。

## 本地启动

需要 Node.js 22.13 或更高版本。

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。

Windows 也可以直接双击 `start-local.cmd`。第一次启动会自动从 `.env.example` 创建一个不会提交到 Git 的 `.env.local`。

如需 AI 导演分析，在 `.env.local` 中填入自己的 OpenAI API Key 后重启：

```text
OPENAI_API_KEY=你的密钥
OPENAI_MODEL=gpt-5.4-mini
```

密钥只由本机服务读取，不会写入浏览器存储或 Git 仓库。请求使用 Responses API 的结构化输出并设置 `store: false`。

页面右上角会显示当前分析引擎：

- `AI · 模型名`：服务已经读取密钥，点击分析会调用 OpenAI。
- `离线规则`：不调用外部 AI，仍可生成和编辑规则草稿、连接 ComfyUI、测试 Beat。

不要把 API Key 粘贴进网页、剧本、工作流 JSON 或聊天窗口，也不要提交 `.env.local`。修改配置后必须重新启动本地服务。

生产构建：

```powershell
npm run build
npm run start
```

## ComfyUI

默认检测 `http://127.0.0.1:8188`。服务端代理目前只允许 `localhost`、`127.0.0.1` 和 `::1`，避免用户输入任意地址造成服务端请求伪造。远程 ComfyUI、鉴权与隧道连接将在设置页中单独设计。

## 完整使用流程

1. 启动 ComfyUI，确认 `http://127.0.0.1:8188/system_stats` 可以访问。
2. 在 ComfyUI 中成功运行一次准备使用的 H3 工作流，并导出 `Save (API Format)` JSON。
3. 双击 `start-local.cmd`，打开 `http://localhost:3000`。
4. 粘贴剧本或导入 `.md`/`.txt`，点击“分析并生成导演数据”。
5. 在右侧检查和修改当前 Beat 的时长、Ref2VA/FL2VA/T2V 模式及提示词。
6. 点击“检测连接与节点”，确认 ComfyUI 在线。
7. 导入刚才跑通的 API 工作流 JSON。
8. Ref2VA/FL2VA 需要图片时，按工作流中 `LoadImage` 节点的顺序选择参考图。图片会上传到 ComfyUI 的 `input/h3-director-web/`。
9. 先选择 0.4MP，点击“测试这个 Beat”。任务运行期间按钮会锁定，避免重复提交。
10. 完成后播放或下载视频，点击“抽取首中尾帧”，检查人物、空间、道具、表演、台词和连续性。
11. 通过后再改为 0.7MP；失败时修改当前 Beat 的提示词、参考图或工作流模式后重做。

应用会按 `class_type` 修改工作流，不依赖固定节点 ID。目前识别：`PrimitiveStringMultiline`、H3 视频节点的直接 `prompt/length`、`PrimitiveFloat`、`BasicScheduler`、`RandomNoise`、`ResolutionSelector`、`LoadImage` 和 `SaveVideo`。

项目右上角可以导出不含图片二进制和 API Key 的 JSON 记录。剧本、导演数据、工作流 JSON、任务 ID 与质检状态默认保存在浏览器 `localStorage`。

## 计划中的本地闭环

1. 复用 `director_compiler.py`、`coverage_audit.py` 与 `asset_audit.py`，把浏览器草稿升级为 Director v2 严格数据。
2. 增加逐 Beat 队列、失败维度记录和选择性重试。
3. 增加字幕、配音及剪辑工程导出。
4. 可选的本地项目目录写入与完整素材打包。

## 仓库边界

本项目不内嵌模型权重，也不复制用户的私人工作流或视频素材。与导演 Skills 的集成将通过用户配置的本地路径完成。

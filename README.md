# MiniMax H3 Director Web

无需 Codex 客户端即可使用的 MiniMax H3 本地短剧导演台。本仓库与 `minimax-h3-director-suite` 完全独立，不会修改或覆盖现有 Skills。

## 当前版本

这是本地 MVP 的第一阶段，已经包含：

- 中文导演工作台与响应式三栏界面
- 剧本文本输入及 `.md`/`.txt` 文件导入
- 浏览器本地自动保存项目草稿
- 人物关系、空间和素材冲突概览
- 可选择的 Beat 时间线
- 根据 Beat 模式自动匹配内置 T2V、Ref2VA 和 FL2VA API 工作流
- 自动核对参考图数量，并支持导入 API Format JSON 手动覆盖
- 本地 ComfyUI `/system_stats` 连接检测及 `/object_info` 必需节点预检
- 界面化大模型设置，支持 OpenAI、阿里云百炼、豆包火山方舟、Kimi 与 DeepSeek
- API Key 会话级保存、官方域名白名单与一键连接测试
- 未配置模型时自动使用本地规则生成草稿
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

### 界面配置（推荐）

点击页面右上角“配置大模型”，选择供应商并填写 API Key、模型名称和兼容接口地址。点击“测试连接”会发送一条极短请求；成功后点击“保存并使用”。支持：

| 供应商 | 默认模型 | 默认接口 |
| --- | --- | --- |
| OpenAI | `gpt-5.4-mini` | `https://api.openai.com/v1` |
| 阿里云百炼 | `qwen3.8-max` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 豆包·火山方舟 | `doubao-seed-2-0-lite-260215` | `https://ark.cn-beijing.volces.com/api/v3` |
| Kimi | `kimi-k2.6` | `https://api.moonshot.cn/v1` |
| DeepSeek | `deepseek-v4-flash` | `https://api.deepseek.com` |

供应商可能更新模型名，界面允许直接修改。阿里云业务空间专属域名也受支持；其他供应商只允许各自官方 API 域名，避免把密钥误发到任意服务器。

界面输入的 API Key 只保存在当前标签页的 `sessionStorage`，关闭标签页后清除；模型名、供应商和接口地址会保存在本机，密钥不会进入项目草稿和导出文件。

### 服务端 OpenAI 配置（可选）

也可以在 `.env.local` 中填入 OpenAI API Key 后重启：

```text
OPENAI_API_KEY=你的密钥
OPENAI_MODEL=gpt-5.4-mini
```

密钥只由本机服务读取，不会写入浏览器存储或 Git 仓库。请求使用 Responses API 的结构化输出并设置 `store: false`。

页面右上角会显示当前分析引擎：

- `供应商 · 模型名`：界面会话或服务端已经配置模型。
- `离线规则`：不调用外部 AI，仍可生成和编辑规则草稿、连接 ComfyUI、测试 Beat。

不要把 API Key 粘贴进剧本、工作流 JSON 或聊天窗口，也不要提交 `.env.local`。只有修改 `.env.local` 时才需要重新启动；界面配置会立即生效。

生产构建：

```powershell
npm run build
npm run start
```

## ComfyUI

默认检测 `http://127.0.0.1:8188`。服务端代理目前只允许 `localhost`、`127.0.0.1` 和 `::1`，避免用户输入任意地址造成服务端请求伪造。远程 ComfyUI、鉴权与隧道连接将在设置页中单独设计。

## 完整使用流程

1. 启动 ComfyUI，确认 `http://127.0.0.1:8188/system_stats` 可以访问。
2. 双击 `start-local.cmd`，打开 `http://localhost:3000`。
3. 粘贴剧本或导入 `.md`/`.txt`，点击“分析并生成导演数据”。
4. 在右侧检查和修改当前 Beat 的时长、Ref2VA/FL2VA/T2V 模式及提示词。系统会立即匹配对应内置工作流。
5. 点击“检测连接与节点”。系统会同时确认 ComfyUI 在线，并核对当前内置模板所需节点；缺少节点时会列出类名。
6. T2V 不选择图片；Ref2VA 选择两张角色/场景参考图；FL2VA 严格按“首帧、尾帧”顺序选择两张图。图片会上传到 ComfyUI 的 `input/h3-director-web/`。
7. 先选择 0.4MP，点击“测试这个 Beat”。任务运行期间按钮会锁定，避免重复提交。
8. 完成后播放或下载视频，点击“抽取首中尾帧”，检查人物、空间、道具、表演、台词和连续性。
9. 通过后再改为 0.7MP；失败时修改当前 Beat 的提示词、参考图或工作流模式后重做。

### 内置工作流匹配规则

| Beat 模式 | 自动选择 | 图片要求 | 典型用途 |
| --- | --- | --- | --- |
| T2V | H3 文生视频 | 0 张 | 无固定人物或资产的纯文本镜头 |
| Ref2VA | H3 多参考图视频 | 2 张 | 人物、服装、空间或道具一致性 |
| FL2VA | H3 首尾帧视频 | 2 张，顺序为首帧、尾帧 | 门闩开合、伤势变化等相反状态 |

右侧“执行工作流”默认处于“自动匹配”。如果本机节点版本或自定义图不同，可以点击“导入其他 API 工作流”，系统会切换到“手动覆盖”；仍然按照节点 `class_type` 注入当前 Beat 参数，而不是依赖节点编号。切回“自动匹配”不会删除已经导入的手动工作流。

应用会按 `class_type` 修改工作流，不依赖固定节点 ID。目前识别：`PrimitiveStringMultiline`、H3 视频节点的直接 `prompt/length`、`PrimitiveFloat`、`BasicScheduler`、`RandomNoise`、`ResolutionSelector`、`LoadImage` 和 `SaveVideo`。

项目右上角可以导出不含图片二进制和 API Key 的 JSON 记录。剧本、导演数据、工作流 JSON、任务 ID 与质检状态默认保存在浏览器 `localStorage`。

## 计划中的本地闭环

1. 复用 `director_compiler.py`、`coverage_audit.py` 与 `asset_audit.py`，把浏览器草稿升级为 Director v2 严格数据。
2. 增加逐 Beat 队列、失败维度记录和选择性重试。
3. 增加字幕、配音及剪辑工程导出。
4. 可选的本地项目目录写入与完整素材打包。

## 仓库边界

本项目只内置三份已经清除私人路径和素材名的通用 API 工作流，不包含模型权重、参考图片或视频素材。内置模板位于 `public/workflows/`，提交前仍需根据 ComfyUI 节点与模型许可证自行准备运行环境。

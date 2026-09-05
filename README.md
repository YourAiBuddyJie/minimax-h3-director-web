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
- 单 Beat 0.4MP 测试入口及执行前状态约束

实际 Beat 视频提交将在下一阶段接入现有 Python 导演编译器和 Runner。当前界面会明确标记本地规则草稿，避免把它误认为完整 AI 导演结果。

## 本地启动

需要 Node.js 22.13 或更高版本。

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。

Windows 也可以直接双击 `start-local.cmd`。

如需 AI 导演分析，将 `.env.example` 复制为 `.env.local`，填入自己的 OpenAI API Key 后重启：

```text
OPENAI_API_KEY=你的密钥
OPENAI_MODEL=gpt-5.4-mini
```

密钥只由本机服务读取，不会写入浏览器存储或 Git 仓库。请求使用 Responses API 的结构化输出并设置 `store: false`。

生产构建：

```powershell
npm run build
npm run start
```

## ComfyUI

默认检测 `http://127.0.0.1:8188`。服务端代理目前只允许 `localhost`、`127.0.0.1` 和 `::1`，避免用户输入任意地址造成服务端请求伪造。远程 ComfyUI、鉴权与隧道连接将在设置页中单独设计。

## 计划中的本地闭环

1. 复用 `director_compiler.py`、`coverage_audit.py` 与 `asset_audit.py`。
2. 读取已跑通的 ComfyUI API 工作流并映射 Ref2VA/T2V/FL2VA。
3. 单 Beat 提交、状态轮询、下载和首中尾帧质检。
4. 可选的本地项目目录写入与打包导出。

## 仓库边界

本项目不内嵌模型权重，也不复制用户的私人工作流或视频素材。与导演 Skills 的集成将通过用户配置的本地路径完成。

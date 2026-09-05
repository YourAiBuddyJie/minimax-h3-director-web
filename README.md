# MiniMax H3 Director Web

无需 Codex 客户端即可使用的 MiniMax H3 本地短剧导演台。本仓库与 `minimax-h3-director-suite` 完全独立，不会修改或覆盖现有 Skills。

## 当前版本

这是本地 MVP 的第一阶段，已经包含：

- 中文导演工作台与响应式三栏界面
- 剧本文本输入
- 人物关系、空间和素材冲突概览
- 可选择的 Beat 时间线
- Ref2VA、FL2VA 和 T2V 模式展示
- 本地 ComfyUI `/system_stats` 连接检测
- 单 Beat 0.4MP 测试入口及执行前状态约束

“分析并生成导演数据”、文件导入及实际 Beat 提交将在下一阶段接入现有 Python 导演编译器和 Runner。目前界面明确标记了尚未接通的能力，避免把演示数据误认为真实生成结果。

## 本地启动

需要 Node.js 22.13 或更高版本。

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。

生产构建：

```powershell
npm run build
npm run start
```

## ComfyUI

默认检测 `http://127.0.0.1:8188`。服务端代理目前只允许 `localhost`、`127.0.0.1` 和 `::1`，避免用户输入任意地址造成服务端请求伪造。远程 ComfyUI、鉴权与隧道连接将在设置页中单独设计。

## 计划中的本地闭环

1. 本地项目目录和剧本文件导入。
2. 调用结构化模型生成剧情状态、人物关系、空间关系和 Beat。
3. 复用 `director_compiler.py`、`coverage_audit.py` 与 `asset_audit.py`。
4. 读取已跑通的 ComfyUI API 工作流并映射 Ref2VA/T2V/FL2VA。
5. 单 Beat 提交、状态轮询、下载和首中尾帧质检。
6. 项目状态保存到本地 `.data/`，不上传私人剧本或素材。

## 仓库边界

本项目不内嵌模型权重，也不复制用户的私人工作流或视频素材。与导演 Skills 的集成将通过用户配置的本地路径完成。

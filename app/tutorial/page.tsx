import type { Metadata } from 'next';
import Link from 'next/link';
import { builtInWorkflows } from '@/lib/workflow-library';
import { providerPresets } from '@/lib/providers';

export const metadata: Metadata = { title: '使用教程 · 智能搭子导演工作台', description: '本地系统条件、安装准备、模型与工作流清单、剧本到视频测试的完整操作指南' };
const chapters = [['requirements','本地系统条件'],['install','安装与启动'],['models','模型与工作流'],['api','配置大模型'],['script','第一步：剧本'],['storyboard','第二步：分镜确认'],['prompts','第三步：提示词'],['images','第四步：参考图'],['video','第五步：视频制作'],['logs','系统日志'],['backup','保存与安全'],['faq','常见问题']] as const;
const modelFolder = (type: string) => ['UNETLoader', 'UnetLoaderGGUF'].includes(type) ? 'diffusion_models' : type === 'CLIPLoader' ? 'text_encoders' : type === 'VAELoader' ? 'vae' : 'loras';

export default function Tutorial() {
  return <main className="tutorial-page">
    <aside className="tutorial-note mx-4">参考图支持本地与线上多种方式：进入“04 参考图”，在顶部选择项目默认方式；需要时可在单张素材右侧临时改为“仅本地”“仅阿里云”或“仅 Seedream”。切换不会删除已有图片。</aside>
    <header className="tutorial-header"><strong>智能搭子导演工作台 / 使用教程</strong><Link href="/">打开导演台 →</Link></header>
    <div className="tutorial-layout"><nav aria-label="教程目录"><p className="font-semibold">从安装到第一次出图</p>{chapters.map(([id,title],i) => <a key={id} href={`#${id}`}>{String(i+1).padStart(2,'0')} · {title}</a>)}<p className="mt-5 text-sm text-muted-foreground">教程独立打开。切回原来的导演台标签页，即可继续当前操作。</p></nav>
    <article className="tutorial-content"><h1>本地制作，一步一步来</h1><p>无需安装 Codex。你需要分别准备导演台、ComfyUI 和模型文件；导演台不会自动下载模型。先完成一个剧情段落的测试，再推进整部短剧。</p><aside className="tutorial-note">第一次使用顺序：检查电脑 → 启动两个服务 → 配置分析 API → 导入剧本 → 生成并采用参考图 → 测试视频。下面的文件名对应当前内置模板，不代表模型官方最低配置。</aside>
    <section id="requirements"><h2>01 / 本地需要满足哪些条件？</h2><div className="tutorial-table"><table><thead><tr><th>项目</th><th>条件与说明</th></tr></thead><tbody>
      <tr><td>操作系统</td><td>当前本地启动脚本面向 Windows。其他系统尚未完成本项目验证，不能直接使用 .cmd / .ps1 启动方式。</td></tr>
      <tr><td>导演台运行环境</td><td>Node.js 22.13 或更高版本，附带 npm；以 package.json 的 engines 要求为准。仅编辑剧本、配置 API 不需要本地 GPU。</td></tr>
      <tr><td>浏览器</td><td>需支持 JavaScript、本地存储、文件上传与视频播放。请固定使用同一个浏览器和地址；小窗口内部分内容会在面板中滚动。</td></tr>
      <tr><td>本地生图与视频</td><td>ComfyUI 必须独立安装并能运行选定模型。显卡、驱动、PyTorch 与量化格式必须相互兼容；NVFP4 不能仅凭显存容量判断可用。</td></tr>
      <tr><td>本地生图配置</td><td>统一使用 Qwen Image 2.1 INT8 主模型与编码器。RTX 5070 12GB 的速度与显存峰值需实机验收；建议从单张母版开始，再增加参考图数量。</td></tr>
      <tr><td>H3 视频资源</td><td>不同模型、时长、分辨率和卸载策略的资源需求不同。本教程不承诺统一最低显存；请先在 ComfyUI 中单独跑通对应视频工作流。</td></tr>
      <tr><td>磁盘空间</td><td>需准备 Qwen Image 2.1 主模型、文本编码器与专用 VAE；H3 视频模型、缓存与输出另计。</td></tr>
      <tr><td>网络与端口</td><td>安装依赖、下载模型和调用云端分析 API 需要联网。默认导演台 3000、生图 ComfyUI 8188、新 Director 8189，分别启动，端口不能被其他程序占用。本地代理只接受本机地址，不支持任意远程服务器。</td></tr>
    </tbody></table></div><p>已下载的模型由本机 ComfyUI 执行；大模型 API 是另一项服务，分析剧本会产生供应商用量。不要将“本地导演台”理解为“全部流程无需联网或 API”。</p></section>
    <section id="install"><h2>02 / 安装与启动</h2><h3>A. 先启动 ComfyUI</h3><ol><li>将 ComfyUI 安装到独立目录，不要把模型放进导演台的 public 或 node_modules。</li><li>按下一章准备模型和自定义节点，然后使用 ComfyUI 自身的启动方式启动。</li><li>打开 <a href="http://127.0.0.1:8188/" target="_blank" rel="noreferrer">本机 ComfyUI</a>。页面能打开仅表示服务在线，还需要跑通工作流。</li></ol><h3>B. 再启动导演台</h3><p>在本项目目录打开 PowerShell。先运行下面两条命令检查版本：</p><pre>node --version{'\n'}npm --version</pre><p>首次安装与启动：</p><pre>npm install{'\n'}npm run build{'\n'}npm run start</pre><p>保持启动终端运行，打开 <a href="http://127.0.0.1:3000/">http://127.0.0.1:3000/</a>。Windows 也可双击项目中的 start-local.cmd；首次构建可能需要等待。修改源码后重新构建并重启，刷新页面才能看到新版本。</p><p>开发时可用 npm run dev，并以终端实际显示的地址为准。同一端口不要同时启动开发版和本地构建版。</p><h3>C. 检查连接</h3><p>首页右上角 → 连接与设置 → 填写 http://127.0.0.1:8188 → 检测连接、节点与模型。生图环境和当前视频模板是分别检查的；换视频模式后请重新检测。</p></section>
    <section id="models"><h2>03 / 准备哪些模型和工作流？</h2><p>系统内置视频、基础生图、动作构图和一致性精修 API 模板，通常不需要手动导入。以下清单直接读取应用配置；文件名必须与加载节点中的选择一致。请从模型作者或节点维护者提供的来源获取，核对说明与校验值，不要只重命名其他权重来消除“缺失”提示。</p>
      {builtInWorkflows.map(w => <details key={w.id} open><summary>{w.name} · {w.requiredImages ? `${w.requiredImages} 张输入图片` : '无需输入图片'}</summary><p>{w.description}</p><p><a href={w.file} download>下载当前 API 工作流 JSON</a>（{w.mode}）</p><ul>{w.requiredModels.map((m,i) => <li key={i}><code>ComfyUI/models/{modelFolder(m.classType)}/{m.filename}</code></li>)}</ul><p>环境预检关注的节点：{w.requiredNodes.join('、')}。这不是完整依赖列表；实际模板中的其他节点也必须存在，最终以 ComfyUI 提交校验为准。</p></details>)}
      <h3>模型准备后的验收</h3><ol><li>把文件放到上述类别目录；重启或刷新 ComfyUI 的模型列表。</li><li>若节点缺失，根据节点类名找到对应维护者的扩展及安装说明。不要随意安装同名陌生扩展。</li><li>先单独运行 Qwen Image 2.1 文生图和参考图编辑，再测试所需 H3 视频模式；模型可选中不等于能成功推理。</li><li>回到导演台重新检测，确认所选模式环境正常。</li></ol><p>手动覆盖入口在“05 视频制作 → 高级”。需要 API Format JSON（节点具有 class_type），不是仅包含 nodes/links 的画布布局 JSON。当前参数注入只适配应用识别的节点类型，并非任意 ComfyUI 图都可直接运行。</p></section>
    <section id="api"><h2>04 / 配置国内大模型 API</h2><h3>剧本分析 API</h3><ol><li>点击“连接与设置 → 剧本分析 API”。</li><li>选择供应商，填写你自己账户的 API Key、已开通的模型名称与兼容接口地址。</li><li>点击“测试连接”；会发送一条短请求，可能产生少量用量。</li><li>成功后“保存并使用”，回到剧本步骤。</li></ol><div className="tutorial-table"><table><thead><tr><th>供应商</th><th>本版本接口预设</th><th>账户入口</th></tr></thead><tbody>{Object.values(providerPresets).map(p => <tr key={p.provider}><td>{p.name}</td><td><code>{p.baseUrl}</code></td><td><a href={p.helpUrl} target="_blank" rel="noreferrer">供应商控制台</a></td></tr>)}</tbody></table></div><h3>线上参考图 API</h3><p>这是独立设置，不会跟随剧本分析供应商自动切换。打开“连接与设置 → 参考图生成方式”，可选择阿里云百炼或火山方舟 Seedream。</p><ul><li>百炼默认 <code>qwen-image-3.0-pro</code>，支持文生图及 1–3 张参考图图生图；工作空间域名和 Key 必须同一区域。</li><li>方舟默认 <code>doubao-seedream-5-0-260128</code>，也可改为 5.0 Lite、4.5 或 4.0 的官方模型 ID；接口为 <code>https://ark.cn-beijing.volces.com/api/v3/images/generations</code>。</li></ul><p>这些服务需要各自独立的 API Key，系统会分别保存在当前标签页。普通聊天产品会员不等于 API 额度；接口域名受白名单限制，不支持第三方中转地址。出现“未配置 API Key，已生成本地规则草稿”只表示没有调用剧本分析模型，与参考图模型无关。</p></section>
    <section id="script"><h2>第一步 / 剧本分镜分析</h2><p>导入剧本后点击分析，只拆分3–12秒的镜头内容，包括原文、场景、动作、对白、起止状态；此阶段不写生成提示词、不规划图片。模型请求最多等待5分钟，可取消；失败保留原结果。</p></section>
    <section id="storyboard"><h2>第二步 / 分镜确认</h2><p>检查每个分镜内容、原对白、时长与衔接，编辑后采纳全部分镜。规划可为3秒，但H3当前帧网格最短实际输出约4.46秒；实际时长在视频参数中显示。</p></section><section id="prompts"><h2>第三步 / 提示词分析</h2><p>全部分镜确认后自动生成提示词与参考图描述。系统按已采纳的分镜编写统一Ref2VA视频提示词和所需参考图描述，不改变分段或时长。提示词生成完成后直接进入参考图，无需再次采纳；修改分镜后，重新确认分镜后会自动更新提示词。视频生成仅选择标准20步或多参考专用加速8步。</p><p>新流程用于重新分析后的项目。旧项目保留原分镜、素材与制作流程；重新分析会保存上一版项目与执行记录的浏览器备份。</p></section>
    <section id="images"><h2>第四步 / 参考图</h2><p>人物、场景、道具基础母版各自独立生成，不强制让道具等待场景。服装或身体状态变体只依赖明确指定的母版，不自动规划首尾帧链。可上传本地图片，或使用已配置的生图服务；生成后打开原图检查并采用。</p><p>每段多参考绑定1–9张图片，顺序对应视频提示词中的图号，人物、场景、道具各有职责。修改参考图描述后请重新生成并采用。</p></section>
    <section id="video"><h2>第五步 / 视频制作</h2><p>新项目固定使用多参考Ref2VA，在参数页选择标准20步或加速8步。8步使用Ref2VA专用Acc权重与Euler/simple采样；20步不加载加速权重。设置Director服务地址、分辨率、画幅和种子，检查已采用参考图及最终提示词，再生成单段或整片。</p><p>逐段生成、预览、人工验收、重做与合片沿用原流程。完整观看画面与声音后验收；MP表示像素量，实际帧数和时长以预览参数为准。旧项目仍显示原工作流选项。</p></section>
    <section id="logs"><h2>08 / 查看系统日志</h2><p>顶部“06 系统日志”会实时记录剧本分析、ComfyUI 连接、参考图状态、视频任务及质检结果。可以按级别和分类筛选、搜索错误摘要、关闭自动滚动，或导出当前筛选结果。</p><ul><li>日志只记录任务名称、状态、模型方式和错误摘要，不记录 API Key、完整剧本或完整提示词。</li><li>最近 500 条保存在当前浏览器；点击“清空”只删除日志，不会删除图片、视频或项目。</li><li>排查失败时先筛选“错误”，再按时间找到相邻的提交与连接记录；需要更底层的信息时仍应查看 ComfyUI 终端。</li></ul></section>
    <section id="backup"><h2>09 / 保存、迁移与隐私</h2><ul><li>项目草稿在当前浏览器 localStorage 中。localhost 与 127.0.0.1 属于不同站点存储，换地址可能看不到原项目。</li><li>逐段验收会在当前浏览器保存进度与任务 ID，刷新后可继续查询。用“导出逐段记录（素材另行备份）”保存验收与配置 JSON；它不包含视频和末帧，也没有导入恢复入口。迁移或开启新一轮前，请另外备份 Director 输出目录中的素材。</li><li>右上角“导出项目”下载 JSON，不包含图片、视频和 API Key。当前没有完整项目包导入恢复入口，不要把导出 JSON 当作一键还原包。</li><li>本地参考图一般在 ComfyUI/output/h3-director-web/assets；线上结果会立即保存到 ComfyUI/input/h3-director-web/cloud，避免供应商临时链接过期。视频在 output/h3-director-web 下。</li><li>剧本分析与线上生图 API Key 都使用会话存储，不写入项目导出。共享电脑请清除密钥；浏览器会话恢复机制可能影响关闭标签页后的保留行为。</li><li>使用云端分析时剧本会发送给分析供应商；使用线上生图时提示词与最多 3 张参考图会发送给生图供应商。不要公开 .env.local、API Key、私人剧本和 ComfyUI 服务端口。</li></ul></section>
    <section id="faq"><h2>10 / 常见问题与排查顺序</h2>{[
      ['网页打不开','先看导演台启动终端是否退出或报错，再确认 3000 端口。ComfyUI 的 8188 是另一个服务，启动其中一个不会自动启动另一个。'],
      ['还是旧版，按钮没反应','确认终端正在运行新构建，按 Ctrl+F5 刷新。不要首先清空浏览器数据，否则可能丢失草稿。'],
      ['无法连接 ComfyUI','先直接打开 127.0.0.1:8188；打不开则检查 ComfyUI 日志与启动状态。能打开再检查导演台填写的地址。远程 IP 暂不支持。'],
      ['缺少节点或模型','按检测结果定位对应模板，核对文件目录、完整文件名与自定义节点依赖，重启后重新检测。仅把其他模型重命名为预期文件名不能解决兼容问题。'],
      ['显存不足或量化加载报错','查看 ComfyUI 原始报错，先停止无关 GPU 任务，再缩小画面或缩短视频。NVFP4/FP4 兼容问题与单纯显存不足不同，需要核对硬件和运行环境。'],
      ['API 测试返回 401 / 403 / 429','依次检查密钥、账户权限和模型是否已开通，以及余额或限流。不要连续重复提交；查看供应商返回的说明。'],
      ['有图片但视频按钮仍不可用','先在“02 分镜”采纳当前分镜；整片需采纳全部分镜。图片必须先采用，再绑定到当前段落。新版等待03提示词生成完成，每段多参考绑定1–9张；检查是否已在“04 参考图”上传并采用。'],
      ['任务长时间排队或提示丢失','去 ComfyUI 查看真实队列与历史。重启或清空历史会导致任务找不到；确认没有同一任务仍在运行后再重试。'],
      ['逐段生成完为什么不自动继续','这是人工验收暂停点。完整观看画面与声音，确认本段和末帧合格后点击“完整观看后通过，允许下一段”，再提交下一段。'],
      ['合片提示缺少 MiniMaxH3ReviewedJoin','安装项目附带的新版桥接节点，手动重启 Director 8189，再检查节点。合片还需 ffmpeg；它拼接已有片段，不重新运行 GPU 采样。'],
      ['提交结果未知或连接中断','先查看 Director 的队列和历史。已提交时，在“恢复任务ID”填写对应 ID 并按 Enter 继续查询；仅在确认没有提交后才点“我已查队列，确认未提交”。不要直接重复生成。'],
      ['修改参数后不能沿用旧验收','剧本、原绑定素材、服务地址或全局参数变化会阻止混合旧结果。先导出记录，再开启新一轮。对当前未通过段增加已采用的首帧纠偏素材，可在该段选择关键帧。'],
      ['图片生成成功但人物对不上','确认人物与场景母版已采用，并确认参考图职责与顺序正确。旧版单阶段图片会被标记要求重做；最终仍需打开原图人工验收。'],
    ].map(([q,a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}<p className="mt-6"><a href="#requirements">返回教程顶部 ↑</a></p></section>
    </article></div>
  </main>;
}

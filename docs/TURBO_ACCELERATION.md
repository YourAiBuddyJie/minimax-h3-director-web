# Director Turbo 8步

标准模式保留原参数。Turbo模式在FL2VA主模型与Director之间接入LoraLoaderModelOnly，强度1，使用Comfy-Org的minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors；各段res_multistep/simple/8步。沿用现有INT8主模型、NVFP4文本编码器与显存卸载策略。不修改上游Director。

支持T2V、I2V、FL2VA及I2V接续；Ref2VA需要对应独立LoRA，本版明确阻止不匹配模式。选择Turbo后预检模型文件和节点，缺失不会退化成普通模型8步。

来源：https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_minimax_h3_i2v.json
模型：https://huggingface.co/Comfy-Org/MiniMax-H3/tree/main/loras

前端模式保存在本机。请先用当前分镜范围、相同素材/种子/0.4MP生成5秒对照，再比较耗时、对白、动作与身份。没有实测前不承诺2.5倍整片加速；模型加载、文本编码和解码不会随20到8步等比例缩短。

静态检查与真实GPU验收分开记录。模型文件下载与校验结果见本次素材记录。

## 本机实测

2026-10-06，RTX 5070 12GB：同一四段I2V接续项目，513帧、24fps、21.375秒、480×864，保持剧情、素材、种子与画幅相同。标准20步1028.522秒，Turbo 8步516.316秒，耗时减少49.8%，约1.99倍速度。该数据为一次顺序对照，缓存因素未隔离；Turbo完整主观质量尚待作者复核，不能据此宣称无损加速。

import { NextResponse } from 'next/server';
import { analyzePromptPlan } from '@/lib/provider-server';
import { providerPresets } from '@/lib/providers';
import { isStoryboardApproved } from '@/lib/storyboard-approval';
import type { DirectorAnalysis } from '@/lib/director';
export async function POST(request: Request) {
 try {
  const body=await request.json() as {script:string;analysis:DirectorAnalysis;providerConfig?:unknown};
  if(!body.script?.trim()||body.script.length>120000||body.analysis?.pipelineVersion!==2||!body.analysis.beats?.length||!body.analysis.beats.every(isStoryboardApproved)) return NextResponse.json({error:'请先完成并采纳全部分镜，再分析提示词'},{status:400});
  const key=process.env.OPENAI_API_KEY?.trim();
  const config=body.providerConfig||(key?{...providerPresets.openai,apiKey:key,model:process.env.OPENAI_MODEL||providerPresets.openai.model}:null);
  if(!config) return NextResponse.json({error:'提示词分析需要配置大模型API；不会用规则草稿冒充AI提示词'},{status:400});
  return NextResponse.json(await analyzePromptPlan(body.script,body.analysis,config,request.signal));
 } catch(error) {
  const detail=error instanceof Error?error.message:'提示词分析失败';
  // Log the failure category, never the script, authored prompt or credentials.
  const category=['遗漏','覆盖','参考图类型','独立生成','循环','不存在','原文','素材 ID','取消','超过','上游返回','JSON'].find(label=>detail.includes(label))||'other';
  console.info('[prompt plan failure]',JSON.stringify({category}));
  return NextResponse.json({error:detail},{status:502});
 }
}

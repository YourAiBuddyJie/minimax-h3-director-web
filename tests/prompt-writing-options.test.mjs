import test from 'node:test';
import assert from 'node:assert/strict';
import { promptWritingOptions } from '../lib/providers.ts';
import { analysisRequest } from '../lib/analysis-request.ts';
import { dialogueLines } from '../lib/director-review.ts';
test('quoted lyrics ignore incidental spaces inside closing quotation marks',()=>{
 assert.deepEqual(dialogueLines('小侠客唱：“我来人间一回，只求个肆意。 ”'),['我来人间一回，只求个肆意。']);
});
test('Qwen 3.8 Max prompt writing disables default thinking only for supported models',()=>{
 for(const model of ['qwen3.8-max','qwen3.8-max-0902','deepseek-v4.1-flash','deepseek-v4-flash','deepseek-v4-flash-0731','deepseek-v4-pro-0813','deepseek-v3.2','deepseek-v3.1']) assert.deepEqual(promptWritingOptions({provider:'aliyun',model}),{enable_thinking:false});
 for(const config of [{provider:'aliyun',model:'qwen3-235b-a22b-thinking-2507'},{provider:'openai',model:'gpt-5.4-mini'},{provider:'aliyun',model:'qwen-max'}]) assert.deepEqual(promptWritingOptions(config),{});
});
test('prompt timeout and cancellation report the correct stage and abort the network request',async()=>{
 const original=globalThis.fetch;let signal;
 try {
  globalThis.fetch=async(_url,init)=>{signal=init.signal;return new Promise(()=>{});};
  await assert.rejects(analysisRequest('http://test',{},20,'提示词分析'),/提示词分析超过1秒/);assert.equal(signal.aborted,true);
  const controller=new AbortController();const request=analysisRequest('http://test',{signal:controller.signal},1000,'提示词分析');controller.abort();
  await assert.rejects(request,/已取消提示词分析/);assert.equal(signal.aborted,true);
 } finally {globalThis.fetch=original;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStoryboard,normalizePromptPlan,storyboardSchema,storyboardIssues } from '../lib/two-stage-analysis.ts';
import { storyboardSignature,promptSignature,isStoryboardApproved,isPromptApproved,storyboardBlockReason } from '../lib/storyboard-approval.ts';
import { checkpointBeat } from '../lib/director-checkpoints.ts';
import { compileDirectorTimeline } from '../lib/director-timeline.ts';
import { resolveAssetSources,assetSourceIssue } from '../lib/asset-binding.ts';
import { dialogueLines } from '../lib/director-review.ts';
const script='沈逍：“走吧。”\n沈逍走出山亭。';
const raw={projectTitle:'出发',characters:['沈逍'],spaces:['山亭'],conflicts:[],beats:[{id:'b1',title:'决定',duration:'3s',sourceText:'沈逍：“走吧。”',scene:'山亭',summary:'沈逍说：“走吧。”',startState:'亭内站立',endState:'转向亭口',reviewNotes:[]},{id:'b2',title:'出发',duration:'12s',sourceText:'沈逍走出山亭。',scene:'山亭',summary:'沈逍走出山亭',startState:'转向亭口',endState:'亭外站立',reviewNotes:[]}]};
const image={id:'person',kind:'identity',beatId:'',title:'沈逍身份母版',prompt:'国风人物，黑发青衣',negativePrompt:'拼图',width:768,height:1024,sourceAssetIds:[]};
function story(){const s=normalizeStoryboard(raw,script);return {...s,beats:s.beats.map(b=>({...b,storyboardApproval:storyboardSignature(b)}))};}
function plan(){return {beats:[{id:'b1',prompt:'沈逍说<d>[Chinese] 走吧。</d>后转向亭口',referenceAssetIds:['person']},{id:'b2',prompt:'沈逍从亭内走出亭外，稳定身份',referenceAssetIds:['person']}],referenceAssets:[image]};}
const opts={steps:20,seed:42,megapixels:0.4,aspect:'16:9',label:'test'};
test('MV production headers are not lyrics; all five sung lines still require coverage',()=>{
 const lyrics=['我本是逍遥仙，在这天，在这地。','奈何天地之间，有狂风急雨。','我偏做逍遥仙，不问天，不问地。','任天地多恩怨，我乘风来去。','我来人间一回，只求个肆意。'];
 const sections=lyrics.map((line,i)=>`【第${i+1}段】\n小侠客唱：“${line}”`);
 const mv='《我本是逍遥仙》\n类型：国风奇幻演唱短片，16:9横屏，Q版3D卡通风格。\n主角：同一个小侠客男童，黑色发髻。\n场景：云海仙山上的石台。\n演唱要求：每段只做“一个主要动作”，歌词唱出来。\n'+sections.join('\n');
 assert.deepEqual(dialogueLines(mv),lyrics);
 const result={projectTitle:'逍遥仙',characters:['小侠客'],spaces:['石台'],conflicts:[],beats:sections.map((sourceText,i)=>({id:`b${i+1}`,title:'演唱',duration:'8s',sourceText,scene:'石台',summary:sourceText,startState:'站立',endState:'站立',reviewNotes:[]}))};
 assert.equal(normalizeStoryboard(result,mv).beats.length,5);
 assert.throws(()=>normalizeStoryboard({...result,beats:result.beats.slice(0,4)},mv),/遗漏.*我来人间一回/);
 assert.deepEqual(dialogueLines('**类型**：音乐短片\n沈逍：走吧。\n小侠客唱：“我偏做逍遥仙。”'),['我偏做逍遥仙。','走吧。']);
});
test('storyboard-only analysis accepts 3–12 seconds and strips all generated prompts and images',()=>{
 const s=normalizeStoryboard({...raw,referenceAssets:[image]},script);
 assert.equal(s.beats[0].duration,'3.0s');assert.equal(s.beats[1].duration,'12.0s');
 assert.deepEqual(s.referenceAssets,[]);assert.ok(s.beats.every(b=>!b.prompt&&b.referenceAssetIds.length===0));
 assert.equal(storyboardSchema.properties.beats.items.properties.mode,undefined);
 assert.equal(storyboardSchema.properties.beats.items.properties.prompt,undefined);
 assert.deepEqual(storyboardIssues(s.beats[0]),[]);
 assert.throws(()=>normalizeStoryboard({...raw,beats:[{...raw.beats[0],duration:'13s'}]},script),/3–12/);
 assert.throws(()=>normalizeStoryboard({...raw,beats:[raw.beats[1]]},script),/遗漏/);
});
test('prompt stage requires adopted shots, preserves them, plans only Ref2VA and rejects missing dependencies',()=>{
 assert.throws(()=>normalizePromptPlan(plan(),normalizeStoryboard(raw,script),script),/采纳/);
 const s=story(),out=normalizePromptPlan(plan(),s,script);
 assert.ok(out.beats.every(b=>b.mode==='Ref2VA'&&!b.continuityFromPrevious));
 assert.deepEqual(out.beats.map(b=>[b.id,b.duration,b.sourceText,b.startState,b.endState]),s.beats.map(b=>[b.id,b.duration,b.sourceText,b.startState,b.endState]));
 assert.ok(out.beats.every(isStoryboardApproved));assert.ok(out.beats.every(isPromptApproved));
 const missing=plan();missing.beats[0].referenceAssetIds=['missing'];assert.throws(()=>normalizePromptPlan(missing,s,script),/不存在/);
 const bad=plan();bad.beats[0].prompt='省略对白';assert.throws(()=>normalizePromptPlan(bad,s,script),/遗漏/);
 const boundProp=plan();boundProp.referenceAssets.push({...image,id:'prop',kind:'prop',sourceAssetIds:['person']});assert.throws(()=>normalizePromptPlan(boundProp,s,script),/独立生成/);
});
test('independent prop does not inherit unrelated scene and can generate before a scene is adopted',()=>{
 const target={...image,id:'sword',title:'剑',kind:'prop',status:'draft'};
 const location={...image,id:'place',kind:'location',status:'approved',files:[{filename:'place.png'}]};
 assert.deepEqual(resolveAssetSources(target,[target,location]),[]);assert.equal(assetSourceIssue(target,[],[target,location]),'');
});
test('prompt adoption guards video execution; changing story or prompt invalidates it',()=>{
 const out=normalizePromptPlan(plan(),story(),script),b=out.beats[0];
 const images={person:{id:'person',kind:'identity',title:'沈逍',file:'person.png'}};
 assert.doesNotThrow(()=>compileDirectorTimeline([b],images,opts));
 const approved={...b,promptApproval:promptSignature(b)};assert.equal(isPromptApproved(approved),true);
 assert.equal(isPromptApproved({...approved,prompt:'新提示词'}),false);
 assert.equal(isPromptApproved({...approved,summary:'修改剧情'}),false);
 assert.equal(storyboardBlockReason([b]),'');
 assert.equal(isPromptApproved({...b,prompt:b.prompt+'，衣袖轻动'}),true);
 assert.throws(()=>compileDirectorTimeline([{...b,summary:'修改剧情'}],images,opts),/采纳/);
 const resolved=checkpointBeat(approved,undefined,{referenceAssetIds:['person']},'','');
 const standard=compileDirectorTimeline([resolved],images,{...opts,steps:9});assert.equal(standard.timeline.clips[0].settings.steps,20);
 assert.equal(standard.timeline.clips[0].media.first_frame,null);assert.equal(standard.workflow['5'].inputs.continuity,false);
 assert.equal(standard.timeline.clips[0].length,107);
 const fast=compileDirectorTimeline([resolved],images,{...opts,acceleration:'turbo8'});
 assert.equal(fast.timeline.clips[0].settings.steps,8);assert.equal(fast.timeline.clips[0].settings.sampler,'euler');assert.equal(fast.timeline.clips[0].settings.scheduler,'simple');
 assert.equal(fast.workflow['12'].inputs.shift_video,12);assert.deepEqual(fast.workflow['5'].inputs.ref_model,['12',0]);
 assert.throws(()=>checkpointBeat(approved,undefined,{},'旧剧本持续约束',''),/叠加旧约束/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { planBeatFrames } from '../lib/beat-frame-plan.ts';
import { assetSourceIssue, resolveAssetSources } from '../lib/asset-binding.ts';
test('unapproved opening blocks ending even when identity and location are approved', () => {
  const assets = [{id:'opening',title:'双人首帧',kind:'first_frame',status:'draft'}, ...['identity','location'].map(kind=>({id:kind,title:kind,kind,status:'approved',files:[{filename:'ok.png'}]}))];
  const end={id:'ending',kind:'last_frame',sourceAssetIds:['opening','identity','location'],prompt:'两人微笑'};
  assert.match(assetSourceIssue(end,resolveAssetSources(end,assets),assets),/双人首帧/);
});
test('model ending uses shared opening without altering model prompt or input assets', () => {
  const input=[{id:'opening',beatId:'b1',kind:'first_frame',prompt:'起点'},{id:'end1',beatId:'b1',kind:'last_frame',prompt:'顾川微笑',sourceAssetIds:['opening']},{id:'end2',beatId:'b2',kind:'last_frame',prompt:'林晚低头',sourceAssetIds:[]}];
  const plan=planBeatFrames([{id:'b1',mode:'I2V'},{id:'b2',mode:'I2V',continuityFromPrevious:true}],input,'');
  assert.equal(plan.assets[2].sourceAssetIds[0],'end1');
  assert.equal(plan.assets[2].prompt,'林晚低头');
  assert.deepEqual(input[2].sourceAssetIds,[]);
});
const beats=[{id:'b1',summary:'两人对视',mode:'I2V',visualStyle:'二维动画'},{id:'b2',summary:'微笑',mode:'I2V',continuityFromPrevious:true}];
test('continuous boundary is one shared image with acyclic dependencies',()=>{const p=planBeatFrames(beats,[],'酒红礼服');assert.equal(p.added.length,3);assert.equal(p.bindings.b1.endKeyframeId,p.bindings.b2.keyframeId);const seen=new Set();for(const a of p.added){for(const id of a.sourceAssetIds)assert.ok(seen.has(id));seen.add(a.id);}assert.ok(p.added[0].prompt.includes('二维动画'));});
test('planning preserves existing images and is idempotent',()=>{const p=planBeatFrames(beats,[],'');const again=planBeatFrames(beats,p.added,'');assert.equal(again.added.length,0);assert.deepEqual(again.bindings,p.bindings);});
test('independent shot receives its own opening',()=>{const p=planBeatFrames([beats[0],{...beats[1],continuityFromPrevious:false}],[],'');assert.equal(p.added.length,4);assert.notEqual(p.bindings.b1.endKeyframeId,p.bindings.b2.keyframeId);});

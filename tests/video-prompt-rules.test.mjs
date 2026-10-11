import test from 'node:test';
import assert from 'node:assert/strict';
import { buildH3VideoPrompt } from '../lib/h3-video-prompt.ts';

test('handover preserves design while ownership and state can change in every input mode', () => {
 const line='<d>[Chinese] 这把伞借你。</d>';
 for(const mode of ['I2V','FL2VA','Ref2VA','T2V']) {
  const refs=mode==='T2V'?[]:mode==='I2V'?[{id:'a',title:'参考图',kind:'first_frame'}]:[{id:'a',title:'参考图1',kind:'first_frame'},{id:'b',title:'参考图2',kind:'last_frame'}];
  const prompt=buildH3VideoPrompt({id:'B1',title:'交接',duration:'8.0s',mode,status:'ready',summary:'交接',prompt:`The receiver grips the handle before the giver releases it. (S1) ${line}`,startState:'The giver owns the umbrella',endState:'The receiver owns the umbrella'},refs);
  assert.equal(prompt.split(line).length-1,1);
  assert.ok(prompt.includes('object ownership'));
  assert.ok(prompt.indexOf('Opening state contract:')<prompt.indexOf('Authored action and performance:'));
  assert.ok(prompt.indexOf('Ending state contract:')>prompt.indexOf(line));
  assert.ok(!prompt.includes('Keep every referenced identity, costume, body state, prop state'));
  assert.ok(prompt.includes('non_diegetic_music:'));
 }
});

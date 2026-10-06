import { writeFileSync } from 'node:fs';
import { compileDirectorTimeline } from '../lib/director-timeline.ts';
const beat = { id: 'qa', title: '静态节点验证', duration: '5s', mode: 'I2V', status: 'review', summary: '角色微笑', prompt: '2D anime character smiles.', visualStyle: '2D cel animation', referenceAssetIds: ['frame'] };
const compiled = compileDirectorTimeline([beat], { frame: { id: 'frame', title: '首帧', file: 'h3-director-web/qa.png', kind: 'first_frame' } }, { seed: 42, steps: 20, megapixels: 0.4, aspect: '9:16', label: 'static-checkpoint', checkpoint: true });
writeFileSync(process.argv[2], JSON.stringify({ checkpoint: compiled }, null, 2));

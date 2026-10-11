import { writeFileSync } from 'node:fs';
import { compileDirectorTimeline } from '../lib/director-timeline.ts';
const base = { id: '1', title: '静态校验', duration: '5s', mode: 'T2V', status: 'review', summary: 'A woman enters a room.', prompt: 'An adult woman enters a room.', referenceAssetIds: [], scene: 'room' };
const images = Object.fromEntries(['first', 'last', 'identity', 'scene'].map((id) => [id, { id, title: id, kind: id === 'scene' ? 'location' : 'identity', file: 'h3-director-web/qa.png' }]));
const options = { steps: 20, seed: 42, megapixels: 0.4, aspect: '16:9', label: 'STATIC_VALIDATION_ONLY' };
const fixtures = {
  turbo: compileDirectorTimeline([base, { ...base, id: '2', mode: 'I2V', continuityFromPrevious: true }], {}, { ...options, acceleration: 'turbo8' }),
  continuous: compileDirectorTimeline([base, { ...base, id: '2', mode: 'I2V', continuityFromPrevious: true }, { ...base, id: '3', mode: 'T2V' }], {}, options),
  mixed: compileDirectorTimeline([base, { ...base, id: '2', mode: 'I2V', referenceAssetIds: ['first'] }, { ...base, id: '3', mode: 'Ref2VA', referenceAssetIds: ['identity', 'scene'] }, { ...base, id: '4', mode: 'FL2VA', referenceAssetIds: ['first', 'last'] }], images, options),
};
writeFileSync(process.argv[2], JSON.stringify(fixtures, null, 2));

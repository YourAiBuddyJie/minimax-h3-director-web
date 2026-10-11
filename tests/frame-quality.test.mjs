import test from 'node:test';
import assert from 'node:assert/strict';
import { measureFrameBars } from '../lib/frame-quality.ts';

function frame(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4; data.fill(paint(x, y), i, i + 3); data[i + 3] = 255;
  }
  return measureFrameBars(data, width, height);
}
test('embedded horizontal footage in portrait canvas is flagged', () => {
  const result = frame(90, 160, (_, y) => y < 50 || y >= 110 ? 3 : 130);
  assert.equal(result.suspectedBars, true); assert.equal(result.top, 50); assert.equal(result.bottom, 50);
});
test('full scene and a fade to black do not become letterbox findings', () => {
  assert.equal(frame(90, 160, () => 130).suspectedBars, false);
  const dark = frame(90, 160, () => 0); assert.equal(dark.darkFrame, true); assert.equal(dark.suspectedBars, false);
});

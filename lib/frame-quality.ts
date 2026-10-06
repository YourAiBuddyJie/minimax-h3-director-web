export function measureFrameBars(data: Uint8ClampedArray, width: number, height: number) {
  // Near-black complete rows/columns, tolerant of compression noise. A heuristic, not semantic QC.
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return Math.max(data[i], data[i + 1], data[i + 2]) < 18;
  };
  const row = (y: number) => { let n = 0; for (let x = 0; x < width; x++) if (dark(x, y)) n++; return n / width > 0.98; };
  const col = (x: number) => { let n = 0; for (let y = 0; y < height; y++) if (dark(x, y)) n++; return n / height > 0.98; };
  let top = 0, bottom = 0, left = 0, right = 0;
  while (top < height && row(top)) top++;
  while (bottom < height - top && row(height - bottom - 1)) bottom++;
  while (left < width && col(left)) left++;
  while (right < width - left && col(width - right - 1)) right++;
  const darkFrame = top + bottom > height * 0.9 || left + right > width * 0.9;
  const suspectedBars = !darkFrame && ((top > height * 0.06 && bottom > height * 0.06) || (left > width * 0.06 && right > width * 0.06));
  return { top, bottom, left, right, darkFrame, suspectedBars };
}

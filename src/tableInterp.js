export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

export function upperBound(arr, x) {
  // first index with arr[i] > x
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function interp1(xs, ys, x) {
  if (xs.length < 2) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  const j = upperBound(xs, x);
  const i = j - 1;
  const x0 = xs[i],
    x1 = xs[j];
  const t = (x - x0) / (x1 - x0);
  return ys[i] * (1 - t) + ys[j] * t;
}

export function interp2Grid(xArr, yArr, grid, x, y) {
  // grid[yIndex][xIndex]
  if (xArr.length < 2 || yArr.length < 2) return NaN;

  const xi = clamp(upperBound(xArr, x) - 1, 0, xArr.length - 2);
  const yi = clamp(upperBound(yArr, y) - 1, 0, yArr.length - 2);

  const x0 = xArr[xi],
    x1 = xArr[xi + 1];
  const y0 = yArr[yi],
    y1 = yArr[yi + 1];

  const tx = (x - x0) / (x1 - x0);
  const ty = (y - y0) / (y1 - y0);

  // JSON can't represent NaN/Infinity; generators must encode invalid points as null.
  // Treat any non-finite value as NaN so interpolation propagates invalidity.
  const toNum = (v) => (Number.isFinite(v) ? v : NaN);

  const z00 = toNum(grid[yi][xi]);
  const z10 = toNum(grid[yi][xi + 1]);
  const z01 = toNum(grid[yi + 1][xi]);
  const z11 = toNum(grid[yi + 1][xi + 1]);

  const z0 = z00 * (1 - tx) + z10 * tx;
  const z1 = z01 * (1 - tx) + z11 * tx;
  return z0 * (1 - ty) + z1 * ty;
}

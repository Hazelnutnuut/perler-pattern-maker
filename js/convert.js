// Image → bead grid conversion.
// grid: Int16Array of length w*h, value = palette index or -1 (empty / no bead).
import { hexToRgb, rgbToLab, deltaE2000 } from './color.js';

export function preparePalette(raw) {
  return raw.colors.map(([code, hex]) => {
    const rgb = hexToRgb(hex);
    return { code, hex, rgb, lab: rgbToLab(rgb) };
  });
}

// Pick the representative colour of a cell.
// "dominant": average of the most common colour bucket — keeps outlines crisp on cartoons.
// "average": plain mean — smoother for photos.
function sampleCell(data, imgW, x0, y0, x1, y1, mode) {
  const buckets = new Map();
  let n = 0, tr = 0, tg = 0, tb = 0, opaque = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * imgW + x) * 4;
      const a = data[i + 3];
      n++;
      if (a < 128) continue;
      opaque++;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      tr += r; tg += g; tb += b;
      if (mode === 'dominant') {
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        let e = buckets.get(key);
        if (!e) { e = [0, 0, 0, 0]; buckets.set(key, e); }
        e[0]++; e[1] += r; e[2] += g; e[3] += b;
      }
    }
  }
  if (n === 0 || opaque / n < 0.5) return null; // mostly transparent
  if (mode === 'dominant') {
    let best = null;
    for (const e of buckets.values()) if (!best || e[0] > best[0]) best = e;
    return [best[1] / best[0], best[2] / best[0], best[3] / best[0]];
  }
  return [tr / opaque, tg / opaque, tb / opaque];
}

// Most common colour on the image border (used for auto background removal).
function detectBackground(data, iw, crop) {
  const x0 = Math.floor(crop.x), y0 = Math.floor(crop.y);
  const w = Math.floor(crop.w), h = Math.floor(crop.h);
  const counts = new Map();
  const add = (x, y) => {
    const i = ((y + y0) * iw + (x + x0)) * 4;
    if (data[i + 3] < 128) { counts.set('t', (counts.get('t') || 0) + 1); return; }
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    counts.set(key, (counts.get(key) || 0) + 1);
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y++) { add(0, y); add(w - 1, y); }
  let bestKey = null, best = 0;
  for (const [k, v] of counts) if (v > best) { best = v; bestKey = k; }
  const share = best / (2 * (w + h));
  if (bestKey === 't' || share < 0.35) return null; // transparent already, or no clear background
  return [((bestKey >> 10) & 31) * 8 + 4, ((bestKey >> 5) & 31) * 8 + 4, (bestKey & 31) * 8 + 4];
}

/**
 * @param {ImageData} img
 * @param {object} opt { width, height, palette (prepared), maxColors, removeBg, bgTolerance, sampling, cleanNoise, crop }
 */
export function convertImage(img, opt) {
  const { width: W, height: H, palette } = opt;
  const data = img.data, iw = img.width, ih = img.height;
  const crop = opt.crop || { x: 0, y: 0, w: iw, h: ih };

  // 1. sample each cell
  const cellRgb = new Array(W * H);
  for (let gy = 0; gy < H; gy++) {
    const y0 = Math.floor(crop.y + (gy * crop.h) / H);
    const y1 = Math.max(y0 + 1, Math.floor(crop.y + ((gy + 1) * crop.h) / H));
    for (let gx = 0; gx < W; gx++) {
      const x0 = Math.floor(crop.x + (gx * crop.w) / W);
      const x1 = Math.max(x0 + 1, Math.floor(crop.x + ((gx + 1) * crop.w) / W));
      cellRgb[gy * W + gx] = sampleCell(data, iw, x0, y0, Math.min(x1, iw), Math.min(y1, ih), opt.sampling || 'dominant');
    }
  }

  // 2. background removal: flood fill from the border through cells close to the bg colour
  const empty = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (!cellRgb[i]) empty[i] = 1;
  if (opt.removeBg) {
    const bg = detectBackground(data, iw, crop);
    if (bg) {
      const bgLab = rgbToLab(bg);
      const tol = opt.bgTolerance ?? 6;
      const isBg = i => cellRgb[i] && deltaE2000(rgbToLab(cellRgb[i]), bgLab) <= tol;
      const seen = new Uint8Array(W * H);
      const stack = [];
      const push = i => { if (!seen[i] && (empty[i] || isBg(i))) { seen[i] = 1; stack.push(i); } };
      for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
      for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
      while (stack.length) {
        const i = stack.pop();
        empty[i] = 1;
        const x = i % W, y = (i / W) | 0;
        if (x > 0) push(i - 1);
        if (x < W - 1) push(i + 1);
        if (y > 0) push(i - W);
        if (y < H - 1) push(i + W);
      }
    }
  }

  // 3. nearest palette colour (CIEDE2000), cached
  const cache = new Map();
  const cellLab = new Array(W * H);
  const grid = new Int16Array(W * H).fill(-1);
  const nearest = (lab, allowed) => {
    let bi = -1, bd = Infinity;
    for (const k of allowed) {
      const d = deltaE2000(lab, palette[k].lab);
      if (d < bd) { bd = d; bi = k; }
    }
    return bi;
  };
  const all = palette.map((_, i) => i);
  for (let i = 0; i < W * H; i++) {
    if (empty[i]) continue;
    const c = cellRgb[i];
    const key = (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
    const lab = rgbToLab(c);
    cellLab[i] = lab;
    let p = cache.get(key);
    if (p === undefined) { p = nearest(lab, all); cache.set(key, p); }
    grid[i] = p;
  }

  // 3b. merge near-duplicate colours into the more common one (fewer bead types to buy)
  const mergeDE = opt.mergeSimilar || 0;
  if (mergeDE > 0) {
    const counts = [...countColors(grid)].sort((a, b) => b[1] - a[1]);
    const kept = [], remap = new Map();
    for (const [k] of counts) {
      let target = k;
      for (const q of kept) if (deltaE2000(palette[k].lab, palette[q].lab) < mergeDE) { target = q; break; }
      if (target === k) kept.push(k); else remap.set(k, target);
    }
    if (remap.size) for (let i = 0; i < grid.length; i++) if (remap.has(grid[i])) grid[i] = remap.get(grid[i]);
  }

  // 4. limit the number of colours: drop the least-used colour, re-match its cells, repeat
  const maxColors = opt.maxColors || 0;
  if (maxColors > 0) {
    for (;;) {
      const counts = new Map();
      for (const v of grid) if (v >= 0) counts.set(v, (counts.get(v) || 0) + 1);
      if (counts.size <= maxColors) break;
      let minK = -1, minC = Infinity;
      for (const [k, c] of counts) if (c < minC) { minC = c; minK = k; }
      const allowed = [...counts.keys()].filter(k => k !== minK);
      for (let i = 0; i < grid.length; i++) if (grid[i] === minK) grid[i] = nearest(cellLab[i], allowed);
    }
  }

  // 5. optional clean-up of isolated single beads
  if (opt.cleanNoise) cleanNoise(grid, W, H, palette);
  return grid;
}

// A bead is "noise" if no 4-neighbour shares its colour and most neighbours agree on one similar colour.
export function cleanNoise(grid, W, H, palette) {
  const out = grid.slice();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, v = grid[i];
      if (v < 0) continue;
      const nb = [];
      if (x > 0) nb.push(grid[i - 1]);
      if (x < W - 1) nb.push(grid[i + 1]);
      if (y > 0) nb.push(grid[i - W]);
      if (y < H - 1) nb.push(grid[i + W]);
      if (nb.length < 3 || nb.includes(v)) continue;
      const cnt = new Map();
      for (const n of nb) cnt.set(n, (cnt.get(n) || 0) + 1);
      let bk = null, bc = 0;
      for (const [k, c] of cnt) if (c > bc) { bc = c; bk = k; }
      if (bc >= 3 && bk >= 0 && deltaE2000(palette[v].lab, palette[bk].lab) < 18) out[i] = bk;
    }
  }
  grid.set(out);
}

export function countColors(grid) {
  const counts = new Map();
  for (const v of grid) if (v >= 0) counts.set(v, (counts.get(v) || 0) + 1);
  return counts;
}

// Find the content box: strip uniform bands from each edge (also phone-viewer black bars with buttons).
export function autoTrim(img) {
  const { data, width: w, height: h } = img;
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const near = (a, b) => (a[3] < 128 && b[3] < 128) ||
    (a[3] >= 128 && b[3] >= 128 && (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < 900);
  const lineMatch = (getPx, len, ref) => {
    let m = 0;
    for (let k = 0; k < len; k++) if (near(getPx(k), ref)) m++;
    return m / len;
  };
  const dominant = (getPx, len) => {
    const cnt = new Map();
    for (let k = 0; k < len; k += Math.max(1, (len / 200) | 0)) {
      const p = getPx(k); const key = p[3] < 128 ? 't' : ((p[0] >> 4) << 8) | ((p[1] >> 4) << 4) | (p[2] >> 4);
      const e = cnt.get(key); if (e) e[0]++; else cnt.set(key, [1, p]);
    }
    let best = null; for (const e of cnt.values()) if (!best || e[0] > best[0]) best = e;
    return best[1];
  };
  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  const trimEdge = (pos, step, limit, getLine, len) => {
    for (let guard = 0; guard < 4; guard++) { // several bands, e.g. black bar then white margin
      const ref = dominant(getLine(pos), len());
      const dark = ref[3] >= 128 && ref[0] + ref[1] + ref[2] < 120;
      const thr = dark ? 0.55 : 0.97;
      let p = pos;
      while (p !== limit && lineMatch(getLine(p), len(), ref) >= thr) p += step;
      if (p === pos) break;
      pos = p;
      if (pos === limit) break;
    }
    return pos;
  };
  top = trimEdge(0, 1, h - 1, y => x => px(left + x, y), () => right - left + 1);
  bottom = trimEdge(h - 1, -1, top, y => x => px(left + x, y), () => right - left + 1);
  left = trimEdge(0, 1, w - 1, x => y => px(x, top + y), () => bottom - top + 1);
  right = trimEdge(w - 1, -1, left, x => y => px(x, top + y), () => bottom - top + 1);
  if (right - left < 8 || bottom - top < 8) return { x: 0, y: 0, w, h };
  // keep a small margin so background detection still sees some border
  const padX = Math.round((right - left) * 0.02), padY = Math.round((bottom - top) * 0.02);
  left = Math.max(0, left - padX); right = Math.min(w - 1, right + padX);
  top = Math.max(0, top - padY); bottom = Math.min(h - 1, bottom + padY);
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

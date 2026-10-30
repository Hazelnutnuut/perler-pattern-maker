// Drawing: on-screen editor canvas, bead preview, printable chart.
import { luminance } from './color.js';
import { countColors } from './convert.js';

const shade = (rgb, d) => `rgb(${rgb.map(v => Math.max(0, Math.min(255, v + d))).join(',')})`;

// Editor view: flat squares or beads, optional codes, grid lines
export function drawEditor(ctx, grid, W, H, pal, cell, opts = {}) {
  const cw = W * cell, ch = H * cell;
  ctx.canvas.width = cw; ctx.canvas.height = ch;
  // checkerboard for empty cells
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#f1eef2';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (grid[y * W + x] < 0 && (x + y) % 2) ctx.fillRect(x * cell, y * cell, cell, cell);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = grid[y * W + x];
      if (v < 0) continue;
      const p = pal[v], px = x * cell, py = y * cell;
      if (opts.bead) drawBead(ctx, px, py, cell, p.rgb);
      else { ctx.fillStyle = p.hex; ctx.fillRect(px, py, cell, cell); }
      if (opts.codes && cell >= 18) {
        ctx.fillStyle = luminance(p.rgb) < 128 ? '#fff' : '#222';
        ctx.font = `600 ${Math.max(7, Math.floor(cell * 0.32))}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.code, px + cell / 2, py + cell / 2 + 0.5);
      }
    }
  }
  if (opts.lines !== false && cell >= 6) drawGridLines(ctx, W, H, cell, 0, 0, opts.board);
  if (opts.highlight != null) {
    ctx.strokeStyle = 'rgba(255,0,110,0.9)'; ctx.lineWidth = 2;
    for (let i = 0; i < grid.length; i++) if (grid[i] === opts.highlight)
      ctx.strokeRect((i % W) * cell + 1, ((i / W) | 0) * cell + 1, cell - 2, cell - 2);
  }
}

function drawBead(ctx, px, py, cell, rgb) {
  const r = cell / 2, cx = px + r, cy = py + r;
  ctx.fillStyle = rgb.join ? `rgb(${rgb.join(',')})` : rgb;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = shade(rgb, -45); ctx.lineWidth = Math.max(0.6, cell * 0.05); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = shade(rgb, -25); ctx.lineWidth = Math.max(0.5, cell * 0.03); ctx.stroke();
}

function drawGridLines(ctx, W, H, cell, ox, oy, board) {
  for (let i = 0; i <= W; i++) {
    const x = ox + i * cell + 0.5;
    const major = i % 10 === 0, mid = i % 5 === 0;
    ctx.strokeStyle = major ? 'rgba(0,0,0,0.85)' : mid ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.13)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + H * cell); ctx.stroke();
  }
  for (let i = 0; i <= H; i++) {
    const y = oy + i * cell + 0.5;
    const major = i % 10 === 0, mid = i % 5 === 0;
    ctx.strokeStyle = major ? 'rgba(0,0,0,0.85)' : mid ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.13)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + W * cell, y); ctx.stroke();
  }
  if (board > 0) { // pegboard boundaries
    ctx.strokeStyle = 'rgba(230,30,120,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    for (let i = board; i < W; i += board) {
      ctx.beginPath(); ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + H * cell); ctx.stroke();
    }
    for (let i = board; i < H; i += board) {
      ctx.beginPath(); ctx.moveTo(ox, oy + i * cell); ctx.lineTo(ox + W * cell, oy + i * cell); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}

// Bead-look preview image (no codes)
export function renderPreview(grid, W, H, pal, cell = 20) {
  const c = document.createElement('canvas');
  c.width = W * cell; c.height = H * cell;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = grid[y * W + x];
    if (v >= 0) drawBead(ctx, x * cell, y * cell, cell, pal[v].rgb);
  }
  return c;
}

// Printable chart: title, codes in every cell, coordinates on 4 sides, 5/10 guides, usage legend
export function renderChart(grid, W, H, pal, t, opts = {}) {
  const cell = opts.cell || 32;
  const counts = [...countColors(grid)].sort((a, b) => codeSort(pal[a[0]].code, pal[b[0]].code));
  const total = counts.reduce((s, [, c]) => s + c, 0);
  const margin = 56, top = 132;
  const gridW = W * cell, gridH = H * cell;
  const pageW = Math.max(gridW + margin * 2, 900);
  const cols = Math.max(2, Math.floor((pageW - margin * 2) / 260));
  const legendRows = Math.ceil(counts.length / cols);
  const pageH = top + gridH + 70 + 50 + legendRows * 46 + 70;
  const c = document.createElement('canvas');
  c.width = pageW; c.height = pageH;
  const ctx = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px "Noto Sans SC","PingFang SC","Microsoft YaHei",ui-sans-serif,system-ui,sans-serif`;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pageW, pageH);
  const ox = Math.round((pageW - gridW) / 2), oy = top;

  ctx.fillStyle = '#1d1720'; ctx.font = font(800, 34); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillText(opts.title || t('chartTitle'), margin, 58);
  ctx.fillStyle = '#6b6170'; ctx.font = font(400, 18);
  ctx.fillText(t('chartMeta', { w: W, h: H, palette: opts.paletteName, n: counts.length, total }), margin, 92);

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = grid[y * W + x];
    const px = ox + x * cell, py = oy + y * cell;
    if (v < 0) continue;
    const p = pal[v];
    ctx.fillStyle = p.hex; ctx.fillRect(px, py, cell, cell);
    ctx.fillStyle = luminance(p.rgb) < 128 ? '#fff' : '#111';
    ctx.font = font(700, Math.floor(cell * (p.code.length > 2 ? 0.34 : 0.4)));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.code, px + cell / 2, py + cell / 2 + 1);
  }
  drawGridLines(ctx, W, H, cell, ox, oy, opts.board);

  ctx.fillStyle = '#5a5060'; ctx.font = font(500, 12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let x = 0; x < W; x++) {
    const cx = ox + x * cell + cell / 2;
    ctx.fillText(x + 1, cx, oy - 12); ctx.fillText(x + 1, cx, oy + gridH + 13);
  }
  for (let y = 0; y < H; y++) {
    const cy = oy + y * cell + cell / 2;
    ctx.textAlign = 'right'; ctx.fillText(y + 1, ox - 8, cy);
    ctx.textAlign = 'left'; ctx.fillText(y + 1, ox + gridW + 8, cy);
  }

  let ly = oy + gridH + 70;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1d1720'; ctx.font = font(700, 22);
  ctx.fillText(t('legendTitle'), margin, ly);
  ly += 22;
  const colW = (pageW - margin * 2) / cols;
  counts.forEach(([k, n], i) => {
    const p = pal[k];
    const x = margin + (i % cols) * colW, y = ly + Math.floor(i / cols) * 46;
    ctx.fillStyle = p.hex; ctx.fillRect(x, y, 58, 34);
    ctx.strokeStyle = '#9a909e'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 57, 33);
    ctx.fillStyle = luminance(p.rgb) < 128 ? '#fff' : '#111';
    ctx.font = font(700, 14); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.code, x + 29, y + 17);
    ctx.fillStyle = '#1d1720'; ctx.textAlign = 'left'; ctx.font = font(600, 18);
    ctx.fillText(`${p.code}`, x + 70, y + 17);
    const cw = ctx.measureText(p.code).width;
    ctx.fillStyle = '#6b6170'; ctx.font = font(400, 16);
    ctx.fillText(`× ${n}`, x + 70 + cw + 12, y + 17);
  });
  ctx.fillStyle = '#9a909e'; ctx.font = font(400, 13); ctx.textBaseline = 'alphabetic';
  ctx.fillText(t('chartFooter'), margin, pageH - 24);
  return c;
}

export function codeSort(a, b) {
  const ma = a.match(/^([A-Z]+)(\d+)$/), mb = b.match(/^([A-Z]+)(\d+)$/);
  if (!ma || !mb) return a.localeCompare(b);
  return ma[1] === mb[1] ? +ma[2] - +mb[2] : ma[1].localeCompare(mb[1]);
}

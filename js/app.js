import { PALETTES } from './palette.js';
import { preparePalette, convertImage, countColors, autoTrim } from './convert.js';
import { drawEditor, renderPreview, renderChart, codeSort } from './render.js';
import { t, applyI18n, getLang, setLang } from './i18n.js';

const $ = id => document.getElementById(id);
const MAX_UNLIMITED = 61;

const state = {
  paletteKey: 'mard221',
  pal: null,
  src: null,        // ImageData of the uploaded image (downscaled)
  srcCanvas: null,
  crop: null,
  aspect: 1,
  W: 40, H: 40,
  grid: null,
  undo: [], redo: [],
  tool: 'paint',
  cur: 0,
  hover: null,
};

// ---------- setup ----------
for (const [k, p] of Object.entries(PALETTES)) {
  const o = document.createElement('option'); o.value = k; o.textContent = p.name; $('palette').append(o);
}
state.pal = preparePalette(PALETTES[state.paletteKey]);
state.cur = Math.max(0, state.pal.findIndex(p => p.code === 'H7'));
applyI18n();
updateOutputs();
renderAllSwatches();
updateCurrent();

$('langBtn').onclick = () => { setLang(getLang() === 'zh' ? 'en' : 'zh'); applyI18n(); updateOutputs(); refreshStats(); };

// ---------- image input ----------
const drop = $('drop');
$('file').onchange = e => e.target.files[0] && loadFile(e.target.files[0]);
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
window.addEventListener('paste', e => {
  const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});

function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const maxSide = 1200;
    const s = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    state.src = ctx.getImageData(0, 0, c.width, c.height);
    state.srcCanvas = c;
    URL.revokeObjectURL(url);
    drop.classList.add('small');
    $('cropWrap').hidden = false;
    setCrop(autoTrim(state.src));
  };
  img.src = url;
}

// ---------- crop ----------
const cropCv = $('cropCv'), cropCtx = cropCv.getContext('2d');
function setCrop(r) {
  state.crop = r;
  state.aspect = r.w / r.h;
  drawCrop();
  if ($('lock').checked) fitHeight();
  regenerate();
}
function drawCrop(tmp) {
  const c = state.srcCanvas; if (!c) return;
  cropCv.width = c.width; cropCv.height = c.height;
  cropCtx.drawImage(c, 0, 0);
  const r = tmp || state.crop;
  cropCtx.fillStyle = 'rgba(30,10,30,0.55)';
  cropCtx.fillRect(0, 0, c.width, r.y);
  cropCtx.fillRect(0, r.y + r.h, c.width, c.height - r.y - r.h);
  cropCtx.fillRect(0, r.y, r.x, r.h);
  cropCtx.fillRect(r.x + r.w, r.y, c.width - r.x - r.w, r.h);
  cropCtx.strokeStyle = '#ff4f93'; cropCtx.lineWidth = Math.max(2, c.width / 200);
  cropCtx.setLineDash([c.width / 60, c.width / 90]);
  cropCtx.strokeRect(r.x, r.y, r.w, r.h);
  cropCtx.setLineDash([]);
}
let cropStart = null, cropTmp = null;
const cropPt = e => {
  const b = cropCv.getBoundingClientRect();
  return [Math.max(0, Math.min(cropCv.width, (e.clientX - b.left) / b.width * cropCv.width)),
          Math.max(0, Math.min(cropCv.height, (e.clientY - b.top) / b.height * cropCv.height))];
};
cropCv.addEventListener('pointerdown', e => { cropCv.setPointerCapture(e.pointerId); cropStart = cropPt(e); cropTmp = null; });
cropCv.addEventListener('pointermove', e => {
  if (!cropStart) return;
  const [x, y] = cropPt(e);
  cropTmp = { x: Math.min(x, cropStart[0]), y: Math.min(y, cropStart[1]), w: Math.abs(x - cropStart[0]), h: Math.abs(y - cropStart[1]) };
  drawCrop(cropTmp);
});
cropCv.addEventListener('pointerup', () => {
  if (cropTmp && cropTmp.w > 8 && cropTmp.h > 8) setCrop(cropTmp); else drawCrop();
  cropStart = null; cropTmp = null;
});
$('autoTrim').onclick = () => state.src && setCrop(autoTrim(state.src));
$('resetCrop').onclick = () => state.src && setCrop({ x: 0, y: 0, w: state.src.width, h: state.src.height });

// ---------- settings ----------
const clampSize = v => Math.max(5, Math.min(200, Math.round(+v || 0)));
function fitHeight() { $('h').value = clampSize($('w').value / state.aspect); }
function fitWidth() { $('w').value = clampSize($('h').value * state.aspect); }

$('w').addEventListener('change', () => { $('w').value = clampSize($('w').value); if ($('lock').checked && state.src) fitHeight(); regenerate(); });
$('h').addEventListener('change', () => { $('h').value = clampSize($('h').value); if ($('lock').checked && state.src) fitWidth(); regenerate(); });
$('lock').addEventListener('change', () => { if ($('lock').checked && state.src) { fitHeight(); regenerate(); } });
$('presets').addEventListener('click', e => {
  const s = e.target.dataset.s; if (!s) return;
  $('w').value = s; $('h').value = s; $('lock').checked = false; regenerate();
});
['max', 'tol', 'merge'].forEach(id => $(id).addEventListener('input', () => { updateOutputs(); debounceRegen(); }));
['sampling', 'bg', 'noise'].forEach(id => $(id).addEventListener('change', regenerate));
$('palette').addEventListener('change', () => {
  state.paletteKey = $('palette').value;
  state.pal = preparePalette(PALETTES[state.paletteKey]);
  state.cur = 0; renderAllSwatches(); updateCurrent(); regenerate();
});
$('board').addEventListener('change', draw);
$('regen').onclick = regenerate;

function updateOutputs() {
  const m = +$('max').value;
  $('maxOut').textContent = m >= MAX_UNLIMITED ? t('unlimited') : m;
  $('tolOut').textContent = $('tol').value;
  $('mergeOut').textContent = +$('merge').value ? $('merge').value : t('off');
}

let regenTimer;
function debounceRegen() { clearTimeout(regenTimer); regenTimer = setTimeout(regenerate, 180); }

function regenerate() {
  if (!state.src) return;
  state.W = clampSize($('w').value); state.H = clampSize($('h').value);
  const m = +$('max').value;
  state.grid = convertImage(state.src, {
    width: state.W, height: state.H, palette: state.pal,
    maxColors: m >= MAX_UNLIMITED ? 0 : m,
    removeBg: $('bg').checked, bgTolerance: +$('tol').value,
    sampling: $('sampling').value, cleanNoise: $('noise').checked,
    crop: state.crop, mergeSimilar: +$('merge').value,
  });
  state.undo = []; state.redo = [];
  $('empty').hidden = true; $('cv').hidden = false;
  draw(); refreshStats();
}

// ---------- drawing ----------
const cv = $('cv'), ctx = cv.getContext('2d');
function draw() {
  if (!state.grid) return;
  drawEditor(ctx, state.grid, state.W, state.H, state.pal, +$('zoom').value, {
    bead: $('beadView').checked, codes: $('codes').checked,
    board: +$('board').value, highlight: state.hover,
  });
  updateUndoButtons();
}
['zoom', 'beadView', 'codes'].forEach(id => $(id).addEventListener('input', draw));

function refreshStats() {
  if (!state.grid) { $('stats').textContent = ''; $('used').innerHTML = ''; return; }
  const counts = countColors(state.grid);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  $('stats').textContent = `${state.W}×${state.H} · ` + t('total', { n: counts.size, total });
  const used = $('used'); used.innerHTML = '';
  [...counts].sort((a, b) => codeSort(state.pal[a[0]].code, state.pal[b[0]].code)).forEach(([k, n]) => {
    const el = swatch(k, n);
    el.addEventListener('mouseenter', () => { state.hover = k; draw(); });
    el.addEventListener('mouseleave', () => { state.hover = null; draw(); });
    used.append(el);
  });
}

function swatch(k, n) {
  const p = state.pal[k];
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'sw' + (k === state.cur ? ' on' : ''); el.dataset.k = k;
  el.innerHTML = `<i style="background:${p.hex}"></i>${p.code}${n != null ? ` <small>×${n}</small>` : ''}`;
  el.title = `${p.code} ${p.hex}`;
  el.onclick = () => selectColor(k);
  return el;
}

function renderAllSwatches() {
  const q = $('search').value.trim().toUpperCase();
  const all = $('all'); all.innerHTML = '';
  state.pal.forEach((p, k) => { if (!q || p.code.includes(q) || p.hex.includes(q)) all.append(swatch(k)); });
}
$('search').addEventListener('input', renderAllSwatches);

function selectColor(k) {
  state.cur = k; updateCurrent();
  document.querySelectorAll('.sw').forEach(el => el.classList.toggle('on', +el.dataset.k === k));
  if (state.tool === 'erase' || state.tool === 'pick') setTool('paint');
}
function updateCurrent() {
  const p = state.pal[state.cur];
  $('curSw').style.background = p.hex; $('curCode').textContent = p.code;
}

// ---------- editing ----------
$('tools').addEventListener('click', e => { const tl = e.target.dataset.tool; if (tl) setTool(tl); });
function setTool(tl) {
  state.tool = tl;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tl));
}

function cellAt(e) {
  const r = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * state.W);
  const y = Math.floor(((e.clientY - r.top) / r.height) * state.H);
  return x >= 0 && y >= 0 && x < state.W && y < state.H ? { x, y, i: y * state.W + x } : null;
}

function pushUndo() {
  state.undo.push(state.grid.slice());
  if (state.undo.length > 100) state.undo.shift();
  state.redo = [];
}

let painting = false, strokeDirty = false;
cv.addEventListener('pointerdown', e => {
  if (!state.grid) return;
  const c = cellAt(e); if (!c) return;
  cv.setPointerCapture(e.pointerId);
  const g = state.grid;
  if (state.tool === 'pick') { if (g[c.i] >= 0) selectColor(g[c.i]); return; }
  if (state.tool === 'fill') {
    if (g[c.i] === state.cur) return;
    pushUndo(); floodFill(c.x, c.y, state.cur); afterEdit(); return;
  }
  if (state.tool === 'replace') {
    const from = g[c.i]; if (from < 0 || from === state.cur) return;
    pushUndo(); for (let i = 0; i < g.length; i++) if (g[i] === from) g[i] = state.cur; afterEdit(); return;
  }
  painting = true; strokeDirty = false;
  state.undo.push(g.slice()); state.redo = [];
  paintAt(c);
});
cv.addEventListener('pointermove', e => {
  const c = cellAt(e);
  $('pos').textContent = c ? t('pos', { x: c.x + 1, y: c.y + 1 }) + (state.grid[c.i] >= 0 ? ` · ${state.pal[state.grid[c.i]].code}` : '') : '';
  if (painting && c) paintAt(c);
});
const endStroke = () => {
  if (!painting) return;
  painting = false;
  if (!strokeDirty) state.undo.pop(); else afterEdit();
};
cv.addEventListener('pointerup', endStroke);
cv.addEventListener('pointercancel', endStroke);
cv.addEventListener('pointerleave', () => { $('pos').textContent = ''; });

function paintAt(c) {
  const v = state.tool === 'erase' ? -1 : state.cur;
  if (state.grid[c.i] === v) return;
  state.grid[c.i] = v; strokeDirty = true; draw();
}
function floodFill(x, y, v) {
  const g = state.grid, W = state.W, H = state.H, from = g[y * W + x];
  const st = [y * W + x];
  while (st.length) {
    const i = st.pop(); if (g[i] !== from) continue;
    g[i] = v;
    const cx = i % W, cy = (i / W) | 0;
    if (cx > 0) st.push(i - 1); if (cx < W - 1) st.push(i + 1);
    if (cy > 0) st.push(i - W); if (cy < H - 1) st.push(i + W);
  }
}
function afterEdit() { draw(); refreshStats(); }

$('undo').onclick = () => { if (!state.undo.length) return; state.redo.push(state.grid.slice()); state.grid = state.undo.pop(); afterEdit(); };
$('redo').onclick = () => { if (!state.redo.length) return; state.undo.push(state.grid.slice()); state.grid = state.redo.pop(); afterEdit(); };
function updateUndoButtons() { $('undo').disabled = !state.undo.length; $('redo').disabled = !state.redo.length; }
window.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('redo') : $('undo')).click(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); $('redo').click(); }
  else if (!mod) {
    const map = { b: 'paint', e: 'erase', i: 'pick', g: 'fill', r: 'replace' };
    if (map[e.key]) setTool(map[e.key]);
  }
});

// ---------- export ----------
function chartCanvas() {
  return renderChart(state.grid, state.W, state.H, state.pal, t, {
    title: $('title').value.trim() || t('chartTitle'),
    paletteName: PALETTES[state.paletteKey].name,
    board: +$('board').value,
    cell: state.W > 80 ? 26 : 32,
  });
}
function fileBase() {
  const s = ($('title').value.trim() || 'perler-pattern').replace(/[\\/:*?"<>|]+/g, '_');
  return `${s}_${state.W}x${state.H}`;
}
function download(blobOrUrl, name) {
  const a = document.createElement('a');
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = name; document.body.append(a); a.click(); a.remove();
}
const need = fn => () => { if (!state.grid) { alert(t('empty')); return; } fn(); };

$('dlChart').onclick = need(() => chartCanvas().toBlob(b => download(b, fileBase() + '_chart.png')));
$('dlPreview').onclick = need(() => renderPreview(state.grid, state.W, state.H, state.pal, 24).toBlob(b => download(b, fileBase() + '_preview.png')));
$('dlCsv').onclick = need(() => {
  const rows = [];
  for (let y = 0; y < state.H; y++) {
    const r = [];
    for (let x = 0; x < state.W; x++) { const v = state.grid[y * state.W + x]; r.push(v < 0 ? '' : state.pal[v].code); }
    rows.push(r.join(','));
  }
  download(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv' }), fileBase() + '.csv');
});
$('print').onclick = need(() => {
  const url = chartCanvas().toDataURL('image/png');
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.append(f);
  const d = f.contentDocument;
  d.open();
  d.write(`<!doctype html><title>${fileBase()}</title><style>@page{margin:8mm}html,body{margin:0}img{width:100%;display:block}</style><img src="${url}">`);
  d.close();
  const img = d.querySelector('img');
  const go = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
  if (img.complete) setTimeout(go, 50); else img.onload = go;
});

// expose for automated tests
window.__ppm = { state, loadFile, regenerate, chartCanvas, setCrop };

// AI background removal, fully in the browser via Transformers.js (loaded on demand from jsDelivr).
// Models:
//   portrait — Xenova/modnet (Apache-2.0), small & fast, made for people
//   general  — onnx-community/BiRefNet_lite (MIT), people, animals and objects; bigger download
// Model files are cached by the browser after the first download.

const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

export const CUTOUT_MODELS = {
  portrait: { id: 'Xenova/modnet', input: 'input', output: 'output', sigmoid: false },
  general: { id: 'onnx-community/BiRefNet_lite', input: 'input_image', output: 'output_image', sigmoid: true },
};

let tfPromise = null;
const loaded = {};   // kind -> { model, processor, step }

// Ordered fallbacks: fast GPU first; if the GPU kernel fails (some drivers do), go full precision, then CPU.
function attempts(kind) {
  const list = [];
  if ('gpu' in navigator) {
    if (kind === 'general') list.push({ device: 'webgpu', dtype: 'fp16' });
    list.push({ device: 'webgpu', dtype: 'fp32' });
  }
  list.push({ device: 'wasm', dtype: 'fp32' });
  return list;
}

// huggingface.co is unreachable from mainland China; fall back to the hf-mirror.com mirror.
let hostChecked = false;
async function pickHost(tf, id) {
  if (hostChecked) return;
  hostChecked = true;
  const probe = async base => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try { const r = await fetch(`${base}${id}/resolve/main/config.json`, { signal: ctl.signal }); return r.ok; }
    catch { return false; } finally { clearTimeout(timer); }
  };
  if (await probe('https://huggingface.co/')) return;
  if (await probe('https://hf-mirror.com/')) tf.env.remoteHost = 'https://hf-mirror.com/';
}

async function loadModel(kind, from, onProgress) {
  const cfg = CUTOUT_MODELS[kind];
  tfPromise ??= import(/* @vite-ignore */ TF_URL);
  const tf = await tfPromise;
  tf.env.allowLocalModels = false;
  await pickHost(tf, cfg.id);
  const files = new Map();
  const progress_callback = p => {
    if (p.status === 'progress' && p.total) {
      files.set(p.file, [p.loaded, p.total]);
      let l = 0, t = 0;
      for (const [a, b] of files.values()) { l += a; t += b; }
      onProgress?.({ phase: 'download', ratio: t ? l / t : 0, mb: t / 1048576 });
    }
  };
  const list = attempts(kind);
  let lastErr = null;
  for (let step = from; step < list.length; step++) {
    try {
      const model = await tf.AutoModel.from_pretrained(cfg.id, { ...list[step], progress_callback });
      const processor = await tf.AutoProcessor.from_pretrained(cfg.id);
      return (loaded[kind] = { tf, model, processor, cfg, step, last: step === list.length - 1 });
    } catch (e) { lastErr = e; console.warn('cutout: load failed with', list[step], e); }
  }
  throw lastErr;
}

/**
 * Returns a new ImageData with the background made transparent.
 * @param {ImageData} img
 * @param {'portrait'|'general'} kind
 */
export async function removeBackground(img, kind, onProgress) {
  let m = loaded[kind] || await loadModel(kind, 0, onProgress);
  for (;;) {
    try {
      onProgress?.({ phase: 'infer' });
      return await runModel(m, img);
    } catch (e) {
      console.warn('cutout: inference failed with', attempts(kind)[m.step], e);
      if (m.last) throw e;
      try { await m.model.dispose?.(); } catch { /* ignore */ }
      delete loaded[kind];
      m = await loadModel(kind, m.step + 1, onProgress);
    }
  }
}

async function runModel({ tf, model, processor, cfg }, img) {
  const raw = new tf.RawImage(new Uint8ClampedArray(img.data), img.width, img.height, 4).rgb();
  const { pixel_values } = await processor(raw);
  const out = await model({ [cfg.input]: pixel_values });
  let t = out[cfg.output][0];
  if (cfg.sigmoid) t = t.sigmoid();
  const mask = await tf.RawImage.fromTensor(t.mul(255).to('uint8')).resize(img.width, img.height);
  return applyMask(img, mask.data, mask.channels || 1);
}

// Use the mask as alpha. Beads are either there or not, so soft edges are cut at 50%.
export function applyMask(img, mask, channels = 1) {
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const a = mask[i * channels];
    out.data[i * 4 + 3] = Math.min(img.data[i * 4 + 3], a >= 128 ? 255 : 0);
  }
  return out;
}

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
const loaded = {};

async function loadModel(kind, onProgress) {
  const cfg = CUTOUT_MODELS[kind];
  if (loaded[kind]) return loaded[kind];
  tfPromise ??= import(/* @vite-ignore */ TF_URL);
  const tf = await tfPromise;
  tf.env.allowLocalModels = false;

  const files = new Map();
  const progress_callback = p => {
    if (p.status === 'progress' && p.total) {
      files.set(p.file, [p.loaded, p.total]);
      let l = 0, t = 0;
      for (const [a, b] of files.values()) { l += a; t += b; }
      onProgress?.({ phase: 'download', ratio: t ? l / t : 0, mb: t / 1048576 });
    }
  };
  const tries = [];
  if ('gpu' in navigator) tries.push({ device: 'webgpu', dtype: kind === 'general' ? 'fp16' : 'fp32' }, { device: 'webgpu', dtype: 'fp32' });
  tries.push({ device: 'wasm', dtype: 'fp32' });

  let model = null, lastErr = null;
  for (const opt of tries) {
    try { model = await tf.AutoModel.from_pretrained(cfg.id, { ...opt, progress_callback }); break; }
    catch (e) { lastErr = e; console.warn('cutout: load failed with', opt, e); }
  }
  if (!model) throw lastErr;
  const processor = await tf.AutoProcessor.from_pretrained(cfg.id);
  loaded[kind] = { tf, model, processor, cfg };
  return loaded[kind];
}

/**
 * Returns a new ImageData with the background made transparent.
 * @param {ImageData} img
 * @param {'portrait'|'general'} kind
 */
export async function removeBackground(img, kind, onProgress) {
  const { tf, model, processor, cfg } = await loadModel(kind, onProgress);
  onProgress?.({ phase: 'infer' });
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

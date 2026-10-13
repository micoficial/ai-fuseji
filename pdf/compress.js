// PDFの中の画像（写真・スキャン・スクリーンショット）を、ブラウザの中で縮小・JPEGに詰め直して、PDFを軽くする。
// 文字や図形（ベクター）はそのまま残すので、文字の選択・検索はできたまま。通信はしない。
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFArray } from "./lib/pdf-lib.esm.min.js";

// 圧縮の強さ。maxDim：画像の長い辺の上限（ピクセル）、quality：JPEGの画質
export const LEVELS = {
  standard: { maxDim: 1800, quality: 0.72 }, // 標準：見た目はほぼ変わらない
  strong: { maxDim: 1200, quality: 0.5 }, // 強め：メールで送れる大きさを優先（Pro）
};

const N = (s) => PDFName.of(s);
const str = (v) => (v ? v.toString() : "");
const isRef = (v) => v && v.constructor && v.constructor.name === "PDFRef";

function filters(dict) {
  const f = dict.get(N("Filter"));
  if (!f) return [];
  if (f instanceof PDFArray) return Array.from({ length: f.size() }, (_, i) => str(f.get(i)));
  return [str(f)];
}

// 色の成分の数（1=グレー、3=RGB）。CMYK・特色・インデックスなどは null（色が変わるおそれがあるので触らない）
function components(dict, ctx) {
  if (dict.get(N("Decode")) || dict.get(N("ImageMask"))) return null;
  let cs = dict.get(N("ColorSpace"));
  if (isRef(cs)) cs = ctx.lookup(cs);
  const s = str(cs);
  if (s === "/DeviceRGB") return 3;
  if (s === "/DeviceGray") return 1;
  if (cs instanceof PDFArray && str(cs.get(0)) === "/ICCBased") {
    let icc = cs.get(1);
    if (isRef(icc)) icc = ctx.lookup(icc);
    const n = icc && icc.dict ? Number(str(icc.dict.get(N("N")))) : 0;
    return n === 1 || n === 3 ? n : null;
  }
  return null;
}

async function inflate(bytes) {
  const ds = new DecompressionStream("deflate");
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}

// PNG の行ごとのフィルタ（Predictor 10〜15）を戻す
function unpredict(data, width, comps, predictor) {
  if (predictor < 10) return data;
  const stride = width * comps;
  const rows = Math.floor(data.length / (stride + 1));
  const out = new Uint8Array(rows * stride);
  for (let y = 0; y < rows; y++) {
    const type = data[y * (stride + 1)];
    const line = data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= comps ? out[o + x - comps] : 0;
      const b = y > 0 ? out[o - stride + x] : 0;
      const c = y > 0 && x >= comps ? out[o - stride + x - comps] : 0;
      let v = line[x];
      if (type === 1) v += a;
      else if (type === 2) v += b;
      else if (type === 3) v += (a + b) >> 1;
      else if (type === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[o + x] = v & 255;
    }
  }
  return out;
}

// 画像を描ける形（ImageBitmap または ImageData）にする。できなければ null
async function decode(obj, ctx) {
  const d = obj.dict;
  const fs = filters(d);
  const comps = components(d, ctx);
  if (!comps) return null;
  const raw = obj.getContents();
  if (fs.length === 1 && fs[0] === "/DCTDecode") {
    try { return await createImageBitmap(new Blob([raw], { type: "image/jpeg" })); } catch { return null; }
  }
  if (fs.length === 1 && fs[0] === "/FlateDecode" && str(d.get(N("BitsPerComponent"))) === "8") {
    const w = Number(str(d.get(N("Width")))), h = Number(str(d.get(N("Height"))));
    let parms = d.get(N("DecodeParms"));
    if (isRef(parms)) parms = ctx.lookup(parms);
    const predictor = parms && parms.get ? Number(str(parms.get(N("Predictor"))) || 1) : 1;
    if (predictor > 1 && predictor < 10) return null; // TIFF 予測は扱わない
    let px;
    try { px = unpredict(await inflate(raw), w, comps, predictor); } catch { return null; }
    if (px.length < w * h * comps) return null;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < w * h; i++, j += comps) {
      const r = px[j], g = comps === 3 ? px[j + 1] : r, b = comps === 3 ? px[j + 2] : r;
      rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
    }
    return new ImageData(rgba, w, h);
  }
  return null;
}

// bytes：元のPDF（Uint8Array）。level：LEVELS の値。onProgress(済み, 全体)
// 戻り値：{ bytes, images（画像の数）, changed（軽くした数） }
export async function compressPdf(bytes, level, onProgress = () => {}) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const targets = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && str(obj.dict.get(N("Subtype"))) === "/Image") targets.push([ref, obj]);
  }
  let changed = 0, done = 0;
  for (const [ref, obj] of targets) {
    onProgress(done++, targets.length);
    const img = await decode(obj, ctx);
    if (!img) continue;
    const scale = Math.min(1, level.maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const g = canvas.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
    if (img instanceof ImageData) {
      const tmp = new OffscreenCanvas(img.width, img.height);
      tmp.getContext("2d").putImageData(img, 0, 0);
      g.drawImage(tmp, 0, 0, w, h);
    } else {
      g.drawImage(img, 0, 0, w, h);
      img.close();
    }
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: level.quality });
    const out = new Uint8Array(await blob.arrayBuffer());
    // 小さくならない画像はそのまま（もともと軽い画像を重くしない）
    if (out.length >= obj.getContents().length * 0.9) continue;
    const nd = obj.dict.clone(ctx);
    nd.set(N("Width"), PDFNumber.of(w));
    nd.set(N("Height"), PDFNumber.of(h));
    nd.set(N("ColorSpace"), N("DeviceRGB"));
    nd.set(N("BitsPerComponent"), PDFNumber.of(8));
    nd.set(N("Filter"), N("DCTDecode"));
    nd.delete(N("DecodeParms"));
    nd.set(N("Length"), PDFNumber.of(out.length));
    ctx.assign(ref, PDFRawStream.of(nd, out));
    changed++;
  }
  onProgress(targets.length, targets.length);
  const saved = await doc.save({ useObjectStreams: true });
  return { bytes: saved, images: targets.length, changed };
}

// 表示用：1234567 → "1.2 MB"
export function formatSize(n) {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}

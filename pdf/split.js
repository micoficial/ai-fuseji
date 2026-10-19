// PDFを分割する・ページを抜き出す（ブラウザの中だけで処理。ページはコピーするので中身・画質はそのまま）
// 検索候補「pdf 分割 無料 安全／オフライン」「pdf ページ 抽出」に答える
import { PDFDocument } from "./lib/pdf-lib.esm.min.js";
import { parseRange } from "./rotate.js";

// 分け方を、ページ番号（0始まり）のまとまりの配列にする
// mode: "each"（1ページずつ）｜"every"（nページごと）｜"groups"（「1-3 / 4-6 / 7-」のように「/」区切り）｜"extract"（指定ページを1つに）
export function planSplit(count, { mode = "each", n = 1, spec = "" } = {}) {
  if (mode === "each") return [...Array(count).keys()].map((i) => [i]);
  if (mode === "every") {
    const k = Math.max(1, parseInt(n, 10) || 1);
    const out = [];
    for (let i = 0; i < count; i += k) out.push([...Array(Math.min(k, count - i)).keys()].map((j) => i + j));
    return out;
  }
  if (mode === "extract") {
    if (!String(spec || "").trim()) return [];
    const one = parseRange(spec, count);
    return one.length ? [one] : [];
  }
  // groups：全角の／や改行も区切りとして受ける
  return String(spec || "").split(/[\/／\n]/).map((s) => s.trim()).filter(Boolean)
    .map((s) => parseRange(s, count)).filter((g) => g.length);
}

// まとまりごとに新しいPDFを作り、{ pages:[1始まり], bytes } の配列を返す
export async function splitPdf(bytes, plan) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = [];
  for (const g of plan) {
    const doc = await PDFDocument.create();
    for (const p of await doc.copyPages(src, g)) doc.addPage(p);
    out.push({ pages: g.map((i) => i + 1), bytes: await doc.save() });
  }
  return out;
}

// 保存するファイル名の後ろ（例：_p1-3、_p2,5）
export function suffix(pages) {
  const runs = [];
  for (const p of pages) {
    const last = runs[runs.length - 1];
    if (last && p === last[1] + 1) last[1] = p; else runs.push([p, p]);
  }
  return "_p" + runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(",");
}

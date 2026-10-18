// PDFのページを回転して保存する（中身は元のまま、ページの /Rotate だけ書き換える）
// ブラウザの表示だけ回しても保存されない、という困りごとに答える
import { degrees } from "./lib/pdf-lib.esm.min.js";

// 「2,4-6」→ [1,3,4,5]（0始まり）。空なら全ページ。範囲外・不正は無視
export function parseRange(spec, count) {
  const s = String(spec || "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[、，]/g, ",").replace(/[ー－〜～]/g, "-").trim();
  if (!s) return [...Array(count).keys()];
  const set = new Set();
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d*))?$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] === undefined ? a : m[2] === "" ? count : parseInt(m[2], 10);
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) if (n >= 1 && n <= count) set.add(n - 1);
  }
  return [...set].sort((x, y) => x - y);
}

// angle: 90（右へ）｜180｜270（左へ）。今の向きに足す。回したページ番号（1始まり）を返す
export function rotatePages(doc, { angle = 90, pages = "" } = {}) {
  const all = doc.getPages();
  const idx = parseRange(pages, all.length);
  for (const i of idx) {
    const cur = all[i].getRotation().angle;
    all[i].setRotation(degrees((((cur + angle) % 360) + 360) % 360));
  }
  return idx.map((i) => i + 1);
}

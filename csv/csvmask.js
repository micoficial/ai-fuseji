// CSVの列ごとに個人情報を伏せる。読み込み・変換・保存はすべてこのPCの中で行う。外部には何も送らない。
import { mask } from "../mask.js";

// Excel が出す Shift_JIS も読めるように、UTF-8 で読めなければ Shift_JIS で読み直す
export function decode(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""); }
  catch { return new TextDecoder("shift_jis").decode(bytes); }
}

export function parseCSV(text) {
  const sep = (text.split(/\r?\n/, 1)[0].match(/\t/g) || []).length > (text.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? "\t" : ",";
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return { rows, sep };
}

export function toCSV(rows, sep = ",") {
  const need = new RegExp(`["\r\n${sep === "\t" ? "\t" : ","}]`);
  return rows.map((r) => r.map((v) => (need.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(sep)).join("\r\n") + "\r\n";
}

// 見出しから、その列の伏せ方を推す
export function guessMode(header) {
  const h = String(header || "").replace(/\s/g, "");
  if (/氏名|名前|お名前|フリガナ|ふりがな|カナ|担当者|患者名|顧客名|name/i.test(h)) return "pseudo";
  if (/電話|TEL|携帯|FAX|メール|mail|住所|address|番地|マイナンバー|個人番号|口座|カード|生年月日|誕生日|保険証/i.test(h)) return "all";
  if (/備考|メモ|コメント|内容|自由|note|memo|comment/i.test(h)) return "auto";
  return "keep";
}

export const MODES = {
  keep: "そのまま",
  pseudo: "置き換え（同じ値は同じ番号）",
  all: "すべて伏せる（●●●）",
  head: "1文字目だけ残す",
  auto: "文中の個人情報だけ伏せる",
};

// modes: 列ごとの伏せ方。hasHeader: 1行目を見出しとして残す
export function maskRows(rows, modes, { hasHeader = true } = {}) {
  const maps = modes.map(() => new Map());
  return rows.map((r, i) => {
    if (hasHeader && i === 0) return r.slice();
    return r.map((v, c) => {
      const m = modes[c] || "keep";
      if (m === "keep" || v.trim() === "") return v;
      if (m === "all") return "●●●";
      if (m === "head") return [...v.trim()][0] + "●".repeat(Math.max(2, [...v.trim()].length - 1));
      if (m === "pseudo") {
        const key = v.trim();
        const map = maps[c];
        if (!map.has(key)) {
          const label = hasHeader ? String(rows[0][c] || "").trim() || `列${c + 1}` : `列${c + 1}`;
          map.set(key, `${label}${String(map.size + 1).padStart(3, "0")}`);
        }
        return map.get(key);
      }
      if (m === "auto") return mask(v).masked;
      return v;
    });
  });
}

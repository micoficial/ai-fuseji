// PDFに電子印鑑を押す：印影をキャンバスで作り、指定の位置に画像として重ねる。元のページの文字はそのまま。
// 位置はページの見た目に対する割合（中心 x,y：左上が 0,0）、大きさは mm で持つ。
import { degrees } from "./lib/pdf-lib.esm.min.js";

export const mmToPt = (mm) => (mm * 72) / 25.4;
export const INK = "#c8161d";
const FONT = "'Yu Mincho','YuMincho','Hiragino Mincho ProN','Noto Serif JP','MS PMincho',serif";

// 印影の見た目の中心（割合）→ 画像の左下（ページ座標）。/Rotate があっても見た目の位置・向きに押す
export function placeOnPage(box, angle, { x, y }, sizePt) {
  const r = ((angle % 360) + 360) % 360;
  const vw = r === 90 || r === 270 ? box.height : box.width;
  const vh = r === 90 || r === 270 ? box.width : box.height;
  const vx = x * vw - sizePt / 2;
  const vy = (1 - y) * vh - sizePt / 2;
  const [px, py] = {
    0: [vx, vy],
    90: [box.width - vy, vx],
    180: [box.width - vx, box.height - vy],
    270: [vy, box.height - vx],
  }[r];
  return { x: box.x + px, y: box.y + py, rotate: r };
}

// 角印の文字の割り振り：右の列から読む。列の数は文字数の平方根を切り上げ
export function squareColumns(text) {
  const chars = [...text];
  const cols = Math.max(1, Math.ceil(Math.sqrt(chars.length)));
  const per = Math.ceil(chars.length / cols);
  const out = [];
  for (let i = 0; i < chars.length; i += per) out.push(chars.slice(i, i + per));
  return out;
}

// 1列を縦に書く。枠に合わせて文字を横に伸ばす（はんこの字の形）
function column(ctx, chars, cx, top, w, h) {
  const cell = h / chars.length;
  const size = Math.min(w, cell) * 0.96;
  const sx = Math.min(1.7, w / size);
  const sy = Math.min(1.7, cell / size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px ${FONT}`;
  chars.forEach((c, i) => {
    ctx.save();
    ctx.translate(cx, top + cell * (i + 0.5));
    ctx.scale(sx * 0.94, sy * 0.94);
    ctx.fillText(c, 0, 0);
    ctx.restore();
  });
}

// 横1行を枠の幅に収める
function line(ctx, text, cx, cy, maxW, size) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  ctx.save();
  ctx.translate(cx, cy);
  if (w > maxW) ctx.scale(maxW / w, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// kind: "round"（丸印）｜"square"（角印）｜"date"（日付印）。canvas は正方形
export function drawSeal(canvas, { kind = "round", text = "", top = "", date = "", bottom = "", color = INK } = {}) {
  const S = canvas.width;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const c = S / 2;
  if (kind === "square") {
    ctx.lineWidth = S * 0.04;
    const m = S * 0.04;
    ctx.strokeRect(m, m, S - 2 * m, S - 2 * m);
    const cols = squareColumns(text || "印");
    const area = S * 0.8, x0 = (S - area) / 2, w = area / cols.length;
    cols.forEach((chars, i) => column(ctx, chars, x0 + area - w * (i + 0.5), x0, w, area));
    return;
  }
  ctx.lineWidth = S * (kind === "date" ? 0.03 : 0.035);
  ctx.beginPath();
  ctx.arc(c, c, c - S * 0.03, 0, Math.PI * 2);
  ctx.stroke();
  if (kind === "round") {
    const chars = [...(text || "印")].slice(0, 6);
    const h = S * (chars.length === 1 ? 0.5 : 0.72);
    column(ctx, chars, c, c - h / 2, S * (chars.length === 1 ? 0.5 : 0.56), h);
    return;
  }
  // 日付印：上に部署や会社、中に日付、下に名前
  ctx.lineWidth = S * 0.02;
  const y1 = S * 0.345, y2 = S * 0.655;
  const half = Math.sqrt(Math.max(0, (c - S * 0.03) ** 2 - (c - y1) ** 2));
  for (const y of [y1, y2]) {
    ctx.beginPath();
    ctx.moveTo(c - half, y);
    ctx.lineTo(c + half, y);
    ctx.stroke();
  }
  line(ctx, top, c, S * 0.215, S * 0.56, S * 0.15);
  line(ctx, date, c, c, S * 0.84, S * 0.15);
  line(ctx, bottom, c, S * 0.785, S * 0.52, S * 0.17);
}

// 手持ちの印影の画像から白い背景を抜く（明るいほど透明に。朱肉の濃いところは残す）
export function whiteToClear(data) {
  for (let i = 0; i < data.length; i += 4) {
    const low = Math.min(data[i], data[i + 1], data[i + 2]);
    if (low > 235) data[i + 3] = 0;
    else if (low > 190) data[i + 3] = Math.min(data[i + 3], Math.round(((235 - low) / 45) * 255));
  }
  return data;
}

// doc：pdf-lib の文書、stamps：{ page（0始まり）, x, y, mm, png（バイト列）, ratio（高さ÷幅、省略時1） } の配列
export async function applyStamps(doc, stamps) {
  const pages = doc.getPages();
  const cache = new Map();
  let done = 0;
  for (const s of stamps) {
    const page = pages[s.page];
    if (!page) continue;
    if (!cache.has(s.png)) cache.set(s.png, await doc.embedPng(s.png));
    const img = cache.get(s.png);
    const w = mmToPt(s.mm);
    const h = w * (s.ratio || 1);
    // 正方形でない画像も、中心が合うように幅と高さの大きい方の箱で位置を出してからずらす
    const box = page.getCropBox();
    const big = Math.max(w, h);
    const p = placeOnPage(box, page.getRotation().angle, s, big);
    const dx = (big - w) / 2, dy = (big - h) / 2;
    const off = { 0: [dx, dy], 90: [-dy, dx], 180: [-dx, -dy], 270: [dy, -dx] }[p.rotate];
    page.drawImage(img, { x: p.x + off[0], y: p.y + off[1], width: w, height: h, rotate: degrees(p.rotate) });
    done++;
  }
  return done;
}

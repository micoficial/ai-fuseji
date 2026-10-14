// 結合のとき、ページの大きさをA4にそろえる（縦長はA4縦、横長はA4横。縦横比は保ち、余白は白）
// 見た目の回転（/Rotate）も反映して、まっすぐに置き直す
import { degrees } from "./lib/pdf-lib.esm.min.js";

export const A4 = [595.28, 841.89];

export async function addPagesFitA4(out, src) {
  const pages = src.getPages();
  const boxes = pages.map((p) => {
    const b = p.getCropBox();
    return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height };
  });
  const embedded = await out.embedPages(pages, boxes);
  pages.forEach((p, i) => {
    const e = embedded[i];
    const r = ((p.getRotation().angle % 360) + 360) % 360;
    const w = e.width, h = e.height;
    const sideways = r === 90 || r === 270;
    const vw = sideways ? h : w, vh = sideways ? w : h; // 見た目の幅と高さ
    const [pw, ph] = vw > vh ? [A4[1], A4[0]] : A4;
    const s = Math.min(pw / vw, ph / vh);
    const ox = (pw - vw * s) / 2, oy = (ph - vh * s) / 2;
    // 時計回りに r 度回したとき、左下が原点に来るようにずらす
    const shift = { 0: [0, 0], 90: [0, w * s], 180: [w * s, h * s], 270: [h * s, 0] }[r] || [0, 0];
    const page = out.addPage([pw, ph]);
    page.drawPage(e, { x: ox + shift[0], y: oy + shift[1], xScale: s, yScale: s, rotate: degrees(-r) });
  });
}

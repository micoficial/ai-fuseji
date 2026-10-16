// A4のページを2枚ずつ横に並べて、A3横の1ページにする（余白なし。A4以外は縦横比を保って半分の枠に収め、余りは白）
// 見た目の回転（/Rotate）も反映する。rtl=true なら右→左の順（縦書き・右綴じの書類向け）
import { degrees } from "./lib/pdf-lib.esm.min.js";

export const A3L = [1190.55, 841.89];

export async function addPagesTwoUp(out, srcPages, { rtl = false } = {}) {
  const boxes = srcPages.map((p) => {
    const b = p.getCropBox();
    return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height };
  });
  // 複数のPDFのページが混ざるので、1ページずつ埋め込む
  const embedded = [];
  for (let i = 0; i < srcPages.length; i++) embedded.push(await out.embedPage(srcPages[i], boxes[i]));
  const half = A3L[0] / 2, H = A3L[1];
  for (let i = 0; i < srcPages.length; i += 2) {
    const page = out.addPage(A3L);
    for (let k = 0; k < 2 && i + k < srcPages.length; k++) {
      const e = embedded[i + k];
      const r = ((srcPages[i + k].getRotation().angle % 360) + 360) % 360;
      const w = e.width, h = e.height;
      const sideways = r === 90 || r === 270;
      const vw = sideways ? h : w, vh = sideways ? w : h;
      const s = Math.min(half / vw, H / vh);
      const slot = rtl ? 1 - k : k;
      const ox = slot * half + (half - vw * s) / 2, oy = (H - vh * s) / 2;
      const shift = { 0: [0, 0], 90: [0, w * s], 180: [w * s, h * s], 270: [h * s, 0] }[r] || [0, 0];
      page.drawPage(e, { x: ox + shift[0], y: oy + shift[1], xScale: s, yScale: s, rotate: degrees(-r) });
    }
  }
}

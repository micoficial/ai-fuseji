// PDFの各ページにページ番号を書き込む（文字は元のまま、番号だけ上に重ねる）
// 見た目の回転（/Rotate）があっても、見た目の下（または上）に正しい向きで入るようにする
// opts: format "n"｜"dash"｜"n/N"、pos "bc"｜"br"｜"bl"｜"tc"｜"tr"、skip=番号を入れない先頭ページ数、start=最初に入れる番号、size=文字の大きさ(pt)
import { StandardFonts, degrees, rgb } from "./lib/pdf-lib.esm.min.js";

export function label(n, total, format) {
  if (format === "dash") return `- ${n} -`;
  if (format === "n/N") return `${n} / ${total}`;
  return String(n);
}

export async function addPageNumbers(doc, { format = "n", pos = "bc", skip = 0, start = 1, size = 10.5, margin = 24 } = {}) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const numbered = Math.max(0, pages.length - skip);
  const total = start + numbered - 1;
  const done = [];
  pages.forEach((page, i) => {
    if (i < skip) return;
    const text = label(start + i - skip, total, format);
    const tw = font.widthOfTextAtSize(text, size);
    const box = page.getCropBox();
    const r = ((page.getRotation().angle % 360) + 360) % 360;
    // 見た目の幅・高さ
    const vw = r === 90 || r === 270 ? box.height : box.width;
    const vh = r === 90 || r === 270 ? box.width : box.height;
    // 見た目の座標（左下原点）で文字の始点を決める
    const vx = pos.endsWith("c") ? (vw - tw) / 2 : pos.endsWith("r") ? vw - margin - tw : margin;
    const vy = pos.startsWith("t") ? vh - margin - size : margin;
    // 見た目の座標 → ページの座標（回転を戻す）
    const [x, y] = {
      0: [vx, vy],
      90: [box.width - vy, vx],
      180: [box.width - vx, box.height - vy],
      270: [vy, box.height - vx],
    }[r];
    page.drawText(text, { x: box.x + x, y: box.y + y, size, font, color: rgb(0, 0, 0), rotate: degrees(r) });
    done.push(text);
  });
  return done;
}

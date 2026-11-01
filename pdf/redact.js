// PDFの墨消し：囲んだ所を塗りつぶし、そのページを画像にして保存する（下の文字ごと消える）。囲みのないページは元のまま。通信はしない。
import { PDFDocument } from "./lib/pdf-lib.esm.min.js";

// 保存するときの画質（1ポイント＝1/72インチに対する倍率。2.5で約180dpi）
export const SAVE_SCALE = 2.5;

// 囲み（ページ上の割合 0〜1）をキャンバスに塗る
export function paintBoxes(ctx, boxes, w, h, color) {
  ctx.fillStyle = color === "white" ? "#ffffff" : "#000000";
  for (const b of boxes) ctx.fillRect(Math.floor(b.x * w), Math.floor(b.y * h), Math.ceil(b.w * w) + 1, Math.ceil(b.h * h) + 1);
}

// pdfjsDoc：pdf.js の文書、bytes：元のPDF、marks：ページ番号(0始まり)→囲みの配列
export async function redactPdf(pdfjsDoc, bytes, marks, { color = "black", onPage } = {}) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  let redacted = 0;
  for (let i = 0; i < pdfjsDoc.numPages; i++) {
    const boxes = marks.get(i) || [];
    if (!boxes.length) {
      const [p] = await out.copyPages(src, [i]);
      out.addPage(p);
      continue;
    }
    const page = await pdfjsDoc.getPage(i + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: SAVE_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    paintBoxes(ctx, boxes, canvas.width, canvas.height, color);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const p = out.addPage([vp1.width, vp1.height]);
    p.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
    canvas.width = canvas.height = 0;
    redacted++;
    if (onPage) onPage(redacted);
  }
  // 題名・作成者などの文書情報も残さない
  out.setTitle(""); out.setAuthor(""); out.setSubject(""); out.setKeywords([]); out.setProducer(""); out.setCreator("");
  return { bytes: await out.save(), redacted };
}

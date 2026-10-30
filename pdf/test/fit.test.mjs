// node test/fit.test.mjs （web/pdf で実行）。A4そろえの大きさと向きを確かめる
import { PDFDocument, StandardFonts, degrees, rgb } from "../lib/pdf-lib.esm.min.js";
import { addPagesFitA4, A4 } from "../merge-fit.js";
import { writeFileSync } from "node:fs";

const src = await PDFDocument.create();
const font = await src.embedFont(StandardFonts.Helvetica);
const cases = [
  ["A4", 595.28, 841.89, 0, "p"], ["B5", 515.91, 728.5, 0, "p"], ["Letter", 612, 792, 0, "p"],
  ["A4 landscape", 841.89, 595.28, 0, "l"], ["A4 rot90", 595.28, 841.89, 90, "l"],
  ["A4 rot180", 595.28, 841.89, 180, "p"], ["A4 rot270", 595.28, 841.89, 270, "l"], ["receipt", 226, 600, 0, "p"],
];
for (const [name, w, h, r] of cases) {
  const p = src.addPage([w, h]);
  p.drawRectangle({ x: 2, y: 2, width: w - 4, height: h - 4, borderColor: rgb(1, 0, 0), borderWidth: 4 });
  p.drawText("TOP " + name, { x: 20, y: h - 40, size: 20, font });
  p.setRotation(degrees(r));
}
// トリミング枠付き（中身の一部だけ見せる）
const pc = src.addPage([800, 800]); pc.setCropBox(100, 100, 400, 600); pc.drawText("CROP", { x: 120, y: 650, size: 30, font });
cases.push(["crop 400x600", 0, 0, 0, "p"]);

const out = await PDFDocument.create();
await addPagesFitA4(out, await PDFDocument.load(await src.save()));
let fail = 0;
out.getPages().forEach((p, i) => {
  const { width, height } = p.getSize();
  const want = cases[i][4] === "p" ? A4 : [A4[1], A4[0]];
  const ok = Math.abs(width - want[0]) < 0.01 && Math.abs(height - want[1]) < 0.01 && p.getRotation().angle === 0;
  if (!ok) fail++;
  console.log(ok ? "OK " : "NG ", cases[i][0], width.toFixed(1), height.toFixed(1));
});
const bytes = await out.save();
writeFileSync("test/fit_out.pdf", bytes);
writeFileSync("test/fit_src.pdf", await src.save());
console.log(fail ? `失敗 ${fail}` : `全${cases.length}件 OK`, (bytes.length / 1024).toFixed(0) + "KB");
process.exit(fail ? 1 : 0);

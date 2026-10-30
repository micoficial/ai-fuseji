// node test/nup.test.mjs （web/pdf で実行）。A4 2枚→A3横1枚の枚数・大きさを確かめる
import { PDFDocument, StandardFonts, degrees, rgb } from "../lib/pdf-lib.esm.min.js";
import { addPagesTwoUp, A3L } from "../nup.js";
import { writeFileSync } from "node:fs";

const src = await PDFDocument.create();
const font = await src.embedFont(StandardFonts.Helvetica);
const specs = [[595.28, 841.89, 0, "1 A4"], [595.28, 841.89, 0, "2 A4"], [515.91, 728.5, 0, "3 B5"], [841.89, 595.28, 0, "4 A4 land"], [595.28, 841.89, 90, "5 rot90"]];
for (const [w, h, r, name] of specs) {
  const p = src.addPage([w, h]);
  p.drawRectangle({ x: 2, y: 2, width: w - 4, height: h - 4, borderColor: rgb(1, 0, 0), borderWidth: 4 });
  p.drawText("TOP " + name, { x: 20, y: h - 40, size: 20, font });
  p.setRotation(degrees(r));
}
const loaded = await PDFDocument.load(await src.save());
let fail = 0;
for (const rtl of [false, true]) {
  const out = await PDFDocument.create();
  await addPagesTwoUp(out, loaded.getPages(), { rtl });
  const n = out.getPageCount();
  const sizesOk = out.getPages().every((p) => { const s = p.getSize(); return Math.abs(s.width - A3L[0]) < 0.01 && Math.abs(s.height - A3L[1]) < 0.01; });
  const ok = n === 3 && sizesOk;
  if (!ok) fail++;
  console.log(ok ? "OK " : "NG ", rtl ? "右→左" : "左→右", `${n}ページ`, sizesOk ? "A3横" : "大きさ違い");
  writeFileSync(`test/nup_out${rtl ? "_rtl" : ""}.pdf`, await out.save());
}
// 別々のPDFのページを混ぜても動く
{
  const other = await PDFDocument.create(); other.addPage([595.28, 841.89]);
  const out = await PDFDocument.create();
  await addPagesTwoUp(out, [...loaded.getPages(), ...(await PDFDocument.load(await other.save())).getPages()]);
  const ok = out.getPageCount() === 3;
  if (!ok) fail++;
  console.log(ok ? "OK " : "NG ", "2つのPDFを混ぜる", out.getPageCount() + "ページ");
}
console.log(fail ? `失敗 ${fail}` : "全3件 OK");
process.exit(fail ? 1 : 0);

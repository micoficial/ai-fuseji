// node test/pagenum.test.mjs （web/pdf で実行）。番号の中身・飛ばし・開始番号・回転ページで壊れないかを確かめる
import { PDFDocument, degrees } from "../lib/pdf-lib.esm.min.js";
import { addPageNumbers, label } from "../pagenum.js";
import { writeFileSync } from "node:fs";

let fail = 0;
const check = (ok, name, got) => { if (!ok) fail++; console.log(ok ? "OK " : "NG ", name, got ?? ""); };

async function sample() {
  const src = await PDFDocument.create();
  for (const [w, h, r] of [[595.28, 841.89, 0], [595.28, 841.89, 90], [841.89, 595.28, 0], [595.28, 841.89, 180], [595.28, 841.89, 270]]) {
    src.addPage([w, h]).setRotation(degrees(r));
  }
  return PDFDocument.load(await src.save());
}

check(label(3, 10, "n") === "3" && label(3, 10, "dash") === "- 3 -" && label(3, 10, "n/N") === "3 / 10", "書式3通り");

{
  const doc = await sample();
  const got = await addPageNumbers(doc, { format: "n/N" });
  check(got.join(",") === "1 / 5,2 / 5,3 / 5,4 / 5,5 / 5", "全ページに n/N", got.join(","));
  const bytes = await doc.save();
  writeFileSync("test/pagenum_out.pdf", bytes);
  const again = await PDFDocument.load(bytes);
  check(again.getPageCount() === 5, "保存して読み直せる");
}
{
  const doc = await sample();
  const got = await addPageNumbers(doc, { skip: 1, start: 1, format: "dash", pos: "br" });
  check(got.join(",") === "- 1 -,- 2 -,- 3 -,- 4 -", "表紙を飛ばして1から", got.join(","));
}
{
  const doc = await sample();
  const got = await addPageNumbers(doc, { skip: 2, start: 5, format: "n/N", pos: "tc" });
  check(got.join(",") === "5 / 7,6 / 7,7 / 7", "途中から5番で始める", got.join(","));
}
{
  const doc = await sample();
  const got = await addPageNumbers(doc, { skip: 9 });
  check(got.length === 0, "飛ばす数がページ数より多い");
}
console.log(fail ? `失敗 ${fail}` : "全5件 OK");
process.exit(fail ? 1 : 0);

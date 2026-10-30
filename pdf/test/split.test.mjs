// node test/split.test.mjs （web/pdf で実行）。分け方の読み取りと、分けたPDFのページが正しいかを確かめる
import { PDFDocument, rgb } from "../lib/pdf-lib.esm.min.js";
import { planSplit, splitPdf, suffix } from "../split.js";

let fail = 0;
const check = (ok, name, got) => { if (!ok) fail++; console.log(ok ? "OK " : "NG ", name, got ?? ""); };
const s = (p) => JSON.stringify(p);

check(s(planSplit(3, { mode: "each" })) === "[[0],[1],[2]]", "1ページずつ");
check(s(planSplit(7, { mode: "every", n: 3 })) === "[[0,1,2],[3,4,5],[6]]", "3ページごと・端数", s(planSplit(7, { mode: "every", n: 3 })));
check(s(planSplit(7, { mode: "every", n: "x" })).startsWith("[[0],[1]"), "nが不正なら1ページずつ");
check(s(planSplit(8, { mode: "groups", spec: "1-3 / 4-6／7-" })) === "[[0,1,2],[3,4,5],[6,7]]", "範囲ごと（半角・全角の/、7-は最後まで）", s(planSplit(8, { mode: "groups", spec: "1-3 / 4-6／7-" })));
check(s(planSplit(5, { mode: "groups", spec: "9 / 2" })) === "[[1]]", "範囲外のまとまりは捨てる");
check(s(planSplit(10, { mode: "extract", spec: "２、５-６" })) === "[[1,4,5]]", "抜き出し（全角）", s(planSplit(10, { mode: "extract", spec: "２、５-６" })));
check(s(planSplit(10, { mode: "extract", spec: "" })) === "[]", "抜き出しで空欄は何もしない（全ページの写しを作らない）");
check(suffix([1, 2, 3]) === "_p1-3" && suffix([2, 5, 6]) === "_p2,5-6", "ファイル名", suffix([2, 5, 6]));

{
  const src = await PDFDocument.create();
  for (let i = 0; i < 5; i++) {
    const pg = src.addPage([200 + i * 10, 300]);
    pg.drawRectangle({ x: 10, y: 10, width: 20, height: 20, color: rgb(0, 0, 0) });
  }
  const bytes = await src.save();
  const parts = await splitPdf(bytes, planSplit(5, { mode: "groups", spec: "1-2/3/4-5" }));
  const widths = [];
  for (const p of parts) widths.push((await PDFDocument.load(p.bytes)).getPages().map((x) => x.getWidth()).join("+"));
  check(widths.join(" | ") === "200+210 | 220 | 230+240", "分けたPDFのページが元の順で入る", widths.join(" | "));
  check(s(parts.map((p) => p.pages)) === "[[1,2],[3],[4,5]]", "返すページ番号は1始まり");
}
console.log(fail ? `NG ${fail}件` : "すべて通過");
process.exit(fail ? 1 : 0);

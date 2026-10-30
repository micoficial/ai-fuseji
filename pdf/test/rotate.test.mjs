// node test/rotate.test.mjs （web/pdf で実行）。ページ指定の読み取りと、回転が保存に残るかを確かめる
import { PDFDocument, degrees } from "../lib/pdf-lib.esm.min.js";
import { parseRange, rotatePages } from "../rotate.js";

let fail = 0;
const check = (ok, name, got) => { if (!ok) fail++; console.log(ok ? "OK " : "NG ", name, got ?? ""); };

check(parseRange("", 3).join() === "0,1,2", "空は全ページ");
check(parseRange("2,4-6", 10).join() === "1,3,4,5", "2,4-6", parseRange("2,4-6", 10).join());
check(parseRange("２、４〜５", 10).join() === "1,3,4", "全角・読点・波線", parseRange("２、４〜５", 10).join());
check(parseRange("3-", 5).join() === "2,3,4", "3- は最後まで", parseRange("3-", 5).join());
check(parseRange("0,9,abc,6-4", 7).join() === "3,4,5", "範囲外と不正は無視・逆順も可", parseRange("0,9,abc,6-4", 7).join());

async function sample() {
  const src = await PDFDocument.create();
  for (const r of [0, 90, 0, 270]) src.addPage([595.28, 841.89]).setRotation(degrees(r));
  return PDFDocument.load(await src.save());
}
{
  const doc = await sample();
  const got = rotatePages(doc, { angle: 90 });
  const again = await PDFDocument.load(await doc.save());
  const r = again.getPages().map((p) => p.getRotation().angle).join();
  check(got.join() === "1,2,3,4" && r === "90,180,90,0", "全ページ右へ90°（今の向きに足す）が保存に残る", r);
}
{
  const doc = await sample();
  const got = rotatePages(doc, { angle: 270, pages: "2,4" });
  const r = doc.getPages().map((p) => p.getRotation().angle).join();
  check(got.join() === "2,4" && r === "0,0,0,180", "指定ページだけ左へ90°", r);
}
{
  const doc = await sample();
  rotatePages(doc, { angle: 180, pages: "1" });
  const r = doc.getPages().map((p) => p.getRotation().angle).join();
  check(r === "180,90,0,270", "180°（上下逆の直し）", r);
}
console.log(fail ? `NG ${fail}件` : "すべてOK");
process.exit(fail ? 1 : 0);

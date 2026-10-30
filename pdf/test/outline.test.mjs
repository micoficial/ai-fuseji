// node test/outline.test.mjs （web/pdf で実行）。しおりの数・名前（日本語）・飛び先のページが正しいかを確かめる
import { PDFDocument, PDFName, PDFHexString } from "../lib/pdf-lib.esm.min.js";
import { addOutline, titleOf } from "../outline.js";
import { writeFileSync } from "node:fs";

let fail = 0;
const check = (ok, name, got) => { if (!ok) fail++; console.log(ok ? "OK " : "NG ", name, got ?? ""); };

check(titleOf("見積書_2026.PDF") === "見積書_2026" && titleOf(".pdf") === "無題", "ファイル名から .pdf を除く");

const out = await PDFDocument.create();
for (const n of [2, 1, 3]) for (let i = 0; i < n; i++) out.addPage([595.28, 841.89]);
const entries = [{ title: "見積書", pageIndex: 0 }, { title: "契約書（控え）", pageIndex: 2 }, { title: "Invoice A", pageIndex: 3 }];
check(addOutline(out, entries) === 3, "しおり3つ");
const bytes = await out.save();
writeFileSync("test/outline_out.pdf", bytes);

const doc = await PDFDocument.load(bytes);
const ol = doc.catalog.lookup(PDFName.of("Outlines"));
check(ol && ol.lookup(PDFName.of("Count")).asNumber() === 3, "読み直しても Outlines がある");
check(doc.catalog.lookup(PDFName.of("PageMode")).toString() === "/UseOutlines", "開くとしおり欄が出る");
const pageRefs = doc.getPages().map((p) => p.ref.toString());
let item = ol.lookup(PDFName.of("First"));
const got = [];
while (item) {
  const t = item.lookup(PDFName.of("Title"), PDFHexString).decodeText();
  const dest = item.lookup(PDFName.of("Dest"));
  got.push(`${t}@${pageRefs.indexOf(dest.get(0).toString())}`);
  item = item.lookup(PDFName.of("Next"));
}
check(got.join(",") === "見積書@0,契約書（控え）@2,Invoice A@3", "名前と飛び先", got.join(","));
check(addOutline(await PDFDocument.create(), []) === 0, "空なら何もしない");

console.log(fail ? `NG ${fail}` : "ALL OK");
process.exit(fail ? 1 : 0);

// 結合したPDFに「しおり（目次）」を足す。1ファイル＝1つのしおり、名前はファイル名（.pdf を除く）、押すとそのファイルの1ページ目へ
// entries: [{ title, pageIndex }]。開いたときにしおりの欄が出るようにする（PageMode UseOutlines）
import { PDFName, PDFHexString } from "./lib/pdf-lib.esm.min.js";

export const titleOf = (name) => String(name).replace(/\.pdf$/i, "").trim() || "無題";

export function addOutline(doc, entries) {
  if (!entries.length) return 0;
  const ctx = doc.context;
  const pages = doc.getPages();
  const root = ctx.nextRef();
  const refs = entries.map(() => ctx.nextRef());
  entries.forEach((e, i) => {
    const d = { Title: PDFHexString.fromText(e.title), Parent: root, Dest: [pages[e.pageIndex].ref, "Fit"] };
    if (i > 0) d.Prev = refs[i - 1];
    if (i < refs.length - 1) d.Next = refs[i + 1];
    ctx.assign(refs[i], ctx.obj(d));
  });
  ctx.assign(root, ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: refs.length }));
  doc.catalog.set(PDFName.of("Outlines"), root);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
  return refs.length;
}

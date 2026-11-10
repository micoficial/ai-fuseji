// Excel（.xlsx）の最初のシートを、行の配列として読む。ブラウザの中だけで展開する（外部には何も送らない）。
// .xlsx は zip の中に XML が入った形。DecompressionStream("deflate-raw") で展開する。

async function inflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// zip の中央ディレクトリを読んで、名前 → 中身（Uint8Array）を返す関数を作る
function unzip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Excel のファイルとして読めませんでした");
  const n = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const entries = {};
  const td = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
    const off = v.getUint32(p + 42, true);
    entries[td.decode(buf.subarray(p + 46, p + 46 + nl))] = { method, size, off };
    p += 46 + nl + el + cl;
  }
  return async (name) => {
    const e = entries[name];
    if (!e) return null;
    const start = e.off + 30 + v.getUint16(e.off + 26, true) + v.getUint16(e.off + 28, true);
    const raw = buf.subarray(start, start + e.size);
    const out = e.method === 0 ? raw : await inflate(raw);
    return td.decode(out);
  };
}

const ent = (s) => s.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, (m, c) =>
  ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[c.toLowerCase()] ??
  String.fromCodePoint(c[1].toLowerCase() === "x" ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)));

// <t> の文字だけをつなぐ。ふりがな（<rPh>）は除く
const texts = (xml) => ent((xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join(""));

const colNum = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

function dateFormats(styles) {
  if (!styles) return [];
  const custom = {};
  for (const m of styles.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom[m[1]] = ent(m[2]);
  const xfs = (styles.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/) || [""])[0];
  return [...xfs.matchAll(/<xf\b[^>]*>/g)].map(([x]) => {
    const id = +(x.match(/numFmtId="(\d+)"/) || [0, 0])[1];
    if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return true;
    const code = (custom[id] || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
    return /[yd]|ge|e/i.test(code) && !/^[#0.,%]+$/.test(code);
  });
}

function serialToDate(x) {
  const ms = Math.round((x - 25569) * 86400000);
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  const day = `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`;
  return x % 1 ? `${day} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : day;
}

export function isXlsx(bytes) { return bytes[0] === 0x50 && bytes[1] === 0x4b; }

export async function readXlsx(bytes) {
  const get = unzip(bytes);
  const wb = await get("xl/workbook.xml");
  if (!wb) throw new Error("Excel（.xlsx）のファイルとして読めませんでした");
  const first = wb.match(/<sheet\b[^>]*>/);
  const sheetName = first ? ent((first[0].match(/name="([^"]*)"/) || [0, ""])[1]) : "";
  const rid = first && (first[0].match(/r:id="([^"]+)"/) || [])[1];
  let path = "xl/worksheets/sheet1.xml";
  const rels = await get("xl/_rels/workbook.xml.rels");
  if (rid && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`));
    const target = rel && (rel.match(/Target="([^"]+)"/) || [])[1];
    if (target) path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  }
  const sst = await get("xl/sharedStrings.xml");
  const strings = sst ? (sst.match(/<si\b[\s\S]*?<\/si>/g) || []).map(texts) : [];
  const isDate = dateFormats(await get("xl/styles.xml"));
  const sheet = await get(path);
  if (!sheet) throw new Error("シートが見つかりませんでした");
  const rows = [];
  for (const rm of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const attrs = rm[1] || rm[3] || "";
    const r = +((attrs.match(/\br="(\d+)"/) || [])[1] || rows.length + 1) - 1;
    const row = [];
    for (const cm of (rm[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = cm[1], body = cm[2] || "";
      const ref = (a.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const c = ref ? colNum(ref) : row.length;
      const t = (a.match(/\bt="(\w+)"/) || [])[1];
      const s = +((a.match(/\bs="(\d+)"/) || [])[1] || 0);
      const vm = body.match(/<v>([\s\S]*?)<\/v>/);
      let val = "";
      if (t === "s") val = vm ? strings[+vm[1]] ?? "" : "";
      else if (t === "inlineStr") val = texts(body);
      else if (t === "b") val = vm ? (vm[1] === "1" ? "TRUE" : "FALSE") : "";
      else if (vm) val = ent(vm[1]);
      if ((!t || t === "n") && val !== "" && isDate[s]) val = serialToDate(+val);
      row[c] = val;
    }
    rows[r] = Array.from(row, (x) => x ?? "");
  }
  const out = Array.from(rows, (x) => x ?? []);
  while (out.length && out[out.length - 1].every((x) => x === "")) out.pop();
  const width = Math.max(0, ...out.map((r) => r.length));
  return { rows: out.map((r) => [...r, ...Array(width - r.length).fill("")]), sheetName };
}

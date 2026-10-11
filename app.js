// 体験ページ：拡張機能と同じ判定（mask.js）を、ページの中だけで動かす。文章はどこにも送らない。
import { mask, restore, splitTokens } from "./mask.js";

const STORE_URL = "https://chromewebstore.google.com/detail/clhnanhhikamfccidiibgbbfhnkgefjo";
const STORE_LIVE = false; // ストアの審査に通ったら true にする
const $ = (id) => document.getElementById(id);
let ignore = [];
let current = { map: {} };
let last = null;

const SAMPLE = `株式会社サンプル商事
営業部 山田太郎様

いつもお世話になっております。合同会社ミコの佐藤です。
お客様の鈴木花子さん（生年月日：1985年4月12日）の契約更新について、
文面の作成をお願いします。
送付先：東京都千代田区丸の内1-2-3 サンプルビル5F
電話：03-1234-5678 ／ メール：hanako.suzuki@example.co.jp`;

let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

function showTab(name) {
  for (const b of document.querySelectorAll(".tab")) b.classList.toggle("on", b.dataset.tab === name);
  $("paneMask").hidden = name !== "mask";
  $("paneRestore").hidden = name !== "restore";
  if (name === "restore") renderRestore();
}
for (const b of document.querySelectorAll(".tab")) b.addEventListener("click", () => showTab(b.dataset.tab));

function words() {
  return $("words").value.split(/[、,，\n]/).map((w) => w.trim()).filter(Boolean);
}

function renderMask() {
  const src = $("src").value;
  const r = mask(src, { words: words(), ignore });
  last = r;
  const out = $("out");
  out.textContent = "";
  for (const p of splitTokens(r.masked, r.map)) {
    if (p.token) {
      const m = document.createElement("mark");
      m.className = "tok";
      m.textContent = p.text;
      m.title = p.original;
      out.append(m);
    } else out.append(p.text);
  }
  const total = r.items.reduce((n, i) => n + i.count, 0);
  $("maskCount").textContent = !src.trim() ? "" : total ? `（${total} か所）` : "（見つかりませんでした）";
  $("copyMasked").disabled = !src.trim();
  const ul = $("items");
  ul.textContent = "";
  for (const it of r.items) {
    const li = document.createElement("li");
    const tok = document.createElement("mark");
    tok.className = "tok";
    tok.textContent = it.token;
    const orig = document.createElement("span");
    orig.className = "orig";
    orig.textContent = it.text + (it.count > 1 ? ` ×${it.count}` : "");
    const skip = document.createElement("button");
    skip.className = "skip";
    skip.textContent = "伏せない";
    skip.addEventListener("click", () => { ignore.push(it.text); renderMask(); });
    li.append(tok, orig, skip);
    ul.append(li);
  }
  if (src.trim()) current = { map: r.map };
}

function renderRestore() {
  const ai = $("ai").value;
  const marked = {};
  for (const [k, v] of Object.entries(current.map)) marked[k] = "\u0001" + v + "\u0002";
  const r = restore(ai, marked);
  const out = $("restored");
  out.textContent = "";
  for (const [i, part] of r.text.split(/[\u0001\u0002]/).entries()) {
    if (i % 2) {
      const m = document.createElement("mark");
      m.className = "back";
      m.textContent = part;
      out.append(m);
    } else out.append(part);
  }
  $("restoreCount").textContent = !ai.trim() ? "" : !Object.keys(current.map).length ? "（先に「1 伏せる」で文章を伏せ字にしてください）" : `（${r.replaced} か所）`;
  $("copyRestored").disabled = !ai.trim();
}

$("src").addEventListener("input", renderMask);
$("words").addEventListener("input", renderMask);
$("ai").addEventListener("input", renderRestore);
$("sample").addEventListener("click", () => { $("src").value = SAMPLE; renderMask(); });
$("copyMasked").addEventListener("click", async () => {
  await navigator.clipboard.writeText(last.masked);
  toast("コピーしました。AIに貼り付けてください");
});
$("copyRestored").addEventListener("click", async () => {
  await navigator.clipboard.writeText(restore($("ai").value, current.map).text);
  toast("コピーしました");
});

// ストアの審査が終わるまでは、拡張機能へのリンクを「準備中」にする
for (const id of ["storeLink", "storeLink2"]) {
  if (STORE_LIVE) $(id).href = STORE_URL;
}
if (!STORE_LIVE) {
  $("storeLink2").removeAttribute("href");
  $("storeLink2").textContent = "Chromeウェブストア（審査中）";
  $("storeNote").textContent = "拡張機能は現在、Chromeウェブストアの審査中です。公開されたら、ここから入れられるようになります。";
}

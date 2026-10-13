// 読み取った文字の整え方（純粋な関数。単体テストあり）

// 日本語の文字（ひらがな、カタカナ、漢字、全角の記号・英数字）
const JA = "\\u3000-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef";
const JA_RE = new RegExp(`[${JA}]`);
const BETWEEN_JA = new RegExp(`(?<=[${JA}])[ \\t]+(?=[${JA}])`, "g");
const JA_NUM = new RegExp(`(?<=[${JA}])[ \\t]+(?=[0-9])|(?<=[0-9])[ \\t]+(?=[${JA}])`, "g");

// OCRは日本語の文字の間に空白を入れてしまう。日本語どうし、日本語と数字の間の空白を消す
export function removeJaSpaces(text) {
  return text
    .split("\n")
    .map((line) => line.replace(BETWEEN_JA, "").replace(JA_NUM, "").replace(/[ \t]+$/, ""))
    .join("\n");
}

// 段落の途中の改行をつなげる。空行は段落の区切りとして残す。
// 日本語の行はそのままつなぎ、英語の行は空白でつなぐ（行末のハイフンは単語をつなぐ）
export function joinLines(text) {
  return text
    .split(/\n[ \t]*\n+/)
    .map((para) => {
      let out = "";
      for (const line of para.split("\n").map((l) => l.trim()).filter(Boolean)) {
        if (!out) out = line;
        else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(line)) out = out.slice(0, -1) + line;
        else if (JA_RE.test(out.slice(-1)) || JA_RE.test(line[0])) out += line;
        else out += " " + line;
      }
      return out;
    })
    .filter(Boolean)
    .join("\n\n");
}

// 全角の英数字・記号・空白を半角にする（カタカナはそのまま）
export function toHalfWidth(text) {
  return text.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");
}

export function clean(text, { join = false, half = false } = {}) {
  let t = removeJaSpaces(text.replace(/\r\n?/g, "\n")).replace(/\n{3,}/g, "\n\n").trim();
  if (join) t = joinLines(t);
  if (half) t = toHalfWidth(t);
  return t;
}

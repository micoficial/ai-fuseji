// 文章の中から個人情報などを見つけて、[氏名1] のような伏せ字に置き換える。AIの答えを元に戻す（restore）こともできる。
// すべてこのPCの中で処理する。外部には何も送らない。

const D = "[0-9０-９]";
const H = "[-‐‑–－―−ー]";
const SP = "[ \\t　]";
const NUM = `(?:${D}+|[一二三四五六七八九十〇]+)`;
const toHalf = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const digitsOf = (s) => toHalf(s).replace(/\D/g, "");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const LABELS = {
  ja: { name: "氏名", company: "会社", email: "メール", phone: "電話", postal: "郵便番号", address: "住所", mynumber: "マイナンバー", card: "カード番号", account: "口座番号", birth: "生年月日", word: "名称", money: "金額", date: "日付", url: "URL", ip: "IP", idnum: "管理番号", secret: "パスワード" },
  en: { name: "NAME", company: "COMPANY", email: "EMAIL", phone: "PHONE", postal: "ZIP", address: "ADDRESS", mynumber: "MYNUMBER", card: "CARD", account: "ACCOUNT", birth: "BIRTHDATE", word: "TERM", money: "AMOUNT", date: "DATE", url: "URL", ip: "IP", idnum: "ID", secret: "SECRET" },
};

// Pro版でだけ使える種類
export const PRO_KINDS = ["money", "date", "url", "ip"];

export function luhn(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// マイナンバー（12桁）の検査用数字
export function myNumberOk(num) {
  if (!/^\d{12}$/.test(num)) return false;
  const p = num.slice(0, 11).split("").reverse().map(Number);
  let s = 0;
  for (let n = 1; n <= 11; n++) s += p[n - 1] * (n <= 6 ? n + 1 : n - 5);
  const r = s % 11;
  return (r <= 1 ? 0 : 11 - r) === Number(num[11]);
}

// ---------- 氏名の判定に使う言葉 ----------
const HONORIFIC = "様|さま|さん|氏|殿|先生|くん|君|ちゃん|副社長|社長|会長|部長|課長|係長|専務|常務|取締役|主任|店長|院長|准教授|教授|弁護士|税理士|会計士|司法書士|医師|看護師";
const ROLE_TAIL = /(副社長|社長|会長|部長|課長|係長|専務|常務|取締役|主任|店長|院長|教授|先生|代表)$/;
// 人の名前ではない言葉（「お客様」「皆さん」など）
const NOT_NAME = new Set(("客 皆 皆々 奥 子 親御 神 王 仏 殿 先方 相手 貴方 貴殿 各位 家族 ご家族 生徒 学生 児童 先輩 後輩 同僚 上司 部下 担当 ご担当 店員 父 母 兄 姉 弟 妹 祖父 祖母 娘 息子 旦那 嫁 主人 夫 妻 彼 彼女 方 皆様 " +
  "社長 会長 部長 課長 係長 専務 常務 主任 店長 院長 教授 先生 医師 代表 患者 本人 当人 御社 貴社 弊社 当社 先様 お隣 隣 近所 大家 管理人 " +
  "ユーザー ユーザ オーナー メンバー ゲスト クライアント スタッフ パートナー ドライバー ホスト ママ パパ ベビー キッズ ファン サポーター リーダー マネージャー マネジャー オペレーター カスタマー エンジニア デザイナー バイヤー セラー ショップ ストア チーム グループ ナース ドクター ボス サンタ ワーカー オーディエンス フォロワー リスナー ゲスト様").split(" "));
const NOT_NAME_TAIL = /[者員客方達側社部課局室所店会院科団体陣層生家族様]$/;
// よくある名字（上位およそ200）。名前だけの行（メールの署名など）を見つけるのに使う。長いものから並べる
const SURNAMES = ("佐々木 長谷川 五十嵐 久保田 大久保 佐藤 鈴木 高橋 田中 伊藤 渡辺 渡邊 山本 中村 小林 加藤 吉田 山田 山口 松本 井上 木村 斎藤 斉藤 清水 山崎 池田 橋本 阿部 石川 山下 中島 石井 小川 前田 岡田 藤田 後藤 近藤 村上 遠藤 青木 坂本 福田 太田 西村 藤井 金子 岡本 藤原 中野 三浦 原田 中川 松田 竹内 小野 田村 中山 和田 石田 森田 上田 内田 柴田 酒井 宮崎 横山 高木 安藤 宮本 大野 小島 谷口 工藤 今井 高田 増田 丸山 杉山 村田 大塚 新井 小山 平野 藤本 河野 上野 野口 武田 松井 千葉 岩崎 菅原 木下 佐野 野村 松尾 菊地 杉本 市川 古川 大西 島田 水野 桜井 高野 渡部 吉川 山内 西田 飯田 菊池 西川 小松 北村 安田 川口 平田 中田 服部 岩田 土屋 川崎 福島 本田 樋口 秋山 田口 永井 山中 中西 吉村 川上 大石 須藤 荒木 星野 松岡 大橋 浅野 内藤 小池 川村 松下 熊谷 片山 桑原 早川 中尾 大谷 宮田 宮下 吉岡 小西 黒田 竹田 堀田 南 林 森 原 関 東 辻 堀 西 北 平井 西山 松村 吉野 大川 浜田 坂口 富田 上原 北川 細川 小澤 小沢 武藤 戸田 秋元 内山 竹中 青山 森本 菅野 吉井 根本 塚本 久保 石原 稲葉 大島 篠原 三宅 望月 栗原 宇野 高山").split(" ").sort((a, b) => b.length - a.length).join("|");
// 名字の一覧にそのまま載っている名前（中村、木村、野村など）は、地名・店名の終わり方でも名前として扱う
const SURNAME_SET = new Set(SURNAMES.split("|"));
const notPlace = (t) => SURNAME_SET.has(t) || !/[屋店堂亭庵館社院科園会局課部室所町村市区県]$/.test(t);

// 会社名の前についてしまいがちな言葉
const LEAD_WORDS = /^(先日|本日|今日|昨日|明日|来週|今週|先週|来月|今月|先月|今回|前回|次回|弊社|当社|御社|貴社|現在|以前|今後|元|旧|新|同)/;

const LEGAL = "(?:株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|社会福祉法人|医療法人社団|医療法人財団|医療法人|学校法人|宗教法人|特定非営利活動法人|NPO法人|税理士法人|弁護士法人|司法書士法人|行政書士法人|監査法人|[(（]株[)）]|㈱|[(（]有[)）]|㈲|[(（]同[)）])";
const CO_CH = "[一-龥々〆ヶヵァ-ヶーA-Za-zＡ-Ｚａ-ｚ0-9０-９&＆・.．'’]";
const CO_NAME = `(?:${CO_CH}|${SP}(?=[A-Za-z]))`;
const PREF = "(?:北海道|東京都|京都府|大阪府|(?:青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄)県)";
const BLK = `${NUM}(?:${SP}?(?:丁目|番地|番|号|${H}|の)${SP}?${NUM})*(?:丁目|番地|番|号)?`;
const BUILDING = `(?:${SP}?[A-Za-zＡ-Ｚａ-ｚァ-ヶー一-龥々・]{2,24}${SP}?${D}{1,4}(?:号室|号|F|Ｆ|階)?)?`;
const DSEP = "[/／.．‐‑–－―−ー-]";
const DATE_BODY = `(?:(?:明治|大正|昭和|平成|令和)?(?:${D}{1,4}|元)年${SP}?${D}{1,2}月${SP}?${D}{1,2}日|(?:[MTSHR]${D}{1,2}|${D}{4})${DSEP}${D}{1,2}${DSEP}${D}{1,2})`;

// 名前の前についた部署名などを外す（「営業部山田」→「山田」）、後ろの役職を外す（「田中社長」→「田中」）
function fixName(text) {
  let start = 0, t = text;
  // 前に付いた部署名や「担当」「ご担当」などを外す（「総務部 山田」「ご担当 高橋」→ 名前だけ）
  const sp = t.match(/^(\S*[部課室局社店所会院科]|ご?担当者?|窓口|宛先|宛て)[ 　]+(.+)$/u);
  if (sp) { start = t.length - sp[2].length; t = sp[2]; }
  const m = t.match(/^(.*[部課室局社店所会院科])(.{2,})$/u);
  if (m && /^[一-龥々ヶ]+$/u.test(t) && t.length > 4) { start += m[1].length; t = m[2]; }
  const r = t.match(ROLE_TAIL);
  if (r && t.length - r[0].length >= 1) t = t.slice(0, -r[0].length);
  t = t.replace(/[ 　]+$/, "");
  if (!t || NOT_NAME.has(t) || NOT_NAME.has(t.replace(/^[おご]/, "")) || NOT_NAME_TAIL.test(t)) return null;
  return { offset: start, text: t };
}
function fixCompany(text) {
  let t = text.replace(/(様|御中|殿|さま)$/u, "");
  let offset = 0;
  const lead = t.match(LEAD_WORDS);
  if (lead && t.length - lead[0].length >= 4) { offset = lead[0].length; t = t.slice(offset); }
  t = t.replace(/[ 　.．・]+$/, "");
  return t.length >= 3 ? { offset, text: t } : null;
}

// 検出のルール。上にあるものほど優先する（重なったら上を採る）
const RULES = [
  // パスワード・APIキー：ラベルの後ろの値と、よく知られたキーの形
  { kind: "secret", re: new RegExp(`(?<![A-Za-z])(?:パスワード|パスコード|暗証番号|ログインPW|PW|Password|password|PASSWORD|passwd|APIキー|API[ _]?[Kk]ey|アクセスキー|シークレット|[Ss]ecret|トークン|[Tt]oken)${SP}*(?:は|[：:=＝])${SP}*([!-~]{4,80})`, "gd"), group: 1, fix: (t) => { const offset = t.match(/^["'(]*/)[0].length; const v = t.slice(offset).replace(/[.,;:)\]}>'"]+$/, ""); return v.length >= 4 && (/[^A-Za-z]/.test(v) || v.length >= 8) ? { offset, text: v } : null; } },
  { kind: "secret", re: /(?<![A-Za-z0-9_-])(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20})/g },
  // 保険証・年金の番号：「被保険者番号：12345678」「保険証 記号12 番号3456 枝番01」。電話の形より先に見る（介護保険の10桁を電話と取り違えないため）
  { kind: "idnum", re: new RegExp(`(?:被保険者証番号|被保険者番号|保険者番号|保険証番号|受給者証番号|受給者番号|公費負担者番号|基礎年金番号|年金番号)${SP}*[：:]?${SP}*([A-Za-zＡ-Ｚａ-ｚ0-9０-９][A-Za-zＡ-Ｚａ-ｚ0-9０-９\\-－]{2,19})`, "gd"), group: 1 },
  { kind: "idnum", re: new RegExp(`(?<=(?:保険証|被保険者証|資格確認書)[^\\n]{0,30}?)(?:記号|番号|枝番)${SP}*[：:]?${SP}*([A-Za-zＡ-Ｚａ-ｚ0-9０-９][A-Za-zＡ-Ｚａ-ｚ0-9０-９\\-－]{0,19})`, "gd"), group: 1 },
  { kind: "idnum", re: new RegExp(`記号${SP}*[・･/／]${SP}*番号${SP}*[：:]?${SP}*([A-Za-zＡ-Ｚａ-ｚ0-9０-９][A-Za-zＡ-Ｚａ-ｚ0-9０-９\\-－・･ 　]{1,25}[A-Za-zＡ-Ｚａ-ｚ0-9０-９])`, "gd"), group: 1 },
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g },
  { kind: "url", re: /https?:\/\/[^\s「」『』（）()<>"'、。]+/g },
  { kind: "card", re: new RegExp(`(?<!${D})${D}(?:[ \\-－]?${D}){12,18}(?!${D})`, "g"),
    check: (t) => { const d = digitsOf(t); return d.length >= 13 && d.length <= 19 && !/^(\d)\1+$/.test(d) && luhn(d); } },
  { kind: "mynumber", re: new RegExp(`(?:マイナンバー|個人番号)${SP}*[：:]?${SP}*(${D}{4}${SP}?${H}?${SP}?${D}{4}${SP}?${H}?${SP}?${D}{4})(?!${D})`, "gd"), group: 1 },
  { kind: "mynumber", re: new RegExp(`(?<!${D})${D}{4}[ \\-－]?${D}{4}[ \\-－]?${D}{4}(?!${D})`, "g"), check: (t) => myNumberOk(digitsOf(t)) },
  { kind: "phone", re: new RegExp(`(?:\\+|＋)(?:81|８１)${SP}?${H}?${SP}?[(（]?${D}{1,4}[)）]?${SP}?${H}?${SP}?${D}{1,4}${SP}?${H}?${SP}?${D}{3,4}(?!${D})`, "g"),
    check: (t) => { const n = digitsOf(t).length; return n >= 11 && n <= 12; } },
  { kind: "phone", re: new RegExp(`(?<!${D})(?:[(（][0０]${D}{1,4}[)）]|[0０]${D}{1,4}[)）]?)${SP}?(?:${H}${SP}?)?${D}{1,4}${SP}?(?:${H}${SP}?)?${D}{3,4}(?!${D})`, "g"),
    check: (t) => { const n = digitsOf(t).length; return n >= 10 && n <= 11; } },
  { kind: "postal", re: new RegExp(`〒${SP}?${D}{3}${H}?${D}{4}(?!${D})`, "g") },
  { kind: "postal", re: new RegExp(`(?<!${D}|${H})${D}{3}${H}${D}{4}(?!${D}|${H})`, "g") },
  { kind: "account", re: new RegExp(`(?:口座番号|口座|普通預金|当座預金|普通|当座)${SP}*[：:]?${SP}*(?:No\\.?|№)?${SP}*(${D}{6,8})(?!${D})`, "gd"), group: 1 },
  { kind: "account", re: new RegExp(`(?<!${D})[1１]${D}{4}${H}${D}{8}(?!${D})`, "g") },
  { kind: "address", re: new RegExp(`(?:住所|所在地|送付先|お届け先|届け先|現住所|居所)${SP}*[：:]${SP}*([^\\n]{4,60}?)(?=\\n|$|${SP}{2}|[、。，,]|TEL|Tel|tel|電話)`, "gd"), group: 1 },
  { kind: "address", re: new RegExp(`${PREF}[一-龥々ヶヵァ-ヶー]{0,8}?[市区町村郡][一-龥々ヶヵぁ-んァ-ヶーA-Za-z]{0,20}?${BLK}${BUILDING}`, "g") },
  { kind: "address", re: new RegExp(`(?<![一-龥々ヶヵァ-ヶー])[一-龥々ヶヵァ-ヶー]{1,6}[市区町村郡](?:[一-龥々ヶヵァ-ヶー]{1,6}[区町村])?[一-龥々ヶヵぁ-んァ-ヶー]{0,12}?${NUM}(?:丁目|番地|${H})${NUM}(?:(?:番|号|${H}|の)${NUM})*号?${BUILDING}`, "g") },
  { kind: "birth", re: new RegExp(`(?:生年月日|誕生日)${SP}*[：:は]?${SP}*(${DATE_BODY})`, "gd"), group: 1 },
  // 「1985年4月3日生まれ」「S60.4.3生」のように、ラベルなしで後ろに「生まれ」が付く日付
  { kind: "birth", re: new RegExp(`(${DATE_BODY})${SP}?(?=生まれ|生(?![一-龥]))`, "gd"), group: 1 },
  { kind: "name", re: new RegExp(`(?:氏名|お名前|名前|フルネーム|担当者名?|ご担当者?|患者名?|契約者名?|申込者名?|代表者名?|宛名|依頼者名?|署名|差出人|送信者|受取人|名義人?)${SP}*[：:]${SP}*([^\\s、。，,（(：:「」]{1,10}(?:${SP}[^\\s、。，,（(：:「」\\d０-９]{1,10})?)`, "gd"), group: 1, fix: (t) => fixName(t) },
  { kind: "name", re: new RegExp(`([一-龥々ヶ]{1,8}(?:${SP}[一-龥々ヶ]{1,4})?|[ァ-ヶー]{2,10}(?:[ 　・][ァ-ヶー]{2,10})?)${SP}?(?=(?:${HONORIFIC})(?![一-龥]))`, "gd"), group: 1, fix: (t) => fixName(t) },
  // 管理番号：社員番号・会員番号・顧客番号・患者番号・カルテ番号・契約番号
  { kind: "idnum", re: new RegExp(`(?:社員番号|社員ID|会員番号|会員ID|顧客番号|顧客ID|お客様番号|患者番号|患者ID|カルテ番号|診察券番号|契約番号|受験番号|学籍番号)${SP}*[：:]?${SP}*([A-Za-zＡ-Ｚａ-ｚ0-9０-９][A-Za-zＡ-Ｚａ-ｚ0-9０-９\\-－]{2,19})`, "gd"), group: 1 },
  // 口座の名義：「カ）サンプルショウジ」「名義：ヤマダ タロウ」
  { kind: "company", re: new RegExp(`(?:カ|ユ|ド|シャ|ザイ|イ)[)）]${SP}?[ァ-ヶー]{2,}(?:${SP}[ァ-ヶー]{2,})?`, "g") },
  { kind: "name", re: new RegExp(`(?:口座名義|名義人?)${SP}*[：:]?${SP}*([ァ-ヶー]{2,}(?:${SP}[ァ-ヶー]{2,})?)`, "gd"), group: 1 },
  // チャットの発言者：「[10:02] 佐藤：」「田中: 」の行頭の名前
  { kind: "name", re: new RegExp(`(?<=^|\\n|[\\]）)]${SP}?)${SP}*((?:${SURNAMES})[一-龥々]{0,3})(?=${SP}*[：:])`, "gd"), group: 1, fix: (t) => fixName(t) },
  // カタカナの名前だけの行：「ヤマダ タロウ」（2語、それぞれ2〜4字、長音「ー」なし。「メール テンプレート」のような外来語を外すため）
  { kind: "name", re: new RegExp(`(?<=^|\\n)${SP}*([ァ-ヶ]{2,4}[ 　・][ァ-ヶ]{2,4})${SP}*(?=\\n|$)`, "gd"), group: 1, check: (t) => !NOT_NAME.has(t.split(/[ 　・]/)[0]) },
  // 英字の名前：敬称つき（Mr. John Smith）、結びのあいさつのあと（Thank you, Taro Yamada）。
  // 2語だけの行は「Best Regards」「Google Chrome」と区別できないので見ない
  { kind: "name", re: /\b(?:Mr|Ms|Mrs|Miss|Dr|Prof)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/dg, group: 1 },
  { kind: "name", re: /(?:Regards|regards|Thanks|thanks|Thank you|thank you|Sincerely|sincerely|Best|Cheers),?\s+([A-Z][a-z]+\s+[A-Z][a-z]+)(?=\s*(?:\n|$))/dg, group: 1 },
  // 署名の行末の名字：「合同会社ミコ 佐藤」「営業部 佐藤一郎」（空白のあと、行の終わりに名字）
  { kind: "name", re: new RegExp(`(?<=[^\\s][ 　]+)((?:${SURNAMES})[一-龥々]{0,3})(?=[ 　]*(?:\\n|$))`, "gd"), group: 1, check: (t) => notPlace(t) },
  // 名前だけの行（メールの署名など）：よくある名字で始まる「鈴木一郎」「鈴木 一郎」だけの行
  { kind: "name", re: new RegExp(`(?<=^|\\n)${SP}*((?:${SURNAMES})(?:${SP}?[一-龥々]{1,3})?)${SP}*(?=\\n|$)`, "gd"), group: 1, check: (t) => [...t.replace(/[ 　]/g, "")].length >= 3 && notPlace(t) },
  // メールの名乗り：「合同会社ミコの佐藤です」「営業部の佐藤と申します」
  { kind: "name", re: new RegExp(`(?:${LEGAL}${CO_NAME}{1,24}|${CO_CH}{1,20}${LEGAL}|[部課室局店]|チーム)の${SP}?([一-龥々ヶ]{1,4})(?=です|と申します|でございます)`, "gd"), group: 1, fix: (t) => fixName(t) },
  { kind: "name", re: new RegExp(`(?<=^|\\n|。|、)${SP}*([一-龥々ヶ]{1,4})(?=と申します|でございます)`, "gd"), group: 1, fix: (t) => fixName(t) },
  // 「株式会社みどり商事」のように、ひらがなで始まる社名（「株式会社にお願い」「株式会社から連絡」のように助詞で始まるものは除く）
  { kind: "company", re: new RegExp(`${LEGAL}${SP}?(?!から|まで|より|など|ほか|および|ならびに|さん|さま|[にはがをでのとへもや])[ぁ-ゖ]{2,8}(?:[一-龥々ヶァ-ヶー]{1,16}|(?=$|\n|${SP}|[、。，,（(様御殿]))`, "g"), fix: (t) => fixCompany(t) },
  { kind: "company", re: new RegExp(`${LEGAL}${SP}?${CO_NAME}{1,24}`, "g"), fix: (t) => fixCompany(t) },
  { kind: "company", re: new RegExp(`${CO_CH}{1,20}${SP}?${LEGAL}`, "g"), fix: (t) => fixCompany(t) },
  { kind: "money", re: new RegExp(`(?:[¥￥$＄]${SP}?${D}[0-9０-９,，.]*(?:${SP}?(?:兆|億|万|千))*|${D}[0-9０-９,，.]*(?:(?:兆|億|万|千)${D}*)*${SP}?(?:円|ドル|USD|JPY))`, "g") },
  { kind: "date", re: new RegExp(`(?:${DATE_BODY}|${D}{1,2}月${D}{1,2}日)`, "g") },
  { kind: "ip", re: /(?<![0-9.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![0-9.])/g },
];

// 同じ人・同じ番号には同じ伏せ字を使うためのキー
const keyOf = (kind, text) => kind + "\u0000" + (["phone", "card", "mynumber", "postal", "account", "idnum"].includes(kind) ? digitsOf(text) : text.replace(/[ 　]/g, "").toLowerCase());

/**
 * 文章を伏せ字にする。
 * opts.kinds: 使う種類の配列（省略時は Pro 以外のすべて）
 * opts.words: いつも伏せる言葉（辞書）
 * opts.ignore: 伏せない言葉（利用者が外したもの）
 * opts.lang: "ja" | "en"（伏せ字の名前）
 * 戻り値: { masked, items: [{ token, kind, text, count }], map: { token: 元の文字 } }
 */
export function mask(text, opts = {}) {
  const kinds = new Set(opts.kinds || Object.keys(LABELS.ja).filter((k) => !PRO_KINDS.includes(k)));
  const ignore = new Set((opts.ignore || []).map((s) => s.trim()).filter(Boolean));
  const labels = LABELS[opts.lang] || LABELS.ja;
  const cands = [];
  let order = 0;
  const add = (kind, start, end, prio) => {
    const t = text.slice(start, end);
    if (!t.trim() || ignore.has(t.trim())) return;
    cands.push({ kind, start, end, prio, order: order++ });
  };

  // 辞書の言葉が最優先（利用者が決めたもの）
  const words = [...new Set((opts.words || []).map((w) => w.trim()).filter((w) => w.length >= 1))].sort((a, b) => b.length - a.length);
  if (kinds.has("word")) {
    for (const w of words) for (const m of text.matchAll(new RegExp(esc(w), "gi"))) add("word", m.index, m.index + m[0].length, -1);
  }
  RULES.forEach((r, prio) => {
    if (!kinds.has(r.kind)) return;
    r.re.lastIndex = 0;
    for (const m of text.matchAll(r.re)) {
      let [s, e] = r.group ? m.indices[r.group] : [m.index, m.index + m[0].length];
      let t = text.slice(s, e);
      if (r.check && !r.check(t)) continue;
      if (r.fix) {
        const f = r.fix(t);
        if (!f) continue;
        s += f.offset;
        e = s + f.text.length;
        t = f.text;
      }
      add(r.kind, s, e, prio);
    }
  });

  // 重なりを解く：優先度の高いもの、同じなら長いものを先に採る
  const taken = [];
  const free = (s, e) => taken.every((x) => e <= x.start || s >= x.end);
  for (const c of [...cands].sort((a, b) => a.prio - b.prio || (b.end - b.start) - (a.end - a.start) || a.start - b.start)) {
    if (free(c.start, c.end)) taken.push(c);
  }
  // 見つかった氏名・会社名は、ほかの場所に単独で出てきても伏せる
  for (const c of [...taken]) {
    if (!["name", "company", "word"].includes(c.kind)) continue;
    const t = text.slice(c.start, c.end);
    if (t.length < 2) continue;
    for (const m of text.matchAll(new RegExp(esc(t), "g"))) {
      if (free(m.index, m.index + t.length)) taken.push({ kind: c.kind, start: m.index, end: m.index + t.length });
    }
  }
  taken.sort((a, b) => a.start - b.start);

  // 伏せ字の番号は、出てきた順に種類ごとに振る
  const counters = {}, byKey = new Map(), items = [], map = {};
  let out = "", pos = 0;
  for (const c of taken) {
    const t = text.slice(c.start, c.end);
    const key = keyOf(c.kind, t);
    let item = byKey.get(key);
    if (!item) {
      counters[c.kind] = (counters[c.kind] || 0) + 1;
      item = { token: `[${labels[c.kind]}${counters[c.kind]}]`, kind: c.kind, text: t, count: 0 };
      byKey.set(key, item);
      items.push(item);
      map[item.token] = t;
    }
    item.count++;
    out += text.slice(pos, c.start) + item.token;
    pos = c.end;
  }
  out += text.slice(pos);
  return { masked: out, items, map };
}

/**
 * AIの答えの中の伏せ字を、元の文字に戻す。
 * AIが括弧を【】や［］に変えたり、括弧を外したりしても戻せるようにする。
 * 戻り値: { text, replaced }
 */
export function restore(text, map) {
  let replaced = 0;
  const tokens = Object.keys(map || {}).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const m = token.match(/^\[(.+?)(\d+)\]$/);
    if (!m) continue;
    const re = new RegExp(`[\\[［【〔<＜]?${SP}*${esc(m[1])}${SP}*${m[2]}(?!\\d)${SP}*[\\]］】〕>＞]?`, "gi");
    text = text.replace(re, () => { replaced++; return map[token]; });
  }
  return { text, replaced };
}

// 伏せ字の部分を見分けるための分割（画面で色を付ける用）
export function splitTokens(text, map) {
  const tokens = Object.keys(map || {});
  if (!tokens.length) return [{ text }];
  const re = new RegExp(tokens.sort((a, b) => b.length - a.length).map(esc).join("|"), "g");
  const parts = [];
  let pos = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > pos) parts.push({ text: text.slice(pos, m.index) });
    parts.push({ text: m[0], token: true, original: map[m[0]] });
    pos = m.index + m[0].length;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos) });
  return parts;
}

// 「社外秘」「Confidential」など、資料そのものに付いた取り扱いの表示を探す。
// 伏せ字は決まった形（氏名・電話など）しか伏せないので、資料ごとAIに貼ってよいかは別に確かめてもらうための注意書き用。
const CONF_RE = /社外秘|部外秘|社内秘|関係者外秘|極秘|㊙|取り?扱い?注意|持ち?出し?禁止|機密(?:文書|資料|情報|扱い|区分)|[【\[［(（]機密[】\]］)）]|\b(?:STRICTLY |Strictly )?(?:CONFIDENTIAL|Confidential)\b|\b(?:INTERNAL USE ONLY|Internal Use Only|For Internal Use Only)\b/g;
export function findConfidential(text) {
  return [...new Set([...(text || "").matchAll(CONF_RE)].map((m) => m[0].replace(/^[【\[［(（]|[】\]］)）]$/g, "")))];
}

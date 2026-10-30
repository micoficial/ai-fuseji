import assert from "node:assert/strict";
import { decode, parseCSV, toCSV, guessMode, maskRows } from "../csvmask.js";

const src = '氏名,電話番号,住所,購入額,備考\r\n山田太郎,090-1234-5678,東京都港区1-2-3,1200,"佐藤花子さんの紹介、""至急"""\r\n鈴木一郎,03-1111-2222,大阪市北区,800,\r\n山田太郎,090-1234-5678,東京都港区1-2-3,500,"改行\nあり"\r\n';
const { rows, sep } = parseCSV(src);
assert.equal(sep, ",");
assert.equal(rows.length, 4);
assert.equal(rows[1][4], '佐藤花子さんの紹介、"至急"');
assert.equal(rows[3][4], "改行\nあり");
assert.deepEqual(parseCSV(toCSV(rows)).rows, rows);

const modes = rows[0].map(guessMode);
assert.deepEqual(modes, ["pseudo", "all", "all", "keep", "auto"]);
const out = maskRows(rows, modes);
assert.deepEqual(out[0], rows[0]);
assert.equal(out[1][0], "氏名001");
assert.equal(out[2][0], "氏名002");
assert.equal(out[3][0], "氏名001");
assert.equal(out[1][1], "●●●");
assert.equal(out[1][3], "1200");
assert.ok(!out[1][4].includes("佐藤花子"), out[1][4]);
assert.equal(out[2][4], "");
assert.equal(maskRows([["山田太郎"]], ["head"], { hasHeader: false })[0][0], "山●●●");

// タブ区切り・Shift_JIS
assert.equal(parseCSV("氏名\t電話\nA\tB\n").sep, "\t");
const sjis = new Uint8Array([0x8e, 0x81, 0x96, 0xbc]); // 「氏名」
assert.equal(decode(sjis), "氏名");
assert.equal(decode(new TextEncoder().encode("﻿氏名")), "氏名");
console.log("csvmask ok", out[1][4]);

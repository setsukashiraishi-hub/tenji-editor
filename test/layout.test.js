// 枠と表の形：枠線は1マス目から行いっぱい（BSEの見本）、表は列をそろえる。1行に入らない表は分ける
const { engine: E } = require('./harness');
const assert = require('assert');
const L = s => Array.from(s).length;
const tableRow = cells => { const tkana = cells; return { type: 'table', tkana, kana: cells.join('  '), cells: E.kanaToBraille(cells.join('  ')).cells }; };
const body = k => ({ type: 'body', kana: k, cells: E.kanaToBraille(k).cells, para: true });
const show = pages => pages.forEach((p, i) => { console.log(`--- page ${i + 1}`); p.forEach(l => console.log('|' + l.replace(/⠀/g, ' ') + '|')); });

// 1. 入る表：列の頭がそろい、枠線は1マス目から行いっぱい
let rows = [{ type: 'frame-start' }, tableRow(['セイサク・セッケイ', '82']), tableRow(['チョーサ', '68']), tableRow(['キョーユー・ハッシン', '55']), { type: 'frame-end' }];
let pages = E.layoutPages(rows, { cols: 32, lines: 18, frameFit: false });
show(pages);
let p = pages[0];
assert.ok(p[0] === '⠖' + '⠒'.repeat(30) + '⠲' && p[4] === '⠓' + '⠒'.repeat(30) + '⠚', '枠線を合わせない設定では1マス目から32マス（BSEの見本）');
// 枠線を中身の幅に合わせる（初めの設定）：いちばん長い行と同じ長さ
{
  const q = E.layoutPages(rows, { cols: 32, lines: 18 })[0];
  const w = Math.max(...q.slice(1, 4).map(l => L(l.replace(/⠀+$/, ''))));
  assert.ok(L(q[0]) === w && L(q[4]) === w && q[0].startsWith('⠖') && q[0].endsWith('⠲') && q[4].endsWith('⠚'), '枠線は中身の幅（' + w + 'マス）');
  assert.ok(w < 32, '表の空いた所まで線を引かない');
}
const col2 = p.slice(1, 4).map(l => l.indexOf('⠼'));
assert.ok(col2.every(x => x === col2[0]), '2列目の頭がそろう');
assert.ok(p.slice(1, 4).every(l => L(l) <= 32), '中身は32マスに入る');

// 2. 入らない表：1列目をくり返して2つの表に分け、それぞれ列の頭をそろえる
rows = [{ type: 'frame-start' }, tableRow(['コーモク', 'ナイヨー', 'ヨート']), tableRow(['シャシン', 'フンイキヤ クーカンノ イメージ', 'シカクテキナ ソキュー']),
  tableRow(['グラフ', 'スーチヤ ケイコーオ ミヤスク セイリ', 'ヒカク・ブンセキ']), { type: 'frame-end' }];
pages = E.layoutPages(rows, { cols: 32, lines: 18 });
show(pages);
p = pages[0];
assert.ok(p.every(l => L(l) <= 32), '32マスをこえない');
assert.strictEqual(rows[1]._table.mode, 'split');
const T = rows[1]._table;
for (let part = 0; part < 2; part++) {
  const ls = T.lines.filter(l => l.part === part && l.row >= 0 && !l.cont).map(l => Array.from(l.cells));
  // 2列目の頭（1列目のあとのマスあけが終わる位置）が、どの行も同じ
  const starts = ls.map(a => { let i = 2; while (a[i] !== '⠀') i++; while (a[i] === '⠀') i++; return i; });
  assert.ok(starts.every(x => x === starts[0]), `表${part + 1}の2列目がそろう`);
}

// 2b. 2列で、2列目が長い表：2列目の中で折り返し、続きの行も2列目の頭にそろえる
rows = [tableRow(['ナマエ', 'セツメイ']), tableRow(['ア', 'コレワ トテモ ナガイ セツメイノ ブンショーデ、 ヒトツノ ランニ オサマリマセン'])];
pages = E.layoutPages(rows, { cols: 32, lines: 18 });
show(pages);
assert.strictEqual(rows[0]._table.mode, 'wrap');
const wl = rows[0]._table.lines;
const a0 = Array.from(wl[0].cells);
const c2 = a0.findIndex((c, i) => i > 0 && a0[i - 1] === '⠀' && c !== '⠀');
const conts = wl.filter(l => l.cont);
assert.ok(conts.length && conts.every(l => Array.from(l.cells).findIndex(c => c !== '⠀') === c2), '続きの行も2列目の頭から');

// 2c. 長い表がページをまたぐと、続きのページの頭に見出しの行をくり返す
rows = [tableRow(['ナマエ', 'カズ'])];
for (let i = 0; i < 25; i++) rows.push(tableRow(['コーモク' + i, String(i)]));
pages = E.layoutPages(rows, { cols: 32, lines: 18 });
assert.strictEqual(pages[1][0], pages[0][0], '2ページ目の頭に見出しの行');

// 3. 枠は、ページの終わりに入りきらなければ次のページへまとめて送る
rows = [];
for (let i = 0; i < 14; i++) rows.push(body('ホンブン'));
rows.push({ type: 'frame-start' }, tableRow(['ア', '1']), tableRow(['イ', '2']), tableRow(['ウ', '3']), { type: 'frame-end' });
pages = E.layoutPages(rows, { cols: 32, lines: 18 });
assert.strictEqual(pages.length, 2);
assert.ok(pages[1][0].includes('⠖'), '枠の始まりは次のページの頭');
assert.ok(!pages[0].some(l => l.includes('⠖')), '前のページに枠線だけ残らない');

// 4. 枠の中の文はふつうの書き方（段落は3マス目から、続きは1マス目から）
rows = [{ type: 'frame-start' }, body('コレワ ワクノ ナカニ カイタ ナガイ ブンショーデ、 イチギョーニワ オサマラナイ ナガサデス。'), { type: 'frame-end' }];
pages = E.layoutPages(rows, { cols: 32, lines: 18, indent: true });
show(pages);
p = pages[0];
assert.ok(p.slice(1, -1).every(l => L(l) <= 32));
assert.ok(p[1].startsWith('⠀⠀') && !p[1].startsWith('⠀⠀⠀') && !p[2].startsWith('⠀'), '段落の頭は3マス目、続きは1マス目');
console.log('layout: all passed');

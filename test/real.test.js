// 実物の BES・エーデル（.edl）ファイルの読み書き（test/fixtures にファイルがあるときだけ）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
const F = require('../js/formats.js');
const dir = path.join(__dirname, 'fixtures');
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

(async () => {
  for (const f of fs.readdirSync(dir).filter(n => /\.bes$/i.test(n))) {
    const buf = fs.readFileSync(path.join(dir, f));
    const r = await F.readFile(f, ab(buf));
    const pages = r.rows.filter(x => x.pagebreak).length + 1;
    assert.ok(r.rows.length > 10, f);
    // ページの長さのバイトが点字として紛れ込んでいないこと：各ページの行数は 18 か 22 以下
    let n = 0, max = 0;
    for (const row of r.rows) { if (row.pagebreak) { max = Math.max(max, n); n = 0; } else n++; }
    assert.ok(Math.max(max, n) <= 24, f + ' ページあたりの行数');
    // 書き出して読み戻すと同じ点字になること
    // 各ページの1行目はページ行として扱う（アプリと同じ）
    let top = true;
    const rows = r.rows.map(x => {
      if (x.pagebreak) { top = true; return x; }
      const row = { cells: x.cells, para: false, type: top ? 'pageno' : 'body' };
      top = false; return row;
    });
    const m = /^E(\d)(\d\d)(\d\d)$/.exec(buf.toString('latin1', 20, 26));
    const opt = { cols: +m[2] - 1, lines: +m[3], indent: false, pageNumbers: false };
    const out = await F.exportFile('bes', rows, opt);
    const back = await F.readFile('x.bes', ab(Buffer.from(out)));
    // 末尾の「ページ番号だけのページ」は比べない
    const norm = rs => rs.map(x => x.pagebreak ? '[page]' : x.cells.replace(/⠀+$/, '')).join('\n')
      .replace(/(\n\[page\]\n⠀*⠼[⠁-⠚]+)+$/, '').replace(/(\n)+$/, '');
    assert.strictEqual(norm(back.rows), norm(r.rows), f + ' 読み戻し');
    assert.strictEqual(Buffer.from(out).toString('latin1', 0, 8), '%BET400%');
    console.log('OK', f, pages, 'pages', r.note);
  }
  for (const f of fs.readdirSync(dir).filter(n => /\.edl$/i.test(n))) {
    const text = fs.readFileSync(path.join(dir, f), 'latin1');
    const edl = F.parseEDL(text);
    const again = Buffer.from(F.toEDL(edl.dots)).toString('latin1');
    assert.strictEqual(again, text.replace(/\x1a/g, ''), f + ' エーデル形式の書き戻し');
    console.log('OK', f, edl.dots.length, 'dots (byte-identical round trip)');
  }
  console.log('real: all passed');
})().catch(e => { console.error(e); process.exit(1); });

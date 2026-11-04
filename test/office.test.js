// Word・Excel から見出し・表・枠・区切り線・図を取り出せるか
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const F = require('../js/formats.js');
const load = n => { const b = fs.readFileSync(path.join(__dirname, 'fixtures', n)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

(async () => {
  const d = await F.readFile('test.docx', load('test.docx'));
  const lines = d.raw.split('\n');
  const types = new Map(d.types);
  assert.strictEqual(types.get('点字の歴史'), 'h1');
  assert.strictEqual(types.get('日本の点字'), 'h2');
  assert.ok(lines.includes('ここは大切なお知らせです。'));
  assert.ok(lines[lines.indexOf('ここは大切なお知らせです。') - 1].startsWith('┌'), '枠の始まり');
  assert.ok(lines.some(l => /^─+$/.test(l)), '区切り線');
  assert.ok(lines.includes('1825年\tブライユが点字を考案'), '表の行');
  assert.ok(lines.includes('［図：図1］'), '図');
  console.log('OK docx');

  const x = await F.readFile('test.xlsx', load('test.xlsx'));
  assert.strictEqual(new Map(x.types).get('時間割'), 'h2');
  assert.ok(x.raw.includes('月\t国語\t算数'));
  console.log('OK xlsx');
  console.log('office: all passed');
})().catch(e => { console.error(e); process.exit(1); });

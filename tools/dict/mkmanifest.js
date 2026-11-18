// packs/manifest.json を作る（ファイルの大きさと SHA-256 を入れる）
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const ROOT = path.join(__dirname, 'packs');
const VERSION = process.argv[2] || '2026-11-18';
const file = (rel, type) => {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  return { name: path.basename(rel), path: rel, size: buf.length, type, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
};
const lines = rel => zlib.gunzipSync(fs.readFileSync(path.join(ROOT, rel))).toString('utf8').split('\n').filter(l => l && l[0] !== '#').length;
const JA_LIC = 'UniDic（国立国語研究所、BSD）・SudachiDict（Apache-2.0）・mecab-ipadic-NEologd（Apache-2.0）・日本郵便 郵便番号データ';
const ja = (id, title, desc) => {
  const rel = 'ja/' + id + '.tsv.gz';
  return { id, kind: 'lexicon', title, desc, version: VERSION, entries: lines(rel), license: JA_LIC, files: [file(rel, 'application/gzip')] };
};
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'louis/catalog.json'), 'utf8'));
const langs = new Set(cat.tables.map(t => t.lang.split('-')[0])).size;
const m = {
  version: VERSION,
  note: '点訳エディタの辞書・言語パック。ダウンロードするとブラウザ（IndexedDB）に保存されます。',
  packs: [
    ja('ja-words', '日本語：一般の語・複合語の読み', '専門用語・複合語など、エディタに入っている辞書（IPA辞書）では読みを誤りやすい語。大きな辞書どうしで読みを照らし合わせ、公式の点字データに出てくる読みで確かめました。'),
    ja('ja-people', '日本語：人名の読み', '姓・名・歴史上の人物など。字にない「の」が入る名前（源頼朝 ミナモトノ ヨリトモ）も点字の書き方で書きます。'),
    ja('ja-places', '日本語：地名・住所の読み', '全国の都道府県・市区町村・町名・駅・寺社・山や川など。日本郵便の郵便番号データの読みも入っています。'),
    ja('ja-names', '日本語：会社・団体・作品などの読み', '会社・団体・施設・作品・商品などの固有名詞。'),
    {
      id: 'louis', kind: 'louis', title: '外国語の点字（約' + langs + 'の言語）',
      desc: '英語・韓国語・中国語・フランス語・ドイツ語・スペイン語・ロシア語・エスペラントなどの点字（liblouis ' + cat.liblouis + '）。「文書の言語」でこれらの言語を選べるようになり、日本語の文の中のハングルやキリル文字なども、その言語の点字で外国語引用符の中に書きます。',
      version: VERSION, entries: cat.tables.length, license: 'liblouis（LGPL-2.1 以降）',
      files: [file('louis/louis.js', 'text/javascript'), file('louis/louis.wasm', 'application/wasm'), file('louis/tables.zip', 'application/zip'), file('louis/catalog.json', 'application/json')]
    }
  ]
};
fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(m, null, 1) + '\n');
console.log(m.packs.map(p => p.id + ' ' + p.entries + ' ' + p.files.reduce((a, f) => a + f.size, 0)).join('\n'));

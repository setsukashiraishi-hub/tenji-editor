// 外国語の点字パック（liblouis）を作る：表の一覧（catalog.json）と表のファイル（tables.zip）
// 使い方: node mkpack.js 表のフォルダ 出力フォルダ
const fs = require('fs'), path = require('path');
const JSZip = require('../../vendor/jszip.min.js');
const createLouis = require(process.env.LOUIS_JS || './louis.js');
const [TDIR, OUT] = process.argv.slice(2);
const JA = {
  af: 'アフリカーンス語', akk: 'アッカド語', ar: 'アラビア語', as: 'アッサム語', awa: 'アワディー語', ba: 'バシキール語', be: 'ベラルーシ語', bg: 'ブルガリア語',
  bh: 'ビハール語', bn: 'ベンガル語', bra: 'ブラジ語', ca: 'カタルーニャ語', chr: 'チェロキー語', ckb: 'クルド語（ソラニー）', cmn: '中国語（普通話）', cop: 'コプト語',
  cs: 'チェコ語', cy: 'ウェールズ語', da: 'デンマーク語', de: 'ドイツ語', el: 'ギリシャ語', en: '英語', eo: 'エスペラント', es: 'スペイン語', et: 'エストニア語',
  fa: 'ペルシャ語', fi: 'フィンランド語', fil: 'フィリピン語', fr: 'フランス語', ga: 'アイルランド語', gez: 'ゲエズ語', gon: 'ゴーンディー語', grc: '古代ギリシャ語',
  gu: 'グジャラート語', haw: 'ハワイ語', hbo: '古代ヘブライ語', he: 'ヘブライ語', hi: 'ヒンディー語', hr: 'クロアチア語', ht: 'ハイチ語', hu: 'ハンガリー語',
  is: 'アイスランド語', it: 'イタリア語', iu: 'イヌクティトゥット語', ka: 'ジョージア語', kha: 'カシ語', kk: 'カザフ語', km: 'クメール語', kmr: 'クルド語（クルマンジー）',
  kn: 'カンナダ語', ko: '韓国・朝鮮語', kok: 'コンカニ語', kru: 'クルク語', lg: 'ガンダ語', lo: 'ラオ語', lt: 'リトアニア語', lv: 'ラトビア語', mi: 'マオリ語',
  mk: 'マケドニア語', ml: 'マラヤーラム語', mni: 'マニプリ語', mr: 'マラーティー語', ms: 'マレー語', mun: 'ムンダ語', mwr: 'マールワーリー語', my: 'ビルマ語',
  ne: 'ネパール語', nl: 'オランダ語', no: 'ノルウェー語', nso: '北ソト語', ny: 'チェワ語', or: 'オリヤー語', ovd: 'エルヴダーレン語', pa: 'パンジャブ語',
  pi: 'パーリ語', pl: 'ポーランド語', pt: 'ポルトガル語', ro: 'ルーマニア語', ru: 'ロシア語', rw: 'ルワンダ語', sa: 'サンスクリット語', sah: 'サハ語',
  sd: 'シンド語', sk: 'スロバキア語', sl: 'スロベニア語', smi: 'サーミ語', sr: 'セルビア語', st: '南ソト語', sv: 'スウェーデン語', sw: 'スワヒリ語',
  syc: '古典シリア語', ta: 'タミル語', te: 'テルグ語', th: 'タイ語', tn: 'ツワナ語', tr: 'トルコ語', tt: 'タタール語', uga: 'ウガリト語', uk: 'ウクライナ語',
  ur: 'ウルドゥー語', uz: 'ウズベク語', ve: 'ヴェンダ語', vi: 'ベトナム語', xh: 'コサ語', yi: 'イディッシュ語', yue: '中国語（広東語）', zu: 'ズールー語'
};
const REGION = { US: 'アメリカ', GB: 'イギリス', CA: 'カナダ', NZ: 'ニュージーランド', AU: 'オーストラリア', KE: 'ケニア', TZ: 'タンザニア', CN: '中国', TW: '台湾', HK: '香港', BR: 'ブラジル', PT: 'ポルトガル', BE: 'ベルギー', CH: 'スイス', AT: 'オーストリア', IN: 'インド', IL: 'イスラエル' };
const meta = f => {
  const m = {};
  for (const line of fs.readFileSync(path.join(TDIR, f), 'utf8').split('\n')) {
    const x = /^#([+-])([a-z-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (x && !(x[2] in m)) m[x[2]] = x[3];
  }
  return m;
};
(async () => {
  const L = await createLouis({ print: () => {}, printErr: () => {} });
  L.FS.mkdirTree('/liblouis/tables');
  const files = fs.readdirSync(TDIR).filter(f => fs.statSync(path.join(TDIR, f)).isFile());
  for (const f of files) L.FS.writeFile('/liblouis/tables/' + f, fs.readFileSync(path.join(TDIR, f)));
  L.ccall('lou_setDataPath', null, ['string'], ['/']);
  const tr = (table, text, back) => {
    const n = text.length * 8 + 128, inP = L._malloc((text.length + 1) * 4), outP = L._malloc(n * 4), inLen = L._malloc(4), outLen = L._malloc(4);
    L.stringToUTF32(text, inP, (text.length + 1) * 4);
    L.setValue(inLen, [...text].length, 'i32'); L.setValue(outLen, n, 'i32');
    const ok = L.ccall(back ? 'lou_backTranslateString' : 'lou_translateString', 'number', ['string', 'number', 'number', 'number', 'number', 'number', 'number', 'number'], ['unicode.dis,' + table, inP, inLen, outP, outLen, 0, 0, 0]);
    const out = ok ? L.UTF32ToString(outP, L.getValue(outLen, 'i32') * 4) : null;
    [inP, outP, inLen, outLen].forEach(p => L._free(p));
    return out;
  };
  const SAMPLE = { ko: '안녕하세요', ru: 'Привет', uk: 'Привіт', bg: 'Здравей', be: 'Прывітанне', sr: 'Здраво', mk: 'Здраво', el: 'Γειά σου', ar: 'مرحبا', fa: 'سلام', ur: 'سلام', he: 'שלום', hbo: 'שלום', yi: 'שלום', th: 'สวัสดี', hi: 'नमस्ते', mr: 'नमस्ते', ne: 'नमस्ते', sa: 'नमस्ते', bn: 'নমস্কার', ta: 'வணக்கம்', te: 'నమస్కారం', kn: 'ನಮಸ್ಕಾರ', ml: 'നമസ്കാരം', gu: 'નમસ્તે', pa: 'ਸਤ ਸ੍ਰੀ', or: 'ନମସ୍କାର', cmn: '你好', 'cmn-Hans': '你好', yue: '你好', ka: 'გამარჯობა', km: 'សួស្តី', lo: 'ສະບາຍດີ', my: 'မင်္ဂလာပါ', chr: 'ᎣᏏᏲ', iu: 'ᐊᐃ', kk: 'Сәлем', tt: 'Сәлам', ba: 'Сәләм', sah: 'Дорообо', 'sr-Cyrl': 'Здраво' };
  const cat = [];
  for (const f of files.sort()) {
    const m = meta(f);
    if (!m['display-name'] || m.type !== 'literary' || m.dots === '8' || /^ja/.test(m.language || '')) continue;
    const lang = m.language || '';
    const base = lang.split('-')[0];
    const sample = SAMPLE[lang] || SAMPLE[base] || 'Hello';
    let fw = null;
    try { fw = tr(f, sample); } catch (e) { fw = null; }
    if (!fw || !/[⠁-⠿]/.test(fw) || /[⡀-⣿]/.test(fw)) { console.error('skip', f, m['display-name']); continue; }
    let bw = null;
    if (m.direction !== 'forward') { try { bw = tr(f, fw, true); } catch (e) { bw = null; } }
    const con = m.contraction === 'full' ? '略字あり' : m.contraction === 'partial' ? '一部略字' : m.contraction === 'no' ? '略字なし' : '';
    const reg = (m.region || '').split('-')[1];
    const name = (JA[base] || m['index-name'] || m['display-name']) + (reg && REGION[reg] ? '・' + REGION[reg] : '') + (con ? '（' + con + '）' : '');
    cat.push({ table: f, lang, name, en: m['display-name'], contraction: m.contraction || '', grade: m.grade || '', system: m.system || '', region: m.region || '', back: !!bw, sample, sampleBraille: fw });
  }
  // 言語名の順（日本語の50音順ではなく、よく使う言語を先に）
  const TOP = ['en', 'ko', 'cmn', 'yue', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'eo', 'nl', 'sv', 'da', 'no', 'fi', 'pl', 'cs', 'el', 'ar', 'he', 'hi', 'th', 'vi'];
  const rank = c => { const i = TOP.indexOf(c.lang.split('-')[0]); return i < 0 ? 100 : i; };
  cat.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ja') || a.table.localeCompare(b.table));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify({ liblouis: L.ccall('lou_version', 'string', [], []), tables: cat }, null, 1));
  const zip = new JSZip();
  for (const f of files) zip.file(f, fs.readFileSync(path.join(TDIR, f)));
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  fs.writeFileSync(path.join(OUT, 'tables.zip'), buf);
  console.log('tables in catalog', cat.length, 'of', files.length, 'zip bytes', buf.length, 'back-translatable', cat.filter(c => c.back).length);
  for (const c of cat.slice(0, 40)) console.log(c.table.padEnd(26), c.name, '|', c.sample, '→', c.sampleBraille);
})();

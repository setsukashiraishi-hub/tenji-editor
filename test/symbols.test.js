// 記号の点訳：どんな記号を入れても「点字にできない文字（⠿）」が出ないことを確かめる
const { getTokenizer, engine: E } = require('./harness');
const assert = require('assert');

(async () => {
  const tk = await getTokenizer();
  const readByChar = surf => {
    let out = '';
    for (const ch of surf) {
      if (/[ぁ-ゖァ-ヺー]/.test(ch)) { out += E.toKatakana(ch); continue; }
      const t = tk.tokenize(ch)[0];
      if (t && t.reading && t.reading !== '*') { out += t.reading; continue; }
      if (E.READ[ch] !== undefined) { out += E.READ[ch]; continue; }
      return null;
    }
    return out || null;
  };
  const conv = text => {
    const r = E.tokensToKana(tk.tokenize(E.prepareSumiji(E.normalizeInput(text))), { fallback: readByChar });
    const b = E.kanaToBraille(r.kana);
    return { kana: r.kana, cells: b.cells, unknown: b.unknown };
  };
  const cases = [
    ['FIELD NOTES DESIGN & IDEAS / 2026', null],
    ['観察>構想>試作>改善', 'カンサツ → コーソー → シサク → カイゼン'],
    ['ILLUSTRATIVE INDEX / 0-100', null],
    ['気温は25℃、湿度60％です。', null],
    ['価格は¥1,000（税込）、$20です。', null],
    ['①準備 ②実行 ③確認', null],
    ['1+2=3、10×3=30、8÷2=4', null],
    ['■ お知らせ', 'オシラセ'],
    ['・項目その1', null],
    ['★☆○×△□◎●◆◇', null],
    ['〒100-0001 東京都千代田区', null],
    ['メール：info@example.com', null],
    ['※注意　#タグ　α線とβ線', null],
    ['⇒ 次へ ← 戻る ↑ 上', null],
    ['㈱テスト　10㎝　Ⅲ章　x²', null],
    ['3≦x≦5、≠、∞', null],
    ['今日は晴れ😀☀️でした♪', null],
    ['『資料』〈注〉《書名》【重要】｛例｝', null],
    ["don't stop", null],
    ['A < B > C', null],
    ['ご確認ください。…以上', null],
    ['2020−2026年', null],
  ];
  let bad = 0;
  for (const [src, want] of cases) {
    const r = conv(src);
    const ok = !r.unknown.length && (!want || r.kana.includes(want));
    console.log((ok ? 'OK ' : 'NG ') + src + '  →  ' + r.kana + '  ' + r.cells + (r.unknown.length ? '  unknown:' + r.unknown.join('') : ''));
    if (!ok) bad++;
  }
  assert.strictEqual(bad, 0, bad + ' cases failed');
  console.log('symbols: all passed');
})().catch(e => { console.error(e); process.exit(1); });

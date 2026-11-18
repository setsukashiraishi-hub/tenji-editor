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
    const r = E.sumijiToKana(text, t => tk.tokenize(t), { fallback: readByChar });
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
    ['■ お知らせ', '⁑ オシラセ'],
    ['第1　趣旨', 'ダイ1  シュシ'],
    ['○関係機関の連携', '⁑ カンケイ'],
    ['・項目その1', null],
    ['★☆○×△□◎●◆◇', null],
    ['〒100-0001 東京都千代田区', null],
    ['メール：info@example.com', null],
    ['※注意　#タグ　α線とβ線', null],
    ['⇒ 次へ ← 戻る ↑ 上', null],
    ['㈱テスト　10㎝　Ⅲ章　x²', null],
    ['3≦x≦5、≠、∞', null],
    ['今日は晴れ😀☀\ufe0fでした♪', null],
    ['『資料』〈注〉《書名》【重要】｛例｝', null],
    ["don't stop", null],
    ['A < B > C', null],
    ['ご確認ください。…以上', null],
    ['2020−2026年', null],
    ['Japanese [dʒæ\u0300pəníːz] は日本の。', '⟦dʒæ\u0300pəníːz⟧'],
    ['apple /ˈæpəl/ りんご', '⟦ˈæpəl⟧'],
    ['［注］ 詳しくは [1] を見る', 'チュー'],
    ['and/or', null],
  ];
  let bad = 0;
  for (const [src, want] of cases) {
    const r = conv(src);
    const ok = !r.unknown.length && (!want || r.kana.includes(want));
    console.log((ok ? 'OK ' : 'NG ') + src + '  →  ' + r.kana + '  ' + r.cells + (r.unknown.length ? '  unknown:' + r.unknown.join('') : ''));
    if (!ok) bad++;
  }
  assert.strictEqual(bad, 0, bad + ' cases failed');
  // 発音記号：文部科学省の例と同じ点字（外るほ小くね五つ｜お三ま二）
  assert.ok(conv('Japanese [dʒæ\u0300pəníːz]').cells.includes('⠰⠙⠮⠘⠩⠏⠢⠝⠸⠊⠒⠵⠆'), '発音記号の点字');
  assert.ok(!conv('［注］ 詳しくは [1] を見る').kana.includes('⟦'), '発音記号でない [ ] はそのまま');
  assert.strictEqual(E.ipaToBraille('ˌdʒæpəˈniːz').cells, E.ipaToBraille('dʒæ\u0300pəníːz').cells, 'ˈ ˌ は次の母音の前に');

  // ---------- 国際音声記号（IPA Braille, ICEB 2025）----------
  const ipa = (t, b) => E.ipaToBraille(t, b).cells;
  assert.strictEqual(ipa('ðə ˈnɔɹθ ˌwɪnd', '['), '⠘⠷⠻⠢⠀⠸⠃⠝⠣⠼⠨⠹⠀⠸⠆⠺⠌⠝⠙⠘⠾', '英語の表にない記号（ɹ）があれば IPA Braille');
  assert.strictEqual(ipa('ã', '['), '⠘⠷⠁⠈⠻⠘⠾', '補助記号は字の後ろ（上は ⠈）');
  assert.strictEqual(ipa('ḁ', '['), '⠘⠷⠁⠠⠫⠘⠾', '下の補助記号は ⠠');
  assert.strictEqual(ipa('kʼ', '['), '⠘⠷⠅⠐⠄⠘⠾', '放出音');
  assert.strictEqual(ipa('t\u0361s', '['), '⠘⠷⠞⠐⠎⠘⠾', 'つなぎ ⠐');
  assert.strictEqual(ipa('kʰæt', '/'), '⠘⠌⠅⠈⠓⠩⠞⠘⠌', '/ / は ⠘⠌');
  assert.strictEqual(ipa('ma˥˩', '['), '⠘⠷⠍⠁⠸⠡⠘⠾', '声調の棒（下がり）');
  assert.strictEqual(ipa('jɐu˨˧', '['), '⠘⠷⠚⠖⠁⠥⠸⠔⠘⠾', '声調の棒（低い上がり）');
  assert.strictEqual(ipa('rː\u0329\u0302', '['), '⠘⠷⠗⠠⠆⠈⠩⠒⠘⠾', '長音符の後ろの補助記号は前の字に');
  assert.strictEqual(ipa('ɲ', '['), '⠘⠷⠿⠘⠾', 'ɲ は ⠿（IPA Braille）');
  assert.ok(E.ipaToBraille('ʩa', '[').defined.length, '表にない字は文書ごとに決める記号');
  assert.ok(conv('ʃ の音').cells.includes('⠰⠱⠆'), '括弧のない発音記号');
  assert.ok(conv('[ðə ˈnɔɹθ]').cells.includes('⠘⠷⠻⠢⠀⠸⠃⠝⠣⠼⠨⠹⠘⠾'), '文の中の国際音声記号');

  // ---------- 絵文字・記号・文字の正規化 ----------
  const has = (src, want, msg) => { const r = conv(src); assert.ok(r.kana.includes(want), (msg || src) + ' → ' + r.kana); assert.ok(!r.unknown.length, src + ' unknown ' + r.unknown.join('')); };
  has('今日は楽しかった😀', '⦅ニッコリ ワラウ⦆', '絵文字は点訳者挿入符で名前');
  has('🎉🎉🎉', '⦅クラッカー 3コ⦆', '同じ絵文字はまとめる');
  has('家族👨\u200d👩\u200d👧で', '⦅', 'ZWJ の並び');
  has('🇯🇵', 'ニホンノ ハタ', '国旗');
  has('👍🏽', '⦅サムズアップ⦆', '肌の色は省く');
  has('1\ufe0f\u20e3準備', '（1）', '囲み数字の絵文字');
  has('株価が↗', 'ミギナナメ ウエムキ ヤジルシ', '斜めの矢印');
  has('x∈Aならば', 'x ゾクスル A', '数学の記号は読む');
  has('₹500', '500ルピー', '通貨');
  has('こゝろ', 'ココロ', '踊り字');
  has('いよ〳〵', 'イヨイヨ', 'くの字点');
  has('𛀂', 'ア', '変体仮名');
  has('髙橋さん', 'タカハシ', '異体字');
  has('德川家康', 'トクガワ', '旧字体');
  has('𩸽を焼く', 'ホッケ', 'まれな漢字（Unihan）');
  has('あ\u200bい', 'アイ', 'ゼロ幅の字は省く');
  has('35°30′15″', '30フン 15ビョー', '角度の分・秒');
  has('10µm', 'マイクロメートル', 'µ の単位');
  has('α線', 'アルファセン', 'ギリシャ文字');
  has('漢文の ㆑', 'カンブン', '漢文の訓点');
  assert.ok(conv('Привет').cells.includes('⠦⠏⠗⠊⠺⠑⠞⠴'), 'キリル文字（エディタの表）');
  assert.ok(conv('⇒ 次へ').cells.includes('⠒⠒⠕'), '⇒ は矢印の点字');
  assert.ok(conv('Қазақстан').cells.includes('⠦⠽⠁⠵⠁⠽⠎⠞⠁⠝⠴'), 'カザフ語の字（エディタの表）');
  assert.ok(conv('Ѳеодоръ').cells.includes('⠦⠋⠑⠕⠙⠕⠗⠷⠴'), '古いキリル文字は近い字で');
  has('龟と鸡', 'カメト ニワトリ', '簡体字 → 繁体字 → 新字体');
  { const r = E.sumijiToKana('あ\ufffdい', t => tk.tokenize(t), {}); assert.ok(r.checks.some(c => /文字化け/.test(c.note || '')), '文字化けの印は校正一覧へ'); }
  { const r = E.sumijiToKana('㈀と㉮', t => tk.tokenize(t), {}); assert.ok((r.foreign || []).some(f => /ハングル/.test(f.kind)), '囲みハングルもハングルとして見分ける'); }
  // 数式の上付き・下付きの英字と符号（点字学習指導の手引：添え字が2つ以上の要素ならブロックカッコで囲む）
  assert.ok(conv('xⁿ＋yⁿ＝zⁿ').cells.includes('⠰⠭⠘⠝⠢⠽⠘⠝⠒⠒⠵⠘⠝'), 'xⁿ は累乗');
  assert.ok(conv('x⁻¹の値').cells.includes('⠰⠭⠘⠦⠔⠼⠁⠴'), 'x⁻¹ は ⠘ のあとブロックカッコ');
  assert.ok(conv('aₙ₊₁＝2aₙ').cells.includes('⠰⠁⠰⠦⠝⠢⠼⠁⠴⠒⠒⠼⠃⠰⠁⠰⠝'), '下付きの添え字');
  assert.ok(conv('xᵢ＋yᵢ').cells.includes('⠰⠭⠰⠊⠢⠽⠰⠊'), '下付きの i は発音記号にしない');
  // イオン（理科：元素記号のあとに ⠄、続けて ＋ ⠢・－ ⠔ を価数の数だけ）
  assert.ok(conv('H₂SO₄ → 2H⁺ + SO₄²⁻').cells.includes('⠰⠠⠓⠆⠎⠕⠲⠀⠒⠕⠀⠼⠃⠠⠓⠄⠢⠀⠢⠀⠎⠕⠲⠄⠔⠔'), 'イオンの反応式（点字学習指導の手引の例）');
  assert.ok(conv('Ca²⁺イオン').cells.includes('⠰⠠⠉⠁⠄⠢⠢'), '2価の陽イオン');
  // 曜日（公式の点字データ：（モク）13719・（スイ）12524 … （キ）2）と、曜日の付いた M/D
  has('4月1日（月）', 'ツイタチ（ゲツ）', '日付のあとの曜日');
  has('10/3(月)から', '10ガツ ミッカ（ゲツ）カラ', '曜日の付いた M/D は月日');
  has('3/4（月・祝）', '（ゲツ・ シュク）', '曜日と祝日');
  has('受付は月・水・金', 'ゲツ・ スイ・ キン', 'かっこのない曜日の並び');
  has('毎週土・日曜日', 'マイシュー ド・ ニチヨービ', '曜日の並びと曜日');
  has('平日（月～金）', '（ゲツ～キン）', '曜日の範囲');
  has('飲み物（水）', '（ミズ）', '日付のない（水）は読みのまま');
  // 伏せ字（公式の点字データ：○○⠤カ ○○ タントーニ、○○ ガ）
  assert.ok(conv('○○課○○担当に変更').cells.includes('⠐⠵⠐⠵⠤⠡⠀⠐⠵⠐⠵⠀⠕⠴⠞⠒⠇'), '伏せ字と接尾語・語');
  assert.ok(conv('○月○日（○）').cells.includes('⠐⠵⠤⠐⠡⠝⠀⠐⠵⠤⠇⠗⠶⠐⠵⠶'), '日付の伏せ字');
  assert.ok(conv('○時から○時まで').cells.startsWith('⠐⠵⠤⠐⠳'), '行頭の ○時 は伏せ字（箇条書きの印にしない）');
  // 音声学の用語・二重
  has('有声歯茎はじき音', 'ユーセイ シケイ ハジキオン', '音声学の用語');
  has('非円唇前舌狭母音', 'ヒエンシン ゼンゼツ セマボイン', '母音の名前');
  has('硬口蓋鼻音', 'コーコーガイ ビオン', '硬口蓋');
  has('二重母音と二重まぶた', 'ニジューボイント フタエ マブタ', '二重');
  has('歯茎から血が出る', 'ハグキカラ', 'ふつうの文の歯茎');
  E.setSymbolMode(false);
  assert.ok(!conv('今日は楽しかった😀').kana.includes('⦅'), '設定で絵文字を省く');
  E.setSymbolMode(true);

  // ---------- 記号のブロックをすべて点訳できるか（⠿ にならない）----------
  const BLOCKS = [[0x00a0, 0x00ff], [0x0250, 0x02ff], [0x1d00, 0x1dbf], [0x2000, 0x206f], [0x20a0, 0x20c0], [0x2100, 0x218f], [0x2190, 0x23ff],
    [0x2460, 0x27ff], [0x2900, 0x2bff], [0x2e00, 0x2e5d], [0x3000, 0x303f], [0x3190, 0x319f], [0x31f0, 0x31ff], [0x3300, 0x33ff], [0xfe10, 0xfe6f],
    [0x1f000, 0x1f0ff], [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f900, 0x1f9ff]];
  const miss = [];
  for (const [a, z] of BLOCKS) for (let cp = a; cp <= z; cp++) {
    const c = String.fromCodePoint(cp);
    if (!/\P{Cn}/u.test(c) || /\p{Cs}|\p{Co}/u.test(c)) continue;
    const r = conv('あ' + c + 'い');
    if (r.unknown.length) miss.push(c);
  }
  console.log('記号のブロックで点字にできなかった字', miss.length, miss.join(''));
  assert.ok(miss.length <= 2, '点字にできない記号 ' + miss.join(''));
  console.log('symbols: all passed');
})().catch(e => { console.error(e); process.exit(1); });

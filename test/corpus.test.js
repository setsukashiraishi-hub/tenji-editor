// 公開されている公式の点字データ（厚生労働省・日本語能力試験・自治体の広報）を調べて分かった書き方のテスト
// データそのものはリポジトリに入れず、分かった規則だけを短い例で確かめる
const assert = require('assert');
const { getTokenizer, engine: E } = require('./harness');

(async () => {
  const tk = await getTokenizer();
  const fallback = surf => { let o = ''; for (const ch of surf) { const t = tk.tokenize(ch)[0]; if (t && t.reading && t.reading !== '*') o += t.reading; else return null; } return o; };
  const kana = s => E.sumijiToKana(s, x => tk.tokenize(x), { fallback }).kana;
  const cells = s => E.kanaToBraille(kana(s)).cells;
  let n = 0;
  const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };

  // 記号
  eq(cells('日時：平成20年'), '⠇⠗⠐⠳⠠⠤⠀⠯⠃⠻⠃⠀⠼⠃⠚⠏⠴', '：は第1小見出し符＋1マス');
  eq(cells('50％以上'), '⠼⠑⠚⠰⠏⠀⠃⠘⠺⠒', '数のあとの％は ⠰⠏');
  eq(cells('認定※1'), '⠇⠴⠟⠃⠰⠼⠁⠆', '注記符 ⠰⠼⠁⠆');
  eq(cells('※市町村民税非課税世帯'), '⠔⠔⠀⠳⠈⠞⠒⠺⠴⠷⠴⠐⠻⠃⠀⠧⠡⠐⠻⠃⠀⠻⠕⠃', '行頭の※は星印（⠰⠆ にしない）');
  assert.ok(cells('※2018（平成30）年4月').startsWith('⠔⠔⠀⠼⠃⠚⠁⠓'), '※2018 は注記符にしない'); n++;
  assert.ok(cells('※65歳までの').startsWith('⠔⠔⠀⠼⠋⠑'), '※65歳 は注記符にしない'); n++;
  eq(cells('最低賃金“1113円”が'), '⠱⠃⠟⠃⠀⠗⠴⠐⠣⠴⠀⠤⠼⠁⠁⠁⠉⠤⠋⠴⠤⠐⠡', '“ ” は第1カギ');
  eq(cells('10×3=30'), '⠼⠁⠚⠡⠼⠉⠒⠒⠼⠉⠚', '数のあいだの×は伏せ字にしない');
  eq(cells('（　）に入れる'), '⠸⠭⠭⠇⠇⠀⠃⠛⠙', '空欄符号');
  assert.ok(cells('場所は○○市です').includes('⠐⠵⠐⠵'), '伏せ字の○'); n++;
  assert.ok(!cells('正しいものに○をつける').includes('⠐⠵'), '○をつける は読む'); n++;
  eq(E.kanaToBraille('⦅ヒョー ソノ1⦆').cells, '⠶⠶⠈⠮⠒⠀⠺⠎⠼⠁⠶⠶', '点訳者挿入符 ⠶⠶ … ⠶⠶');

  // 読み取り
  eq(E.brailleToKana('⠇⠗⠐⠳⠠⠤⠀⠯⠃⠻⠃'), 'ニチジ： ヘイセイ', '小見出し符を読む');
  eq(E.brailleToKana('⠐⠤⠶⠼⠃⠶⠀⠫⠁⠤⠂'), '〖（2） ケア〗', '第1指示符');
  eq(E.brailleToKana('⠀⠀⠔⠔⠀⠼⠁'), '  ⁑ 1', '第1星印');
  eq(E.brailleToKana('⠰⠠⠠⠎⠙⠛⠰⠎'), 'SDGs', '大文字の続きのあとの小文字');
  eq(E.brailleToKana('⠰⠠⠓⠼⠁⠛⠏⠴'), 'H17ネン', '英字の数字のあとは仮名');
  eq(E.brailleToKana('⠼⠉⠤⠼⠁'), '3-1', '数字のあいだのハイフン');
  for (const c of ['⠒'.repeat(20), '⠖' + '⠒'.repeat(30) + '⠲', '⠀⠀⠎⠀' + '⠂'.repeat(9) + '⠀⠼⠓', '⠰⠶⠜⠒⠶⠆', '⠦⠠⠞⠺⠊⠞⠞⠑⠗⠴']) {
    eq(E.kanaToBraille(E.brailleToKana(c)).cells, c, '読んで書き戻すと同じ点字: ' + c);
  }

  // URL・メールアドレス（アドレス囲み符号＋情報処理用点字）
  eq(cells('詳しくは https://www.mhlw.go.jp/ へ'), '⠩⠄⠳⠩⠄⠀⠠⠦⠓⠞⠞⠏⠎⠐⠂⠌⠌⠺⠺⠺⠲⠍⠓⠇⠺⠲⠛⠕⠲⠚⠏⠌⠠⠴⠀⠋', 'URL');
  eq(E.kanaToBraille('⟬www8.cao.go.jp⟭').cells, '⠠⠦⠺⠺⠺⠼⠓⠲⠰⠉⠁⠕⠲⠛⠕⠲⠚⠏⠠⠴', '数字のあとの a〜j は ⠰');
  eq(E.brailleToKana('⠠⠦⠕⠋⠋⠊⠉⠑⠪⠙⠏⠊⠤⠚⠁⠏⠁⠝⠲⠕⠗⠛⠠⠴'), '⟬office@dpi-japan.org⟭', 'メールアドレスを読む');
  const st = {};
  eq(E.brailleToKana('⠠⠦⠓⠞⠞⠏⠐⠂⠌⠌⠺⠺⠺⠲⠍⠓⠇⠺⠲⠛⠕⠲⠚⠏⠌', st) + E.brailleToKana('⠈⠊⠝⠙⠑⠭⠲⠓⠞⠍⠇⠠⠴', st), '⟬http://www.mhlw.go.jp/⟬↪index.html⟭', '続きの行（⠈）');
  const lay = E.layoutPages([{ type: 'body', kana: 'ア ⟬https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/index.html⟭', cells: E.kanaToBraille('ア ⟬https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/index.html⟭').cells, para: true }], { cols: 32, lines: 18 })[0];
  assert.ok(lay.every(l => Array.from(l).length <= 32) && lay.slice(2).some(l => l.startsWith('⠈')), '長いアドレスは ⠈ で続ける'); n++;

  // 英語：1文字ずつ・番号つきは外字符
  eq(cells('A B C'), '⠰⠠⠁⠀⠰⠠⠃⠀⠰⠠⠉', '1文字ずつは外字符');
  eq(cells('FAX 261-0535'), '⠰⠠⠠⠋⠁⠭⠀⠼⠃⠋⠁⠤⠼⠚⠑⠉⠑', '番号は外国語引用符にしない');

  // 読み・分かち書き（法令・公文書）
  eq(kana('令和５年４月１日から'), 'レイワ 5ネン 4ガツ ツイタチカラ', '令和・日付');
  eq(kana('昭和六十二年十二月二十五日'), 'ショーワ 62ネン 12ガツ 25ニチ', '漢数字の日付');
  eq(kana('6月3日、8月14日、9月20日'), '6ガツ ミッカ、 8ガツ 14カ、 9ガツ ハツカ', '日の読み');
  eq(kana('公布の日から起算して三月を経過した日'), 'コーフノ ヒカラ キサン シテ 3ゲツヲ ケイカ シタ ヒ', '期間の月はゲツ');
  eq(kana('附則第一条ただし書'), 'フソク ダイ1ジョー タダシガキ', '附則・ただし書');
  eq(kana('各号に掲げる'), 'カク ゴーニ カカゲル', '接頭語の各');
  eq(kana('旧規則'), 'キュー キソク', '接頭語の旧');
  eq(kana('施行前に'), 'シコー マエニ', '施行前');
  eq(kana('就学前の支援'), 'シューガクゼンノ シエン', '就学前');
  eq(kana('国民の間に'), 'コクミンノ アイダニ', 'の間');
  eq(kana('厚生労働省令で定める数'), 'コーセイ ロードー ショーレイデ サダメル スー', '省令・数');
  eq(kana('当たつては'), 'アタッテワ', '法令の大きい「つ」');
  eq(kana('希望する方は'), 'キボー スル カタワ', '人の方');
  eq(kana('市町村長又は'), 'シチョーソンチョー マタワ', '長');
  eq(kana('二行目です'), '2ギョーメデス', '行数の行はギョー');
  eq(kana('銀行に行く'), 'ギンコーニ イク', '銀行はそのまま');
  eq(kana('第一項 の規定'), 'ダイ1コーノ キテイ', '組版のスペース');
  console.log(`corpus: all passed (${n})`);
})().catch(e => { console.error(e); process.exit(1); });

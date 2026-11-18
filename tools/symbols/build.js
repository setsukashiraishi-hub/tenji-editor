// 記号・絵文字・まれな漢字の表を作る（js/symbols-data.js と js/kanji-unihan.js）
//
// 使い方: node tools/symbols/build.js <データのフォルダ>
//   データのフォルダに置くもの（どれも Unicode, Inc. が公開しているもの。ライセンスは Unicode License v3）
//     UnicodeData.txt                 https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt
//     EquivalentUnifiedIdeograph.txt  https://www.unicode.org/Public/UCD/latest/ucd/EquivalentUnifiedIdeograph.txt
//     Unihan_Readings.txt / Unihan_Variants.txt / Unihan_IRGSources.txt   https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip
//     ja_ann.json / ja_der.json       CLDR の日本語の注釈（cldr-json の cldr-annotations-full / cldr-annotations-derived-full の ja/annotations.json）
//
// 出力する表の1行：「文字 \t 種類 \t 値」
//   m 置き換え（値の文字に置き換えてから点訳する）   r 読み（語として仮名で読む）
//   o 読み（数学の記号・矢印。前後を区切る）          c 通貨（数のあとに読む：$5 → 5ドル）
//   d 説明（点訳者挿入符 ⦅ ⦆ の中に名前を書く。設定で省くこともできる）
//   x 省く                                           X 省いて、校正箇所の一覧に出す（値は理由）
//   l 横線（棒線 ⠒⠒ にする）                         i 発音記号の字（国際音声記号の点字。IPA Braille にない音声学の字を名前から作ったもの）
// 仮名の読みは、エディタの変換エンジン（kuromoji）で漢字の名前を仮名にしたもの。読み誤るものは下の表で直してある。
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
if (!DIR) { console.error('使い方: node tools/symbols/build.js <データのフォルダ>'); process.exit(1); }
const ROOT = path.join(__dirname, '../..');
const { getTokenizer, engine: E } = require(path.join(ROOT, 'test/harness'));
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const hex = cp => cp.toString(16).toUpperCase().padStart(4, '0');
const ch = cp => String.fromCodePoint(cp);

// ---------- Unicode のデータ ----------
const UD = new Map(); // cp → { name, gc, ccc, decomp }
{
  let rangeStart = null;
  for (const line of read('UnicodeData.txt').split('\n')) {
    if (!line) continue;
    const f = line.split(';');
    const cp = parseInt(f[0], 16);
    if (/, First>$/.test(f[1])) { rangeStart = cp; continue; }
    if (/, Last>$/.test(f[1])) { rangeStart = null; continue; }
    UD.set(cp, { name: f[1], gc: f[2], ccc: +f[3], decomp: f[5] });
  }
}
const name = cp => (UD.get(cp) || {}).name || '';
const gc = cp => (UD.get(cp) || {}).gc || 'Cn';
const ja = JSON.parse(read('ja_ann.json')).annotations.annotations;
const jd = JSON.parse(read('ja_der.json')).annotationsDerived.annotations;
const cldr = c => { const v = ja[c] || jd[c]; return v && v.tts && v.tts[0]; };

// ---------- 名前を仮名にする ----------
// kuromoji が誤って読む言葉は、先にひらがなにしておく（長い言葉から）
const PRE = [
  ['上向き', 'ウエムキ'], ['下向き', 'シタムキ'], ['右向き', 'ミギムキ'], ['左向き', 'ヒダリムキ'],
  ['上向', 'ウエムキ'], ['下向', 'シタムキ'], ['右向', 'ミギムキ'], ['左向', 'ヒダリムキ'],
  ['右上がり', 'ミギアガリ'], ['右下がり', 'ミギサガリ'], ['左右', 'サユー'],
  ['右上', 'ミギウエ'], ['右下', 'ミギシタ'], ['左上', 'ヒダリウエ'], ['左下', 'ヒダリシタ'],
  ['上矢印', 'ウエ ヤジルシ'], ['下矢印', 'シタ ヤジルシ'], ['右矢印', 'ミギ ヤジルシ'], ['左矢印', 'ヒダリ ヤジルシ'],
  ['上カーブ', 'ウエ カーブ'], ['下カーブ', 'シタ カーブ'], ['右カーブ', 'ミギ カーブ'], ['左カーブ', 'ヒダリ カーブ'],
  ['上半', 'ウエハン'], ['下半', 'シタハン'], ['左半', 'ヒダリハン'], ['右半', 'ミギハン'],
  ['上指差し', 'ウエ ユビサシ'], ['下指差し', 'シタ ユビサシ'], ['下付き', 'シタツキ'], ['上付き', 'ウワツキ'],
  ['右折', 'ウセツ'], ['左折', 'サセツ'], ['下曲がり', 'シタ マガリ'], ['左曲がり', 'ヒダリ マガリ'],
  ['右縦棒', 'ミギ タテボー'], ['左縦棒', 'ヒダリ タテボー'], ['高速上', 'コーソク ウエ'], ['高速下', 'コーソク シタ'],
  ['二等辺三角形', 'ニトーヘン サンカッケイ'], ['直角三角形', 'チョッカク サンカッケイ'], ['三角形', 'サンカッケイ'], ['四角形', 'シカッケイ'], ['十字架', 'ジュージカ'],
  ['四分円弧', 'シブン エンコ'], ['四分円', 'シブンエン'], ['四角', 'シカク'], ['三角', 'サンカク'], ['二重', 'ニジュー'], ['三重', 'サンジュー'],
  ['二等辺', 'ニトーヘン'], ['八分', 'ハチブ'], ['四分', 'シブ'], ['二分', 'ニブ'], ['十六分', '16ブ'], ['全音', 'ゼンオン'],
  ['十字', 'ジュージ'], ['三点', 'サンテン'], ['二点', 'ニテン'],
  ['演算子', 'エンザンシ'], ['直和', 'チョクワ'], ['真部分集合', 'シン ブブン シューゴー'], ['空集合', 'クーシューゴー'],
  ['後にある', 'アトニ アル'], ['後にはない', 'アトニワ ナイ'], ['元として', 'ゲントシテ'], ['節記号', 'セツ キゴー'],
  ['無限大記号', 'ムゲンダイ キゴー'], ['次の間に', 'ツギノ アイダニ'], ['分綴点', 'ブンテツテン'], ['米印', 'コメジルシ'],
  ['前置関係', 'ゼンチ カンケイ'], ['後置関係', 'コーチ カンケイ'], ['救命浮環', 'キューメイ フカン'], ['妊夫', 'ニンプ'], ['隕石', 'インセキ'],
  ['波括弧', 'ナミ カッコ'], ['角括弧', 'カク カッコ'], ['二重山括弧', 'ニジュー ヤマ カッコ'], ['山括弧', 'ヤマ カッコ'],
  ['隅付き括弧', 'スミツキ カッコ'], ['亀甲括弧', 'キッコー カッコ'], ['鉤括弧', 'カギ カッコ'], ['開き', 'ヒラキ'], ['閉じ', 'トジ'],
  ['銛型', 'モリガタ'], ['鏃', 'ヤジリ'], ['特大', 'トクダイ'], ['白十字', 'シロ ジュージ'], ['縦三点', 'タテ サンテン'],
  ['うお座', 'ウオザ'], ['へびつかい座', 'ヘビツカイザ'], ['いて座', 'イテザ'], ['みずがめ座', 'ミズガメザ'], ['おひつじ座', 'オヒツジザ'],
  ['おうし座', 'オウシザ'], ['ふたご座', 'フタゴザ'], ['かに座', 'カニザ'], ['しし座', 'シシザ'], ['おとめ座', 'オトメザ'],
  ['てんびん座', 'テンビンザ'], ['さそり座', 'サソリザ'], ['やぎ座', 'ヤギザ'],
  ['鶏もも肉', 'トリ モモニク'], ['寝待月', 'ネマチヅキ'], ['下弦', 'カゲン'], ['上弦', 'ジョーゲン'],
  ['左', 'ヒダリ'], ['右', 'ミギ']
];
// 形の大きさ（黒四角大 → クロ シカク ダイ）
const SIZE = [[/(シカク|サンカク|丸|ひし形)大$/, '$1 ダイ'], [/(シカク|サンカク|丸|ひし形)中$/, '$1 チュー'], [/(シカク|サンカク|丸|ひし形)小$/, '$1 ショー']];
let TK = null;
const kanaCache = new Map();
function toKana(jp) {
  if (kanaCache.has(jp)) return kanaCache.get(jp);
  let s = jp.replace(/[ｎ]/g, 'n').replace(/：/g, ': ').replace(/[（(]([^）)]*)[）)]/g, ' $1');
  for (const [a, b] of PRE) s = s.split(a).join(' ' + b + ' ');
  s = s.replace(/ +/g, ' ').trim();
  for (const [re, b] of SIZE) s = s.replace(re, b);
  // 「家族: 大人二人と子供一人」のような「何: どんな」は「どんな 何」に
  const m = /^(.+?):\s*(.+)$/.exec(s);
  if (m) s = m[2] + 'の' + m[1];
  const r = E.sumijiToKana(s, t => TK.tokenize(t), {});
  let k = r.kana.replace(/[「」『』]/g, '').replace(/\s+/g, ' ').trim().replace(/ (ノ|ニ|ヲ|ガ|ワ|デ|ト|モ|ヘ|ヤ)(?= |$)/g, '$1');
  kanaCache.set(jp, k);
  if (r.unresolved.length) unresolvedNames.push(jp + ' → ' + k);
  return k;
}
const unresolvedNames = [];

// ---------- 手で決めた表（読み・置き換え）----------
// 値が仮名のものはカタカナで書く（分かち書きずみ）
const MANUAL = {
  // ラテン1補助
  '¡': ['x'], '¿': ['x'], '¤': ['c', 'ツーカ'], '¨': ['d', 'ウムラウト'], '©': ['d', 'コピーライト'], 'ª': ['m', 'a'], 'º': ['m', 'o'],
  '«': ['m', '“'], '»': ['m', '”'], '¬': ['r', 'ヒテイ'], '®': ['d', 'トーロク ショーヒョー'], '¯': ['x'], '´': ['x'], '¸': ['x'],
  // 修飾文字（発音記号のものはエンジンが発音記号として扱う）
  'ʹ': ['m', '′'], 'ʺ': ['m', '″'], 'ʻ': ['m', 'ʼ'], 'ʽ': ['m', 'ʼ'], 'ʾ': ['m', 'ʼ'], 'ʿ': ['m', 'ʼ'],
  '˂': ['m', '<'], '˃': ['m', '>'], '˄': ['m', '^'], '˅': ['x'],
  'ˆ': ['d', 'サーカムフレックス'], 'ˇ': ['d', 'キャロン'], 'ˉ': ['d', 'マクロン'], 'ˊ': ['d', 'アキュート アクセント'], 'ˋ': ['d', 'グレーブ アクセント'],
  'ˍ': ['x'], '˘': ['d', 'ブレーブ'], '˙': ['d', 'ドット'], '˚': ['d', 'リング'], '˛': ['d', 'オゴネク'], '˜': ['m', '～'], '˝': ['d', 'ダブル アキュート アクセント'], '˟': ['x'],
  // 一般句読点
  '‒': ['m', '-'], '‖': ['o', ''], '‗': ['x'], '‚': ['m', '“'], '‛': ['m', '“'], '„': ['m', '“'], '‟': ['m', '“'],
  '‣': ['m', '・'], '․': ['m', '.'], '‱': ['r', 'パーミリアド'], '′': ['r', 'ダッシュ'], '″': ['r', 'ニジュー ダッシュ'], '‴': ['r', 'サンジュー ダッシュ'],
  '‵': ['m', '“'], '‶': ['m', '“'], '‷': ['m', '“'], '‸': ['x'], '‹': ['m', '〈'], '›': ['m', '〉'], '‽': ['m', '?!'], '‾': ['x'], '‿': ['x'], '⁀': ['x'],
  '⁁': ['x'], '⁃': ['m', '・'], '⁄': ['m', '/'], '⁅': ['m', '［'], '⁆': ['m', '］'], '⁇': ['m', '??'], '⁊': ['m', '&'], '⁋': ['x'],
  '⁌': ['m', '・'], '⁍': ['m', '・'], '⁏': ['m', ';'], '⁐': ['x'], '⁒': ['r', 'マイナス'], '⁓': ['m', '～'], '⁔': ['x'], '⁕': ['m', '＊'],
  '⁖': ['x'], '⁗': ['r', 'ヨンジュー ダッシュ'], '⁘': ['x'], '⁙': ['x'], '⁚': ['x'], '⁛': ['x'], '⁜': ['x'], '⁝': ['x'], '⁞': ['x'],
  // 通貨
  '₠': ['c', 'エキュ'], '₡': ['c', 'コロン'], '₢': ['c', 'クルゼイロ'], '₣': ['c', 'フラン'], '₤': ['c', 'リラ'], '₥': ['c', 'ミル'], '₦': ['c', 'ナイラ'],
  '₧': ['c', 'ペセタ'], '₨': ['c', 'ルピー'], '₩': ['c', 'ウォン'], '₪': ['c', 'シェケル'], '₫': ['c', 'ドン'], '€': ['c', 'ユーロ'], '₭': ['c', 'キープ'],
  '₮': ['c', 'トゥグルグ'], '₯': ['c', 'ドラクマ'], '₰': ['c', 'ペニヒ'], '₱': ['c', 'ペソ'], '₲': ['c', 'グアラニー'], '₳': ['c', 'アウストラル'],
  '₴': ['c', 'フリヴニャ'], '₵': ['c', 'セディ'], '₶': ['c', 'リーヴル トゥルノワ'], '₷': ['c', 'スペスミロ'], '₸': ['c', 'テンゲ'], '₹': ['c', 'ルピー'],
  '₺': ['c', 'リラ'], '₻': ['c', 'マルク'], '₼': ['c', 'マナト'], '₽': ['c', 'ルーブル'], '₾': ['c', 'ラリ'], '₿': ['c', 'ビットコイン'],
  '⃀': ['c', 'ソム'], '⃁': ['c', 'リヤル'], '֏': ['c', 'ドラム'], '؋': ['c', 'アフガニ'], '৲': ['c', 'ルピー'], '৳': ['c', 'タカ'],
  '૱': ['c', 'ルピー'], '௹': ['c', 'ルピー'], '฿': ['c', 'バーツ'], '៛': ['c', 'リエル'], '﷼': ['c', 'リヤル'],
  // 文字のような記号
  '℄': ['d', 'センター ライン'], 'ℇ': ['r', 'オイラー テイスー'], '℈': ['d', 'スクループル'], '℔': ['c', 'ポンド'], 'ℏ': ['r', 'エイチ バー'],
  '℗': ['d', 'レコードノ チョサクケン マーク'], '℞': ['d', 'ショホーセン'], '℟': ['d', 'レスポンス'], '℣': ['d', 'バーシクル'], '℥': ['r', 'オンス'],
  'Ω': ['r', 'オーム'], '℧': ['r', 'モー'], '℩': ['d', 'サカサノ イオタ'], '℮': ['d', 'イー マーク'], 'Ⅎ': ['d', 'サカサノ F'],
  'ℵ': ['r', 'アレフ'], 'ℶ': ['r', 'ベート'], 'ℷ': ['r', 'ギメル'], 'ℸ': ['r', 'ダレット'], 'ℹ': ['d', 'インフォメーション'], '℺': ['d', 'カイテンシタ Q'],
  '⅁': ['d', 'サカサノ G'], '⅂': ['d', 'サカサノ L'], '⅃': ['d', 'ハンテンシタ L'], '⅄': ['d', 'サカサノ Y'], '⅊': ['d', 'キョーカイセン'],
  '⅋': ['m', '&'], '⅌': ['r', 'パー'], 'ⅎ': ['d', 'サカサノ f'], '⅏': ['d', 'サマリア ゲンテン'],
  // 数字の形
  'ↀ': ['m', 'M'], 'ↁ': ['r', 'ローマ スージノ 5000'], 'ↂ': ['r', 'ローマ スージノ 10000'], 'Ↄ': ['d', 'サカサノ C'], 'ↄ': ['d', 'サカサノ c'],
  'ↅ': ['m', 'VI'], 'ↆ': ['m', 'L'], 'ↇ': ['r', 'ローマ スージノ 50000'], 'ↈ': ['r', 'ローマ スージノ 100000'], '↊': ['d', 'デック'], '↋': ['d', 'エル'],
  // 矢印（点字の矢印 → ← ↔ と、読み）
  '↕': ['r', 'ジョーゲ ヤジルシ'], '↖': ['r', 'ヒダリナナメ ウエムキ ヤジルシ'], '↗': ['r', 'ミギナナメ ウエムキ ヤジルシ'],
  '↘': ['r', 'ミギナナメ シタムキ ヤジルシ'], '↙': ['r', 'ヒダリナナメ シタムキ ヤジルシ'], '↻': ['r', 'トケイ マワリノ ヤジルシ'], '↺': ['r', 'ハントケイ マワリノ ヤジルシ'],
  // 数学（よく使うものは読み方で。ほかは CLDR の名前）
  '∀': ['r', 'スベテノ'], '∃': ['r', 'ソンザイ スル'], '∄': ['r', 'ソンザイ シナイ'], '∂': ['r', 'ラウンド'], '∅': ['r', 'クーシューゴー'], '∆': ['r', 'デルタ'],
  '∇': ['r', 'ナブラ'], '∈': ['r', 'ゾクスル'], '∉': ['r', 'ゾクサナイ'], '∊': ['r', 'ゾクスル'], '∋': ['r', 'ヨーソトシテ フクム'], '∌': ['r', 'ヨーソトシテ フクマナイ'],
  '∏': ['r', 'パイ'], '∐': ['r', 'ソーワ'], '∑': ['r', 'シグマ'], '∔': ['r', 'プラス'], '∕': ['m', '/'], '∖': ['r', 'サシューゴー'], '∗': ['m', '＊'],
  '∘': ['r', 'マル'], '∙': ['m', '・'], '∛': ['r', '3ジョーコン'], '∜': ['r', '4ジョーコン'], '∝': ['r', 'ヒレイ'], '∟': ['r', 'チョッカク'], '∡': ['r', 'カク'], '∢': ['r', 'カク'],
  '∣': ['r', 'ワリキル'], '∤': ['r', 'ワリキレナイ'], '∦': ['r', 'ヘイコーデ ナイ'], '∧': ['r', 'カツ'], '∨': ['r', 'マタワ'], '∩': ['r', 'キャップ'], '∪': ['r', 'カップ'],
  '∬': ['r', 'ニジュー セキブン'], '∭': ['r', 'サンジュー セキブン'], '∮': ['r', 'シューカイ セキブン'], '∯': ['r', 'メン セキブン'], '∰': ['r', 'タイセキ セキブン'],
  '∶': ['r', 'タイ'], '∷': ['r', 'ヒ'], '∸': ['r', 'マイナス'], '∺': ['r', 'キカ ヒ'], '∼': ['m', '～'], '∽': ['r', 'ソージ'], '≁': ['r', 'ソージデ ナイ'],
  '≃': ['r', 'ニアリー イコール'], '≄': ['r', 'ニアリー イコールデ ナイ'], '≅': ['r', 'ゴードー'], '≆': ['r', 'ゴードーデ ナイ'], '≇': ['r', 'ゴードーデ ナイ'],
  '≉': ['r', 'ニアリー イコールデ ナイ'], '≊': ['r', 'ニアリー イコール'], '≋': ['r', 'ニアリー イコール'], '≍': ['r', 'ドーチ'], '≎': ['r', 'ドーチ'],
  '≐': ['r', 'キョクゲンデ ヒトシイ'], '≑': ['r', 'ニアリー イコール'], '≓': ['r', 'ニアリー イコール'], '≔': ['r', 'テイギ'], '≕': ['r', 'テイギ'], '≙': ['r', 'タイオー スル'],
  '≜': ['r', 'テイギ'], '≝': ['r', 'テイギ'], '≟': ['r', 'ヒトシイカ'], '≡': ['r', 'ゴードー'], '≢': ['r', 'ゴードーデ ナイ'], '≣': ['r', 'ドートー'],
  '≪': ['r', 'ヒジョーニ チイサイ'], '≫': ['r', 'ヒジョーニ オオキイ'], '≮': ['r', 'ショーナリデ ナイ'], '≯': ['r', 'ダイナリデ ナイ'],
  '≰': ['r', 'ショーナリ イコールデ ナイ'], '≱': ['r', 'ダイナリ イコールデ ナイ'], '≲': ['r', 'ショーナリ ニアリー イコール'], '≳': ['r', 'ダイナリ ニアリー イコール'],
  '⊂': ['r', 'フクマレル'], '⊃': ['r', 'フクム'], '⊄': ['r', 'フクマレナイ'], '⊅': ['r', 'フクマナイ'], '⊆': ['r', 'フクマレル'], '⊇': ['r', 'フクム'],
  '⊈': ['r', 'フクマレナイ'], '⊉': ['r', 'フクマナイ'], '⊊': ['r', 'シンニ フクマレル'], '⊋': ['r', 'シンニ フクム'],
  '⊕': ['r', 'マル プラス'], '⊖': ['r', 'マル マイナス'], '⊗': ['r', 'マル カケル'], '⊘': ['r', 'マル スラッシュ'], '⊙': ['r', 'マル ドット'],
  '⊢': ['r', 'ミチビク'], '⊣': ['r', 'ミチビカレル'], '⊤': ['r', 'シン'], '⊥': ['r', 'スイチョク'], '⊨': ['r', 'イミ スル'], '⊻': ['r', 'ハイタテキ ロンリワ'],
  '⊼': ['r', 'ナンド'], '⊽': ['r', 'ノア'], '⊿': ['r', 'チョッカク サンカッケイ'], '⋀': ['r', 'カツ'], '⋁': ['r', 'マタワ'], '⋂': ['r', 'キャップ'], '⋃': ['r', 'カップ'],
  '⋄': ['r', 'ヒシガタ'], '⋅': ['m', '・'], '⋆': ['m', '＊'], '⋈': ['r', 'シゼン ケツゴー'], '⋮': ['m', ' '], '⋯': ['m', '…'], '⋰': ['m', ' '], '⋱': ['m', ' '],
  '⌀': ['r', 'チョッケイ'], '⌂': ['d', 'イエ'], '⌃': ['d', 'コントロール キー'], '⌄': ['x'], '⌅': ['x'], '⌆': ['x'],
  '❛': ['m', '“'], '❜': ['m', '”'], '❝': ['m', '“'], '❞': ['m', '”'], '❟': ['m', '“'], '❠': ['m', '“'], '❡': ['x'], '❢': ['m', '!'],
  '✗': ['r', 'バツ'], '✘': ['r', 'バツ'], '⟨': ['m', '〈'], '⟩': ['m', '〉'], '℘': ['o', 'ワイエルシュトラスノ ペー'], '⌈': ['m', '［'], '⌉': ['m', '］'], '⌊': ['m', '［'], '⌋': ['m', '］'], '⌐': ['r', 'ヒテイ'], '⌒': ['r', 'コ'], '⌓': ['r', 'ユミガタ'],
  '⌘': ['d', 'コマンド キー'], '⌜': ['m', '「'], '⌝': ['m', '」'], '⌞': ['m', '「'], '⌟': ['m', '」'], '⌠': ['x'], '⌡': ['x'], '⌢': ['r', 'コ'], '⌣': ['r', 'コ'],
  '⌤': ['d', 'エンター キー'], '⌥': ['d', 'オプション キー'], '⌦': ['d', 'デリート キー'], '⌧': ['d', 'クリア キー'], '⌫': ['d', 'バックスペース キー'],
  '⌬': ['d', 'ベンゼンカン'], '⎋': ['d', 'エスケープ キー'], '⏎': ['d', 'リターン キー'], '⎈': ['d', 'ヘルム'], '⎌': ['d', 'モトニ モドス'],
  '⏻': ['d', 'デンゲン'], '⏼': ['d', 'デンゲン'], '⏽': ['d', 'デンゲン オン'], '⏾': ['d', 'スリープ'], '⏨': ['m', 'E'],
  // 図形・記号で CLDR にないもの
  '☇': ['d', 'イナズマ'], '☈': ['d', 'ライウ'], '☉': ['d', 'タイヨー'], '☊': ['d', 'ショーコーテン'], '☋': ['d', 'コーコーテン'], '☌': ['d', 'ゴー'], '☍': ['d', 'ショー'],
  '☒': ['d', 'バツジルシノ ハイッタ シカク'], '☓': ['r', 'バツ'], '☖': ['r', 'ゴテ'], '☗': ['r', 'センテ'], '☙': ['x'],
  '☚': ['d', 'ヒダリヲ サス ユビ'], '☛': ['d', 'ミギヲ サス ユビ'], '☜': ['d', 'ヒダリヲ サス ユビ'], '☞': ['d', 'ミギヲ サス ユビ'], '☟': ['d', 'シタヲ サス ユビ'],
  '☡': ['d', 'チューイ'], '☤': ['d', 'ヘルメスノ ツエ'], '☥': ['d', 'アンク'], '☧': ['d', 'カイ ロー'], '☨': ['d', 'ロレーヌ ジュージ'], '☩': ['d', 'エルサレム ジュージ'],
  '☫': ['d', 'ペルシャノ シンボル'], '☬': ['d', 'カンダ'], '☭': ['d', 'カマト ハンマー'],
  '☰': ['d', 'ハッケノ ケン'], '☱': ['d', 'ハッケノ ダ'], '☲': ['d', 'ハッケノ リ'], '☳': ['d', 'ハッケノ シン'], '☴': ['d', 'ハッケノ ソン'], '☵': ['d', 'ハッケノ カン'],
  '☶': ['d', 'ハッケノ ゴン'], '☷': ['d', 'ハッケノ コン'], '☻': ['d', 'エガオ'], '☼': ['d', 'タイヨー'], '☽': ['d', 'ミカヅキ'], '☾': ['d', 'ミカヅキ'],
  '☿': ['d', 'スイセイ'], '♁': ['d', 'チキュー'], '♃': ['d', 'モクセイ'], '♄': ['d', 'ドセイ'], '♅': ['d', 'テンノーセイ'], '♆': ['d', 'カイオーセイ'], '♇': ['d', 'メイオーセイ'],
  '♀': ['r', 'メス'], '♂': ['r', 'オス'],
  '♔': ['d', 'チェスノ シロノ キング'], '♕': ['d', 'チェスノ シロノ クイーン'], '♖': ['d', 'チェスノ シロノ ルーク'], '♗': ['d', 'チェスノ シロノ ビショップ'],
  '♘': ['d', 'チェスノ シロノ ナイト'], '♙': ['d', 'チェスノ シロノ ポーン'], '♚': ['d', 'チェスノ クロノ キング'], '♛': ['d', 'チェスノ クロノ クイーン'],
  '♜': ['d', 'チェスノ クロノ ルーク'], '♝': ['d', 'チェスノ クロノ ビショップ'], '♞': ['d', 'チェスノ クロノ ナイト'], '♟': ['d', 'チェスノ クロノ ポーン'],
  '♡': ['d', 'ハート'], '♢': ['d', 'ダイヤ'], '♤': ['d', 'スペード'], '♧': ['d', 'クラブ'], '♩': ['d', 'シブ オンプ'], '♪': ['d', 'オンプ'], '♫': ['d', 'オンプ'], '♬': ['d', 'オンプ'],
  '♮': ['r', 'ナチュラル'], '♭': ['r', 'フラット'], '♯': ['r', 'シャープ'], '♰': ['d', 'ジュージ'], '♱': ['d', 'ジュージ'],
  '♲': ['d', 'リサイクル マーク'], '♳': ['d', 'リサイクル マーク'], '♴': ['d', 'リサイクル マーク'], '♵': ['d', 'リサイクル マーク'], '♶': ['d', 'リサイクル マーク'],
  '♷': ['d', 'リサイクル マーク'], '♸': ['d', 'リサイクル マーク'], '♹': ['d', 'リサイクル マーク'], '♺': ['d', 'リサイクル マーク'], '♼': ['d', 'サイセイシ マーク'], '♽': ['d', 'サイセイシ マーク'],
  '⚀': ['d', 'サイコロノ 1'], '⚁': ['d', 'サイコロノ 2'], '⚂': ['d', 'サイコロノ 3'], '⚃': ['d', 'サイコロノ 4'], '⚄': ['d', 'サイコロノ 5'], '⚅': ['d', 'サイコロノ 6'],
  '⚐': ['d', 'シロイ ハタ'], '⚑': ['d', 'クロイ ハタ'], '⚘': ['d', 'ハナ'], '⚚': ['d', 'ヘルメスノ ツエ'], '⚝': ['d', 'ホシ'], '⚢': ['d', 'ジョセイノ マーク'], '⚣': ['d', 'ダンセイノ マーク'],
  '⚤': ['d', 'ダンセイト ジョセイノ マーク'], '⚥': ['d', 'ダンセイト ジョセイノ マーク'], '⚦': ['d', 'セイベツノ マーク'], '⚨': ['d', 'セイベツノ マーク'], '⚩': ['d', 'セイベツノ マーク'],
  '⚬': ['d', 'マル'], '⚭': ['d', 'ケッコン'], '⚮': ['d', 'リコン'], '⚯': ['d', 'パートナー'], '⚲': ['d', 'チューセイ'], '⚿': ['d', 'カギ'],
  '⛀': ['d', 'チェッカーノ コマ'], '⛁': ['d', 'チェッカーノ コマ'], '⛂': ['d', 'チェッカーノ コマ'], '⛃': ['d', 'チェッカーノ コマ'], '⛆': ['d', 'アメ'], '⛇': ['d', 'ユキダルマ'],
  '⛉': ['d', 'ショーギノ コマ'], '⛊': ['d', 'ショーギノ コマ'], '⛌': ['d', 'コーサ'], '⛍': ['d', 'コショーシャ'], '⛐': ['d', 'スリップ チューイ'], '⛒': ['d', 'ツーコードメ'],
  '⛝': ['r', 'バツ'], '⛟': ['d', 'トラック'], '⛢': ['d', 'テンノーセイ'], '⛤': ['d', 'ゴボーセイ'], '⛥': ['d', 'ゴボーセイ'], '⛦': ['d', 'ゴボーセイ'], '⛧': ['d', 'ゴボーセイ'],
  '⛫': ['d', 'シロ'], '⛬': ['d', 'シセキ'], '⛭': ['d', 'ハグルマ'], '⛮': ['d', 'ハグルマ'], '⛯': ['d', 'トーダイ'], '⛻': ['d', 'ギンコー'], '⛼': ['d', 'ボチ'], '⛿': ['d', 'ハタ'],
  // CJK の記号
  '〄': ['d', 'ジス マーク'], '〓': ['d', 'ゲタ キゴー'], '〞': ['m', '”'], '〠': ['d', 'ユービン マーク'], '\u302a': ['x'], '\u302b': ['x'], '\u302c': ['x'], '\u302d': ['x'], '〮': ['x'], '〯': ['x'],
  '〰': ['m', '～'], '〶': ['m', '〒'], '〷': ['x'], '〸': ['m', '10'], '〹': ['m', '20'], '〺': ['m', '30'], '〻': ['m', '々'], '〼': ['r', 'マス'], '〽': ['d', 'イオリテン'],
  '〾': ['x'], '〿': ['m', ' '], '〡': ['m', '1'], '〢': ['m', '2'], '〣': ['m', '3'], '〤': ['m', '4'], '〥': ['m', '5'], '〦': ['m', '6'], '〧': ['m', '7'], '〨': ['m', '8'], '〩': ['m', '9'],
  // 補助句読点
  'ⸯ': ['x'], '⸗': ['m', '-'], '⸚': ['m', '-'], '⸛': ['m', '～'], '⸞': ['m', '～'], '⸟': ['m', '～'], '⸢': ['m', '［'], '⸣': ['m', '］'], '⸤': ['m', '［'], '⸥': ['m', '］'],
  '⸦': ['m', '（'], '⸧': ['m', '）'], '⸨': ['m', '｟'], '⸩': ['m', '｠'], '⸮': ['m', '?'], '⸰': ['m', '・'], '⸱': ['m', '・'], '⸲': ['m', ','], '⸳': ['m', '・'],
  '⸴': ['m', ','], '⸵': ['m', ';'], '⸶': ['m', '†'], '⸷': ['m', '†'], '⸸': ['m', '†'], '⸹': ['m', '§'], '⸺': ['m', '―'], '⸻': ['m', '―'], '⸼': ['m', '。'],
  '⹀': ['m', '-'], '⹁': ['m', '、'], '⹂': ['m', '“'], '⹃': ['m', '―'], '⹊': ['m', '/'], '⹋': ['m', '†'], '⹌': ['m', ','], '⹒': ['m', '&'], '⹓': ['m', '!'], '⹔': ['m', '?'],
  '⹕': ['m', '［'], '⹖': ['m', '］'], '⹗': ['m', '［'], '⹘': ['m', '］'], '⹙': ['m', '（'], '⹚': ['m', '）'], '⹛': ['m', '（'], '⹜': ['m', '）'], '⹝': ['m', '-'],
  // 特殊
  '\ufffc': ['x'], '\ufff9': ['x'], '\ufffa': ['x'], '\ufffb': ['x'],
  '\ufffd': ['X', '文字化けした字（読めなかった字の印）がありました。もとの文書で確かめてください'], // U+FFFD REPLACEMENT CHARACTER
  '\uab5b': ['x'], // 発音記号の飾り（MODIFIER BREVE WITH INVERTED BREVE）
  'ꟾ': ['m', 'I'], // 碑文の長い I（LATIN EPIGRAPHIC LETTER I LONGA）
  '㉿': ['d', 'カンコク コーギョー キカクノ マーク'] // KOREAN STANDARD SYMBOL（KS マーク）
};
// 漢文の訓点（点字では書き下し文に直して書く：文部科学省「点字学習指導の手引」第6章）
for (let cp = 0x3190; cp <= 0x319f; cp++) MANUAL[ch(cp)] = ['X', '漢文の訓点（点字では書き下し文に直して書きます）'];
// 制御文字の図（␀ ␊ など）は略号の英字に
const CTRL = 'NUL SOH STX ETX EOT ENQ ACK BEL BS HT LF VT FF CR SO SI DLE DC1 DC2 DC3 DC4 NAK SYN ETB CAN EM SUB ESC FS GS RS US SP DEL'.split(' ');
CTRL.forEach((a, i) => { MANUAL[ch(0x2400 + i)] = ['m', a]; });
Object.assign(MANUAL, { '␢': ['d', 'クーハク'], '␣': ['d', 'クーハク'], '␤': ['m', 'NL'], '␥': ['x'], '␦': ['m', 'SUB'], '␧': ['x'], '␨': ['x'], '␩': ['x'] });

// ---------- 名前から決める ----------
const has = (n, w) => new RegExp('\\b' + w + '\\b').test(n);
// 矢印の向き
function arrowKind(n) {
  if (/WITH (?:DOUBLE |VERTICAL )?STROKE|NOT /.test(n)) return null; // 否定の矢印は名前で
  const L = /LEFTWARDS|LEFT-POINTING|\bLEFT\b|WESTWARDS|\bWEST\b(?! )/.test(n), R = /RIGHTWARDS|RIGHT-POINTING|\bRIGHT\b|EASTWARDS/.test(n);
  const U = /UPWARDS|UP-POINTING|\bUP\b|NORTHWARDS/.test(n), Dn = /DOWNWARDS|DOWN-POINTING|\bDOWN\b|SOUTHWARDS/.test(n);
  if (/NORTH EAST/.test(n)) return ['r', 'ミギナナメ ウエムキ ヤジルシ'];
  if (/SOUTH EAST/.test(n)) return ['r', 'ミギナナメ シタムキ ヤジルシ'];
  if (/SOUTH WEST/.test(n)) return ['r', 'ヒダリナナメ シタムキ ヤジルシ'];
  if (/NORTH WEST/.test(n)) return ['r', 'ヒダリナナメ ウエムキ ヤジルシ'];
  if (/ANTICLOCKWISE|COUNTERCLOCKWISE/.test(n)) return ['r', 'ハントケイ マワリノ ヤジルシ'];
  if (/CLOCKWISE/.test(n)) return ['r', 'トケイ マワリノ ヤジルシ'];
  if (L && R) return ['m', '↔'];
  if (U && Dn) return ['r', 'ジョーゲ ヤジルシ'];
  if (R && !L) return ['m', '→'];
  if (L && !R) return ['m', '←'];
  if (U) return ['r', 'ウエムキ ヤジルシ'];
  if (Dn) return ['r', 'シタムキ ヤジルシ'];
  return null;
}
// 英語の名前の言葉 → 日本語（CLDR に名前のない記号の説明を作る）
const W = {
  BLACK: 'クロイ', WHITE: 'シロイ', HEAVY: 'フトイ', LIGHT: 'ホソイ', BOLD: 'フトイ', LARGE: 'オオキイ', SMALL: 'チイサイ', MEDIUM: 'チューグライノ',
  SQUARE: 'シカク', CIRCLE: 'マル', TRIANGLE: 'サンカク', DIAMOND: 'ヒシガタ', LOZENGE: 'ヒシガタ', STAR: 'ホシ', PENTAGON: 'ゴカッケイ', HEXAGON: 'ロッカッケイ',
  OCTAGON: 'ハッカッケイ', ELLIPSE: 'ダエン', RECTANGLE: 'チョーホーケイ', PARALLELOGRAM: 'ヘイコー シヘンケイ', HEART: 'ハート', CROSS: 'ジュージ', SALTIRE: 'バツ',
  ARROW: 'ヤジルシ', ARROWHEAD: 'ヤジリ', BULLET: 'ビュレット', DOT: 'テン', DOTS: 'テン', LINE: 'セン', BAR: 'ボー', ASTERISK: 'アステリスク', FLORETTE: 'ハナ',
  FLOWER: 'ハナ', SNOWFLAKE: 'ユキノ ケッショー', SPARKLE: 'キラキラ', SUN: 'タイヨー', MOON: 'ツキ', CLOUD: 'クモ', HAND: 'テ', FINGER: 'ユビ', PENCIL: 'エンピツ',
  SCISSORS: 'ハサミ', TELEPHONE: 'デンワ', ENVELOPE: 'フートー', CHECK: 'チェック', BALLOT: 'チェック ボックス', FLAG: 'ハタ', SHIELD: 'タテ', KEY: 'カギ', BOOK: 'ホン',
  QUADRANT: 'シブンエン', ARC: 'コ', SEGMENT: 'ユミガタ', SECTOR: 'オーギガタ', SPIRAL: 'ウズマキ', WAVE: 'ナミ', BELL: 'ベル', CLOCK: 'トケイ', HOUSE: 'イエ',
  INTEGRAL: 'セキブン', SUMMATION: 'ソーワ', PRODUCT: 'セキ', PLUS: 'プラス', MINUS: 'マイナス', TIMES: 'カケル', DIVISION: 'ワル', EQUALS: 'イコール', EQUAL: 'イコール',
  'LESS-THAN': 'ショーナリ', 'GREATER-THAN': 'ダイナリ', SUBSET: 'ブブン シューゴー', SUPERSET: 'ジョーイ シューゴー', UNION: 'カップ', INTERSECTION: 'キャップ',
  LOGICAL_AND: 'ロンリセキ', LOGICAL_OR: 'ロンリワ', NOT: 'ヒテイ', TILDE: 'チルダ', ELEMENT: 'ヨーソ', ANGLE: 'カク', PARALLEL: 'ヘイコー', PERPENDICULAR: 'スイチョク',
  CIRCLED: 'マルカコミ', SQUARED: 'シカクカコミ', DOUBLE: 'ニジューノ', TRIPLE: 'サンジューノ', BRACKET: 'カッコ', PARENTHESIS: 'カッコ', TACK: 'タック', TURNSTILE: 'ターンスタイル',
  OPERATOR: 'エンザンシ', RELATION: 'カンケイ', SIMILAR: 'ソージ', IDENTICAL: 'ゴードー', APPROXIMATELY: 'ニアリー', PRECEDES: 'ゼンジュン', SUCCEEDS: 'コージュン',
  DIVIDES: 'ワリキル', PROPORTIONAL: 'ヒレイ', INFINITY: 'ムゲンダイ', NABLA: 'ナブラ', DIFFERENTIAL: 'ビブン', QUESTIONED: 'ギモン', RING: 'リング', SLASH: 'スラッシュ',
  SOLIDUS: 'スラッシュ', REVERSE: 'ギャク', REVERSED: 'ギャクノ', TURNED: 'サカサノ', ROTATED: 'カイテンシタ', INVERTED: 'サカサノ',
  CHESS: 'チェス', KING: 'キング', QUEEN: 'クイーン', ROOK: 'ルーク', BISHOP: 'ビショップ', KNIGHT: 'ナイト', PAWN: 'ポーン', EQUIHOPPER: 'エクイホッパー',
  LEFTWARDS: 'ヒダリムキ', RIGHTWARDS: 'ミギムキ', UPWARDS: 'ウエムキ', DOWNWARDS: 'シタムキ', STROKE: 'シャセン', CONTAINS: 'フクム', MEMBER: 'ヨーソ',
  CARD: 'カード', SPADES: 'スペード', HEARTS: 'ハート', DIAMONDS: 'ダイヤ', CLUBS: 'クラブ', DIE: 'サイコロ', DOMINO: 'ドミノ', TILE: 'パイ',
  KEYBOARD: 'キーボード', COMPUTER: 'コンピューター', MOUSE: 'マウス', PRINTER: 'プリンター', DISK: 'ディスク', FOLDER: 'フォルダー', DOCUMENT: 'ショルイ',
  MAP: 'チズ', BUILDING: 'タテモノ', CASTLE: 'シロ', TREE: 'キ', LEAF: 'ハ', BIRD: 'トリ', FISH: 'サカナ', SKULL: 'ドクロ', CANDLE: 'ロウソク', LOCK: 'カギ'
};
const MODIFIER = new Set(['クロイ', 'シロイ', 'フトイ', 'ホソイ', 'オオキイ', 'チイサイ', 'チューグライノ', 'ニジューノ', 'サンジューノ', 'ギャク', 'ギャクノ', 'サカサノ', 'カイテンシタ', 'マルカコミ', 'シカクカコミ', 'ロンリ', 'ヒテイ', 'シャセン']);
function describe(n) {
  const words = n.replace(/LOGICAL (AND|OR)/g, 'LOGICAL_$1').replace(/-/g, ' - ').split(/\s+/);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i] === '-' ? null : words[i];
    if (!w) continue;
    const j = W[w] || W[w + (words[i + 1] === '-' ? '-' + (words[i + 2] || '') : '')];
    if (j && !out.includes(j)) out.push(j);
  }
  return out.some(w => !MODIFIER.has(w)) ? out.join(' ') : '';
}
// 楽譜の記号
const MUSIC = [
  [/G CLEF/, 'トオン キゴー'], [/F CLEF/, 'ヘオン キゴー'], [/C CLEF/, 'ハオン キゴー'], [/DRUM CLEF/, 'ダガッキノ キゴー'],
  [/DOUBLE WHOLE NOTE|BREVE/, 'ニバイ ゼンオンプ'], [/WHOLE NOTE/, 'ゼンオンプ'], [/HALF NOTE/, 'ニブ オンプ'], [/QUARTER NOTE/, 'シブ オンプ'],
  [/EIGHTH NOTE/, 'ハチブ オンプ'], [/SIXTEENTH NOTE/, '16ブ オンプ'], [/THIRTY-SECOND NOTE/, '32ブ オンプ'], [/SIXTY-FOURTH NOTE/, '64ブ オンプ'],
  [/ONE HUNDRED TWENTY-EIGHTH NOTE/, '128ブ オンプ'], [/WHOLE REST|MULTI MEASURE REST/, 'ゼンキューフ'], [/HALF REST/, 'ニブ キューフ'], [/QUARTER REST/, 'シブ キューフ'],
  [/EIGHTH REST/, 'ハチブ キューフ'], [/SIXTEENTH REST/, '16ブ キューフ'], [/THIRTY-SECOND REST/, '32ブ キューフ'], [/SIXTY-FOURTH REST/, '64ブ キューフ'],
  [/DOUBLE SHARP/, 'ダブル シャープ'], [/DOUBLE FLAT/, 'ダブル フラット'], [/SHARP/, 'シャープ'], [/FLAT/, 'フラット'], [/NATURAL/, 'ナチュラル'],
  [/FERMATA/, 'フェルマータ'], [/BREATH MARK/, 'ブレス'], [/DAL SEGNO/, 'ダル セーニョ'], [/DA CAPO/, 'ダ カーポ'], [/SEGNO/, 'セーニョ'], [/CODA/, 'コーダ'],
  [/REPEAT/, 'リピート'], [/CRESCENDO/, 'クレッシェンド'], [/DECRESCENDO/, 'デクレッシェンド'], [/PIANO/, 'ピアノ'], [/FORTE/, 'フォルテ'], [/MEZZO/, 'メッゾ'],
  [/RINFORZANDO/, 'リンフォルツァンド'], [/SUBITO/, 'スビト'], [/Z$/, 'ツ'], [/TRILL/, 'トリル'], [/TURN/, 'ターン'], [/MORDENT/, 'モルデント'], [/ARPEGGIATO/, 'アルペッジョ'],
  [/STACCATO/, 'スタッカート'], [/TENUTO/, 'テヌート'], [/ACCENT/, 'アクセント'], [/MARCATO/, 'マルカート'], [/TIE|SLUR/, 'タイ'], [/BEAM/, 'ハタ'],
  [/BARLINE/, 'タテセン'], [/STAFF|LINES/, 'ゴセン'], [/PEDAL/, 'ペダル'], [/GLISSANDO/, 'グリッサンド'], [/TREMOLO/, 'トレモロ'], [/ORNAMENT/, 'ソーショクオン'],
  [/COMMON TIME/, '4ブンノ 4ビョーシ'], [/CUT TIME/, '2ブンノ 2ビョーシ'], [/NOTEHEAD/, 'タマ'], [/OTTAVA/, 'オッターヴァ']
];
// 麻雀牌
function mahjong(n) {
  const NUM = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9 };
  let m;
  if ((m = /TILE (\w+) OF (CHARACTERS|BAMBOOS|CIRCLES)/.exec(n))) return 'マージャンパイノ ' + NUM[m[1]] + { CHARACTERS: 'マン', BAMBOOS: 'ソー', CIRCLES: 'ピン' }[m[2]];
  const T = { 'EAST WIND': 'トン', 'SOUTH WIND': 'ナン', 'WEST WIND': 'シャー', 'NORTH WIND': 'ペー', 'RED DRAGON': 'チュン', 'GREEN DRAGON': 'ハツ', 'WHITE DRAGON': 'ハク', JOKER: 'ジョーカー', BACK: 'ウラ' };
  for (const k in T) if (n.includes(k)) return 'マージャンパイノ ' + T[k];
  if (/PLUM|ORCHID|BAMBOO|CHRYSANTHEMUM/.test(n)) return 'マージャンパイノ ハナパイ';
  if (/SPRING|SUMMER|AUTUMN|WINTER/.test(n)) return 'マージャンパイノ キセツパイ';
  return 'マージャンパイ';
}
function card(n) {
  const R = { ACE: 'エース', TWO: '2', THREE: '3', FOUR: '4', FIVE: '5', SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9', TEN: '10', JACK: 'ジャック', KNIGHT: 'ナイト', QUEEN: 'クイーン', KING: 'キング' };
  const S = { SPADES: 'スペード', HEARTS: 'ハート', DIAMONDS: 'ダイヤ', CLUBS: 'クラブ' };
  const m = /PLAYING CARD (\w+) OF (\w+)/.exec(n);
  if (m && R[m[1]] && S[m[2]]) return 'トランプノ ' + S[m[2]] + 'ノ ' + R[m[1]];
  if (/JOKER/.test(n)) return 'トランプノ ジョーカー';
  if (/BACK/.test(n)) return 'トランプノ ウラ';
  if (/TRUMP|FOOL/.test(n)) return 'タロット カード';
  return 'トランプ';
}
function chess(n) {
  if (/XIANGQI/.test(n)) return 'シャンチーノ コマ';
  const c = /WHITE/.test(n) ? 'シロノ ' : /BLACK/.test(n) ? 'クロノ ' : '';
  const p = { KING: 'キング', QUEEN: 'クイーン', ROOK: 'ルーク', BISHOP: 'ビショップ', KNIGHT: 'ナイト', PAWN: 'ポーン', EQUIHOPPER: 'エクイホッパー' };
  for (const k in p) if (has(n, k)) return 'チェスノ ' + c + p[k];
  return 'チェスノ コマ';
}
const ALCH = { GOLD: 'キン', SILVER: 'ギン', MERCURY: 'スイギン', SULFUR: 'イオー', SALT: 'シオ', WATER: 'ミズ', FIRE: 'ヒ', AIR: 'クーキ', EARTH: 'ツチ', IRON: 'テツ', COPPER: 'ドー', LEAD: 'ナマリ', TIN: 'スズ', ANTIMONY: 'アンチモン', ARSENIC: 'ヒソ' };

// ---------- 1字ずつ決める ----------
const SYM = new Map();
const ENGINE_MARKS = new Set('⟪⟫⟬⟭⟦⟧⟮⟯⦅⦆'.split(''));
const put = (key, v) => { if (v && !SYM.has(key) && !ENGINE_MARKS.has(key)) SYM.set(key, v); };
const isEmoji = c => /\p{Extended_Pictographic}/u.test(c);
const nfkc = c => c.normalize('NFKC');
// エンジンがもともと点字にできる文字（表に入れない）
const SPECIAL = new Set('―─━…‥～〜~"ʼ※・'.split('').concat(["'", '\u3000']));
function native(c) {
  if (E.READ[c] !== undefined || E.PUNCT[c] !== undefined || SPECIAL.has(c)) return true;
  if (/[ -~]/.test(c)) return true;
  return false;
}
const RANGES = [
  [0x00a0, 0x00ff], [0x02b0, 0x02ff], [0x2010, 0x205e], [0x20a0, 0x20cf], [0x2100, 0x218f], [0x2190, 0x23ff], [0x2400, 0x245f], [0x2500, 0x27ff],
  [0x2900, 0x2bff], [0x2e00, 0x2e7f], [0x3000, 0x303f], [0x3190, 0x319f], [0x31c0, 0x31ef], [0xfe10, 0xfe1f], [0xfe30, 0xfe6f], [0xfff9, 0xfffd], [0xab5b, 0xab5b], [0xa7fe, 0xa7fe], [0x327f, 0x327f],
  [0x058f, 0x058f], [0x060b, 0x060b], [0x09f2, 0x09f3], [0x0af1, 0x0af1], [0x0bf9, 0x0bf9], [0x0e3f, 0x0e3f], [0x17db, 0x17db], [0xfdfc, 0xfdfc],
  [0x1d100, 0x1d1ff], [0x1d200, 0x1d24f], [0x1f000, 0x1f0ff], [0x1f100, 0x1f2ff], [0x1f300, 0x1faff], [0x1fb00, 0x1fbff]
];
function decide(cp) {
  const c = ch(cp), n = name(cp), g = gc(cp);
  if (MANUAL[c]) return MANUAL[c];
  if (native(c)) return null;
  if (cp >= 0x02b0 && cp <= 0x02ff) return null; // 修飾文字は発音記号としてエンジンが扱う
  if (/^[LN]/.test(g) && !/CIRCLED|SQUARED|PARENTHESIZED|NEGATIVE|ENCLOSED|DINGBAT/.test(n)) return null; // 文字・数字はエンジンが扱う
  // 互換分解で普通の文字になるもの（囲み文字・全角・縦書き用・小さい字など）はエンジンが直す
  if (nfkc(c) !== c && /^(?:<(?:compat|wide|narrow|vertical|small|circle|square|super|sub|font|fraction)>)/.test((UD.get(cp) || {}).decomp || '') && !isEmoji(c)) return null;
  if (cp >= 0x2800 && cp <= 0x28ff) return null; // 点字はそのまま
  // 矢印
  if (/ARROW|HARPOON/.test(n) && !/ARROWHEAD$/.test(n)) {
    const a = arrowKind(n);
    if (a) return a;
  }
  // 罫線・ブロック
  if (/^BOX DRAWINGS/.test(n)) return /HORIZONTAL/.test(n) && !/VERTICAL|DOWN|UP|LEFT|RIGHT|ARC|DIAGONAL/.test(n) ? ['l'] : ['m', ' '];
  if (/^BOX DRAWINGS LIGHT (LEFT|RIGHT)$|^BOX DRAWINGS HEAVY (LEFT|RIGHT)$/.test(n)) return ['l'];
  if (cp >= 0x2580 && cp <= 0x259f) return ['m', ' '];
  if (cp >= 0x1fb00 && cp <= 0x1fbef) return ['m', ' '];
  if (cp >= 0x2300 && cp <= 0x23ff && /HOOK|EXTENSION|UPPER|LOWER|MIDDLE PIECE|SECTION|TOP |BOTTOM /.test(n) && /BRACKET|PARENTHESIS|BRACE|INTEGRAL|SUMMATION|LINE/.test(n)) return /HORIZONTAL LINE EXTENSION/.test(n) ? ['l'] : ['x'];
  if (/^MUSICAL SYMBOL/.test(n)) { for (const [re, v] of MUSIC) if (re.test(n)) return ['d', v]; return ['d', 'オンガクノ キゴー']; }
  if (cp >= 0x1d200 && cp <= 0x1d24f) return ['d', 'ギリシャノ オンガク キゴー'];
  if (/^MAHJONG TILE/.test(n)) return ['d', mahjong(n)];
  if (/^DOMINO TILE/.test(n)) return ['d', 'ドミノノ パイ'];
  if (/^PLAYING CARD/.test(n)) return ['d', card(n)];
  if (/CHESS|XIANGQI/.test(n)) return ['d', chess(n)];
  if (/^ALCHEMICAL SYMBOL/.test(n)) { for (const k in ALCH) if (has(n, k)) return ['d', 'レンキンジュツノ ' + ALCH[k]]; return ['d', 'レンキンジュツノ キゴー']; }
  if (/^CJK STROKE/.test(n)) return ['d', 'カンジノ ヒツガ'];
  // 囲み・四角の中の英字や数字（🅲 など。互換分解のないもの）は、その字に
  const lm = /(?:LATIN (?:CAPITAL|SMALL) LETTER|DIGIT|NUMBER) ([A-Z]|ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)$/.exec(n);
  if (lm && /CIRCLED|SQUARED|PARENTHESIZED|NEGATIVE|ENCLOSED|DINGBAT/.test(n) && !isEmoji(c)) {
    const D = { ZERO: 0, ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10 };
    const v = D[lm[1]] !== undefined ? String(D[lm[1]]) : /SMALL/.test(n) ? lm[1].toLowerCase() : lm[1];
    return ['m', /^[0-9]+$/.test(v) ? '（' + v + '）' : v];
  }
  // CLDR の日本語の名前（句読点には使わない）
  const cl = /^P/.test(g) ? null : cldr(c);
  if (cl) {
    const k = toKana(cl);
    if (/^Sm$/.test(g) && !isEmoji(c)) return ['r', k];
    if (/^Sc$/.test(g)) return ['c', k];
    return ['d', k];
  }
  // かっこ・引用符・ダッシュは同じ働きの記号に
  if (g === 'Ps') return ['m', '（'];
  if (g === 'Pe') return ['m', '）'];
  if (g === 'Pi') return ['m', '“'];
  if (g === 'Pf') return ['m', '”'];
  if (g === 'Pd') return ['m', /EM DASH|TWO-EM|THREE-EM|HORIZONTAL BAR|LONG/.test(n) ? '―' : '-'];
  if (g === 'Zs') return ['m', ' '];
  if (/^(Po)$/.test(g)) return ['x'];
  if (g === 'Mn' || g === 'Me' || g === 'Cf') return ['x'];
  if (g === 'Sc') return ['c', 'ツーカ'];
  // 名前から説明を作る
  const dsc = describe(n);
  if (g === 'Sm') return ['r', dsc || 'スーガクノ キゴー'];
  if (dsc) return ['d', dsc];
  if (g === 'So' || g === 'Sk') return ['d', isEmoji(c) ? 'エモジ' : 'キゴー'];
  return null;
}
// 数学の記号・矢印の読みは、前後を区切って書く（x ∈ A → x ゾクスル A）
function decide2(cp) {
  const v = decide(cp);
  if (v && v[0] === 'r' && (gc(cp) === 'Sm' || /ARROW/.test(name(cp))) && !/^(♀|♂)$/.test(ch(cp))) return ['o', v[1]];
  return v;
}
// ---------- 音声学の字（IPA Braille にないもの）：名前から IPA Braille の形を作る ----------
const IPAB_BASE = { SCHWA: '⠢', 'OPEN E': '⠜', 'OPEN O': '⠣', ESH: '⠱', EZH: '⠮', ENG: '⠫', ALPHA: '⠡', IOTA: '⠌', UPSILON: '⠷', GAMMA: '⠨⠛', PHI: '⠨⠋',
  CHI: '⠨⠯', BETA: '⠨⠃', THETA: '⠨⠹', ETH: '⠻', 'DOTLESS I': '⠊', 'DOTLESS J': '⠚', AE: '⠩', OE: '⠪', 'GLOTTAL STOP': '⠆', 'REVERSED GLOTTAL STOP': '⠖⠆',
  'SCRIPT G': '⠛', 'TURNED A': '⠖⠁', 'TURNED ALPHA': '⠖⠡', 'REVERSED OPEN E': '⠖⠜', 'TURNED M': '⠖⠥', 'TURNED R': '⠼', 'TURNED V': '⠬', 'TURNED H': '⠲⠓',
  'TURNED W': '⠖⠺', 'TURNED Y': '⠦⠽', 'BARRED O': '⠴⠕', 'BARRED U': '⠴⠥', 'BARRED I': '⠴⠊', 'SMALL CAPITAL I': '⠌', 'O WITH STROKE': '⠳', EPSILON: '⠜' };
const LETTER_B = 'abcdefghijklmnopqrstuvwxyz'.split('').reduce((o, c, i) => (o[c.toUpperCase()] = '⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵'[i], o), {});
function ipaBase(frag) {
  frag = frag.trim();
  if (IPAB_BASE[frag]) return IPAB_BASE[frag];
  if (/^[A-Z]$/.test(frag)) return LETTER_B[frag];
  return null;
}
function ipaLetter(cp) {
  const n = name(cp);
  let m, b;
  if ((m = /^(?:MODIFIER LETTER|SUPERSCRIPT LATIN) (?:SMALL |CAPITAL )?(?:LETTER )?(.+)$/.exec(n)) && (b = ipaLetterFrom(m[1]))) return '⠈' + b;
  if ((m = /^LATIN SUBSCRIPT (?:SMALL |CAPITAL )?LETTER (.+)$/.exec(n)) && (b = ipaLetterFrom(m[1]))) return '⠠' + b;
  if ((m = /^LATIN (?:SMALL |CAPITAL )?LETTER (.+)$/.exec(n))) return ipaLetterFrom(m[1]);
  return null;
}
function ipaLetterFrom(f) {
  let m, b;
  if ((b = ipaBase(f))) return b;
  if ((m = /^SMALL CAPITAL (.+)$/.exec(f)) && (b = ipaBase(m[1]))) return '⠔' + b;
  if ((m = /^(TURNED|REVERSED|INVERTED) (.+)$/.exec(f)) && (b = ipaLetterFrom(m[2]))) return '⠖' + b;
  if ((m = /^(?:BARRED|SIDEWAYS) (.+)$/.exec(f)) && (b = ipaLetterFrom(m[1]))) return '⠴' + b;
  if ((m = /^(.+?) WITH (.+)$/.exec(f)) && (b = ipaLetterFrom(m[1]))) {
    const w = m[2];
    if (/RETROFLEX HOOK|RIGHT TAIL|LEFT TAIL|TAIL|RETROFLEX/.test(w)) return '⠲' + b;
    if (/PALATAL HOOK/.test(w)) return b + '⠈⠚';
    if (/MIDDLE TILDE|TILDE/.test(w)) return b + '⠐⠻';
    if (/CURL|HOOK|BELT|LOOP/.test(w)) return '⠦' + b;
    if (/STROKE|BAR/.test(w)) return '⠴' + b;
    if (/DOT BELOW/.test(w)) return b + '⠠⠨⠂';
    if (/RING BELOW/.test(w)) return b + '⠠⠫';
    return b;
  }
  return null;
}
function hentaigana(cp) {
  const n = name(cp);
  let m = /^HENTAIGANA LETTER ([A-Z]+)(?:-[A-Z]+)*(?:-\d+)?$/.exec(n);
  const KANA = { A: 'あ', I: 'い', U: 'う', E: 'え', O: 'お', KA: 'か', KI: 'き', KU: 'く', KE: 'け', KO: 'こ', SA: 'さ', SI: 'し', SU: 'す', SE: 'せ', SO: 'そ',
    TA: 'た', TI: 'ち', TU: 'つ', TE: 'て', TO: 'と', NA: 'な', NI: 'に', NU: 'ぬ', NE: 'ね', NO: 'の', HA: 'は', HI: 'ひ', HU: 'ふ', HE: 'へ', HO: 'ほ',
    MA: 'ま', MI: 'み', MU: 'む', ME: 'め', MO: 'も', YA: 'や', YU: 'ゆ', YE: 'え', YO: 'よ', RA: 'ら', RI: 'り', RU: 'る', RE: 'れ', RO: 'ろ',
    WA: 'わ', WI: 'ゐ', WE: 'ゑ', WO: 'を', N: 'ん' };
  if (m) return KANA[m[1]] || null;
  if ((m = /^(HIRAGANA|KATAKANA) LETTER (?:SMALL |ARCHAIC )?([A-Z]+)$/.exec(n))) {
    const k = { YE: 'イェ', WU: 'う', YI: 'い' }[m[2]] || KANA[m[2]];
    if (!k) return null;
    return m[1] === 'KATAKANA' ? E.toKatakana(k) : k;
  }
  return null;
}

(async () => {
  TK = await getTokenizer();
  // 1. 手で決めたもの・名前から決めるもの
  for (const [a, z] of RANGES) for (let cp = a; cp <= z; cp++) {
    if (!UD.has(cp)) continue;
    put(ch(cp), decide2(cp));
  }
  // 音声学の字（発音記号の中で使う。IPA Braille の表にないもの）
  for (const [a, z] of [[0x0250, 0x02af], [0x1d00, 0x1dbf], [0x2c60, 0x2c7f], [0xa720, 0xa7ff], [0xab30, 0xab6f], [0x10780, 0x107bf], [0x1df00, 0x1dfff]]) for (let cp = a; cp <= z; cp++) {
    if (!UD.has(cp) || SYM.has(ch(cp))) continue;
    if ('ʈɖɟɢʔɱɳɲɴʙʀɾɽɸʂʐʝɣʁħʕɦɬɮʋɹɻɰɭʎʟɓɗʄɠʛʘʍɥʜʡʢɧɺɕʑɫɛɑɔɒʌɤɯɨʉɪʏʊəɵɐɜɚɞɘɝʦʣʧʤʨʥɡ'.includes(ch(cp))) continue; // エンジンの表にある
    const b = ipaLetter(cp);
    if (b) put(ch(cp), ['i', b]);
  }
  // 2. 変体仮名・古い仮名・小さい仮名（拡張）・アイヌ語の小さいカタカナ → ふつうの仮名
  for (let cp = 0x1aff0; cp <= 0x1b16f; cp++) {
    if (!UD.has(cp)) continue;
    const k = hentaigana(cp);
    put(ch(cp), k ? ['m', k] : ['x']);
  }
  'クシストヌハヒフヘホムラリルレロ'.split('').forEach((k, i) => put(ch(0x31f0 + i), ['m', k]));
  // 2b. まれなラテン文字（Ⱡ ꜩ ꝺ など）：もとの英字に（飾りの付いた字はアクセント符を付けるため結合文字を添える）
  for (const [a, z] of [[0x2c60, 0x2c7f], [0xa720, 0xa7ff], [0xab30, 0xab6f], [0x1df00, 0x1dfff]]) for (let cp = a; cp <= z; cp++) {
    if (!UD.has(cp) || SYM.has(ch(cp))) continue;
    const n = name(cp);
    const m = /^LATIN (CAPITAL|SMALL) LETTER (.+)$/.exec(n) || /^LATIN LETTER (SMALL CAPITAL) (.+)$/.exec(n) || /^LATIN EPIGRAPHIC LETTER (?:SIDEWAYS |REVERSED |INVERTED |ARCHAIC )?()([A-Z]+)$/.exec(n);
    if (/SINOLOGICAL DOT/.test(n)) { put(ch(cp), ['m', '・']); continue; }
    if (/^GREEK LETTER SMALL CAPITAL OMEGA$/.test(n)) { put(ch(cp), ['m', 'ω']); continue; }
    if (!m) { if (/^MODIFIER LETTER/.test(n)) put(ch(cp), ['x']); continue; }
    const cap = m[1] === 'CAPITAL' || m[1] === '';
    let rest = m[2], acc = false;
    const w = /^(.+?) WITH .+$/.exec(rest);
    if (w) { rest = w[1]; acc = true; }
    rest = rest.replace(/^(?:INSULAR|BROKEN|REVERSED|TURNED|SIDEWAYS|SCRIPT|DOTLESS|MIDDLE-WELSH|VISIGOTHIC|CLOSED|OPEN|LONG|SMALL CAPITAL|INVERTED|BARRED|SQUAT|CUATRILLO|VOLAPUK|STRETCHED|BELTED|CURLY|TRESILLO|HALF|TAILLESS|SINOLOGICAL|ARCHAIC|EGYPTOLOGICAL|BLACKLETTER|OLD POLISH|ANGLICANA|SIGMOID|DOUBLE|THORN|AFRICAN|PHARYNGEAL) /g, '');
    let v = null;
    if (/^[A-Z]{1,3}$/.test(rest)) v = rest;
    else if (/^(ALEF)$/.test(rest)) v = 'ʼ'; else if (/^(AIN|AYIN)$/.test(rest)) v = 'ʼ'; else if (/^YOD$/.test(rest)) v = 'I';
    if (!v) { put(ch(cp), ['d', 'ラテン モジ']); continue; }
    if (v.length === 1 && v !== 'ʼ') v = cap ? v : v.toLowerCase(); else if (v !== 'ʼ') v = cap ? v : v.toLowerCase();
    put(ch(cp), ['m', v + (acc && v.length === 1 && /[A-Za-z]/.test(v) ? '\u0301' : '')]);
  }
  // 3. CJK 部首（⺟ など）→ 統合漢字（読める字だけ。読めない字は「漢字の部首」と説明）
  const RADICAL = new Map();
  for (const line of read('EquivalentUnifiedIdeograph.txt').split('\n')) {
    const m = /^([0-9A-F]{4,5})(?:\.\.([0-9A-F]{4,5}))?\s*;\s*([0-9A-F]{4,5})/.exec(line);
    if (!m) continue;
    const a = parseInt(m[1], 16), z = m[2] ? parseInt(m[2], 16) : a;
    for (let cp = a; cp <= z; cp++) if (ch(cp).normalize('NFKC') === ch(cp)) RADICAL.set(ch(cp), ch(parseInt(m[3], 16)));
  }
  const KU = new Set(); for (const line of read('Unihan_Readings.txt').split('\n')) { const mm = /^U\+([0-9A-F]+)\tkJapanese\t/.exec(line); if (mm) KU.add(String.fromCodePoint(parseInt(mm[1], 16))); }
  const canRead = c => { const t = TK.tokenize(c); return (t.length === 1 && !!t[0].reading && t[0].reading !== '*') || KU.has(c); };
  for (const [r, u] of RADICAL) put(r, canRead(u) ? ['m', u] : ['d', 'カンジノ ブシュ']);
  for (let cp = 0x2e80; cp <= 0x2fdf; cp++) if (UD.has(cp) && !SYM.has(ch(cp)) && ch(cp).normalize('NFKC') === ch(cp)) put(ch(cp), ['d', 'カンジノ ブシュ']);
  // 4. 絵文字の並び（ZWJ・国旗など）。肌の色は省いてから引く
  const SEQ = new Map();
  const seqName = (k, v) => { const t = v && v.tts && v.tts[0]; if (!t) return; if (/[\u{1F3FB}-\u{1F3FF}]/u.test(k)) return; SEQ.set(k, t); };
  for (const [k, v] of Object.entries(ja)) if (Array.from(k).length > 1) seqName(k, v);
  for (const [k, v] of Object.entries(jd)) if (Array.from(k).length > 1) seqName(k, v);
  for (const [k, v] of Object.entries(ja)) {
    if (Array.from(k).length !== 1 || !isEmoji(k) || native(k)) continue;
    if (nfkc(k) !== k && /^</.test((UD.get(k.codePointAt(0)) || {}).decomp || '')) continue;
    put(k, ['d', toKana(v.tts[0])]);
  }
  for (const [k, t] of SEQ) {
    if (/^[0-9#*]\u20e3$/.test(k)) continue; // 囲み数字はエンジンで
    put(k, ['d', toKana(t)]);
  }
  // 5. 辞書で読めない漢字の異体字 → 読める字（Unihan）。旧字体 → 新字体（德 → 徳）、まれな異体字 → ふつうの字（髙 → 高、﨑 → 崎、𠮷 → 吉）
  //    読みの一部が同じ（Unihan の kJapanese）で、変換エンジンの辞書が1字で読める字に直せるものだけ
  const JLV = new Map(); // 字 → JIS の水準（1 第1水準、2 第2水準）
  for (const line of read('Unihan_IRGSources.txt').split('\n')) {
    const m = /^U\+([0-9A-F]+)\tkIRG_JSource\tJ0-([0-9A-F]{2})/.exec(line);
    if (m) JLV.set(String.fromCodePoint(parseInt(m[1], 16)), parseInt(m[2], 16) < 0x50 ? 1 : 2);
  }
  const JREAD = new Map();
  for (const line of read('Unihan_Readings.txt').split('\n')) {
    const m = /^U\+([0-9A-F]+)\tkJapanese\t(.+)$/.exec(line);
    if (m) JREAD.set(String.fromCodePoint(parseInt(m[1], 16)), new Set(m[2].split(' ').map(r => E.toKatakana(r))));
  }
  const readable = c => { const t = TK.tokenize(c); return t.length === 1 && !!t[0].reading && t[0].reading !== '*'; };
  const PRI = { kJapaneseNewVariant: 0, kTraditionalVariant: 1, kZVariant: 2, kSemanticVariant: 3, kSpecializedSemanticVariant: 4, kSpoofingVariant: 5 };
  const VAR = new Map(); // 字 → [{ tg, pri, z }]
  for (const line of read('Unihan_Variants.txt').split('\n')) {
    const m = /^U\+([0-9A-F]+)\t(\w+)\t(.+)$/.exec(line);
    if (!m || PRI[m[2]] === undefined) continue;
    const src = String.fromCodePoint(parseInt(m[1], 16));
    const a = VAR.get(src) || [];
    for (const x of m[3].split(' ')) {
      const mm = /^U\+([0-9A-F]+)(<.*)?$/.exec(x);
      if (mm) a.push({ tg: String.fromCodePoint(parseInt(mm[1], 16)), pri: PRI[m[2]], z: /:Z/.test(mm[2] || '') });
    }
    VAR.set(src, a);
  }
  let nvar = 0;
  const overlap = (a, b) => { const A = JREAD.get(a), B = JREAD.get(b); if (!A || !B) return 0; let n = 0; for (const r of A) if (B.has(r)) n++; return n; };
  for (const [src, cands] of VAR) {
    if (SYM.has(src) || JLV.has(src) || readable(src)) continue; // JIS 第1・第2水準の字は、辞書が語の中で読むのでそのまま
    const ok = cands.filter(x => x.tg !== src && (readable(x.tg) || JLV.has(x.tg)) && (JREAD.has(src) ? overlap(src, x.tg) > 0 : JLV.get(x.tg) === 1));
    if (!ok.length) continue;
    ok.sort((a, b) => a.pri - b.pri || (b.z - a.z) || ((JLV.get(a.tg) || 9) - (JLV.get(b.tg) || 9)) || (overlap(src, b.tg) - overlap(src, a.tg)));
    put(src, ['m', ok[0].tg]); nvar++;
  }
  // 2段階の異体字（龟 → 龜 → 亀、简体字 → 繁体字 → 新字体）：1段階で読める字に直せなかったものだけ
  let nvar2 = 0;
  for (const [src, cands] of VAR) {
    if (SYM.has(src) || JLV.has(src) || readable(src)) continue;
    // 1段目は繁体字・同じ字の別の形（kTraditionalVariant・kZVariant）、2段目は新字体・同じ字の別の形（kJapaneseNewVariant・kZVariant）だけ
    //（意味が近いだけの字や、形が似ているだけの字をたどると別の字になるため：应 → 應 → 応 はよいが、应 → 硬 にはしない）
    const ok = [];
    for (const mid of cands) {
      if (mid.tg === src || !(mid.pri === PRI.kTraditionalVariant || mid.pri === PRI.kZVariant)) continue;
      for (const x of VAR.get(mid.tg) || []) {
        if (x.tg === src || x.tg === mid.tg || !readable(x.tg) || !(x.pri === PRI.kJapaneseNewVariant || x.pri === PRI.kZVariant)) continue;
        if (!(JLV.has(x.tg) || overlap(mid.tg, x.tg) > 0)) continue;
        ok.push({ tg: x.tg, pri: mid.pri * 10 + x.pri, z: mid.z && x.z });
      }
    }
    if (!ok.length) continue;
    ok.sort((a, b) => a.pri - b.pri || (b.z - a.z) || ((JLV.get(a.tg) || 9) - (JLV.get(b.tg) || 9)));
    put(src, ['m', ok[0].tg]); nvar2++;
  }
  // 置き換えの先がさらに置き換わるもの（⻳ → 龟 → 亀）は、最後の字に直接置き換える
  for (const [k, v] of SYM) {
    if (v[0] !== 'm' || Array.from(v[1] || '').length !== 1) continue;
    let t = v[1]; const seen = new Set([k]);
    while (SYM.has(t) && SYM.get(t)[0] === 'm' && Array.from(SYM.get(t)[1] || '').length === 1 && !seen.has(t)) { seen.add(t); t = SYM.get(t)[1]; }
    if (t !== v[1]) SYM.set(k, ['m', t]);
  }
  // 出力
  const lines = [];
  const keys = [...SYM.keys()].sort((a, b) => a.codePointAt(0) - b.codePointAt(0) || a.length - b.length || (a < b ? -1 : 1));
  for (const k of keys) {
    const [kind, val] = SYM.get(k);
    if (/[\t\n]/.test(k + (val || ''))) continue;
    lines.push(k + '\t' + kind + (val !== undefined ? '\t' + val : ''));
  }
  const body = lines.join('\n');
  const js = '// 記号・絵文字・まれな文字の扱い（tools/symbols/build.js で作った表。もとのデータは Unicode, Inc. の UnicodeData・Unihan と CLDR の日本語の注釈）\n' +
    '// 1行：文字 \\t 種類（m 置き換え・r 読み・o 演算記号や矢印の読み・c 通貨・d 説明（点訳者挿入符）・x 省く・X 省いて校正一覧へ・l 横線・i 発音記号の字）\\t 値\n' +
    'var TENJI_SYMBOLS = ' + JSON.stringify(body) + ';\n' +
    "if (typeof module !== 'undefined' && module.exports) module.exports = TENJI_SYMBOLS;\n";
  fs.writeFileSync(path.join(ROOT, 'js/symbols-data.js'), js);
  const cnt = {}; for (const [, [kind]] of SYM) cnt[kind] = (cnt[kind] || 0) + 1;
  console.log('symbols', SYM.size, cnt, 'variants', nvar, '+', nvar2, 'bytes', Buffer.byteLength(js));
  // まれな漢字の読み（Unihan の kJapanese。音読み（カタカナ）を優先）
  const ky = require(path.join(ROOT, 'js/kanji-yomi.js'));
  const haveKy = new Set(ky.split(',').map(x => Array.from(x)[0]));
  const out = [];
  for (const line of read('Unihan_Readings.txt').split('\n')) {
    const m = /^U\+([0-9A-F]+)\tkJapanese\t(.+)$/.exec(line);
    if (!m) continue;
    const c = String.fromCodePoint(parseInt(m[1], 16));
    if (haveKy.has(c) || SYM.has(c) || readable(c)) continue;
    const rs = m[2].split(' ').filter(r => /^[ぁ-ゖァ-ヺー]+$/.test(r));
    const on = rs.find(r => /^[ァ-ヺー]+$/.test(r)), kun = rs.find(r => /^[ぁ-ゖ]+$/.test(r));
    const r = on || (kun && E.toKatakana(kun));
    if (r) out.push(c + r);
  }
  const kbody = out.join(',');
  fs.writeFileSync(path.join(ROOT, 'js/kanji-unihan.js'),
    '// まれな漢字の読み（Unicode, Inc. の Unihan データベースの kJapanese から。音読みがあれば音読み）\n' +
    '// 「漢字読み,漢字読み,…」。辞書にも js/kanji-yomi.js にもない漢字を1字ずつ読むとき（要確認になる）に使う\n' +
    "var TENJI_KANJI_UNIHAN = '" + kbody + "';\n" +
    "if (typeof module !== 'undefined' && module.exports) module.exports = TENJI_KANJI_UNIHAN;\n");
  console.log('kanji', out.length, 'bytes', Buffer.byteLength(kbody));
  if (unresolvedNames.length) console.log('読めなかった名前', unresolvedNames.length, unresolvedNames.slice(0, 40).join(' / '));
})().catch(e => { console.error(e); process.exit(1); });

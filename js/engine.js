/*
 * 点訳エンジン
 *  - 墨字（漢字かな交じり）→ 点字仮名遣い・分かち書き（kuromoji の解析結果を使用）
 *  - かな（分かち書き済み）→ 6点点字（Unicode 点字 U+2800〜）
 *  - 6点点字 → かな（墨字起こし）
 * 点字の表記は『日本点字表記法』『点訳のてびき』の基本ルールに沿っています。
 * 特殊音・拗音の対応表は bes2kana-for-checking（MIT License）を参考にしています。
 */
(function (root) {
  'use strict';

  // ---------- 基本の点字表 ----------
  const BASE = {
    'ア': '⠁', 'イ': '⠃', 'ウ': '⠉', 'エ': '⠋', 'オ': '⠊',
    'カ': '⠡', 'キ': '⠣', 'ク': '⠩', 'ケ': '⠫', 'コ': '⠪',
    'サ': '⠱', 'シ': '⠳', 'ス': '⠹', 'セ': '⠻', 'ソ': '⠺',
    'タ': '⠕', 'チ': '⠗', 'ツ': '⠝', 'テ': '⠟', 'ト': '⠞',
    'ナ': '⠅', 'ニ': '⠇', 'ヌ': '⠍', 'ネ': '⠏', 'ノ': '⠎',
    'ハ': '⠥', 'ヒ': '⠧', 'フ': '⠭', 'ヘ': '⠯', 'ホ': '⠮',
    'マ': '⠵', 'ミ': '⠷', 'ム': '⠽', 'メ': '⠿', 'モ': '⠾',
    'ヤ': '⠌', 'ユ': '⠬', 'ヨ': '⠜',
    'ラ': '⠑', 'リ': '⠓', 'ル': '⠙', 'レ': '⠛', 'ロ': '⠚',
    'ワ': '⠄', 'ヰ': '⠆', 'ヱ': '⠖', 'ヲ': '⠔', 'ン': '⠴',
    'ッ': '⠂', 'ー': '⠒'
  };
  const DAKU_SRC = {
    'ガ': 'カ', 'ギ': 'キ', 'グ': 'ク', 'ゲ': 'ケ', 'ゴ': 'コ',
    'ザ': 'サ', 'ジ': 'シ', 'ズ': 'ス', 'ゼ': 'セ', 'ゾ': 'ソ',
    'ダ': 'タ', 'ヂ': 'チ', 'ヅ': 'ツ', 'デ': 'テ', 'ド': 'ト',
    'バ': 'ハ', 'ビ': 'ヒ', 'ブ': 'フ', 'ベ': 'ヘ', 'ボ': 'ホ',
    'ヴ': 'ウ'
  };
  const HANDAKU_SRC = { 'パ': 'ハ', 'ピ': 'ヒ', 'プ': 'フ', 'ペ': 'ヘ', 'ポ': 'ホ' };

  // 2文字の拗音・特殊音（前置符 + 基本の仮名）
  const COMBOS = [
    ['⠈', { // 拗音符
      'キャ': 'カ', 'キュ': 'ク', 'キョ': 'コ', 'シャ': 'サ', 'シュ': 'ス', 'ショ': 'ソ',
      'チャ': 'タ', 'チュ': 'ツ', 'チョ': 'ト', 'ニャ': 'ナ', 'ニュ': 'ヌ', 'ニョ': 'ノ',
      'ヒャ': 'ハ', 'ヒュ': 'フ', 'ヒョ': 'ホ', 'ミャ': 'マ', 'ミュ': 'ム', 'ミョ': 'モ',
      'リャ': 'ラ', 'リュ': 'ル', 'リョ': 'ロ',
      'イェ': 'エ', 'キェ': 'ケ', 'スィ': 'シ', 'シェ': 'セ', 'ティ': 'チ', 'チェ': 'テ',
      'ニェ': 'ネ', 'ヒェ': 'ヘ'
    }],
    ['⠘', { // 拗濁音符
      'ギャ': 'カ', 'ギュ': 'ク', 'ギョ': 'コ', 'ジャ': 'サ', 'ジュ': 'ス', 'ジョ': 'ソ',
      'ヂャ': 'タ', 'ヂュ': 'ツ', 'ヂョ': 'ト', 'ビャ': 'ハ', 'ビュ': 'フ', 'ビョ': 'ホ',
      'ギェ': 'ケ', 'ズィ': 'シ', 'ジェ': 'セ', 'ディ': 'チ', 'ヂェ': 'テ', 'ビェ': 'ヘ'
    }],
    ['⠨', { // 拗半濁音符
      'ピャ': 'ハ', 'ピュ': 'フ', 'ピョ': 'ホ', 'テュ': 'ツ', 'フュ': 'ユ', 'フョ': 'ヨ'
    }],
    ['⠸', { 'デュ': 'ツ', 'ヴュ': 'ユ', 'ヴョ': 'ヨ' }],
    ['⠢', { // 合拗音符
      'ウィ': 'イ', 'ウェ': 'エ', 'ウォ': 'オ', 'クァ': 'カ', 'クィ': 'キ', 'クェ': 'ケ', 'クォ': 'コ',
      'ツァ': 'タ', 'ツィ': 'チ', 'ツェ': 'テ', 'ツォ': 'ト',
      'ファ': 'ハ', 'フィ': 'ヒ', 'フェ': 'ヘ', 'フォ': 'ホ'
    }],
    ['⠲', { // 合拗濁音符
      'グァ': 'カ', 'グィ': 'キ', 'グェ': 'ケ', 'グォ': 'コ',
      'ヴァ': 'ハ', 'ヴィ': 'ヒ', 'ヴェ': 'ヘ', 'ヴォ': 'ホ'
    }]
  ];
  // 単独で現れる小書き文字（拗濁音符 + 母音など）
  const SMALL = { 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ' };

  const DIGIT = { '1': '⠁', '2': '⠃', '3': '⠉', '4': '⠙', '5': '⠑', '6': '⠋', '7': '⠛', '8': '⠓', '9': '⠊', '0': '⠚' };
  const LETTER = {};
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach((ch, i) => {
    LETTER[ch] = '⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵'[i];
  });

  const SIGN = {
    NUM: '⠼', FOREIGN: '⠰', CAP: '⠠', TSUNAGI: '⠤', BLANK: '⠀', UNKNOWN: '⠿'
  };
  // ア行・ラ行（数字と同じ形になる仮名）
  const NUMLIKE_KANA = new Set('アイウエオラリルレロ'.split(''));

  const PUNCT = {
    '。': '⠲', '．': '⠲', '、': '⠰', '，': '⠰',
    '？': '⠢', '?': '⠢', '！': '⠖', '!': '⠖', '・': '⠐',
    '「': '⠤', '」': '⠤', '『': '⠰⠤', '』': '⠤⠆',
    '（': '⠶', '）': '⠶', '(': '⠶', ')': '⠶',
    '〔': '⠐⠶', '〕': '⠶⠂', '［': '⠐⠶', '］': '⠶⠂', '[': '⠐⠶', ']': '⠶⠂', '【': '⠐⠶', '】': '⠶⠂',
    '⦅': '⠠⠶', '⦆': '⠶⠄', // 点訳者挿入符
    '“': '⠰⠄', '”': '⠠⠆', '〈': '⠰⠄', '〉': '⠠⠆', '《': '⠰⠄', '》': '⠠⠆', '＜': '⠰⠄', '＞': '⠠⠆',
    '：': '⠐⠂', ':': '⠐⠂', '※': '⠰⠆', '-': '⠤', '－': '⠤', '‐': '⠤', '‑': '⠤', '–': '⠤',
    '<': '⠰⠄', '>': '⠠⠆',
    // 斜線・矢印
    '/': '⠌', '／': '⠌', '→': '⠒⠒⠕', '←': '⠪⠒⠒', '↔': '⠪⠒⠒⠕',
    // 数式の中の記号（数字にはさまれたときだけ記号のまま残す。ほかは読み替える）
    '+': '⠢', '×': '⠡', '÷': '⠌', '＝': '⠒⠒', '−': '⠔',
    // 英文の句読点
    '.': '⠲', ',': '⠰', ';': '⠆', '；': '⠆'
  };

  // ---------- 点字に専用の記号がないものの読み替え ----------
  // 点訳のてびきの考え方に合わせて、読みに置き換えるか、飾りなら省く
  const READ = {
    '℃': 'ド', '℉': 'カシド', '°': 'ド', '%': 'パーセント', '％': 'パーセント', '‰': 'パーミル',
    '&': ' アンド ', '＆': ' アンド ', '@': ' アット ', '＠': ' アット ', '#': 'シャープ', '＃': 'シャープ',
    '§': 'セクション ', '¶': '', '†': '※', '‡': '※', '*': '※', '＊': '※', '⁂': '※',
    '○': 'マル', '◯': 'マル', '◎': 'ニジューマル', '●': 'クロマル', '△': 'サンカク', '▲': 'クロサンカク',
    '▽': 'ギャクサンカク', '▼': 'クロギャクサンカク', '□': 'シカク', '■': 'クロシカク', '◇': 'ヒシガタ', '◆': 'クロヒシガタ',
    '☆': 'シロボシ', '★': 'クロボシ', '✓': 'チェック', '✔': 'チェック', '☑': 'チェック', '☐': 'シカク', '✕': 'バツ', '✖': 'バツ',
    '♪': '', '♫': '', '♬': '', '♩': '', '¦': ' ', '|': ' ', '｜': ' ', '\\': ' ', '＼': ' ', '^': '', '_': '', '`': '', '＾': '', '＿': '',
    '〒': 'ユービン バンゴー ', '☎': 'デンワ ', '☏': 'デンワ ', '№': 'No.', '〃': 'ドージョー', '仝': 'ドージョー', '〆': 'シメ',
    '±': ' プラスマイナス ', '∓': ' マイナスプラス ', '≦': ' ショーナリ イコール ', '≤': ' ショーナリ イコール ', '≧': ' ダイナリ イコール ', '≥': ' ダイナリ イコール ',
    '≠': ' ノット イコール ', '≒': ' ニアリー イコール ', '≈': ' ニアリー イコール ', '∞': 'ムゲンダイ', '√': 'ルート', '∴': 'ユエニ', '∵': 'ナゼナラバ',
    '∑': 'シグマ', '∫': 'インテグラル', '∠': 'カク', '⊥': 'スイチョク', '∥': 'ヘイコー', '△': 'サンカク',
    '↑': 'ウエムキ ヤジルシ', '↓': 'シタムキ ヤジルシ', '⇧': 'ウエムキ ヤジルシ', '⇩': 'シタムキ ヤジルシ',
    '¥': 'エン', '￥': 'エン', '$': 'ドル', '＄': 'ドル', '€': 'ユーロ', '£': 'ポンド', '￡': 'ポンド', '¢': 'セント', '￠': 'セント', '₩': 'ウォン',
    'α': 'アルファ', 'β': 'ベータ', 'γ': 'ガンマ', 'δ': 'デルタ', 'ε': 'イプシロン', 'ζ': 'ゼータ', 'η': 'イータ', 'θ': 'シータ',
    'ι': 'イオタ', 'κ': 'カッパ', 'λ': 'ラムダ', 'μ': 'ミュー', 'ν': 'ニュー', 'ξ': 'クシー', 'ο': 'オミクロン', 'π': 'パイ',
    'ρ': 'ロー', 'σ': 'シグマ', 'ς': 'シグマ', 'τ': 'タウ', 'υ': 'ユプシロン', 'φ': 'ファイ', 'χ': 'カイ', 'ψ': 'プサイ', 'ω': 'オメガ',
    'Α': 'アルファ', 'Β': 'ベータ', 'Γ': 'ガンマ', 'Δ': 'デルタ', 'Θ': 'シータ', 'Λ': 'ラムダ', 'Π': 'パイ', 'Σ': 'シグマ', 'Φ': 'ファイ', 'Ψ': 'プサイ', 'Ω': 'オメガ',
    '·': '・', '•': '・', '◦': '・', '‧': '・', '∙': '・', '･': '・', '〝': '“', '〟': '”', '‘': '“', '’': '”', '＂': '"',
    '〘': '〔', '〙': '〕', '〚': '〔', '〛': '〕', '{': '〔', '}': '〕', '｛': '〔', '｝': '〕', '｟': '（', '｠': '）',
    '⇒': '→', '➡': '→', '⟶': '→', '➔': '→', '➜': '→', '➤': '→', '➢': '→', '▶': '→', '►': '→', '▸': '→', '⇨': '→', '⟹': '→',
    '⇐': '←', '⬅': '←', '⟵': '←', '◀': '←', '◄': '←', '⇦': '←', '⇔': '↔', '⟷': '↔', '⟺': '↔',
    '–': '-', '—': '―', '⸺': '―', '〜': '～', '∼': '～', '゠': '＝', '‼': '!!', '⁉': '!?', '⁈': '?!',
    '\u3000': ' ', '\u00a0': ' ', '\u2002': ' ', '\u2003': ' ', '\u2009': ' '
  };
  // 箇条書きの頭の飾り（点訳では省く）
  const BULLET_RE = /^[ 　]*(?:[●○◎◆◇■□▪▫•◦★☆✓✔✅☐☑▲△▼▽►▶▷▸➢➤❖◉◯⚫⚪・]|[-–—*＊][ 　])[ 　]*/;
  const CIRCLED = [[0x2460, 0x2473, 1], [0x3251, 0x325f, 21], [0x32b1, 0x32bf, 36], [0x2776, 0x277f, 1], [0x2780, 0x2789, 1], [0x278a, 0x2793, 1], [0x24eb, 0x24f4, 11], [0x24f5, 0x24fe, 1]];
  const circledNumber = cp => { for (const [a, b, n] of CIRCLED) if (cp >= a && cp <= b) return n + cp - a; return 0; };
  const isPictograph = c => /\p{Extended_Pictographic}/u.test(c) && !READ[c] && !PUNCT[c];
  // 互換文字（㎝・㈱・Ⅳ・²など）を普通の文字にする
  const COMPAT_RE = /[\u00b2\u00b3\u00b9\u00bc-\u00be\u2070-\u209f\u2100-\u214f\u2150-\u218f\u2474-\u24ea\u3200-\u33ff\ufb00-\ufb06]/g;

  // 墨字の1行を、形態素解析の前に整える（記号の読み替え・飾りの除去）
  function prepareSumiji(line) {
    let s = line.replace(BULLET_RE, '');
    // 丸数字 → （1）
    s = s.replace(/[\u2460-\u2473\u3251-\u325f\u32b1-\u32bf\u2776-\u2793\u24eb-\u24fe]/g, c => '（' + circledNumber(c.codePointAt(0)) + '）');
    s = s.replace(/℃|℉/g, m => READ[m]); // NFKC で °C にならないよう先に読む
    s = s.replace(COMPAT_RE, c => c.normalize('NFKC'));
    // 通貨記号は数のあとに読む（¥1,000 → 1,000エン）
    s = s.replace(/([¥￥$＄€£￡¢￠₩])[ 　]?([0-9０-９][0-9０-９,，.．]*)(?:[ 　]?([万億兆]))?/g, (m, u, n, b) => n + (b || '') + READ[u]);
    // 数式：数字にはさまれた演算記号は記号のまま、ほかは読む
    const D = '[0-9０-９）)]', N = '(?=[ 　]?[0-9０-９(（])';
    const MATH = { '＝': '\ue001', '+': '\ue002', '×': '\ue003', '÷': '\ue004', '−': '\ue005' };
    s = s.replace(new RegExp(`(${D})[ 　]?[=＝][ 　]?${N}`, 'g'), '$1\ue001')
      .replace(new RegExp(`(${D})[ 　]?[+＋][ 　]?${N}`, 'g'), '$1\ue002')
      .replace(new RegExp(`(${D})[ 　]?[×xX＊*][ 　]?${N}`, 'g'), '$1\ue003')
      .replace(new RegExp(`(${D})[ 　]?÷[ 　]?${N}`, 'g'), '$1\ue004')
      .replace(new RegExp(`(${D})[ 　]?[−ー－][ 　]?(?=[0-9０-９(（][^0-9０-９]*[\ue001=＝])`, 'g'), '$1\ue005');
    s = s.replace(/([0-9０-９])[ 　]?−[ 　]?(?=[0-9０-９])/g, '$1-'); // 2020−2026 のような範囲
    s = s.replace(/[=＝]/g, ' イコール ').replace(/[+＋]/g, 'プラス').replace(/÷/g, 'ワル').replace(/−/g, 'マイナス').replace(/×/g, 'バツ');
    for (const k in MATH) s = s.split(MATH[k]).join(k);
    // 不等号：対になっていれば山カッコ、数の比較なら読み、それ以外は矢印として扱う
    const paired = /[<＜][^<＜>＞]+[>＞]/.test(s) && !/\d[ 　]*[<＜>＞][ 　]*\d/.test(s);
    if (!paired) {
      s = s.replace(/([0-9０-９])[ 　]*[<＜][ 　]*(?=[0-9０-９])/g, '$1 ショーナリ ').replace(/([0-9０-９])[ 　]*[>＞][ 　]*(?=[0-9０-９])/g, '$1 ダイナリ ')
        .replace(/[>＞]/g, '→').replace(/[<＜]/g, '←');
    }
    // 英単語の中のアポストロフィ（don't）
    s = s.replace(/([A-Za-z])[’'](?=[A-Za-z])/g, '$1\u02bc');
    // 残りの記号を1字ずつ読み替える。絵文字などの飾りは省く
    let out = '';
    for (const c of s) {
      if (c === '\u200d' || c === '\ufe0f' || c === '\ufe0e' || (c >= '\u{1f3fb}' && c <= '\u{1f3ff}')) continue;
      if (READ[c] !== undefined && !PUNCT[c]) { out += READ[c]; continue; }
      if (isPictograph(c)) continue;
      out += c;
    }
    return out.replace(/[ 　]{2,}/g, ' ').replace(/^ | $/g, '');
  }

  // ---------- 文字種ユーティリティ ----------
  function toKatakana(s) {
    return s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  }
  function toHiragana(s) {
    return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }
  // 全角英数字を半角に、半角カタカナを全角に
  function normalizeInput(s) {
    return s
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[｡-ﾟ]+/g, m => m.normalize('NFKC'))
      .replace(/\t/g, ' ');
  }
  const isKana = c => /[ァ-ヺー]/.test(c);
  const isDigit = c => c >= '0' && c <= '9';
  const isLatin = c => /[A-Za-z]/.test(c);
  const isSpace = c => c === ' ' || c === '　' || c === '⠀';
  const SMALL_KANA = new Set('ァィゥェォャュョヮ'.split(''));

  function moraCount(kana) {
    let n = 0;
    for (const c of kana) if (!SMALL_KANA.has(c)) n++;
    return n;
  }

  const O_ROW = new Set('オコソトノホモヨロヲゴゾドボポョォ'.split(''));
  const U_ROW = new Set('ウクスツヌフムユルグズヅブプュゥヴ'.split(''));

  // ---------- かな → 点字 ----------
  function kanaToBraille(line) {
    const s = Array.from(normalizeInput(toKatakana(line)));
    let out = '';
    const unknown = [];
    const bad = []; // 変換できなかった文字の、点字列での位置
    let inNum = false, inLatin = false, latinCapAll = false;
    // 表示用：かなの1単位（1文字、拗音なら2文字）と、それに対応する点字のマスの組
    const units = [];
    let ui = 0, uo = 0;
    const flush = upto => {
      if (upto > ui) units.push({ text: s.slice(ui, upto).join(''), cells: out.slice(uo) });
      ui = upto; uo = out.length;
    };
    for (let i = 0; i < s.length; i++) {
      flush(i);
      const c = s[i];
      const next = s[i + 1];
      if (isSpace(c)) { out += SIGN.BLANK; inNum = false; inLatin = false; continue; }
      if (isDigit(c)) {
        if (!inNum) out += SIGN.NUM;
        inNum = true;
        out += DIGIT[c];
        continue;
      }
      if (inNum && (c === ',' || c === '.') && next && isDigit(next)) {
        out += c === ',' ? '⠄' : '⠂';
        continue;
      }
      if (c === '・' && inNum && next && isDigit(next)) { inNum = false; continue; } // 2・3 → 数2数3
      if (isLatin(c)) {
        if (!inLatin && s[i - 1] !== '\u02bc') {
          let j = i;
          while (j < s.length && isLatin(s[j])) j++;
          const run = s.slice(i, j).join('');
          latinCapAll = run.length > 1 && run === run.toUpperCase();
          out += SIGN.FOREIGN + (latinCapAll ? SIGN.CAP + SIGN.CAP : '');
        }
        inLatin = true; inNum = false;
        const upper = c !== c.toLowerCase();
        out += (upper && !latinCapAll ? SIGN.CAP : '') + LETTER[c.toLowerCase()];
        if (next === '\u02bc') continue;
        if (next && !isLatin(next) && isKana(next)) out += SIGN.TSUNAGI; // 英字と仮名の間はつなぎ符
        continue;
      }
      if (isKana(c)) {
        if (inNum && NUMLIKE_KANA.has(c)) out += SIGN.TSUNAGI;
        inNum = false; inLatin = false;
        const pair = c + (next || '');
        let done = false;
        for (const [prefix, table] of COMBOS) {
          if (table[pair]) { out += prefix + BASE[table[pair]]; i++; done = true; break; }
        }
        if (done) continue;
        if (BASE[c]) { out += BASE[c]; continue; }
        if (DAKU_SRC[c]) { out += '⠐' + BASE[DAKU_SRC[c]]; continue; }
        if (HANDAKU_SRC[c]) { out += '⠠' + BASE[HANDAKU_SRC[c]]; continue; }
        if (SMALL[c]) { out += '⠘' + BASE[SMALL[c]]; continue; }
        if (c === 'ヵ') { out += BASE['カ']; continue; }
        if (c === 'ヶ') { out += BASE['ケ']; continue; }
      }
      inNum = false; inLatin = false;
      if (c === '…' || c === '‥') {
        while (s[i + 1] === '…' || s[i + 1] === '‥') i++;
        out += '⠂⠂⠂'; continue;
      }
      if (c === '―' || c === '─' || c === '—') {
        while (s[i + 1] === '―' || s[i + 1] === '─' || s[i + 1] === '—') i++;
        out += '⠒⠒'; continue;
      }
      if (c === '～' || c === '〜' || c === '~') { out += '⠤⠤'; continue; }
      if (c === '"') { out += '⠰⠄'; continue; }
      if (PUNCT[c]) { out += PUNCT[c]; continue; }
      if (c >= '⠀' && c <= '⣿') { out += c; continue; } // すでに点字
      if (c === '\u02bc' || c === "'") { out += '⠄'; inLatin = /[A-Za-z]/.test(next || ''); continue; } // アポストロフィ
      if (READ[c] !== undefined) { // かなを直接直したときも、記号は読みに置き換える
        const r = kanaToBraille(READ[c]);
        out += r.cells; continue;
      }
      if (isPictograph(c) || c === '\u200d' || c === '\ufe0f') continue; // 絵文字などの飾りは省く
      if (/[\u2460-\u2473\u3251-\u325f\u32b1-\u32bf\u2776-\u2793]/.test(c)) { out += kanaToBraille('（' + circledNumber(c.codePointAt(0)) + '）').cells; continue; }
      const nk = c.normalize('NFKC');
      if (nk !== c && nk.length <= 4) { out += kanaToBraille(nk).cells; continue; }
      unknown.push(i);
      bad.push(Array.from(out).length);
      out += SIGN.UNKNOWN;
    }
    flush(s.length);
    return { cells: out, unknown: unknown.map(i => s[i]), bad, units };
  }

  // ---------- 点字 → かな ----------
  const REV_BASE = {};
  for (const k in BASE) REV_BASE[BASE[k]] = k;
  const REV_COMBO = {}; // prefix -> {baseCell: kana2}
  for (const [prefix, table] of COMBOS) {
    REV_COMBO[prefix] = {};
    for (const k in table) REV_COMBO[prefix][BASE[table[k]]] = k;
  }
  const REV_DAKU = {}; for (const k in DAKU_SRC) REV_DAKU[BASE[DAKU_SRC[k]]] = k;
  const REV_HANDAKU = {}; for (const k in HANDAKU_SRC) REV_HANDAKU[BASE[HANDAKU_SRC[k]]] = k;
  const REV_SMALL = {}; for (const k in SMALL) REV_SMALL[BASE[SMALL[k]]] = k;
  const REV_DIGIT = {}; for (const k in DIGIT) REV_DIGIT[DIGIT[k]] = k;
  const REV_LETTER = {}; for (const k in LETTER) REV_LETTER[LETTER[k]] = k;

  function brailleToKana(cellsLine) {
    const s = Array.from(cellsLine.replace(/ /g, '⠀'));
    let out = '';
    let kagi = false, kakko = false, ins = false;
    const blank = j => j >= s.length || s[j] === '⠀';
    const closer = j => j >= s.length || s[j] === '⠀' || s[j] === '⠤' || s[j] === '⠶';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], n1 = s[i + 1];
      if (c === '⠀') { out += ' '; continue; }
      if (c < '⠀' || c > '⣿') { out += c; continue; }
      // 数符
      if (c === '⠼') {
        let j = i + 1, num = '';
        while (j < s.length) {
          if (REV_DIGIT[s[j]] !== undefined) { num += REV_DIGIT[s[j]]; j++; continue; }
          if ((s[j] === '⠂' || s[j] === '⠄') && REV_DIGIT[s[j + 1]] !== undefined) { num += s[j] === '⠂' ? '.' : ','; j++; continue; }
          break;
        }
        out += num;
        if (s[j] === '⠤' && REV_BASE[s[j + 1]] && NUMLIKE_KANA.has(REV_BASE[s[j + 1]])) j++; // つなぎ符
        i = j - 1; continue;
      }
      // 外字符・読点・ふたえカギ・第2カギ・注記符
      if (c === '⠰') {
        if (blank(i + 1)) { out += '、'; continue; }
        if (n1 === '⠤') { out += '『'; i++; continue; }
        if (n1 === '⠄') { out += '“'; i++; continue; }
        if (n1 === '⠆') { out += '※'; i++; continue; }
        let j = i + 1, word = '', capAll = false, capNext = false;
        while (j < s.length && s[j] !== '⠀') {
          const d = s[j];
          if (d === '⠠' && s[j + 1] === '⠠') { capAll = true; j += 2; continue; }
          if (d === '⠠') { capNext = true; j++; continue; }
          if (d === '⠤') { j++; break; } // つなぎ符：ここから仮名
          if (d === '⠼') { // 英字の中の数字
            j++;
            while (REV_DIGIT[s[j]] !== undefined) { word += REV_DIGIT[s[j]]; j++; }
            if (s[j] === '⠤') { j++; break; }
            continue;
          }
          if (d === '⠲') { word += '.'; j++; continue; }
          if (REV_LETTER[d]) {
            const ch = REV_LETTER[d];
            word += (capAll || capNext) ? ch.toUpperCase() : ch;
            capNext = false; j++; continue;
          }
          break;
        }
        out += word;
        i = j - 1; continue;
      }
      if (c === '⠤') {
        if (n1 === '⠆') { out += '』'; i++; continue; }
        if (n1 === '⠤') { out += '～'; i++; continue; }
        out += kagi ? '」' : '「'; kagi = !kagi; continue;
      }
      if (c === '⠶' && n1 === '⠄' && ins) { out += '⦆'; ins = false; i++; continue; }
      if (c === '⠶') {
        if (n1 === '⠂') { out += '〕'; i++; continue; }
        out += kakko ? '）' : '（'; kakko = !kakko; continue;
      }
      if (c === '⠐') {
        if (blank(i + 1)) { out += '・'; continue; }
        if (n1 === '⠶') { out += '〔'; i++; continue; }
        if (n1 === '⠂') { out += '：'; i++; continue; }
        if (REV_DAKU[n1]) { out += REV_DAKU[n1]; i++; continue; }
      }
      if (c === '⠠' && n1 === '⠶') { out += '⦅'; ins = true; i++; continue; }
      if (c === '⠠') {
        if (n1 === '⠆') { out += '”'; i++; continue; }
        if (REV_HANDAKU[n1]) { out += REV_HANDAKU[n1]; i++; continue; }
      }
      if (c === '⠢' && closer(i + 1)) { out += '？'; continue; }
      if (c === '⠲' && closer(i + 1)) { out += '。'; continue; }
      if (c === '⠖' && closer(i + 1)) { out += '！'; continue; }
      if (REV_COMBO[c] && REV_COMBO[c][n1]) { out += REV_COMBO[c][n1]; i++; continue; }
      if (c === '⠘' && REV_SMALL[n1]) { out += REV_SMALL[n1]; i++; continue; }
      if (c === '⠒' && n1 === '⠒') { out += '―'; i++; continue; }
      if (c === '⠂' && n1 === '⠂' && s[i + 2] === '⠂') { out += '…'; i += 2; continue; }
      if (REV_BASE[c]) { out += REV_BASE[c]; continue; }
      out += '〓';
    }
    return out;
  }

  // ---------- 墨字 → かな分かち書き（kuromoji トークン列から） ----------
  const KANJI_DIGIT = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const KANJI_UNIT = { '十': 10, '百': 100, '千': 1000 };
  const BIG_UNIT = { '万': 'マン', '億': 'オク', '兆': 'チョー' };
  const WAGO_TSU = ['', 'ヒトツ', 'フタツ', 'ミッツ', 'ヨッツ', 'イツツ', 'ムッツ', 'ナナツ', 'ヤッツ', 'ココノツ'];

  function parseSmallNumber(part) {
    if (/^[0-9.,]+$/.test(part)) return part;
    if (!/[十百千]/.test(part)) {
      let r = '';
      for (const ch of part) {
        if (KANJI_DIGIT[ch] !== undefined) r += KANJI_DIGIT[ch];
        else if (isDigit(ch)) r += ch;
        else return null;
      }
      return r;
    }
    let total = 0, num = 0;
    for (const ch of part) {
      if (KANJI_DIGIT[ch] !== undefined) num = num * 10 + KANJI_DIGIT[ch];
      else if (isDigit(ch)) num = num * 10 + Number(ch);
      else if (KANJI_UNIT[ch]) { total += (num || 1) * KANJI_UNIT[ch]; num = 0; }
      else return null;
    }
    return String(total + num);
  }
  // 数の語（例：二十七、３兆２４００万）→ 「27」「3チョー 2400マン」
  function numberToKana(surface) {
    const groups = surface.match(/[^万億兆]+[万億兆]?|[万億兆]/g) || [];
    const parts = [];
    for (const g of groups) {
      const unit = BIG_UNIT[g.slice(-1)] ? g.slice(-1) : '';
      const body = unit ? g.slice(0, -1) : g;
      const n = body ? parseSmallNumber(body) : '1';
      if (n === null) return null;
      parts.push(n + (unit ? BIG_UNIT[unit] : ''));
    }
    return parts.join(' ');
  }

  function longVowel(R, P, isVerb) {
    const r = Array.from(R), p = Array.from(P || R);
    const out = r.slice();
    for (let i = 1; i < r.length; i++) {
      if (r[i] !== 'ウ') continue;
      if (isVerb && i === r.length - 1) continue; // 動詞の活用語尾は「ウ」のまま
      if (p.length === r.length) {
        if (p[i] === 'ー') out[i] = 'ー';
      } else if (O_ROW.has(r[i - 1]) || U_ROW.has(r[i - 1])) {
        out[i] = 'ー';
      }
    }
    return out.join('');
  }

  const OPEN_BRACKETS = new Set('「『（(〔［[【“〈《＜'.split(''));
  const CLOSE_BRACKETS = new Set('」』）)〕］]】”〉》＞'.split(''));
  const PUNCTS = new Set('。、，．？！?!・…‥'.split(''));
  const UNITS = new Set(['ド', 'エン', 'ドル', 'パーセント', 'パーミル', 'ユーロ', 'ポンド', 'セント', 'ウォン', 'カシド', 'ネン', 'ガツ', 'ニチ', 'ジ', 'フン', 'ビョー']);
  // ローマ数字・英字のあとの1字の助数詞（Ⅲ章 → III ショー）。辞書が人名などに読むのを防ぐ
  const COUNTER = { '章': 'ショー', '節': 'セツ', '条': 'ジョー', '項': 'コー', '号': 'ゴー', '巻': 'カン', '部': 'ブ', '編': 'ヘン', '話': 'ワ', '回': 'カイ', '位': 'イ', '世': 'セイ', '型': 'ガタ', '版': 'ハン', '組': 'クミ', '期': 'キ', '類': 'ルイ', '式': 'シキ', '段': 'ダン', '級': 'キュー' };
  const SPACED = new Set(['→', '←', '↔', '＝']); // 前後を1マスあける記号
  const ATTACH = new Set(['/', '／', '+', '×', '÷', '−', '-', '－', '‐', '\u02bc']); // 前後を続ける記号
  const isKanji2 = s => /^[一-鿿々]{2}$/.test(s);
  const isLatinWord = s => /^[A-Za-z][A-Za-z0-9.]*$/.test(s);

  // kuromoji のトークンを語に整える（数の連続をまとめる）
  function prepareTokens(tokens) {
    const res = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const isNum = t.pos === '名詞' && t.pos_detail_1 === '数';
      if (isNum && /^[0-9〇零一二三四五六七八九十百千万億兆.,]+$/.test(t.surface_form)) {
        let surf = t.surface_form;
        for (;;) {
          const n1 = tokens[i + 1], n2 = tokens[i + 2];
          const isNumTok = t2 => t2 && t2.pos === '名詞' && t2.pos_detail_1 === '数' && /^[0-9〇零一二三四五六七八九十百千万億兆.,]+$/.test(t2.surface_form);
          if (isNumTok(n1)) { i++; surf += n1.surface_form; continue; }
          // 1,000 や 3.14 のように、カンマ・小数点で分かれた数をつなぐ
          if (n1 && /^[,.]$/.test(n1.surface_form) && n2 && /^[0-9]+$/.test(n2.surface_form) && /[0-9]$/.test(surf)) { i += 2; surf += n1.surface_form + n2.surface_form; continue; }
          break;
        }
        res.push({ surface_form: surf, pos: '名詞', pos_detail_1: '数', isNumber: true, reading: '*' });
        continue;
      }
      res.push(t);
    }
    return res;
  }

  function tokenKana(t, prev, next, opts) {
    const surf = t.surface_form;
    if (t.isNumber) {
      // 和語の数え方（一つ、二つ…）は仮名で書く
      if (next && next.surface_form === 'つ' && /^[一二三四五六七八九1-9]$/.test(surf)) return { kana: WAGO_TSU[KANJI_DIGIT[surf] || Number(surf)], eatNext: true };
      if (next && next.surface_form === '人' && (surf === '一' || surf === '二')) return { kana: surf === '一' ? 'ヒトリ' : 'フタリ', eatNext: true };
      const k = numberToKana(surf);
      if (k !== null) return { kana: k };
    }
    if (isLatinWord(surf) || /^[0-9.,]+$/.test(surf)) return { kana: surf };
    if (Array.from(surf).every(c => PUNCT[c] || c === '\u02bc')) return { kana: surf }; // 記号（辞書が名詞と見ることもある）
    if (t.pos === '記号' || PUNCTS.has(surf) || OPEN_BRACKETS.has(surf) || CLOSE_BRACKETS.has(surf)) {
      if (/^[ァ-ヺーぁ-ゖ]+$/.test(surf)) return { kana: toKatakana(surf) };
      if (Array.from(surf).every(c => PUNCT[c] || c === '\u02bc')) return { kana: surf };
      if (t.reading && t.reading !== '*' && !PUNCT[surf] && !/[…‥―─—～〜]/.test(surf)) return { kana: t.reading };
      return { kana: surf };
    }
    if (COUNTER[surf] && prev && (isLatinWord(prev.surface_form) || prev.isNumber)) return { kana: COUNTER[surf] };
    // 数字のあとの「月」はガツ
    if (prev && prev.isNumber && surf === '月') return { kana: 'ガツ' };
    // 推量・意志の助動詞「う」は長音符（書こう → カコー）
    if (t.pos === '助動詞' && surf === 'う' && prev && prev._kana && (O_ROW.has(prev._kana.slice(-1)) || U_ROW.has(prev._kana.slice(-1)))) return { kana: 'ー' };
    if (t.pos === '助詞') {
      if (surf === 'は') return { kana: 'ワ' };
      if (surf === 'へ') return { kana: 'エ' };
    }
    const R = t.reading && t.reading !== '*' ? t.reading : null;
    if (R) {
      return { kana: longVowel(R, t.pronunciation && t.pronunciation !== '*' ? t.pronunciation : R, t.pos === '動詞') };
    }
    // 辞書にない語（カタカナ語の区切りの中点はマスあけにする：ルイ・ブライユ → ルイ ブライユ）
    if (/^[ぁ-ゖァ-ヺー・]+$/.test(surf)) return { kana: toKatakana(surf).replace(/・/g, ' ') };
    if (/^[A-Za-z0-9.,\u02bc]+$/.test(surf)) return { kana: surf };
    if (opts && opts.fallback) { const k = opts.fallback(surf); if (k) return { kana: k, unresolved: true }; }
    return { kana: surf, unresolved: true };
  }

  function needsBreak(t, prev, ctx) {
    if (!prev) return false;
    if (ctx.attachNext) return false;
    const surf = t.surface_form, p = t.pos, d1 = t.pos_detail_1;
    const ps = prev.surface_form;
    if (CLOSE_BRACKETS.has(surf) || PUNCTS.has(surf)) return false;
    if (OPEN_BRACKETS.has(surf)) return true;
    if (ATTACH.has(surf) || ATTACH.has(ps)) return false;
    if (SPACED.has(surf) || SPACED.has(ps)) return true;
    if (PUNCTS.has(ps) && ps !== '…' && ps !== '‥') return true;
    if (CLOSE_BRACKETS.has(ps)) return !(p === '助詞' || p === '助動詞');
    if (ATTACH.has(surf) || ATTACH.has(ps)) return false;
    if (SPACED.has(surf) || SPACED.has(ps)) return true;
    if (prev.isNumber && (UNITS.has(surf) || (/^[A-Za-z]{1,3}$/.test(surf) && /^[a-zA-Z]+$/.test(surf) && /^(?:mm|cm|m|km|g|kg|mg|t|ml|l|L|kl|dl|cc|a|ha|W|kW|V|A|Hz|kHz|MHz|GHz|B|KB|MB|GB|TB|px|pt|dB|K)$/.test(surf)))) return false;
    if (p === '記号') return /[…‥―─—]/.test(surf);
    if (p === '助詞' || p === '助動詞') return isLatinWord(ps);
    if (p === '名詞') {
      if (d1 === '接尾') return false;
      if (d1 === '非自立') return !(surf === 'の' || surf === 'ん');
      if (prev.pos === '接頭詞') return false;
      if (prev.pos === '名詞' && !['接尾', '非自立', '数', '代名詞'].includes(prev.pos_detail_1) && !prev.isNumber && !t.isNumber) {
        if (prev.pos_detail_3 === '姓' && t.pos_detail_3 === '名') return true;
        if (isLatinWord(ps) || isLatinWord(surf)) return false;
        return ctx.prevMora >= 3 && ctx.curMora >= 3; // 複合語の切れ続き
      }
      if (prev.isNumber && (d1 === '接尾' || d1 === '助数詞' || /^[\u4e00-\u9fff]$/.test(surf) || UNITS.has(surf))) return false;
      return true;
    }
    if (p === '動詞') {
      if (d1 === '接尾') return false;
      if (t.basic_form === 'する' && prev.pos === '名詞' && /^[一-鿿]$/.test(ps)) return false; // 愛する
      if (['てる', 'でる', 'とく', 'どく', 'ちゃう', 'じゃう', 'ちまう'].includes(t.basic_form)) return false;
      if (t.basic_form === 'なさる' && prev.pos === '動詞') return false;
      // 複合動詞（混み合う・歩き続ける）は続ける
      if (prev.pos === '動詞' && /^連用/.test(prev.conjugated_form || '') && prev.pos_detail_1 === '自立') return false;
      return true;
    }
    if (p === '形容詞') {
      if (d1 === '接尾') return false;
      if (d1 === '非自立') return ps === 'て' || ps === 'で';
      return true;
    }
    return true; // 副詞・連体詞・接続詞・感動詞・接頭詞など
  }

  function moraOf(t, kana) {
    if (isKanji2(t.surface_form)) return 3; // 2字漢語は3拍扱い
    return moraCount(kana);
  }

  // 読みが割れる語（候補を出して、点訳者に選んでもらう）
  const AMBIG = {
    'その後': ['ソノゴ', 'ソノ アト', 'ソノ ノチ'], 'その他': ['ソノ ホカ', 'ソノタ'],
    '一日': ['イチニチ', 'ツイタチ'], '今日': ['キョー', 'コンニチ'], '明日': ['アシタ', 'アス', 'ミョーニチ'],
    '昨日': ['キノー', 'サクジツ'], '日本': ['ニホン', 'ニッポン'], '上手': ['ジョーズ', 'ウワテ', 'カミテ'],
    '下手': ['ヘタ', 'シモテ', 'シタテ'], '人気': ['ニンキ', 'ヒトケ'], '生物': ['セイブツ', 'ナマモノ'],
    '色紙': ['シキシ', 'イロガミ'], '市場': ['イチバ', 'シジョー'], '大家': ['オーヤ', 'タイカ'],
    '一行': ['イチギョー', 'イッコー'], '風車': ['フーシャ', 'カザグルマ'], '最中': ['サイチュー', 'モナカ'],
    '何人': ['ナンニン', 'ナニジン'],
    '今月末': ['コンゲツマツ', 'コンゲツ スエ'], '一番': ['イチバン', 'イチ バン'], '行方': ['ユクエ', 'ギョーホー', 'イクエ'], '一時': ['イチジ', 'イットキ', 'イチ ジ']
  };

  // 1行分の kuromoji トークン → 分かち書きした点字仮名
  function tokensToKana(rawTokens, opts) {
    const tokens = prepareTokens(rawTokens);
    let out = '';
    const unresolved = [];
    const checks = [];
    const ctx = { attachNext: false, prevMora: 0, curMora: 0 };
    let prev = null;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const surf = t.surface_form;
      if (/^[\s　]+$/.test(surf)) { out += ' '; prev = null; ctx.attachNext = false; continue; }
      // カタカナ語どうしを区切る中点はマスあけにする（ルイ・ブライユ → ルイ ブライユ）
      const nx = tokens[i + 1];
      if (surf === '・' && prev && nx && /^[ァ-ヺー]+$/.test(prev.surface_form) && /^[ァ-ヺー]+/.test(nx.surface_form)) {
        out += ' '; prev = null; ctx.attachNext = false; continue;
      }
      const r = tokenKana(t, prev, tokens[i + 1], opts);
      if (r.unresolved) unresolved.push(surf);
      if (AMBIG[surf] && r.kana) checks.push({ surface: surf, kana: r.kana, options: AMBIG[surf] });
      else if (t.isNumber && tokens[i + 1] && tokens[i + 1].surface_form === '日') checks.push({ surface: surf + '日', kana: r.kana + 'ニチ', options: [r.kana + 'ニチ', r.kana + 'カ'] });
      ctx.curMora = moraOf(t, r.kana);
      const brk = needsBreak(t, prev, ctx);
      if (brk && out && !out.endsWith(' ')) out += ' ';
      out += r.kana;
      t._kana = r.kana;
      if (r.eatNext) i++;
      ctx.attachNext = t.pos === '接頭詞' || OPEN_BRACKETS.has(surf);
      ctx.prevMora = ctx.curMora;
      prev = t;
    }
    return { kana: normalizeSpacing(out), unresolved, checks };
  }

  // 句読点まわりのマスあけを整える
  function normalizeSpacing(s) {
    return s
      .replace(/[ 　]+/g, ' ')
      .replace(/ *([→←↔＝]) */g, ' $1 ')
      .replace(/ *([\/／]) */g, '$1')
      .replace(/ +(?=[。、？！?!」』）)〕］】”〉》＞])/g, '')
      .replace(/([「『（(〔［【“〈《＜]) +/g, '$1')
      .replace(/、 */g, '、 ')
      .replace(/(\D)・ */g, '$1・ ')
      .replace(/([。？！?!]) *(?=[^ 」』）)〕］】”〉》＞])/g, '$1  ')
      .replace(/([。？！?!][」』）)”]) *(?=[「『（(“])/g, '$1  ')
      .trim();
  }

  // ---------- 行の種類と飾り ----------
  const ROW_TYPES = [
    ['body', '本文'], ['h1', '大見出し'], ['h2', '中見出し'], ['h3', '小見出し'],
    ['rule', '区切り線'], ['frame-start', '枠の始まり'], ['frame-end', '枠の終わり'],
    ['table', '表の行'], ['figure', '図'], ['blank', '空行']
  ];
  const HEAD_INDENT = { h1: 6, h2: 4, h3: 2 }; // 7・5・3マス目から書き出す
  const DECOR_TYPES = new Set(['rule', 'frame-start', 'frame-end']);
  // 枠線：第1種（⠖⠒⠲ / ⠓⠒⠚）。区切り線は棒線（⠒）を左右2マスあけて引く
  function decorCells(type, cols) {
    const inner = Math.max(2, cols - 6);
    if (type === 'rule') return '⠀⠀' + '⠒'.repeat(Math.max(2, cols - 4));
    if (type === 'frame-start') return '⠀⠀⠖' + '⠒'.repeat(inner) + '⠲';
    if (type === 'frame-end') return '⠀⠀⠓' + '⠒'.repeat(inner) + '⠚';
    return '';
  }
  // 点字の飾り行を見分ける（点字→墨字のとき、読まずに飾りとして扱う）
  function detectDecor(cells) {
    const t = (cells || '').replace(/^⠀+|⠀+$/g, '');
    if (!t) return null;
    if (/^⠒{4,}$/.test(t) || /^⠂{6,}$/.test(t) || /^⠤{6,}$/.test(t)) return 'rule';
    if (/^[⠖⠫]⠒{2,}[⠲⠝]$/.test(t)) return 'frame-start';
    if (/^[⠓⠮]⠒{2,}[⠚⠵]$/.test(t)) return 'frame-end';
    return null;
  }
  // 飾りの点字を、墨字のデザインに起こす
  const DECOR_GLYPH = {
    rule: { '⠒': '─', '⠂': '･', '⠤': '─' },
    'frame-start': { '⠖': '┌', '⠫': '┏', '⠒': '─', '⠲': '┐', '⠝': '┓' },
    'frame-end': { '⠓': '└', '⠮': '┗', '⠒': '─', '⠚': '┘', '⠵': '┛' }
  };
  function decorText(type, cells) {
    const map = DECOR_GLYPH[type] || {};
    return Array.from(cells || '').map(c => c === '⠀' ? '　' : (map[c] || '･')).join('').replace(/^　+|　+$/g, '');
  }
  // 点字が多く、かなとして読むと意味をなさない行（点図・模様）を見分ける
  function looksLikeGraphic(cells, kana) {
    const t = (cells || '').replace(/⠀/g, '');
    if (t.length < 6) return false;
    const bad = (kana.match(/〓/g) || []).length;
    const dense = (t.match(/[⠿⠾⠷⠯⠟⠻⠽]/g) || []).length / t.length;
    return bad / t.length > 0.25 || (dense > 0.6 && !/[ァ-ン]{3}/.test(kana.replace(/メ|モ|ミ|ヘ|テ|セ|ム/g, '')));
  }

  // ---------- 枠と表の形を整える ----------
  // 枠の中は3マス目から書く。枠線の長さは中身の幅に合わせる。
  // 表は列の頭をそろえ（列の間は2マス以上あける）、1行に入らない表は「見出し：値」を項目ごとに書く。
  const FRAME_IND = 2;
  const clen = s => Array.from(s || '').length;
  function tableKana(r) {
    if (r.tkana && r.tkana.length) return r.tkana;
    return (r.kana || '').split(/ {2,}|\t/);
  }
  function fitBlocks(rows, opt) {
    const cols = opt.cols || 32;
    const live = rows.filter(r => r && !r.pagebreak);
    live.forEach(r => { r._lines = null; r._fit = null; r._inFrame = false; r._table = null; r._tableHead = null; });
    // 枠の中の行に印を付ける
    const frames = [];
    let open = null;
    for (const r of live) {
      if (r.type === 'frame-start' && !r.fixed) { if (open) frames.push(open); open = { start: r, rows: [] }; continue; }
      if (r.type === 'frame-end' && !r.fixed) { if (open) { open.end = r; frames.push(open); open = null; } continue; }
      if (open && r.type !== 'genpon' && r.type !== 'pageno') { open.rows.push(r); r._inFrame = true; }
    }
    if (open) frames.push(open);
    // 表：続いた表の行を1つの表にして、列をそろえる
    for (let i = 0; i < live.length;) {
      if (live[i].type !== 'table') { i++; continue; }
      let j = i;
      while (j < live.length && live[j].type === 'table') j++;
      fitTable(live.slice(i, j), cols, live[i]._inFrame ? FRAME_IND : 0);
      i = j;
    }
    // 枠の中の文は3マス目から（段落の頭はさらに2マスあける）
    for (const f of frames) {
      let w = 0;
      for (const r of f.rows) {
        if (r.type === 'body' && r.cells) {
          const ind = FRAME_IND + (r.para && opt.indent ? 2 : 0);
          const body = (r.cells || '').replace(/^⠀+|⠀+$/g, '');
          const ls = wrapCells('⠀'.repeat(ind - FRAME_IND) + body, cols - FRAME_IND).map(l => '⠀'.repeat(FRAME_IND) + l);
          r._lines = ls;
        }
        if (r._lines) r._lines.forEach(l => { w = Math.max(w, clen(l)); });
        else if (HEAD_INDENT[r.type] && r.cells) w = Math.max(w, Math.min(cols, HEAD_INDENT[r.type] + clen(r.cells)));
        else if (r.type === 'figure' && r.figure && !r.noFigure) r.figure.forEach(l => { w = Math.max(w, Math.min(cols, clen(l))); });
        else if (r.type === 'figure' && r.cells) w = Math.max(w, Math.min(cols, FRAME_IND + clen(r.cells)));
      }
      // 枠線は中身より1マス以上長く、短すぎないように
      const W = Math.min(cols, Math.max(w + 1, 16));
      const inner = Math.max(2, W - FRAME_IND - 2);
      f.start._lines = ['⠀'.repeat(FRAME_IND) + '⠖' + '⠒'.repeat(inner) + '⠲'];
      if (f.end) f.end._lines = ['⠀'.repeat(FRAME_IND) + '⠓' + '⠒'.repeat(inner) + '⠚'];
      f.start._block = 2 + f.rows.reduce((a, r) => a + estimateLines(r, cols), 0);
    }
    return rows;
  }
  function estimateLines(r, cols) {
    if (r._lines) return r._lines.length;
    if (r.type === 'blank') return 1;
    if (r.type === 'figure') return r.figure && !r.noFigure ? r.figure.length : 1;
    if (HEAD_INDENT[r.type]) return wrapCells((r.cells || '').replace(/^⠀+/, ''), cols - HEAD_INDENT[r.type]).length + 1;
    return r.cells ? wrapCells(r.cells, cols).length : 1;
  }
  // かなと点字を、表示でそろえられる単位（かな1つ・記号1つ）の並びにする
  function pieceUnits(kana) {
    const b = kanaToBraille((kana || '').trim());
    return b.units.map(u => ({ k: u.text, c: u.cells }));
  }
  const plen = a => a.reduce((n, p) => n + clen(p.c), 0);
  const padPiece = n => ({ k: '', c: '⠀'.repeat(Math.max(0, n)), pad: true });
  const isSpacePiece = p => /^⠀+$/.test(p.c) && /^[ 　]*$/.test(p.k);
  // 単位の並びを、語の切れ目（マスあけ）で width マスごとに折り返す
  function wrapPieces(pcs, width) {
    const words = [];
    let cur = [], sp = [];
    for (const p of pcs) {
      if (isSpacePiece(p)) { if (cur.length) { words.push({ sp, w: cur }); cur = []; sp = []; } sp.push(p); }
      else cur.push(p);
    }
    if (cur.length) words.push({ sp, w: cur });
    const lines = [];
    let line = [], len = 0;
    for (const { sp, w } of words) {
      const wl = plen(w), sl = plen(sp);
      if (len && len + sl + wl <= width) { line.push(...sp, ...w); len += sl + wl; continue; }
      if (len) { lines.push(line); line = []; len = 0; }
      if (wl <= width) { line = [...w]; len = wl; continue; }
      for (const p of w) { const l = clen(p.c); if (len && len + l > width) { lines.push(line); line = []; len = 0; } line.push(p); len += l; }
    }
    if (line.length || !lines.length) lines.push(line);
    return lines;
  }
  // 表を整える。列の頭を縦にそろえ、列の間は2マス以上あける。
  //  grid  … そのまま入る
  //  wrap  … 最後の列だけ、その列の中で折り返す（続きの行も列の頭にそろえる）
  //  split … 1行に入らないので、1列目（行の名前）をくり返して、いくつかの表に分ける
  //  list  … それでも入らないとき、「列の名前：値」で項目ごとに書く
  const MIN_LAST = 8;
  function fitTable(trs, cols, ind) {
    const grid = trs.map(r => tableKana(r).map(k => pieceUnits(k)));
    const nc = Math.max(...grid.map(g => g.length));
    grid.forEach(g => { while (g.length < nc) g.push([]); });
    const w = Array(nc).fill(0);
    grid.forEach(g => g.forEach((c, k) => { w[k] = Math.max(w[k], plen(c)); }));
    // 1行目を列の見出しとみなすのは、2行以上あり、1行目に数だけの欄がないとき
    const numeric = k => /^[\s0-9.,%％\-−＋+]+$/.test(k.trim()) && /[0-9]/.test(k);
    const hasHead = trs.length > 1 && !tableKana(trs[0]).some(numeric);
    let parts, mode;
    if (ind + w.reduce((a, b) => a + b, 0) + 2 * (nc - 1) <= cols) { parts = [[...Array(nc).keys()]]; mode = 'grid'; }
    else {
      parts = [];
      let cur = [0], fixed = ind + w[0];
      for (let k = 1; k < nc; k++) {
        if (cur.length > 1 && fixed + 2 + Math.min(w[k], MIN_LAST) > cols) { parts.push(cur); cur = [0]; fixed = ind + w[0]; }
        cur.push(k); fixed += 2 + w[k];
      }
      parts.push(cur);
      const fits = parts.every(p => {
        const fx = ind + p.slice(0, -1).reduce((a, k) => a + w[k] + 2, 0);
        return cols - fx >= Math.min(w[p[p.length - 1]], MIN_LAST);
      });
      mode = !fits ? 'list' : parts.length > 1 ? 'split' : 'wrap';
    }
    const lines = [];
    if (mode !== 'list') {
      parts.forEach((p, pi) => {
        if (parts.length > 1) {
          if (pi) lines.push({ pieces: [], row: -1, part: pi, gap: true });
          lines.push({ pieces: [padPiece(ind), ...pieceUnits(`⦅ヒョー ソノ${pi + 1}⦆`)], row: -1, part: pi, note: true });
        }
        const starts = [];
        let x = ind;
        p.forEach(k => { starts.push(x); x += w[k] + 2; });
        const lastK = p[p.length - 1], lastStart = starts[starts.length - 1];
        const tag = (pcs, k) => pcs.map(pc => ({ ...pc, col: k })); // 表示で列ごとに色分けするための印
        grid.forEach((g, ri) => {
          wrapPieces(tag(g[lastK], lastK), cols - lastStart).forEach((ll, li) => {
            const pcs = [];
            if (li === 0) {
              pcs.push(padPiece(ind));
              p.slice(0, -1).forEach(k => { pcs.push(...tag(g[k], k), padPiece(w[k] - plen(g[k]) + 2)); });
            } else pcs.push(padPiece(lastStart)); // 欄の中の折り返しは、その列の頭から
            pcs.push(...ll);
            lines.push({ pieces: pcs, row: ri, part: pi, header: hasHead && ri === 0, cont: li > 0 });
          });
        });
      });
    } else {
      const colon = { k: '：', c: '⠐⠂' };
      grid.forEach((g, ri) => {
        if (hasHead && ri === 0) {
          const all = [];
          g.forEach((c, k) => { if (!c.length) return; if (all.length) all.push(padPiece(2)); all.push(...c); });
          wrapPieces(all, cols - ind).forEach(l => lines.push({ pieces: [padPiece(ind), ...l], row: ri, header: true, part: 0 }));
          return;
        }
        wrapPieces(g[0], cols - ind).forEach(l => lines.push({ pieces: [padPiece(ind), ...l], row: ri, part: 0 }));
        g.slice(1).forEach((c, k) => {
          if (!c.length) return;
          const label = hasHead && grid[0][k + 1].length ? [...grid[0][k + 1], colon] : [];
          wrapPieces([...label, ...c], cols - ind - 2).forEach(l => lines.push({ pieces: [padPiece(ind + 2), ...l], row: ri, part: 0, cont: true }));
        });
      });
    }
    lines.forEach(l => {
      while (l.pieces.length && l.pieces[l.pieces.length - 1].pad) l.pieces.pop();
      l.pieces = l.pieces.filter(p => p.c);
      l.cells = l.pieces.map(p => p.c).join('');
    });
    const T = { mode, parts: parts.length, nc, rows: trs.length, lines, ind, widths: w, hasHead };
    trs.forEach((r, ri) => { r._lines = ri ? [] : lines.map(l => l.cells); r._fit = { mode }; r._table = ri ? null : T; r._tableHead = trs[0]; });
  }

  const digitsCells = n => '⠼' + String(n).split('').map(d => DIGIT[d]).join('');
  // ページ行（1行目）：点字ページ番号を28マス目から書く。原本ページは行頭に書く（指定したとき）
  function pageLine(n, genpon, cols, opt) {
    if (opt.noNumbers) return '';
    const line = Array(cols).fill('⠀');
    const num = Array.from(digitsCells(n));
    let start = Math.min(27, cols - num.length);
    num.forEach((c, i) => { line[start + i] = c; });
    if (opt.genpon && genpon) {
      const g = Array.from(digitsCells(genpon));
      g.forEach((c, i) => { if (i < start - 1) line[i] = c; });
    }
    return line.join('').replace(/⠀+$/, '');
  }

  // ---------- レイアウト（マス数・行数） ----------
  // rows: [{cells, para, type}, {pagebreak:true}, {type:'genpon', page:'12'}, ...]
  function layoutPages(rows, opt) {
    const cols = opt.cols || 32, lines = opt.lines || 18, indent = opt.indent ? 2 : 0;
    const bodyLines = opt.pageNumbers ? lines - 1 : lines;
    fitBlocks(rows, opt);
    let curGenpon = null;
    const pages = [[]], meta = [{ genpon: null }];
    const cur = () => pages[pages.length - 1];
    const newPage = () => { pages.push([]); meta.push({ genpon: curGenpon }); };
    const room = () => bodyLines - cur().length;
    const pushLine = l => { if (cur().length >= bodyLines) newPage(); cur().push(l); };
    for (const row of rows) {
      if (row.pagebreak) { if (cur().length) newPage(); continue; }
      const type = row.type || 'body';
      if (type === 'pageno') {
        // 読み込んだページ行：ページ番号を付け直す設定なら捨てる。BESのようにページ行の枠があればそこへ置く
        if (opt.pageNumbers && !opt.noNumbers) continue;
        if (opt.pageNumbers) { if (cur().length) newPage(); meta[meta.length - 1].pageLine = row.cells; continue; }
        pushLine(row.cells);
        continue;
      }
      if (type === 'genpon') {
        curGenpon = row.page;
        if (!cur().length) meta[meta.length - 1].genpon = curGenpon;
        continue;
      }
      if (type === 'blank') { pushLine(''); continue; }
      if (row._table) {
        // 表：1ページに入るならまとめる。ページをまたぐときは、続きのページの頭に列の見出しの行をもう一度書く
        const T = row._table;
        if (cur().length && T.lines.length <= bodyLines && room() < T.lines.length) newPage();
        const heads = {};
        for (const l of T.lines) {
          if (l.header) (heads[l.part] = heads[l.part] || []).push(l.cells);
          if (room() <= 0) {
            newPage();
            if (l.gap) continue;
            if (!l.header && !l.note && heads[l.part] && T.rows > 3) heads[l.part].forEach(h => pushLine(h));
          }
          pushLine(l.cells);
        }
        continue;
      }
      if (row._lines) {
        // 枠は、1ページに入るならまとめて次のページへ送る。枠線だけがページの端に残らないようにする
        if (row._block && cur().length && (row._block <= bodyLines ? room() < row._block : room() < 3)) newPage();
        for (const l of row._lines) pushLine(l);
        continue;
      }
      if (DECOR_TYPES.has(type)) {
        pushLine(row.fixed ? row.cells : decorCells(type, cols));
        continue;
      }
      if (type === 'figure' && row.figure && row.figure.length && !row.noFigure) {
        if (room() < row.figure.length && cur().length) newPage();
        for (const l of row.figure) pushLine(Array.from(l).slice(0, cols).join(''));
        continue;
      }
      let cells = (row.cells || '').replace(/⠀+$/, ''); // 行末の空白は折り返しの計算に入れない
      if (cells === '') { pushLine(''); continue; }
      if (HEAD_INDENT[type]) {
        const ind = HEAD_INDENT[type];
        const body = wrapCells(cells.replace(/^⠀+/, ''), cols - ind).map(l => '⠀'.repeat(ind) + l);
        // 見出しの前は1行あける。ページの最後に見出しだけが残らないようにする
        if (cur().length && cur()[cur().length - 1] !== '') {
          if (room() < body.length + 2) newPage(); else pushLine('');
        } else if (room() < body.length + 1) newPage();
        for (const l of body) pushLine(l);
        continue;
      }
      if (row.para && indent && !cells.startsWith('⠀')) cells = '⠀'.repeat(indent) + cells;
      for (const l of wrapCells(cells, cols)) pushLine(l);
    }
    if (pages.length > 1 && cur().length === 0) { pages.pop(); meta.pop(); }
    if (opt.pageNumbers) {
      const startNo = opt.pageStart || 1;
      return pages.map((p, i) => [meta[i].pageLine !== undefined ? meta[i].pageLine : pageLine(startNo + i, meta[i].genpon, cols, opt), ...p]);
    }
    return pages;
  }

  // 分かち書きの単位で行を折り返す（語の途中で切らない）
  function wrapCells(cells, cols) {
    const arr = Array.from(cells);
    if (arr.length <= cols) return [cells];
    const parts = []; // 語と空白の塊
    let cur = '', curIsSpace = null;
    for (const c of arr) {
      const sp = c === '⠀';
      if (curIsSpace === null || sp === curIsSpace) { cur += c; curIsSpace = sp; }
      else { parts.push(cur); cur = c; curIsSpace = sp; }
    }
    if (cur) parts.push(cur);
    const out = [];
    let line = '';
    const len = x => Array.from(x).length;
    for (const part of parts) {
      const isSp = part.startsWith('⠀');
      if (isSp) {
        if (!out.length && !line) { line = part; continue; } // 段落の頭のマスあけは残す
        if (line && len(line) + len(part) < cols) line += part;
        else if (line) { out.push(line); line = ''; }
        continue;
      }
      if (len(line) + len(part) <= cols) { line += part; continue; }
      if (line) { out.push(line.replace(/⠀+$/, '')); line = ''; }
      let w = Array.from(part);
      while (w.length > cols) { out.push(w.slice(0, cols).join('')); w = w.slice(cols); }
      line = w.join('');
    }
    if (line) out.push(line.replace(/⠀+$/, ''));
    return out;
  }

  // ---------- 点字コード変換（NABCC / Braille ASCII / BES バイト） ----------
  const ASCII_BRAILLE = ' A1B\'K2L@CIF/MSP"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=';
  const cellBits = c => c.charCodeAt(0) - 0x2800;
  const bitsCell = b => String.fromCharCode(0x2800 + b);
  const ASCII_TO_BITS = {};
  for (let b = 0; b < 64; b++) {
    const ch = ASCII_BRAILLE[b];
    ASCII_TO_BITS[ch] = b;
    ASCII_TO_BITS[ch.toLowerCase()] = b;
  }
  // NABCC 小文字側の記号
  Object.assign(ASCII_TO_BITS, { '`': 8, '{': 42, '|': 51, '}': 59, '~': 24 });

  function cellsToAscii(cells, lower) {
    let s = '';
    for (const c of cells) {
      const b = cellBits(c) & 63;
      const ch = ASCII_BRAILLE[b];
      s += lower ? ch.toLowerCase() : ch;
    }
    return s;
  }
  function asciiToCells(text) {
    let s = '';
    for (const ch of text) {
      if (ASCII_TO_BITS[ch] !== undefined) s += bitsCell(ASCII_TO_BITS[ch]);
      else if (ch >= '⠀' && ch <= '⣿') s += ch;
    }
    return s;
  }

  const api = {
    ROW_TYPES, HEAD_INDENT, DECOR_TYPES, decorCells, detectDecor, decorText, looksLikeGraphic, pageLine, AMBIG,
    kanaToBraille, brailleToKana, tokensToKana, normalizeSpacing,
    layoutPages, fitBlocks, tableKana, wrapCells, cellsToAscii, asciiToCells, cellBits, bitsCell,
    toKatakana, toHiragana, normalizeInput, numberToKana, moraCount, prepareSumiji, READ
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TenjiEngine = api;
})(typeof self !== 'undefined' ? self : this);

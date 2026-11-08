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
    '⦅': '⠶⠶', '⦆': '⠶⠶', // 点訳者挿入符（点訳のてびき第4版の形）
    '｟': '⠰⠶', '｠': '⠶⠆', // 二重カッコ
    '“': '⠤', '”': '⠤', // “ ” は「」と同じ第1カギ（公式の点字データ）
    '〈': '⠰⠄', '〉': '⠠⠆', '《': '⠰⠄', '》': '⠠⠆', '＜': '⠰⠄', '＞': '⠠⠆',
    // ：は第1小見出し符（⠠⠤＋1マスあけ）。数字のあいだの : だけはコロン（⠐⠂）
    '：': '⠠⠤', ':': '⠐⠂', '※': '⠰⠆', '％': '⠰⠏',
    // 星印（第1 ⠔⠔・第2 ⠢⠢・第3 ⠠⠢）、伏せ字（○ △ □ × その他）、指示符（第1 ⠐⠤ … ⠤⠂）
    '⁂': '⠢⠢', '⁎': '⠠⠢', '○': '⠐⠵', '△': '⠐⠷', '□': '⠐⠽', '╳': '⠐⠿', '◌': '⠐⠾',
    '〖': '⠐⠤', '〗': '⠤⠂', '＆': '⠰⠯', '&': '⠰⠯', '＃': '⠰⠩', '#': '⠰⠩', '-': '⠤', '－': '⠤', '‐': '⠤', '‑': '⠤', '–': '⠤',
    '<': '⠰⠄', '>': '⠠⠆', '⁑': '⠔⠔',
    // 斜線・矢印
    '/': '⠌', '／': '⠌', '→': '⠒⠒⠕', '←': '⠪⠒⠒', '↔': '⠪⠒⠒⠕',
    // 数式の中の記号（数字にはさまれたときだけ記号のまま残す。ほかは読み替える）
    '+': '⠢', '×': '⠡', '÷': '⠌', '＝': '⠒⠒', '−': '⠔',
    // 英文の句読点
    '.': '⠲', ',': '⠰', ';': '⠆', '；': '⠆'
  };

  // 墨字の1行 → かな（分かち書き）。全角スペースの区切りは2マスあけにする
  // 日本語・英語以外の外国語（点字の書き方が言語ごとに違うので、点訳者に確かめてもらう）
  const FOREIGN = [
    [/[A-Za-zÀ-ÖØ-öø-ɏ]*[À-ÖØ-öø-ɏ][A-Za-zÀ-ÖØ-öø-ɏ]*/g, 'アクセント記号つきの外国語（フランス語・ドイツ語・スペイン語など）'],
    [/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]+/g, 'ハングル（韓国・朝鮮語）'],
    [/[\u0400-\u04FF]+/g, 'キリル文字（ロシア語など）'],
    [/[\u0600-\u06FF\u0750-\u077F]+/g, 'アラビア文字'],
    [/[\u0590-\u05FF]+/g, 'ヘブライ文字'],
    [/[\u0E00-\u0E7F]+/g, 'タイ文字'],
    [/[\u0900-\u097F]+/g, 'デーヴァナーガリー（ヒンディー語など）']
  ];
  function foreignParts(text) {
    const out = [];
    for (const [re, kind] of FOREIGN) for (const m of text.matchAll(re)) out.push({ text: m[0], kind });
    return out;
  }

  // 行頭の番号・記号（見出しや箇条書きの「ア」「1」「（1）」「第1」）を、点字の書き方にする
  //  （1）→「（1）」＋1マス、ア／ア．→「ア。」＋1マス、1．→「1。」＋1マス、1・第1（後ろに空白）→＋2マス
  function lineLabel(text) {
    const zen = t => t.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    let m;
    if ((m = /^[ 　]*[（(]([0-9０-９]+|[ア-ン])[）)][ 　]*(?=\S)/.exec(text))) return { kana: '（' + zen(m[1]) + '）', sep: ' ', rest: text.slice(m[0].length) };
    if ((m = /^[ 　]*([ア-ン])(?:[．.、][ 　]*|[ 　]+)(?=\S)/.exec(text))) return { kana: m[1] + '。', sep: ' ', rest: text.slice(m[0].length) };
    if ((m = /^[ 　]*([0-9０-９]+)[．.][ 　]*(?=\S)/.exec(text))) return { kana: zen(m[1]) + '。', sep: ' ', rest: text.slice(m[0].length) };
    if ((m = /^[ 　]*(第?)([0-9０-９]+)[ 　]+(?=\S)(?![+\-−×÷=＝<>＜＞＋－/^√²³])/.exec(text))) return { kana: (m[1] ? 'ダイ' : '') + zen(m[2]), sep: '  ', rest: text.slice(m[0].length) };
    return null;
  }
  function sumijiToKana(text, tokenize, opts, noLabel) {
    const lb = noLabel ? null : lineLabel(text);
    if (lb) {
      const r = sumijiToKana(lb.rest, tokenize, opts, true);
      return { kana: lb.kana + lb.sep + r.kana, unresolved: r.unresolved, checks: r.checks, foreign: r.foreign };
    }
    // 発音記号（[dʒæ̀pəníːz] など）は読まずに ⟦ ⟧ で囲んで残し、点字にするときに発音記号の点字にする
    const segs = [];
    let last = 0, m;
    IPA_RE.lastIndex = 0;
    while ((m = IPA_RE.exec(text))) {
      const inner = m[1] || m[2] || m[3] || m[4];
      if (!isIpaText(inner)) continue;
      if (m.index > last) segs.push({ text: text.slice(last, m.index) });
      segs.push({ ipa: inner.normalize('NFC').trim() });
      last = m.index + m[0].length;
    }
    if (last < text.length) segs.push({ text: text.slice(last) });
    // URL・メールアドレスは読まずに ⟬ ⟭ で囲んで残す（点字ではアドレス囲み符号の中に情報処理用点字で書く）
    for (let k = segs.length - 1; k >= 0; k--) {
      if (!segs[k].text) continue;
      const t = normalizeInput(segs[k].text), parts = [];
      let p0 = 0, mm;
      URL_RE.lastIndex = 0;
      while ((mm = URL_RE.exec(t))) {
        let u = mm[0].replace(/[.,;:!?)\]]+$/, ''); // 文の終わりの句読点はアドレスに入れない
        if (mm.index > p0) parts.push({ text: t.slice(p0, mm.index) });
        parts.push({ url: u });
        p0 = mm.index + u.length;
        URL_RE.lastIndex = p0;
      }
      if (!parts.length) continue;
      if (p0 < t.length) parts.push({ text: t.slice(p0) });
      segs.splice(k, 1, ...parts);
    }
    // 数式・単位（m²）は数学点字で書くので、読まずに ⟮ ⟯ で囲んで残す
    for (let k = segs.length - 1; k >= 0; k--) {
      if (!segs[k].text) continue;
      const t = normalizeInput(segs[k].text).replace(/[㎡㎥㎠㎤㎢㎦㎟㎣]/g, c => COMPAT_UNIT[c]), sp = findMath(t);
      if (!sp.length) continue;
      const parts = []; let p0 = 0;
      for (const x of sp) {
        if (x.start > p0) parts.push({ text: t.slice(p0, x.start) });
        parts.push({ math: x.raw, unit: !!x.unit });
        p0 = x.end;
      }
      if (p0 < t.length) parts.push({ text: t.slice(p0) });
      segs.splice(k, 1, ...parts);
    }
    let kana = '';
    const unresolved = [], checks = [], foreign = [];
    for (const sg of segs) {
      if (sg.text) foreign.push(...foreignParts(sg.text)); // 発音記号の中は除く
      if (sg.ipa) { kana += (kana && !/ $/.test(kana) ? ' ' : '') + '⟦' + sg.ipa + '⟧'; continue; }
      if (sg.url) { kana += (kana && !/ $/.test(kana) ? ' ' : '') + '⟬' + sg.url + '⟭'; continue; }
      // 単位（10m²）は数に続け、数式は前後を1マスあける
      if (sg.math) {
        kana += (sg.unit || !kana || / $/.test(kana) ? '' : ' ') + '⟮' + sg.math + '⟯';
        if (/[≦≤≧≥]/.test(sg.math)) checks.push({ surface: sg.math, kana: '⟮' + sg.math + '⟯', options: [], note: '≦ ≧ の点字（⠔⠔⠒⠒・⠢⠢⠒⠒）' });
        continue;
      }
      if (!sg.text.trim()) { if (kana) kana += ' '; continue; }
      const parts = prepareSumiji(normalizeInput(sg.text)).split(WIDE_GAP);
      const res = parts.map(p => tokensToKana(tokenize(p), opts));
      const k = res.map(r => r.kana).join('  ');
      if (kana && k && !/^[。、，．？！?!」』）)〕］】”]/.test(k) && !/ $/.test(kana)) kana += ' ';
      kana += k;
      res.forEach(r => { unresolved.push(...r.unresolved); checks.push(...r.checks); });
    }
    return { kana: kana.replace(/ +$/, ''), unresolved, checks, foreign };
  }

  // ---------- 点字に専用の記号がないものの読み替え ----------
  // 点訳のてびきの考え方に合わせて、読みに置き換えるか、飾りなら省く
  const READ = {
    '℃': 'ド', '℉': 'カシド', '°': 'ド', '%': 'パーセント', '％': 'パーセント', '‰': 'パーミル',
    '&': ' アンド ', '＆': ' アンド ', '@': ' アット ', '＠': ' アット ', '#': 'シャープ', '＃': 'シャープ',
    '§': 'セクション ', '¶': '', '†': '※', '‡': '※', '*': '※', '＊': '※',
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
    '〘': '〔', '〙': '〕', '〚': '〔', '〛': '〕', '{': '〔', '}': '〕', '｛': '〔', '｝': '〕',
    '⇒': '→', '➡': '→', '⟶': '→', '➔': '→', '➜': '→', '➤': '→', '➢': '→', '▶': '→', '►': '→', '▸': '→', '⇨': '→', '⟹': '→',
    '⇐': '←', '⬅': '←', '⟵': '←', '◀': '←', '◄': '←', '⇦': '←', '⇔': '↔', '⟷': '↔', '⟺': '↔',
    '–': '-', '—': '―', '⸺': '―', '〜': '～', '∼': '～', '゠': '＝', '‼': '!!', '⁉': '!?', '⁈': '?!',
    '\u3000': ' ', '\u00a0': ' ', '\u2002': ' ', '\u2003': ' ', '\u2009': ' '
  };
  // 箇条書きの頭の飾り（点訳では省く）
  // 箇条書きの頭の印。記号の印（○●■◆★▶など）は点字の「⠔⠔」＋マスあけにする（BSEの見本の書き方）。
  // 中点・ハイフンの印は省く
  const MARK_RE = /^[ 　]*[●○◎◆◇■□▪▫★☆✓✔✅☐☑▲△▼▽►▶▷▸➢➤❖◉◯⚫⚪](?![○△□×])[ 　]*/;
  const BULLET_RE = /^[ 　]*(?:[•◦・]|[-–—*＊][ 　])[ 　]*/;
  const MARK = '⁑'; // 行頭の印（点字では ⠔⠔）
  const WIDE_GAP = '\ue020'; // 全角スペースの区切り（点字では2マスあけ）
  const CIRCLED = [[0x2460, 0x2473, 1], [0x3251, 0x325f, 21], [0x32b1, 0x32bf, 36], [0x2776, 0x277f, 1], [0x2780, 0x2789, 1], [0x278a, 0x2793, 1], [0x24eb, 0x24f4, 11], [0x24f5, 0x24fe, 1]];
  const circledNumber = cp => { for (const [a, b, n] of CIRCLED) if (cp >= a && cp <= b) return n + cp - a; return 0; };
  const isPictograph = c => /\p{Extended_Pictographic}/u.test(c) && !READ[c] && !PUNCT[c];
  // 互換文字（㎝・㈱・Ⅳ・²など）を普通の文字にする
  const COMPAT_RE = /[\u00b2\u00b3\u00b9\u00bc-\u00be\u2070-\u209f\u2100-\u214f\u2150-\u218f\u2474-\u24ea\u3200-\u33ff\ufb00-\ufb06]/g;

  // 墨字の1行を、形態素解析の前に整える（記号の読み替え・飾りの除去）
  function prepareSumiji(line) {
    let s = MARK_RE.test(line) ? line.replace(MARK_RE, MARK + ' ') : line.replace(BULLET_RE, '');
    // 行頭の ※・＊ は星印（⠔⠔＋マスあけ）。「※1 」のような注の番号だけは注記符のまま（公式の点字データの書き方）
    if (/^[ 　]*[※＊*](?![ 　]?[0-9０-９]{1,2}(?![0-9０-９一-鿿々（(.．,，]))/.test(s)) s = s.replace(/^[ 　]*[※＊*][ 　]*/, MARK + ' ');
    // 空欄（　）・（＿＿）→ 空欄符号（全角スペースの2マスあけより先に）
    s = s.replace(/[（(][ 　_＿]*[）)]/g, '\ue062');
    // 組版の都合で入ったスペース（第 36 条・13 ページ・第一項 の）は詰める（全角スペースは区切りとして残す）
    s = s.replace(/([一-鿿々ぁ-ゖァ-ヺ]) +(?=[0-9０-９])/g, '$1').replace(/([0-9０-９]) +(?=[一-鿿々ぁ-ゖァ-ヺ])/g, '$1')
      .replace(/([一-鿿々0-9０-９）)]) +(?=[のにをがでとへはも][^ 　、。]?)/g, '$1');
    // 法令の古い書き方の大きい「つ」（あつて・もつて・支払つた）→ 促音
    s = s.replace(/([あもたな払従伴至限代係行使立持待言思守因よ図拠依沿違異去])つ(?=[てた])/g, '$1っ').replace(/附[ 　]+則/g, '附則')
      .replace(/([）)])[ 　]*抄(?=[（(]|[ 　]|$|この)/g, '$1 （抄） ') // 附則の「抄」は（ショー）
      .replace(/([0-9０-９])．(?=[0-9０-９])/g, '$1.')
      .replace(/([項条号]) +(?=中)/g, '$1');
    // 日付の漢数字は数字にする（四月一日 → 4月1日、十二月二十五日 → 12月25日）
    const kn = k => { let n = 0, cur = 0; for (const ch of k) { const d = '〇一二三四五六七八九'.indexOf(ch); if (d >= 0) cur = cur * 10 + d; else if (ch === '十') { n += (cur || 1) * 10; cur = 0; } } return n + cur; };
    s = s.replace(/(^|[^一-鿿〇]|年)([一二三四五六七八九十]{1,3})月/g, (m, a, k) => { const n = kn(k); return n >= 1 && n <= 12 ? a + n + '月' : m; })
      .replace(/月([〇一二三四五六七八九十]{1,3})日/g, (m, k) => { const n = kn(k); return n >= 1 && n <= 31 ? '月' + n + '日' : m; });
    // 語と語の間の全角スペース（「第1　趣旨」「資料1　（福）…」）は2マスあけ
    s = s.replace(/([^ 　])　+(?=[^ 　])/g, '$1' + WIDE_GAP);
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
    s = s.replace(/[=＝]/g, ' イコール ').replace(/[+＋]/g, 'プラス').replace(/÷/g, 'ワル').replace(/−/g, 'マイナス')
      .replace(/(?<=[○◯])×|×(?=[印式])/g, 'バツ').replace(/×/g, ' カケル '); // ○×・×印はバツ、語と語のあいだ（縦×横）はカケル
    for (const k in MATH) s = s.split(MATH[k]).join(k);
    // 不等号：対になっていれば山カッコ、数の比較なら読み、それ以外は矢印として扱う
    const paired = /[<＜][^<＜>＞]+[>＞]/.test(s) && !/\d[ 　]*[<＜>＞][ 　]*\d/.test(s);
    if (!paired) {
      s = s.replace(/([0-9０-９])[ 　]*[<＜][ 　]*(?=[0-9０-９])/g, '$1 ショーナリ ').replace(/([0-9０-９])[ 　]*[>＞][ 　]*(?=[0-9０-９])/g, '$1 ダイナリ ')
        .replace(/[>＞]/g, '→').replace(/[<＜]/g, '←');
    }
    // ：は小見出し符。数字のあいだ（10:30・1:2）の : だけはコロンのまま
    s = s.replace(/([0-9０-９])[:：](?=[0-9０-９])/g, '$1\ue060').replace(/:/g, '：').replace(/\ue060/g, ':');
    // ％は数のあとだけ記号（⠰⠏）。ほかは「パーセント」と読む
    s = s.replace(/([0-9０-９])[ 　]?[%％]/g, '$1\ue061').replace(/[%％]/g, 'パーセント').replace(/\ue061/g, '％');
    // 注記符：※1・※ 2 → ⠰⠼⠁⠆
    s = s.replace(/[※＊*][ 　]?(?=[0-9０-９]{1,2}(?![0-9０-９一-鿿々]))/g, '※');
    // 伏せ字：○○市・△△さん・□年□月のような、語の代わりの印。○をつける・○×式は読む
    // 伏せ字は「○○市」「△△さん」「××年」のように印が2つ以上続くときと、○年○月・○様のように数や名前の代わりになっているときだけ。
    // ×が1つのとき（縦×横、a×b）はかけ算の記号（⠡）
    s = s.replace(/[○◯△□×✕]{2,}|[○◯△□](?=[年月日時分秒市町村区県都道府さん様氏君号番回人個円歳])/g,
      m => Array.from(m).map(c => ({ '○': '\ue063○', '◯': '\ue063○', '△': '\ue063△', '□': '\ue063□', '×': '╳', '✕': '╳' })[c]).join(''));
    // 英単語の中のアポストロフィ（don't）
    s = s.replace(/([A-Za-z])[’'](?=[A-Za-z])/g, '$1\u02bc');
    s = s.replace(/([A-Za-z]) *[&＆] *(?=[A-Za-z])/g, '$1 \ue030 '); // 英語のあいだの & は英語の点字で書く
    // 残りの記号を1字ずつ読み替える。絵文字などの飾りは省く
    let out = '', prevMark = '';
    for (const c of s) {
      if (c === '\u200d' || c === '\ufe0f' || c === '\ufe0e' || (c >= '\u{1f3fb}' && c <= '\u{1f3ff}')) continue;
      if (READ[c] !== undefined && (!PUNCT[c] || (c === '○' || c === '△' || c === '□') && prevMark !== '\ue063')) { prevMark = c; out += READ[c]; continue; }
      prevMark = c;
      if (c === '\ue063') continue;
      if (isPictograph(c)) continue;
      out += c;
    }
    return out.replace(/[ 　]{2,}/g, ' ').replace(/^ | $/g, '').replace(/\ue030/g, '&').replace(/\ue062/g, '（＿）');
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
  // アクセント記号つきのラテン文字（é ü ñ ō など）。点字ではアクセント符（4の点 ⠈）を文字の前に付ける
  const ACC_RE = /[À-ÖØ-öø-ɏ]/;
  const accBase = c => { const d = c.normalize('NFD'); return /^[A-Za-z]/.test(d) && d.length > 1 ? d[0] : null; };
  const isLatin = c => /[A-Za-z]/.test(c) || (ACC_RE.test(c) && !!accBase(c));
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
  // ---------- 英語の発音記号（万国音標文字） ----------
  // 日本点字表記法 2018年版・文部科学省「点字学習指導の手引」の表による。
  // 発音記号符 ⠰ … ⠆ で囲む。英字と同じ形の記号は英字の点字（外字符は付けない）。
  // 第1ストレス符 ⠸（4 5 6の点）・第2ストレス符 ⠘（4 5の点）は、その母音の前に置く。長音符 ː は ⠒
  const IPA_OPEN = '⠰', IPA_CLOSE = '⠆', STRESS1 = '⠸', STRESS2 = '⠘';
  const IPA = {
    a: '⠁', b: '⠃', c: '⠉', d: '⠙', e: '⠑', f: '⠋', g: '⠛', h: '⠓', i: '⠊', j: '⠚', k: '⠅', l: '⠇', m: '⠍',
    n: '⠝', o: '⠕', p: '⠏', q: '⠟', r: '⠗', s: '⠎', t: '⠞', u: '⠥', v: '⠧', w: '⠺', x: '⠭', y: '⠽', z: '⠵',
    'ɑ': '⠡', 'æ': '⠩', 'ʌ': '⠬', 'ɛ': '⠜', 'ɔ': '⠣', 'ə': '⠢', 'ɪ': '⠌', 'ᴜ': '⠷', 'ʊ': '⠷',
    'ŋ': '⠫', 'θ': '⠹', 'ð': '⠻', 'ʃ': '⠱', 'ʒ': '⠮', 'ː': '⠒', ':': '⠒',
    // 表にない記号は、近い記号で書く（辞書によって書き方が違うもの）
    'ɡ': '⠛', 'ɒ': '⠡', 'ɜ': '⠢', 'ɚ': '⠢⠗', 'ɝ': '⠢⠗', 'ɐ': '⠬', 'ɹ': '⠗', 'ɫ': '⠇', 'ʤ': '⠙⠮', 'ʧ': '⠞⠱', 'ʍ': '⠓⠺',
    '(': '⠶', ')': '⠶', '-': '⠤', ' ': '⠀'
  };
  const IPA_VOWEL = /[aeiouyɑæʌɛɔəɪʊᴜɒɜɚɝɐ]/;
  const IPA_MARK = /[ɑæʌɛɔəɪʊᴜŋθðʃʒˈˌːɒɜɚɝɹɡʤʧʍɐ\u0300\u0301áéíóúàèìòùǽ]/;
  function ipaToBraille(text) {
    const chars = Array.from(text.normalize('NFD'));
    let out = IPA_OPEN, pending = '';
    const unknown = [];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i].toLowerCase();
      if (c === 'ˈ' || c === "'") { pending = STRESS1; continue; } // 音節の頭のストレス記号は、次の母音の前に移す
      if (c === 'ˌ') { pending = STRESS2; continue; }
      if (/[\u0300-\u036f.ˑ]/.test(c)) continue; // アクセント記号は母音の前に出したので飛ばす。音節の区切りの点も書かない
      // 母音の上のアクセント記号（í ＝ 第1、æ̀ ＝ 第2）
      let mark = '';
      for (let k = i + 1; k < chars.length && /[\u0300-\u036f]/.test(chars[k]); k++) {
        if (chars[k] === '\u0301') mark = STRESS1;
        if (chars[k] === '\u0300') mark = STRESS2;
      }
      if (IPA[c] === undefined) { unknown.push(chars[i]); out += SIGN.UNKNOWN; continue; }
      if (IPA_VOWEL.test(c) && (mark || pending)) { out += mark || pending; pending = ''; }
      out += IPA[c];
    }
    return { cells: out.replace(/⠀+$/, '') + IPA_CLOSE, unknown };
  }
  // 墨字の [ ] や / / の中の発音記号を見つける（英字だけの [ ] は発音記号とみなさない）
  const IPA_RE = /\[([^\[\]\n]{1,80})\]|［([^［］\n]{1,80})］|\/([^\/\n]{1,80})\/|／([^／\n]{1,80})／/g;
  const isIpaText = t => IPA_MARK.test(t.normalize('NFC')) && /^[a-zA-Zɑæʌɛɔəɪʊᴜŋθðʃʒˈˌːɒɜɚɝɹɡʤʧʍɐɫ\u0300-\u036f\u00c0-\u024f().ˑ' :-]+$/.test(t.normalize('NFC'));

  // ---------- 英語の語句（2語以上）：外国語引用符 ⠦ … ⠴ で囲み、中は英語の点字で書く ----------
  // 1語だけのときは、今までどおり外字符 ⠰ を前に付ける
  const EN_LETTER = { a: '⠁', b: '⠃', c: '⠉', d: '⠙', e: '⠑', f: '⠋', g: '⠛', h: '⠓', i: '⠊', j: '⠚', k: '⠅', l: '⠇', m: '⠍', n: '⠝', o: '⠕', p: '⠏', q: '⠟', r: '⠗', s: '⠎', t: '⠞', u: '⠥', v: '⠧', w: '⠺', x: '⠭', y: '⠽', z: '⠵' };
  const EN_DIGIT = { 1: '⠁', 2: '⠃', 3: '⠉', 4: '⠙', 5: '⠑', 6: '⠋', 7: '⠛', 8: '⠓', 9: '⠊', 0: '⠚' };
  const EN_PUNCT = { ',': '⠂', '.': '⠲', '?': '⠦', '!': '⠖', "'": '⠄', '’': '⠄', '\u02bc': '⠄', '-': '⠤', ':': '⠒', ';': '⠆', '&': '⠈⠯' };
  const LAT = 'A-Za-zÀ-ÖØ-öø-ɏ';
  const EN_PHRASE_RE = new RegExp(`[${LAT}][${LAT}0-9'’\u02bc.\\-]*(?:,? +(?:&|[${LAT}0-9][${LAT}0-9'’\u02bc.\\-]*))+[.?!]?`, 'g');
  function englishBraille(text) {
    let out = '';
    for (const word of text.split(/ +/)) {
      if (out) out += '⠀';
      const letters = word.normalize('NFD').replace(/[^A-Za-z]/g, '');
      const allCaps = letters.length >= 2 && letters === letters.toUpperCase();
      if (allCaps) out += '⠠⠠';
      let num = false;
      for (const ch of word) {
        if (/[0-9]/.test(ch)) { if (!num) out += '⠼'; num = true; out += EN_DIGIT[ch]; continue; }
        const base = /[A-Za-z]/.test(ch) ? ch : (ACC_RE.test(ch) ? accBase(ch) : null);
        if (base) {
          if (num && /[a-jA-J]/.test(base)) out += '⠰'; // 数字のすぐ後の a〜j は、数字と区別する印
          num = false;
          if (!allCaps && ch !== ch.toLowerCase()) out += '⠠';
          out += (base !== ch ? '⠈' : '') + EN_LETTER[base.toLowerCase()];
          continue;
        }
        if (num && ch === '.' ) { out += '⠲'; continue; }
        num = false;
        out += EN_PUNCT[ch] || '';
      }
    }
    return out;
  }

  // 英語の点字（外国語引用符の中）→ 英文
  function englishFromBraille(cells) {
    const L = {}, P = {}, D = {};
    for (const k in EN_LETTER) L[EN_LETTER[k]] = k;
    for (const k in EN_DIGIT) D[EN_DIGIT[k]] = k;
    for (const k of [',', '.', '?', '!', "'", '-', ':', ';']) P[EN_PUNCT[k]] = k;
    let out = '', capAll = false, capNext = false, num = false;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c === '⠀') { out += ' '; capAll = false; num = false; continue; }
      if (c === '⠠' && cells[i + 1] === '⠠') { capAll = true; i++; continue; }
      if (c === '⠠') { capNext = true; continue; }
      if (c === '⠼') { num = true; continue; }
      if (c === '⠈' && cells[i + 1] === '⠯') { out += '&'; i++; continue; }
      if (c === '⠰') { num = false; continue; }
      if (num && D[c]) { out += D[c]; continue; }
      if (L[c]) { out += (capAll || capNext) ? L[c].toUpperCase() : L[c]; capNext = false; num = false; continue; }
      if (P[c]) { out += P[c]; continue; }
      out += '〓';
    }
    return out;
  }

  // ---------- 数式（数学点字）：文部科学省「点字学習指導の手引」（令和5年）の書き方 ----------
  // ・数式は前後を続けて書く（記号の前後をあけない）。数字で始まらない式の頭には数式指示符 ⠰
  // ・＋ ⠢、－ ⠔、× ⠡、÷ ⠌⠌、＝ ⠒⠒、＜ ⠔⠔、＞ ⠢⠢、小カッコ ⠦ … ⠴、小数点 ⠂
  // ・文字（x, a など）は外字符なしで書き、数字のすぐ後の a〜j の前だけ ⠰。大文字は ⠠
  // ・分数は ⠷ 分子 ⠌ 分母 ⠾（帯分数は整数のすぐ後に続ける）、根号 √ は ⠜（中が2つ以上の要素ならカッコで囲む）
  // ・2乗 ⠣、3乗 ⠩、ほかの累乗は ⠘＋要素、右下の1桁の添え字は ⠠＋下がり数字、それ以外の添え字は ⠰＋要素
  const VULGAR = { '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4], '⅕': [1, 5], '⅖': [2, 5], '⅗': [3, 5], '⅘': [4, 5],
    '⅙': [1, 6], '⅚': [5, 6], '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8] };
  const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
  const LOW_DIGIT = { '1': '⠂', '2': '⠆', '3': '⠒', '4': '⠲', '5': '⠢', '6': '⠖', '7': '⠶', '8': '⠦', '9': '⠔', '0': '⠴' };
  const MATH_OP = { '+': '⠢', '＋': '⠢', '-': '⠔', '−': '⠔', '–': '⠔', '－': '⠔', '×': '⠡', '÷': '⠌⠌', '=': '⠒⠒', '＝': '⠒⠒',
    '<': '⠔⠔', '＜': '⠔⠔', '>': '⠢⠢', '＞': '⠢⠢',
    // ± は「＋の下に－」の1つの記号（文部科学省 中学部点字教科書編集資料）なので ⠢⠔。
    // ≦ ≧ は「＜・＞の下に＝」の形として ⠔⠔⠒⠒・⠢⠢⠒⠒ で書き、校正の一覧に出す
    '±': '⠢⠔', '∓': '⠔⠢', '≦': '⠔⠔⠒⠒', '≤': '⠔⠔⠒⠒', '≧': '⠢⠢⠒⠒', '≥': '⠢⠢⠒⠒' };
  // ---------- 化学式：化学式の指示符 ⠰⠠ から書き、元素記号に大文字符を付けず、右下の数は下がり数字、カッコは ⠣ ⠜（点字学習指導の手引 理科） ----------
  const ELEMENTS = new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pt Au Hg Pb Bi Rn Ra U Pu'.split(' '));
  const CHEM_RE = /(?<![A-Za-z0-9])([0-9]*)((?:\(?(?:[A-Z][a-z]?[0-9₀-₉]*)+\)?[0-9₀-₉]*)+)(?![A-Za-z0-9])/g;
  const isChem = body => {
    const els = body.match(/[A-Z][a-z]?/g) || [];
    if (!els.length || !els.every(e => ELEMENTS.has(e))) return false;
    return /[₀-₉]/.test(body) || (els.length >= 2 && /[A-Za-z)][0-9]/.test(body)); // H₂O・CO2・H2SO4（A4・B5 は化学式にしない）
  };
  function chemBraille(raw) {
    // 反応式：＋と→は前後を1マスあける。式の頭は ⠰⠠、係数があれば ⠼2⠠、2つめからの化学式は係数がなければそのまま（⠕⠆）
    const parts = String(raw).split(/[ 　]*([+＋]|→|⟶|=)[ 　]*/);
    if (parts.length > 1) return parts.map((p, k) => k % 2 ? (p === '→' || p === '⟶' ? '⠀⠒⠕⠀' : p === '=' ? '⠀⠒⠒⠀' : '⠀⠢⠀') : chemBraille1(p, k === 0)).join('');
    return chemBraille1(raw, true);
  }
  function chemBraille1(raw, first) {
    const m = /^([0-9]*)(.*)$/.exec(raw);
    let out = m[1] ? numCells(m[1]) + SIGN.CAP : first ? SIGN.FOREIGN + SIGN.CAP : ''; // 係数のあとは ⠠ から（2H₂O → ⠼⠃⠠⠓⠆⠕）
    for (const ch of m[2]) {
      if (/[A-Za-z]/.test(ch)) out += LETTER[ch.toLowerCase()];
      else if (SUB[ch] !== undefined) out += LOW_DIGIT[SUB[ch]];
      else if (isDigit(ch)) out += LOW_DIGIT[ch];
      else if (ch === '(') out += '⠣';
      else if (ch === ')') out += '⠜';
    }
    return out;
  }
  const numCells = n => SIGN.NUM + Array.from(String(n)).map(d => d === '.' ? '⠂' : DIGIT[d]).join('');
  function mathBraille(raw) {
    if (String(raw).startsWith('\ue0f0')) return chemBraille(String(raw).slice(1));
    const s = Array.from(String(raw).replace(/[ 　]/g, '').replace(/（/g, '(').replace(/）/g, ')').replace(/⁄/g, '/'));
    let i = 0, last = '';
    const vul = c => '⠷' + numCells(VULGAR[c][0]) + '⠌' + numCells(VULGAR[c][1]) + '⠾';
    function post(e) { // 累乗・添え字
      for (;;) {
        const c = s[i];
        if (c === '²') { e += '⠣'; i++; continue; }
        if (c === '³') { e += '⠩'; i++; continue; }
        if (SUP[c]) { let d = ''; while (SUP[s[i]]) d += SUP[s[i++]]; e += '⠘' + numCells(d); continue; }
        if (SUB[c]) { let d = ''; while (SUB[s[i]]) d += SUB[s[i++]]; e += d.length === 1 ? SIGN.CAP + LOW_DIGIT[d] : SIGN.FOREIGN + numCells(d); continue; }
        if (c === '^') {
          i++;
          if ((s[i] === '2' || s[i] === '3') && !isDigit(s[i + 1] || '') && s[i + 1] !== '.') { e += s[i] === '2' ? '⠣' : '⠩'; i++; continue; }
          last = ''; e += '⠘' + (element() || ''); last = 'let'; continue;
        }
        if (c === '_') { i++; last = ''; e += SIGN.FOREIGN + (element() || ''); last = 'let'; continue; }
        return e;
      }
    }
    function element() {
      const c = s[i];
      if (c === undefined) return null;
      if (isDigit(c)) {
        let d = '';
        while (i < s.length && (isDigit(s[i]) || (s[i] === '.' && isDigit(s[i + 1] || '')))) d += s[i++];
        let e = numCells(d);
        if (VULGAR[s[i]]) e += vul(s[i++]); // 帯分数 3½
        last = 'num'; return post(e);
      }
      if (VULGAR[c]) { i++; last = 'num'; return post(vul(c)); }
      if (/[A-Za-z]/.test(c)) {
        i++; const lc = c.toLowerCase();
        const e = (last === 'num' && 'abcdefghij'.includes(lc) ? SIGN.FOREIGN : '') + (c !== lc ? SIGN.CAP : '') + LETTER[lc];
        last = 'let'; return post(e);
      }
      if (c === '(') { i++; last = ''; const inner = expr(')'); if (s[i] === ')') i++; last = 'let'; return post('⠦' + inner + '⠴'); }
      if (c === '√') { i++; last = ''; const e = element(); last = 'let'; return '⠜' + (e || ''); }
      return null;
    }
    function expr(end) {
      const parts = [];
      while (i < s.length && s[i] !== end) {
        const c = s[i];
        if (c === '/' && parts.length && parts[parts.length - 1].el !== undefined) { // 分数：直前の要素／直後の要素
          i++; last = '';
          const den = element() || '';
          const unwrap = x => /^⠦/.test(x) && /⠴$/.test(x) && x.indexOf('⠴') === x.length - 1 ? x.slice(1, -1) : x; // (a+b)/2 の外側のカッコは分数囲みが代わる
          const num = parts.pop().el;
          parts.push({ el: post('⠷' + unwrap(num) + '⠌' + unwrap(den) + '⠾') }); last = 'let'; continue;
        }
        if (MATH_OP[c]) { parts.push({ op: MATH_OP[c] }); i++; last = 'op'; continue; }
        const e = element();
        if (e === null) { parts.push({ op: SIGN.UNKNOWN }); i++; continue; }
        parts.push({ el: e });
      }
      return parts.map(p => p.el !== undefined ? p.el : p.op).join('');
    }
    const body = expr();
    return (body.startsWith(SIGN.NUM) ? '' : SIGN.FOREIGN) + body; // 数字で始まらない式は数式指示符から
  }
  // 文の中の数式・単位（m² など）を探す。戻り値 [{ start, end, raw, unit }]
  const UNIT_POW_RE = /(?<![A-Za-z])(km|cm|mm|dm|m)([²³])/g;
  const COMPAT_UNIT = { '㎡': 'm²', '㎥': 'm³', '㎠': 'cm²', '㎤': 'cm³', '㎢': 'km²', '㎦': 'km³', '㎟': 'mm²', '㎣': 'mm³' };
  const FORMULA_RUN_RE = /[0-9A-Za-z.+\-−–×÷=＝<>＜＞()（）\/⁄^_√²³¹⁰⁴-⁹₀-₉½⅓⅔¼¾⅕-⅞ ＋－±∓≦≤≧≥]+/g;
  function findMath(text) {
    const spans = [];
    let m;
    UNIT_POW_RE.lastIndex = 0;
    while ((m = UNIT_POW_RE.exec(text))) spans.push({ start: m.index, end: m.index + m[0].length, raw: m[0], unit: true });
    CHEM_RE.lastIndex = 0;
    const chem = [];
    while ((m = CHEM_RE.exec(text))) if (isChem(m[2])) chem.push({ start: m.index, end: m.index + m[0].length });
    // 化学反応式（2H₂ + O₂ → 2H₂O）は1つにまとめる
    for (let k = 0; k < chem.length; k++) {
      let a = chem[k];
      while (k + 1 < chem.length && /^[ 　]*(?:[+＋]|→|⟶|=)[ 　]*$/.test(text.slice(a.end, chem[k + 1].start))) { a = { start: a.start, end: chem[k + 1].end }; k++; }
      spans.push({ start: a.start, end: a.end, raw: '\ue0f0' + text.slice(a.start, a.end), chem: true });
    }
    FORMULA_RUN_RE.lastIndex = 0;
    while ((m = FORMULA_RUN_RE.exec(text))) {
      const lead = m[0].length - m[0].trimStart().length;
      const t = m[0].trim();
      if (!t) continue;
      const start = m.index + lead, end = start + t.length;
      if (spans.some(sp => sp.start < end && start < sp.end)) continue;
      // 数式のしるし：根号・累乗・添え字・分数の文字・÷、または「数か文字 演算記号 数か文字」（- だけの 2026-11-08・03-1234 は数式にしない）
      const strong = /[√^²³¹⁰⁴-⁹₀-₉½⅓⅔¼¾⅕-⅞÷]/.test(t);
      const binary = /[0-9A-Za-z)²³½⅓⅔¼¾][+×=＝<>＜＞÷＋－±∓≦≤≧≥][-−－]?[0-9A-Za-z(√½⅓⅔¼¾]/.test(t.replace(/[ 　]/g, '').replace(/（/g, '(').replace(/）/g, ')'));
      if (!strong && !binary) continue;
      if (/[A-Za-z]{3,}/.test(t)) continue; // 英単語の入った語句は数式にしない
      if (/^\+\d/.test(t)) continue; // 国際電話番号
      if (!/[0-9A-Za-z½⅓⅔¼¾]/.test(t)) continue;
      spans.push({ start, end, raw: t });
    }
    return spans.sort((a, b) => a.start - b.start);
  }

  // ---------- URL・メールアドレス：アドレス囲み符号 ⠠⠦ … ⠠⠴ の中を情報処理用点字で書く ----------
  // 英字は外字符なし、数字は数符から。数字のあとの a〜j は ⠰ で英字に戻す。続きの行は ⠈ から書く
  const INFO_SYM = { ':': '⠐⠂', '/': '⠌', '.': '⠲', '-': '⠤', '_': '⠐⠤', '@': '⠪', '?': '⠐⠦', '=': '⠒⠒', '#': '⠩', '&': '⠯',
    '+': '⠬', '%': '⠻', '~': '⠔', ',': '⠂', '!': '⠖', '*': '⠡', "'": '⠄', '(': '⠶', ')': '⠶' };
  const REV_INFO = {}; for (const k in INFO_SYM) if (!REV_INFO[INFO_SYM[k]]) REV_INFO[INFO_SYM[k]] = k;
  const URL_RE = /(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+|[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+/g;
  // 1文字ずつの点字（折り返しのため）
  function infoUnits(str) {
    const units = []; let num = false;
    for (const ch of str) {
      let c = '';
      if (isDigit(ch)) { if (!num) c += SIGN.NUM; num = true; c += DIGIT[ch]; }
      else if (/[A-Za-z]/.test(ch)) {
        const lc = ch.toLowerCase();
        if (num && 'abcdefghij'.includes(lc)) c += SIGN.FOREIGN;
        num = false;
        c += (ch !== lc ? SIGN.CAP : '') + LETTER[lc];
      } else { c += INFO_SYM[ch] || SIGN.UNKNOWN; if (ch !== '.' && ch !== ',') num = false; }
      units.push({ text: ch, cells: c });
    }
    return units;
  }
  // s[i] から読み、⠠⠴（または ⠴）で閉じる。戻り値 [文字列, 次の位置, 閉じたか]
  function infoFromBraille(s, i) {
    let out = '', num = false, cap = false;
    for (; i < s.length; i++) {
      const c = s[i], n1 = s[i + 1];
      if (c === '⠴') return [out, i + 1, true];
      if (c === '⠠' && n1 === '⠴') return [out, i + 2, true];
      if (c === '⠀') return [out, i, false];
      if (c === '⠼') { num = true; continue; }
      if (c === '⠰') { num = false; continue; }
      if (c === '⠠') { cap = true; continue; }
      if (num && REV_DIGIT[c] !== undefined) { out += REV_DIGIT[c]; continue; }
      const two = c + (n1 || '');
      if (REV_INFO[two] && two.length === 2 && (c === '⠐' || c === '⠒')) { out += REV_INFO[two]; i++; if (REV_INFO[two] !== '.') num = false; continue; }
      if (REV_LETTER[c]) { out += cap ? REV_LETTER[c].toUpperCase() : REV_LETTER[c]; cap = false; num = false; continue; }
      if (REV_INFO[c]) { out += REV_INFO[c]; if (c !== '⠲' && c !== '⠂') num = false; continue; }
      out += '〓';
    }
    return [out, i, false];
  }

  function kanaToBraille(line) {
    // かなを手で直すときに [ ] や / / で発音記号を書いても、発音記号の点字にする
    // （すでに ⟪ ⟫・⟬ ⟭・⟦ ⟧ で囲んだところはそのまま）
    // かなを直接直したときも、数式（y=2x+1）は数学点字にする
    const wrapMath = t => { const sp = findMath(t); let o = '', p0 = 0; for (const x of sp) { o += t.slice(p0, x.start) + '⟮' + x.raw + '⟯'; p0 = x.end; } return o + t.slice(p0); };
    line = String(line || '').split(/(⟪[^⟫]*⟫|⟬[^⟭]*⟭?|⟦[^⟧]*⟧|⟮[^⟯]*⟯)/).map((part, k) => k % 2 ? part : (/https?:|www\.|@/.test(part) ? part : wrapMath(part))
      .replace(URL_RE, m => { const t = /[.,;:!?)\]]+$/.exec(m); const tail = t ? t[0] : ''; return '⟬' + m.slice(0, m.length - tail.length) + '⟭' + tail; }) // アドレス（手で書いたときも）
      .replace(IPA_RE, (m, a, b, c, d) => { const t = a || b || c || d; return isIpaText(t) ? '⟦' + t + '⟧' : m; })
      // 外国語引用符にするのは、2文字以上の英語の語が2つ以上ある語句だけ（A B C・FAX 261 は1語ずつ外字符）
      .replace(EN_PHRASE_RE, m => m.split(/ +/).filter(w => (w.match(/[A-Za-zÀ-ÖØ-öø-ɏ]/g) || []).length >= 2).length >= 2 ? '⟪' + m + '⟫' : m)).join('');
    const s = Array.from(normalizeInput(toKatakana(line)));
    let out = '';
    const unknown = [];
    const bad = []; // 変換できなかった文字の、点字列での位置
    let inNum = false, inLatin = false, latinCapAll = false, latinCapEnd = -1;
    const parens = []; // 開いている丸カッコ（true＝カッコの中のカッコ）
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
      if (c === '⟪') { // 英語の語句（⟪ ⟫ の中）
        let j = i + 1;
        while (j < s.length && s[j] !== '⟫') j++;
        out += '⠦' + englishBraille(s.slice(i + 1, j).join('')) + '⠴';
        inNum = false; inLatin = false;
        i = j;
        continue;
      }
      if (c === '⟮') { // 数式（⟮ ⟯ の中）
        let j = i + 1;
        while (j < s.length && s[j] !== '⟯') j++;
        const cells = mathBraille(s.slice(i + 1, j).join(''));
        units.push({ text: s.slice(i, j + 1).join(''), cells });
        out += cells;
        inNum = false; inLatin = false;
        i = j; ui = j + 1; uo = out.length;
        continue;
      }
      if (c === '⟬') { // URL・メールアドレス（⟬ ⟭ の中）
        let j = i + 1;
        while (j < s.length && s[j] !== '⟭') j++;
        const cont = s[i + 1] === '↪'; // 前の行から続くアドレス（行頭に ⠈）
        units.push({ text: cont ? '⟬↪' : '⟬', cells: cont ? '⠈' : '⠠⠦' });
        out += cont ? '⠈' : '⠠⠦';
        for (const u of infoUnits(s.slice(i + (cont ? 2 : 1), j).join(''))) { units.push({ text: u.text, cells: u.cells, url: true }); out += u.cells; }
        if (s[j] === '⟭') { units.push({ text: '⟭', cells: '⠠⠴' }); out += '⠠⠴'; }
        inNum = false; inLatin = false;
        i = j; ui = j + 1; uo = out.length;
        continue;
      }
      if (c === '⟦') { // 発音記号（⟦ ⟧ の中）
        let j = i + 1;
        while (j < s.length && s[j] !== '⟧') j++;
        const r = ipaToBraille(s.slice(i + 1, j).join(''));
        if (r.unknown.length) { unknown.push(i); bad.push(Array.from(out).length); }
        out += r.cells;
        inNum = false; inLatin = false;
        i = j;
        continue;
      }
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
          // 頭の大文字の続き＋小文字（SDGs）：⠰⠠⠠ SDG ⠰ s
          const pm = /^([A-Z]{2,})([a-z]+)$/.exec(run);
          latinCapEnd = pm ? i + pm[1].length : -1;
          if (pm) latinCapAll = true;
          out += SIGN.FOREIGN + (latinCapAll ? SIGN.CAP + SIGN.CAP : '');
        }
        if (i === latinCapEnd) { out += SIGN.FOREIGN; latinCapAll = false; }
        inLatin = true; inNum = false;
        const upper = c !== c.toLowerCase();
        const base = /[A-Za-z]/.test(c) ? c : accBase(c);
        out += (upper && !latinCapAll ? SIGN.CAP : '') + (base !== c ? '⠈' : '') + LETTER[base.toLowerCase()];
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
      // 点線：「……」は ⠂⠂⠂。目次などの長い点線（3字以上）は長さをそのまま残す
      if (c === '…' || c === '‥') {
        let k = 1;
        while (s[i + 1] === '…' || s[i + 1] === '‥') { i++; k++; }
        out += k >= 3 ? '⠂'.repeat(k) : '⠂⠂⠂'; continue;
      }
      if (c === '―' || c === '─' || c === '—') {
        while (s[i + 1] === '―' || s[i + 1] === '─' || s[i + 1] === '—') i++;
        out += '⠒⠒'; continue;
      }
      if (c === '━') { out += '⠒'; continue; } // 線（点字を読み込んだときの長い棒線・枠線）
      // 注記符：※1 → ⠰⠼⠁⠆
      if (c === '※' && next && isDigit(next)) { // 注の番号は1〜2桁（※2018 は注記符にしない）
        let j = i + 1, d = '';
        while (j < s.length && isDigit(s[j])) d += DIGIT[s[j++]];
        if (d.length <= 2) { out += '⠰⠼' + d + '⠆'; i = j - 1; continue; }
      }
      // 空欄符号：（ ）
      if (c === '（' || c === '(') {
        let j = i + 1;
        while (j < s.length && (s[j] === '＿' || s[j] === '_')) j++;
        if (s[j] === '）' || s[j] === ')') { out += '⠸⠭⠭⠇'; i = j; continue; }
      }
      if (c === '～' || c === '〜' || c === '~') { out += '⠤⠤'; continue; }
      if (c === '"') { out += '⠰⠄'; continue; }
      // 丸カッコ：カッコの中のカッコは第2の形（⠰⠶ … ⠶⠆）にする
      if (c === '（' || c === '(') { out += parens.length ? '⠰⠶' : '⠶'; parens.push(parens.length > 0); inNum = false; inLatin = false; continue; }
      if (c === '）' || c === ')') { out += parens.pop() ? '⠶⠆' : '⠶'; inNum = false; inLatin = false; continue; }
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

  // 数学点字の語を墨字の式に戻す（w は1語の点字の配列）
  const REV_LOW = {}; for (const k in LOW_DIGIT) REV_LOW[LOW_DIGIT[k]] = k;
  const SUB_OF = d => String.fromCharCode(0x2080 + +d);
  const SUP_OF = d => ({ '1': '¹', '2': '²', '3': '³' })[d] || String.fromCharCode(0x2070 + +d);
  const VULGAR_OF = {}; for (const k in VULGAR) VULGAR_OF[VULGAR[k].join('/')] = k;
  function mathFromBraille(w) {
    let i = w[0] === '⠰' ? 1 : 0;
    function element(numMode) {
      const c = w[i];
      if (c === '⠼') {
        i++; let d = '';
        for (;;) {
          if (REV_DIGIT[w[i]] !== undefined) d += REV_DIGIT[w[i++]];
          else if (w[i] === '⠂' && REV_DIGIT[w[i + 1]] !== undefined) { d += '.'; i++; }
          else break;
        }
        return d;
      }
      if (c === '⠦') { i++; const t = seq('⠴'); if (w[i] === '⠴') i++; return '(' + t + ')'; }
      if (c === '⠷') { // 分数
        i++; const a = seq('⠌'); if (w[i] === '⠌') i++; const b = seq('⠾'); if (w[i] === '⠾') i++;
        if (VULGAR_OF[a + '/' + b]) return VULGAR_OF[a + '/' + b];
        const g = x => /^[0-9A-Za-z.]+$/.test(x) ? x : '(' + x + ')';
        return g(a) + '/' + g(b);
      }
      if (c === '⠜') { i++; return '√' + (element() || ''); }
      if (c === '⠰' && REV_LETTER[w[i + 1]]) { i++; return element(); } // 数字のあとの a〜j
      if (c === '⠠' && REV_LETTER[w[i + 1]]) { i += 2; return REV_LETTER[w[i - 1]].toUpperCase(); }
      if (REV_LETTER[c]) { i++; return REV_LETTER[c]; }
      return null;
    }
    function post(e) {
      for (;;) {
        const c = w[i];
        if (c === '⠣') { e += '²'; i++; continue; }
        if (c === '⠩') { e += '³'; i++; continue; }
        if (c === '⠘') { i++; const x = element() || ''; e += /^[0-9]+$/.test(x) ? Array.from(x).map(SUP_OF).join('') : '^' + (x.length > 1 && !/^\(/.test(x) ? '(' + x + ')' : x); continue; }
        if (c === '⠠' && REV_LOW[w[i + 1]] !== undefined) { e += SUB_OF(REV_LOW[w[i + 1]]); i += 2; continue; }
        if (c === '⠰' && w[i + 1] === '⠼') { i++; const x = element() || ''; e += Array.from(x).map(SUB_OF).join(''); continue; }
        return e;
      }
    }
    const OPS = [['⠔⠔⠒⠒', '≦'], ['⠢⠢⠒⠒', '≧'], ['⠒⠒', '='], ['⠌⠌', '÷'], ['⠔⠔', '<'], ['⠢⠢', '>'], ['⠢⠔', '±'], ['⠔⠢', '∓'], ['⠢', '+'], ['⠔', '-'], ['⠡', '×']];
    function seq(end) {
      let out = '';
      while (i < w.length && w[i] !== end) {
        const op = OPS.find(([b]) => w.slice(i, i + b.length).join('') === b);
        if (op && out) { out += op[1]; i += op[0].length; continue; }
        if (op && !out && op[1] === '-') { out += '-'; i++; continue; }
        const e = element();
        if (e === null) { out += '〓'; i++; continue; }
        out += post(e);
      }
      return out;
    }
    return seq();
  }
  // 化学式・化学反応式を読む。s[i] が ⠰⠠。戻り値 [文字列, 次の位置] か null
  const CHEM_PREFER2 = new Set(['Si', 'Sn', 'Hg', 'Hf', 'Nb', 'Bi']); // 2文字の元素として読むもの（S と I などより多い）
  const REV_LOW_CHEM = { '⠂': '1', '⠆': '2', '⠒': '3', '⠲': '4', '⠢': '5', '⠖': '6', '⠶': '7', '⠦': '8', '⠔': '9', '⠴': '0' };
  function chemFromBraille(s, i0) {
    let i = i0 + 2, out = '\ue0f0', seenLow = false;
    if (s[i0] === '⠼') { // 係数から始まる（2H₂ + O₂ → 2H₂O）
      i = i0 + 1; let d = '';
      while (REV_DIGIT[s[i]] !== undefined) d += REV_DIGIT[s[i++]];
      if (!d || s[i] !== '⠠' || !REV_LETTER[s[i + 1]]) return null;
      out += d; i++;
    }
    const compound = () => {
      let t = '', any = false;
      while (i < s.length) {
        const c = s[i];
        if (REV_LETTER[c]) { // 元素記号：2文字の元素が成り立てば2文字目は小文字
          const a = REV_LETTER[c].toUpperCase(), b = REV_LETTER[s[i + 1]];
          // 点字では大文字・小文字の区別がないので、CO（C と O）と Co のように両方ありうるものは1文字ずつに読む
          if (b && ELEMENTS.has(a + b) && !(ELEMENTS.has(a) && ELEMENTS.has(b.toUpperCase()) && !CHEM_PREFER2.has(a + b))) { t += a + b; i += 2; }
          else { t += a; i++; }
          any = true; continue;
        }
        if (REV_LOW_CHEM[c] !== undefined && any) { t += SUB_OF(REV_LOW_CHEM[c]); i++; seenLow = true; continue; }
        if (c === '⠣') { t += '('; i++; continue; }
        if (c === '⠜') { t += ')'; i++; continue; }
        break;
      }
      return any ? t : null;
    };
    const first = compound();
    if (!first) return null;
    out += first;
    for (;;) { // ＋ → の続き
      let sym = null;
      if (s.slice(i, i + 3).join('') === '⠀⠢⠀') sym = ' + ';
      else if (s.slice(i, i + 4).join('') === '⠀⠒⠕⠀') sym = ' → ';
      if (!sym) break;
      const save = i; i += sym === ' + ' ? 3 : 4;
      let coef = '';
      if (s[i] === '⠼') { i++; while (REV_DIGIT[s[i]] !== undefined) coef += REV_DIGIT[s[i++]]; if (s[i] === '⠠') i++; }
      const c2 = compound();
      if (!c2) { i = save; break; }
      out += sym + coef + c2;
    }
    if (!seenLow) return null;
    if (i < s.length && !/[⠀⠲⠰⠴⠤]/.test(s[i])) return null; // 化学式のあとは区切りか句読点（V=RI の ⠒⠒ を下がり数字と読まない）
    return [out, i];
  }
  // 数式の語か（演算記号・分数・根号が、数や文字のあいだに使われている）
  function isMathWord(w) {
    const t = w.join('');
    if (!/^[⠰⠼]/.test(t)) return false;
    if (/(⠒⠒|⠌⠌|⠔⠔|⠢⠢|[⠢⠔⠡])[⠼⠦⠷⠜]/.test(t) || /⠷[^⠀]*⠌[^⠀]*⠾/.test(t) || /^⠰[⠜⠷⠦]/.test(t)) return true;
    // ⠰ で始まる語で、英字のすぐ後に演算記号・累乗・添え字がある（一般の外字の語にはない形）
    if (/^⠰⠠{0,2}[⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵]/.test(t)) {
      const L = '[⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵]';
      return new RegExp(L + '(⠒⠒|⠌⠌|[⠢⠔⠡⠘⠣⠩]|⠠[⠂⠆⠒⠲⠢⠖⠶⠦⠔⠴])').test(t);
    }
    return false;
  }

  // st：行をまたぐ状態（アドレス囲みの続きの行など）。同じオブジェクトを続けて渡す
  function brailleToKana(cellsLine, st) {
    const s = Array.from(cellsLine.replace(/ /g, '⠀'));
    let out = '';
    st = st || {};
    let i0 = 0;
    if (st.url) { // 前の行から続くアドレス（行頭の ⠈ は続きの印）
      st.url = false;
      if (s[0] === '⠈') {
        const [t, j, closed] = infoFromBraille(s, 1);
        out += '⟬↪' + t + (closed ? '⟭' : '');
        if (!closed && j >= s.length) st.url = true;
        i0 = j;
      }
    }
    let kagi = false, kakko = false, ins = false, inner = 0, shiji = 0;
    const innerTop = [];
    const atStart = j => j === 0 || s[j - 1] === '⠀';
    const blank = j => j >= s.length || s[j] === '⠀';
    const closer = j => j >= s.length || s[j] === '⠀' || s[j] === '⠤' || s[j] === '⠶';
    for (let i = i0; i < s.length; i++) {
      const c = s[i], n1 = s[i + 1];
      if (c === '⠀') { out += ' '; continue; }
      if (c < '⠀' || c > '⣿') { out += c; continue; }
      if (c === '⠰') { // 単位の2乗・3乗（10m²、100cm³）
        const um = /^⠰([⠅⠉⠍⠙]?⠍)([⠣⠩])(?=$|[⠀⠰⠲⠶⠴⠤])/.exec(s.slice(i, i + 5).join(''));
        if (um) { out += '⟮' + Array.from(um[1]).map(x => REV_LETTER[x]).join('') + (um[2] === '⠣' ? '²' : '³') + '⟯'; i += Array.from(um[0]).length - 1; continue; }
      }
      if (((c === '⠰' && n1 === '⠠') || (c === '⠼' && /^⠼[⠁-⠚]+⠠[⠁-⠵]/.test(s.slice(i, i + 8).join('')))) && atStart(i)) { // 化学式（⠰⠠ か 係数⠠ から。右下の数は下がり数字）
        const r = chemFromBraille(s, i);
        if (r) { out += '⟮' + r[0] + '⟯'; i = r[1] - 1; continue; }
      }
      if ((c === '⠰' || c === '⠼') && atStart(i)) { // 数式（1語まるごと）
        let j = i; while (j < s.length && s[j] !== '⠀') j++;
        let w = s.slice(i, j), tail = '';
        if (w.length > 1 && (w[w.length - 1] === '⠰' || w[w.length - 1] === '⠲')) { tail = w[w.length - 1] === '⠰' ? '、' : '。'; w = w.slice(0, -1); } // 式のあとの読点・句点
        if (isMathWord(w)) { out += '⟮' + mathFromBraille(w) + '⟯' + tail; i = j - 1; continue; }
      }
      if (c === '⠠' && n1 === '⠦') { // アドレス囲み符号
        const [t, j, closed] = infoFromBraille(s, i + 2);
        out += '⟬' + t + (closed ? '⟭' : '');
        if (!closed && j >= s.length) st.url = true;
        i = j - 1; continue;
      }
      if (c === '⠶' && n1 === '⠶' && !kakko) { out += ins ? '⦆' : '⦅'; ins = !ins; i++; continue; } // 点訳者挿入符
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
        else if (s[j] === '⠤' && s[j + 1] === '⠼') { out += '-'; j++; } // 3-1（番地・電話番号）
        i = j - 1; continue;
      }
      // 外字符・読点・ふたえカギ・第2カギ・注記符
      if (c === '⠰') {
        if (blank(i + 1)) { out += '、'; continue; }
        if (n1 === '⠼') { // 注記符 ⠰⠼⠁⠆ → ※1
          let j = i + 2, d = '';
          while (REV_DIGIT[s[j]] !== undefined) d += REV_DIGIT[s[j++]];
          if (d && s[j] === '⠆') { out += '※' + d; i = j; continue; }
        }
        if (n1 === '⠏' && /[0-9]$/.test(out)) { out += '％'; i++; continue; }
        if (n1 === '⠯') { out += '＆'; i++; continue; }
        if (n1 === '⠩') { out += '＃'; i++; continue; }
        if (n1 === '⠤') { out += '『'; i++; continue; }
        if (n1 === '⠄') { out += '〈'; i++; continue; } // 第2カギ
        if (n1 === '⠆') { out += '※'; i++; continue; }
        if (n1 === '⠶') { const top = !kakko; out += top ? '｟' : '（'; innerTop.push(top); inner++; i++; continue; } // カッコの中のカッコ（外なら二重カッコ）
        let j = i + 1, word = '', capAll = false, capNext = false;
        while (j < s.length && s[j] !== '⠀') {
          const d = s[j];
          if (d === '⠠' && s[j + 1] === '⠤') break; // 小見出し符
          if (d === '⠠' && s[j + 1] === '⠠') { capAll = true; j += 2; continue; }
          if (d === '⠰' && capAll && REV_LETTER[s[j + 1]]) { capAll = false; j++; continue; } // 大文字の終わり（SDGs）
          if (d === '⠠') { capNext = true; j++; continue; }
          if (d === '⠤') { j++; break; } // つなぎ符：ここから仮名
          if (d === '⠼') { // 英字の中の数字
            j++;
            while (REV_DIGIT[s[j]] !== undefined) { word += REV_DIGIT[s[j]]; j++; }
            if (s[j] === '⠤') { j++; break; }
            if (s[j] === '⠰') { j++; continue; } // 数字のあとも英字（a〜j）
            break; // 数字のあとは仮名（H17ネン）
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
      // 外国語引用符 ⠦ … ⠴：中は英語の点字
      if (c === '⠦' && s.indexOf('⠴', i + 1) > i) {
        const end = s.indexOf('⠴', i + 1);
        out += '⟪' + englishFromBraille(s.slice(i + 1, end)) + '⟫';
        i = end; continue;
      }
      if (c === '⠤') {
        if (n1 === '⠂' && shiji > 0) { out += '〗'; shiji--; i++; continue; }
        if (n1 === '⠆') { out += '』'; i++; continue; }
        if (n1 === '⠤') { out += '～'; i++; continue; }
        out += kagi ? '」' : '「'; kagi = !kagi; continue;
      }
      if (c === '⠶' && n1 === '⠄' && ins) { out += '⦆'; ins = false; i++; continue; }
      if (c === '⠶') {
        if (n1 === '⠆' && inner > 0) { out += innerTop.pop() ? '｠' : '）'; inner--; i++; continue; }
        if (n1 === '⠂') { out += '〕'; i++; continue; }
        out += kakko ? '）' : '（'; kakko = !kakko; continue;
      }
      if (c === '⠐') {
        if (blank(i + 1)) { out += '・'; continue; }
        if (n1 === '⠤') { out += '〖'; shiji++; i++; continue; } // 第1指示符
        const fuse = { '⠵': '○', '⠷': '△', '⠽': '□', '⠿': '╳', '⠾': '◌' }[n1]; // 伏せ字
        if (fuse) { out += fuse; i++; continue; }
        if (n1 === '⠶') { out += '〔'; i++; continue; }
        if (n1 === '⠂') { out += ':'; i++; continue; }
        if (REV_DAKU[n1]) { out += REV_DAKU[n1]; i++; continue; }
      }
      if (c === '⠠' && n1 === '⠶') { out += '⦅'; ins = true; i++; continue; }
      if (c === '⠠' && n1 === '⠤') { out += '：'; i++; continue; } // 第1小見出し符
      if (c === '⠸' && s.slice(i, i + 4).join('') === '⠸⠭⠭⠇') { out += '（＿）'; i += 3; continue; } // 空欄符号
      // 星印（行頭の印）
      if (blank(i + 2) && ((atStart(i) && ((c === '⠔' && n1 === '⠔') || (c === '⠢' && n1 === '⠢'))) || (c === '⠠' && n1 === '⠢'))) {
        out += c === '⠔' ? '⁑' : c === '⠢' ? '⁂' : '⁎'; i++; continue;
      }
      if (c === '⠠') {
        if (n1 === '⠆') { out += '〉'; i++; continue; }
        if (REV_HANDAKU[n1]) { out += REV_HANDAKU[n1]; i++; continue; }
      }
      if (c === '⠢' && closer(i + 1)) { out += '？'; continue; }
      if (c === '⠲' && closer(i + 1)) { out += '。'; continue; }
      if (c === '⠖' && closer(i + 1)) { out += '！'; continue; }
      if (REV_COMBO[c] && REV_COMBO[c][n1]) { out += REV_COMBO[c][n1]; i++; continue; }
      if (c === '⠘' && REV_SMALL[n1]) { out += REV_SMALL[n1]; i++; continue; }
      if (c === '⠒' || c === '⠂') { // 長い棒線・点線は長さを残す
        let j = i; while (s[j] === c) j++;
        const n = j - i;
        if (c === '⠒' && n >= 4) { out += '━'.repeat(n); i = j - 1; continue; }
        if (c === '⠂' && n >= 4) { out += '…'.repeat(n); i = j - 1; continue; }
      }
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
  const SEP_PREFIX = new Set(['各', '旧', '新', '毎', '全', '現', '前', '両', '故', '総']);
  const ATTACH = new Set(['/', '／', '+', '×', '÷', '−', '-', '－', '‐', '\u02bc', '※']); // 前後を続ける記号（※1 は注記符）
  const isKanji2 = s => /^[一-鿿々]{2}$/.test(s);
  const isLatinWord = s => /^[A-Za-zÀ-ÖØ-öø-ɏ][A-Za-zÀ-ÖØ-öø-ɏ0-9.]*$/.test(s);

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
        res.push({ surface_form: surf, pos: '名詞', pos_detail_1: '数', isNumber: true, reading: '*', word_position: t.word_position });
        continue;
      }
      // 辞書で分かれてしまう語（対償 → 対＋償）を、決まった読みの1語にまとめる
      let joined = false;
      // 「労働省令」は辞書が「労働省＋令」に分けるので「ロードー ショーレイ」に直す
      if (/^.+省$/.test(t.surface_form) && t.surface_form.length >= 3 && tokens[i + 1] && tokens[i + 1].surface_form === '令') {
        const rd = (t.reading || '').replace(/ショウ$/, '');
        res.push({ ...t, surface_form: t.surface_form.slice(0, -1), reading: rd });
        res.push({ surface_form: '省令', pos: '名詞', pos_detail_1: '一般', reading: 'ショーレイ' });
        i++; continue;
      }
      // 「をもって」は助詞＋動詞に分ける（ヒトリヲ モッテ）
      if (t.surface_form === 'をもって' || t.surface_form === 'をもつて') {
        res.push({ surface_form: 'を', pos: '助詞', pos_detail_1: '格助詞', pos_detail_2: '一般', reading: 'ヲ', basic_form: 'を' });
        res.push({ surface_form: 'もって', pos: '動詞', pos_detail_1: '自立', reading: 'モッテ', basic_form: 'もって', fromRengo: true });
        continue;
      }
      // 「機関の長」「市町村長」の長（辞書が形容詞の語幹と見ることがある）はチョー
      if (t.surface_form === '長' && t.pos === '形容詞' && !(tokens[i + 1] && /^(い|く|かっ|さ|すぎ|けれ|き)/.test(tokens[i + 1].surface_form))) {
        const pn = res.length && res[res.length - 1].pos === '名詞' && !/^(の|その|この|当該)$/.test(res[res.length - 1].surface_form);
        res.push({ surface_form: '長', pos: '名詞', pos_detail_1: pn ? '接尾' : '一般', reading: 'チョウ', pronunciation: 'チョー' }); continue;
      }
      // 名詞のあとの「元」は接尾語（派遣元 ハケンモト）
      if (t.surface_form === '元' && t.pos === '接頭詞' && res.length && res[res.length - 1].pos === '名詞') {
        res.push({ ...t, pos: '名詞', pos_detail_1: '接尾' }); continue;
      }
      // 「一条」「二項」のように1語になった漢数字＋条・項・号は、数字と分ける（ダイ1ジョー）
      const cm = /^([〇一二三四五六七八九十百千]+)([条項号章節款])$/.exec(t.surface_form);
      if (cm) {
        res.push({ surface_form: cm[1], pos: '名詞', pos_detail_1: '数', isNumber: true, reading: '*' });
        res.push({ surface_form: cm[2], pos: '名詞', pos_detail_1: '接尾', reading: { '条': 'ジョウ', '項': 'コウ', '号': 'ゴウ', '章': 'ショウ', '節': 'セツ', '款': 'カン' }[cm[2]] });
        continue;
      }
      for (const n of [3, 2]) {
        const w = tokens.slice(i, i + n).map(x => x.surface_form).join('');
        if (i + n <= tokens.length && WORD_READ[w]) { res.push({ surface_form: w, pos: '名詞', pos_detail_1: '一般', reading: WORD_READ[w] }); i += n - 1; joined = true; break; }
      }
      if (joined) continue;
      // 連語の格助詞（に対して・について・として・という・による など）は、助詞と動詞の部分に分ける
      // （点字では「ニ タイシテ」「ト シテ」のように、動詞の部分を区切って書く）
      if (t.pos === '助詞' && t.pos_detail_2 === '連語') {
        const m = /^(に|と|を)(.+)$/.exec(t.surface_form);
        if (m && !/^(の|は|も|が|で|へ|から|まで|ほど|だけ|など|って|か|て)+$/.test(m[2])) {
          const rd = t.reading && t.reading !== '*' ? t.reading : toKatakana(t.surface_form);
          res.push({ surface_form: m[1], pos: '助詞', pos_detail_1: '格助詞', pos_detail_2: '一般', reading: rd.slice(0, 1), basic_form: m[1] });
          const pr = t.pronunciation && t.pronunciation !== '*' ? t.pronunciation.slice(1) : undefined;
          res.push({ surface_form: m[2], pos: '動詞', pos_detail_1: '自立', reading: rd.slice(1), pronunciation: pr, basic_form: m[2], fromRengo: true });
          continue;
        }
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
      // 「4月1日」の日：1〜10日・20日は和語（ツイタチ・フツカ…ハツカ）、14日・24日は「14カ」、ほかは「15ニチ」
      if (next && next.surface_form === '日' && prev && prev.surface_form === '月' && /^[0-9]{1,2}$/.test(surf)) {
        const n = +surf;
        const W = { 1: 'ツイタチ', 2: 'フツカ', 3: 'ミッカ', 4: 'ヨッカ', 5: 'イツカ', 6: 'ムイカ', 7: 'ナノカ', 8: 'ヨーカ', 9: 'ココノカ', 10: 'トオカ', 20: 'ハツカ' };
        return { kana: W[n] || (n === 14 || n === 24 ? n + 'カ' : n + 'ニチ'), eatNext: true, day: true };
      }
      const k = numberToKana(surf);
      if (k !== null) return { kana: k };
    }
    if (isLatinWord(surf) || /^[0-9.,]+$/.test(surf) || surf === '&') return { kana: surf };
    if (Array.from(surf).every(c => PUNCT[c] || c === '\u02bc')) return { kana: surf }; // 記号（辞書が名詞と見ることもある）
    if (t.pos === '記号' || PUNCTS.has(surf) || OPEN_BRACKETS.has(surf) || CLOSE_BRACKETS.has(surf)) {
      if (/^[ァ-ヺーぁ-ゖ]+$/.test(surf)) return { kana: toKatakana(surf) };
      if (Array.from(surf).every(c => PUNCT[c] || c === '\u02bc')) return { kana: surf };
      if (t.reading && t.reading !== '*' && !PUNCT[surf] && !/[…‥―─—～〜]/.test(surf)) return { kana: t.reading };
      return { kana: surf };
    }
    if (COUNTER[surf] && prev && (isLatinWord(prev.surface_form) || prev.isNumber)) return { kana: COUNTER[surf] };
    // 数字のあとの「月」はガツ
    // 「3月を経過」「6月以内」のような期間はゲツ
    if (prev && prev.isNumber && surf === '月') return { kana: next && /^(を|以内|以上|未満|間|後|ごと|毎)$/.test(next.surface_form) ? 'ゲツ' : 'ガツ' };
    // 数字のあとの助数詞は、最後の数字で読みが変わる（30分 → 30プン、3本 → 3ボン）
    if (prev && prev.isNumber && COUNTER_SOUND[surf] && /[0-9]$/.test(prev.surface_form)) {
      const d = +prev.surface_form.slice(-1), tens = /[0-9]0$/.test(prev.surface_form) && prev.surface_form.length > 1;
      return { kana: COUNTER_SOUND[surf](d, tens) };
    }
    // 推量・意志の助動詞「う」は長音符（書こう → カコー）
    if (t.pos === '助動詞' && surf === 'う' && prev && prev._kana && (O_ROW.has(prev._kana.slice(-1)) || U_ROW.has(prev._kana.slice(-1)))) return { kana: 'ー' };
    if (t.pos === '助詞') {
      if (surf === 'は') return { kana: 'ワ' };
      if (surf === 'へ') return { kana: 'エ' };
    }
    if (WORD_READ[surf]) return { kana: WORD_READ[surf] };
    const R = t.reading && t.reading !== '*' ? t.reading : null;
    // 接続詞・あいさつの「は」はワ（又は → マタワ、こんにちは → コンニチワ）
    if (R && /^(接続詞|感動詞)$/.test(t.pos) && /は$/.test(surf)) return { kana: longVowel(R, t.pronunciation && t.pronunciation !== '*' ? t.pronunciation : R, false).replace(/ハ$/, 'ワ') };
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
    // A4・B5 のように英字にすぐ続く数字は続ける
    if (t.isNumber && /^[A-Za-z]+$/.test(ps) && prev.word_position && t.word_position === prev.word_position + ps.length) return false;
    if (CLOSE_BRACKETS.has(surf) || PUNCTS.has(surf)) return false;
    if ((surf === '（' || surf === '(') && !PUNCTS.has(ps) && !OPEN_BRACKETS.has(ps) && prev.pos !== '助詞') return false; // 補足のカッコは前の語に続ける（ハイリョ（ホー…）
    if (OPEN_BRACKETS.has(surf)) return true;
    if (ATTACH.has(surf) || ATTACH.has(ps)) return false;
    if (SPACED.has(surf) || SPACED.has(ps)) return true;
    if (PUNCTS.has(ps) && ps !== '…' && ps !== '‥') return true;
    if (CLOSE_BRACKETS.has(ps)) return !(p === '助詞' || p === '助動詞' || (p === '名詞' && d1 === '接尾')); // （ヘイセイ 30）ネン
    if (ATTACH.has(surf) || ATTACH.has(ps)) return false;
    if (SPACED.has(surf) || SPACED.has(ps)) return true;
    if (prev.isNumber && (UNITS.has(surf) || (/^[A-Za-z]{1,3}$/.test(surf) && /^[a-zA-Z]+$/.test(surf) && /^(?:mm|cm|m|km|g|kg|mg|t|ml|l|L|kl|dl|cc|a|ha|W|kW|V|A|Hz|kHz|MHz|GHz|B|KB|MB|GB|TB|px|pt|dB|K)$/.test(surf)))) return false;
    if (p === '記号') return /[…‥―─—]/.test(surf);
    // 「である」「でない」の ある・ない は補助用言なので区切る（デ アル、デ ナイ）
    if (p === '助動詞' && ps === 'で' && prev.pos === '助動詞' && /^(ある|ない)$/.test(t.basic_form || '')) return true;
    // 「ではない」「もない」「美しくない」の ない は区切る（デワ ナイ、ウツクシク ナイ）
    if (t.basic_form === 'ない' && ((prev.pos === '助詞' && /^(は|も|こそ|さえ|しか)$/.test(ps)) || (prev.pos === '形容詞' && /く$/.test(ps)) || (prev.pos === '助動詞' && /^(たく|らしく)$/.test(ps)))) return true;
    if (p === '助詞' || p === '助動詞') return false; // 英字の後の助詞も続ける（点字ではつなぎ符をはさむ：CDヲ）
    if (p === '名詞') {
      // 「等（とう）」と「以上・以下・未満・以内・以外」は区切る（テアテ トー、50サイ ミマン）
      if (surf === '等' || /^(以上|以下|未満|以内|以外|以降|以前|以後)$/.test(surf)) return true;
      // 2字以上の接尾語で、前もあとも3拍以上なら区切る（ショーガイ テイド、ジギョー ネンド）
      if (d1 === '接尾' && /^[一-鿿]{2,}$/.test(surf) && prev.pos === '名詞' && !prev.isNumber && ctx.curMora >= 3 && Math.max(ctx.prevMora, ctx.segMora || 0) >= 3) return true;
      if (d1 === '接尾') return false;
      // 「ように」「そうだ」などの「よう・そう」は前に続ける（デキルヨーニ、ソチノヨーニ）
      if (d1 === '非自立' && t.pos_detail_2 === '助動詞語幹') return false;
      if (d1 === '非自立') return !(surf === 'の' || surf === 'ん');
      if (prev.pos === '接頭詞') return false;
      if (prev.pos === '名詞' && !['接尾', '非自立', '数', '代名詞'].includes(prev.pos_detail_1) && !prev.isNumber && !t.isNumber) {
        if (prev.pos_detail_3 === '姓' && t.pos_detail_3 === '名') return true;
        if (isLatinWord(ps) || isLatinWord(surf)) return false;
        // 1字の名詞＋2字のサ変名詞は区切る（ホー イハン、ガク カイテイ）
        if (/^[一-鿿]$/.test(ps) && prev.pos_detail_1 === '一般' && d1 === 'サ変接続' && /^[一-鿿]{2}$/.test(surf) && !(ctx.segMora > ctx.prevMora)) return true;
        return Math.max(ctx.prevMora, ctx.segMora || 0) >= 3 && ctx.curMora >= 3; // 複合語の切れ続き（ザイエン キカン）
      }
      if (prev.isNumber && (d1 === '接尾' || d1 === '助数詞' || /^[\u4e00-\u9fff]$/.test(surf) || UNITS.has(surf))) return false;
      return true;
    }
    if (p === '動詞') {
      if (d1 === '接尾') return false;
      // 名詞＋動詞の連用形で1つの名詞になっているもの（切り欠きを）は続ける
      if (prev.pos === '名詞' && /^連用/.test(t.conjugated_form || '') && ctx.nextIsCase && /[りきしちみぎびい]$/.test(ps)) return false;
      if (t.basic_form === 'する' && prev.pos === '名詞' && prev.pos_detail_1 !== '接尾' && /^[一-鿿]$/.test(ps)) return false; // 愛する（多様化 シテ は区切る）
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

  // 数字＋助数詞の読み（最後の数字 d、10・20… のときは tens）
  const COUNTER_SOUND = {
    '分': d => [1, 3, 4, 6, 8, 0].includes(d) ? 'プン' : 'フン',
    '本': d => [1, 6, 8, 0].includes(d) ? 'ポン' : d === 3 ? 'ボン' : 'ホン',
    '杯': d => [1, 6, 8, 0].includes(d) ? 'パイ' : d === 3 ? 'バイ' : 'ハイ',
    '匹': d => [1, 6, 8, 0].includes(d) ? 'ピキ' : d === 3 ? 'ビキ' : 'ヒキ',
    '発': d => [1, 6, 8, 0].includes(d) ? 'パツ' : 'ハツ',
    '泊': d => [1, 3, 4, 6, 8, 0].includes(d) ? 'パク' : 'ハク',
    '歩': d => [1, 6, 8, 0].includes(d) ? 'ポ' : d === 3 ? 'ボ' : 'ホ'
  };
  // 辞書の読みが、点訳のふつうの読みと違う語
  const WORD_READ = { '毎年': 'マイネン', '如何': 'イカン', '上方': 'ジョーホー', '車いす': 'クルマ イス', '車椅子': 'クルマ イス', '対償': 'タイショー',
    // 公式の点字データ（厚生労働省）と比べて分かった、辞書の読みが違う・ない語
    '令和': 'レイワ', '令': 'レイ', '附則': 'フソク', '事業主': 'ジギョーヌシ', '届出': 'トドケデ', '獣医師': 'ジューイシ', '獣医': 'ジューイ', '被毛': 'ヒモー',
    '毎年度': 'マイネンド', '各省各庁': 'カクショー カクチョー', '関係会社': 'カンケイガイシャ', '親事業主': 'オヤジギョーヌシ', '安定所': 'アンテイジョ',
    '前号': 'ゼンゴー', '前項': 'ゼンコー', '前条': 'ゼンジョー', '次条': 'ジジョー', '次項': 'ジコー', '次号': 'ジゴー', '上欄': 'ジョーラン', '下欄': 'カラン',
    '介助犬': 'カイジョケン', '聴導犬': 'チョードーケン', '両眼': 'リョーガン', '市区町村': 'シクチョーソン', '市町村民税': 'シチョーソンミンゼイ', '等': 'トー',
    'やむを得ない': 'ヤムヲ エナイ', 'やむを得ず': 'ヤムヲ エズ', '止むを得ない': 'ヤムヲ エナイ', '止むを得ず': 'ヤムヲ エズ', '付則': 'フソク', '抄': 'ショー', '申出': 'モーシデ', 'ただし書': 'タダシガキ', '但し書': 'タダシガキ', '但書': 'タダシガキ' };
  // 読みが割れる語（候補を出して、点訳者に選んでもらう）
  const AMBIG = {
    '毎年': ['マイネン', 'マイトシ'], '如何': ['イカン', 'イカガ'], '上方': ['ジョーホー', 'カミガタ'],
    'その後': ['ソノゴ', 'ソノ アト', 'ソノ ノチ'], 'その他': ['ソノ ホカ', 'ソノタ'],
    '一日': ['イチニチ', 'ツイタチ'], '今日': ['キョー', 'コンニチ'], '明日': ['アシタ', 'アス', 'ミョーニチ'],
    '昨日': ['キノー', 'サクジツ'], '日本': ['ニホン', 'ニッポン'], '上手': ['ジョーズ', 'ウワテ', 'カミテ'],
    '下手': ['ヘタ', 'シモテ', 'シタテ'], '人気': ['ニンキ', 'ヒトケ'], '生物': ['セイブツ', 'ナマモノ'],
    '色紙': ['シキシ', 'イロガミ'], '市場': ['イチバ', 'シジョー'], '大家': ['オーヤ', 'タイカ'],
    '一行': ['イチギョー', 'イッコー'], '風車': ['フーシャ', 'カザグルマ'], '最中': ['サイチュー', 'モナカ'],
    '何人': ['ナンニン', 'ナニジン'],
    '今月末': ['コンゲツマツ', 'コンゲツ スエ'], '一番': ['イチバン', 'イチ バン'], '行方': ['ユクエ', 'ギョーホー', 'イクエ'], '一時': ['イチジ', 'イットキ', 'イチ ジ']
  };

  // 前後を見ないと読みが決まらない語。読みの候補を出す
  function contextReading(tokens, i) {
    const t = tokens[i], surf = t.surface_form, p1 = tokens[i - 1], p2 = tokens[i - 2], n1 = tokens[i + 1];
    // 「〜の方」：人ならカタ、方向・方面ならホー
    if (surf === '方' && p1 && p1.surface_form === 'の') {
      const person = tokens.slice(Math.max(0, i - 5), i - 1).some(x => /者$|^歳$|^人$|^以外$|^未満$|^以上$|^様$|^皆/.test(x.surface_form));
      const kana = person ? 'カタ' : 'ホー';
      return { surface: 'の方', kana, options: person ? ['カタ', 'ホー'] : ['ホー', 'カタ'] };
    }
    // 「〜の下、」「〜の下で」：モト（認識の下、指導の下で）
    if (surf === '下' && p1 && p1.surface_form === 'の' && n1 && /^(、|で|に)$/.test(n1.surface_form) && p2 && p2.pos === '名詞' && p2.pos_detail_1 === 'サ変接続') {
      return { surface: 'の下', kana: 'モト', options: ['モト', 'シタ'] };
    }
    // 2字の漢語＋「前」：マエと読んで区切る（施行前 シコー マエ、改正前 カイセイ マエ）
    if (surf === '前' && p1 && p1.pos === '名詞' && /^[一-鿿]{2}$/.test(p1.surface_form) && p1.pos_detail_1 === 'サ変接続') {
      if (/^(就学|術|産)$/.test(p1.surface_form)) return { surface: p1.surface_form + '前', kana: 'ゼン', options: ['ゼン', 'マエ'] }; // 決まった言い方（シューガクゼン）
      return { surface: p1.surface_form + '前', kana: 'マエ', options: ['マエ', 'ゼン'], brk: true };
    }
    // 「前二条」「前三項」：ゼン（数の前）
    if (surf === '前' && n1 && n1.isNumber && t.pos === '名詞') return { surface: '前', kana: 'ゼン', options: ['ゼン', 'マエ'] };
    // 「第一項中」「表中」：チュー
    if (surf === '中' && p1 && /^(項|条|号|欄|表|図|文|本文|ただし書)$/.test(p1.surface_form)) return { surface: '中', kana: 'チュー', options: ['チュー', 'ナカ'], attach: true };
    // 「〜の間」「〜との間」：アイダ（当分の間、国民の間に）
    if (surf === '間' && p1 && p1.surface_form === 'の' && t.reading === 'マ') return { surface: 'の間', kana: 'アイダ', options: ['アイダ', 'マ', 'カン'] };
    // 動詞のあとの「方」は人（希望する方は → キボー スル カタワ）
    if (surf === '方' && p1 && p1.pos === '動詞' && t.pos_detail_1 === '非自立') return { surface: p1.surface_form + '方', kana: 'カタ', options: ['カタ', 'ホー'] };
    // 「〜の数」「定める数」：スー（法令・統計の書き方）
    if (surf === '数' && p1 && (p1.surface_form === 'の' || p1.pos === '動詞') && t.reading === 'カズ') return { surface: '数', kana: 'スー', options: ['スー', 'カズ'] };
    // 「機関の長」「その長」：チョー
    if (surf === '長' && p1 && /^(の|その|当該|この)$/.test(p1.surface_form) && (!n1 || !/^(い|く|かっ|さ|すぎ)/.test(n1.surface_form))) return { surface: '長', kana: 'チョー', options: ['チョー', 'ナガ'] };
    return null;
  }

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
      let r = tokenKana(t, prev, tokens[i + 1], opts);
      const ctxCheck = contextReading(tokens, i);
      if (ctxCheck) { r = { kana: ctxCheck.kana }; checks.push(ctxCheck); if (ctxCheck.attach) ctx.attachHere = true; }
      if (r.unresolved) unresolved.push(surf);
      if (AMBIG[surf] && r.kana) checks.push({ surface: surf, kana: r.kana, options: AMBIG[surf] });
      else if (t.isNumber && !r.day && tokens[i + 1] && tokens[i + 1].surface_form === '日') checks.push({ surface: surf + '日', kana: r.kana + 'ニチ', options: [r.kana + 'ニチ', r.kana + 'カ'] });
      ctx.curMora = moraOf(t, r.kana);
      ctx.nextIsCase = !!(tokens[i + 1] && tokens[i + 1].pos === '助詞' && /^(を|が|に|の|は|も|で|と)$/.test(tokens[i + 1].surface_form));
      const brk = !ctx.attachHere && (needsBreak(t, prev, ctx) || ctx.forceBreak || !!(ctxCheck && ctxCheck.brk));
      ctx.forceBreak = false; ctx.attachHere = false;
      if (brk && out && !out.endsWith(' ')) out += ' ';
      ctx.segMora = brk || !out ? ctx.curMora : (ctx.segMora || 0) + ctx.curMora;
      out += r.kana;
      t._kana = r.kana;
      if (r.eatNext) i++;
      // 1字の接頭語（各・旧・新・毎・全など）は、あとに2字以上の語が来れば区切る（カク ゴー、キュー キソク、マイ ジギョー）
      const nt = tokens[i + 1];
      const sepPrefix = t.pos === '接頭詞' && SEP_PREFIX.has(surf) && nt && nt.pos === '名詞' && (surf === '各' || nt.isNumber || /^[一-鿿々]{2,}/.test(nt.surface_form));
      ctx.attachNext = (t.pos === '接頭詞' && !sepPrefix) || OPEN_BRACKETS.has(surf);
      if (sepPrefix) ctx.forceBreak = true;
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
  // 枠線は、点字データの書き方（BSEの見本）に合わせて1マス目から行いっぱいに引く
  function decorCells(type, cols) {
    const inner = Math.max(2, cols - 2);
    if (type === 'rule') return '⠀⠀' + '⠒'.repeat(Math.max(2, cols - 4));
    if (type === 'frame-start') return '⠖' + '⠒'.repeat(inner) + '⠲';
    if (type === 'frame-end') return '⠓' + '⠒'.repeat(inner) + '⠚';
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
      fitTable(live.slice(i, j), cols, 0);
      i = j;
    }
    // 枠線は行いっぱい。枠の中はふつうの書き方（段落は3マス目から、続きは1マス目から）
    for (const f of frames) {
      f.start._lines = [decorCells('frame-start', cols)];
      if (f.end) f.end._lines = [decorCells('frame-end', cols)];
      f.start._block = 2 + f.rows.reduce((a, r) => a + estimateLines(r, cols), 0);
    }
    return rows;
  }
  function estimateLines(r, cols) {
    if (r._lines) return r._lines.length;
    if (r.type === 'blank') return 1;
    if (r.type === 'figure') return r.figure && !r.noFigure ? r.figure.length : 1;
    if (HEAD_INDENT[r.type]) return headingLines(r.cells || '', HEAD_INDENT[r.type], cols).length + 1;
    return r.cells ? wrapCells(r.cells, cols).length : 1;
  }
  // かなと点字を、表示でそろえられる単位（かな1つ・記号1つ）の並びにする
  function pieceUnits(kana) {
    const b = kanaToBraille((kana || '').trim());
    return b.units.map(u => u.url ? { k: u.text, c: u.cells, url: true } : { k: u.text, c: u.cells });
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
      if (w.some(p => p.url)) { // 長いアドレス：/ や . のあとで折り返し、続きの行は ⠈ から書く
        let rest = w.slice();
        while (rest.length) {
          let n = 0, l = len;
          while (n < rest.length && l + clen(rest[n].c) <= width) { l += clen(rest[n].c); n++; }
          if (n >= rest.length) { line.push(...rest); len = l; break; }
          let cut = n;
          for (let k = n; k > Math.max(1, n >> 1); k--) if (rest[k - 1].url && /^[\/._\-?&=]$/.test(rest[k - 1].k)) { cut = k; break; }
          if (cut < 1) cut = 1;
          line.push(...rest.slice(0, cut)); lines.push(line);
          rest = rest.slice(cut);
          line = [{ k: '↪', c: '⠈' }]; len = 1;
        }
        continue;
      }
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
        const body = headingLines(cells, ind, cols);
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

  // 見出し：1行目は決まったマス目から、2行目以降はさらに2マス下げる（7マス目→9マス目、5→7、3→5）
  function headingLines(cells, ind, cols) {
    const text = cells.replace(/^⠀+/, '');
    const first = wrapCells(text, cols - ind)[0];
    const rest = text.slice(first.length).replace(/^⠀+/, '');
    const out = ['⠀'.repeat(ind) + first.replace(/⠀+$/, '')];
    if (rest) wrapCells(rest, cols - ind - 2).forEach(l => out.push('⠀'.repeat(ind + 2) + l.replace(/⠀+$/, '')));
    return out;
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
      if (part.includes('⠠⠦')) { // 長いアドレス：/ や . のあとで折り返し、続きの行は ⠈ から書く
        while (w.length > cols) {
          let cut = cols;
          for (let k = cols; k > cols >> 1; k--) if (/[⠌⠲⠤]/.test(w[k - 1]) && w[k - 2] !== '⠐') { cut = k; break; }
          if (w[cut - 1] === '⠠' || w[cut - 1] === '⠐' || w[cut - 1] === '⠼' || w[cut - 1] === '⠰') cut--; // 2マスの記号を分けない
          out.push(w.slice(0, cut).join('')); w = ['⠈', ...w.slice(cut)];
        }
        line = w.join(''); continue;
      }
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
    toKatakana, toHiragana, normalizeInput, numberToKana, moraCount, prepareSumiji, sumijiToKana, headingLines, ipaToBraille, READ
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TenjiEngine = api;
})(typeof self !== 'undefined' ? self : this);

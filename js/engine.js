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
    '：': '⠐⠂', ':': '⠐⠂', '※': '⠰⠆', '-': '⠤', '－': '⠤', '‐': '⠤'
  };

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
        if (!inLatin) {
          let j = i;
          while (j < s.length && isLatin(s[j])) j++;
          const run = s.slice(i, j).join('');
          latinCapAll = run.length > 1 && run === run.toUpperCase();
          out += SIGN.FOREIGN + (latinCapAll ? SIGN.CAP + SIGN.CAP : '');
        }
        inLatin = true; inNum = false;
        const upper = c !== c.toLowerCase();
        out += (upper && !latinCapAll ? SIGN.CAP : '') + LETTER[c.toLowerCase()];
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
        while (i + 1 < tokens.length && tokens[i + 1].pos === '名詞' && tokens[i + 1].pos_detail_1 === '数' &&
               /^[0-9〇零一二三四五六七八九十百千万億兆.,]+$/.test(tokens[i + 1].surface_form)) {
          i++; surf += tokens[i].surface_form;
        }
        res.push({ surface_form: surf, pos: '名詞', pos_detail_1: '数', isNumber: true, reading: '*' });
        continue;
      }
      res.push(t);
    }
    return res;
  }

  function tokenKana(t, prev, next) {
    const surf = t.surface_form;
    if (t.isNumber) {
      // 和語の数え方（一つ、二つ…）は仮名で書く
      if (next && next.surface_form === 'つ' && /^[一二三四五六七八九1-9]$/.test(surf)) return { kana: WAGO_TSU[KANJI_DIGIT[surf] || Number(surf)], eatNext: true };
      if (next && next.surface_form === '人' && (surf === '一' || surf === '二')) return { kana: surf === '一' ? 'ヒトリ' : 'フタリ', eatNext: true };
      const k = numberToKana(surf);
      if (k !== null) return { kana: k };
    }
    if (isLatinWord(surf) || /^[0-9.,]+$/.test(surf)) return { kana: surf };
    if (t.pos === '記号' || PUNCTS.has(surf) || OPEN_BRACKETS.has(surf) || CLOSE_BRACKETS.has(surf)) {
      if (/^[ァ-ヺーぁ-ゖ]+$/.test(surf)) return { kana: toKatakana(surf) };
      if (t.reading && t.reading !== '*' && !PUNCT[surf] && !/[…‥―─—～〜]/.test(surf)) return { kana: t.reading };
      return { kana: surf };
    }
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
    return { kana: surf, unresolved: true };
  }

  function needsBreak(t, prev, ctx) {
    if (!prev) return false;
    if (ctx.attachNext) return false;
    const surf = t.surface_form, p = t.pos, d1 = t.pos_detail_1;
    const ps = prev.surface_form;
    if (CLOSE_BRACKETS.has(surf) || PUNCTS.has(surf)) return false;
    if (OPEN_BRACKETS.has(surf)) return true;
    if (PUNCTS.has(ps) && ps !== '…' && ps !== '‥') return true;
    if (CLOSE_BRACKETS.has(ps)) return !(p === '助詞' || p === '助動詞');
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
      if (prev.isNumber && (d1 === '接尾' || d1 === '助数詞' || /^[\u4e00-\u9fff]$/.test(surf))) return false;
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
  function tokensToKana(rawTokens) {
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
      const r = tokenKana(t, prev, tokens[i + 1]);
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
    layoutPages, wrapCells, cellsToAscii, asciiToCells, cellBits, bitsCell,
    toKatakana, toHiragana, normalizeInput, numberToKana, moraCount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TenjiEngine = api;
})(typeof self !== 'undefined' ? self : this);

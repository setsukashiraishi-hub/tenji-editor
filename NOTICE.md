# 同梱しているソフトウェア

| 名前 | 用途 | ライセンス |
|---|---|---|
| [kuromoji.js](https://github.com/takuyaa/kuromoji.js) 0.1.2（`vendor/kuromoji.js`、`dict/`） | 漢字かな交じり文の形態素解析（読みがなと品詞） | Apache License 2.0（`vendor/kuromoji-LICENSE.txt`）。辞書は mecab-ipadic に基づきます |
| [pdf.js](https://github.com/mozilla/pdf.js) 4.2.67（`vendor/pdfjs/`） | PDF の文字の取り出し | Apache License 2.0（`vendor/pdfjs/LICENSE.txt`） |
| [JSZip](https://github.com/Stuk/jszip) 3.10.1（`vendor/jszip.min.js`） | Word（.docx）の読み書き | MIT / GPLv3 のデュアルライセンス（`vendor/jszip-LICENSE.md`） |

# 辞書・言語パック（ダウンロードして使うもの）

画面の「辞書・言語パック」からダウンロードするファイルは、このリポジトリの `dict-packs` ブランチにあり、
公開するときに `packs/` に置かれます（使う人のブラウザの IndexedDB に保存されます）。ライセンスの全文は同じブランチの `packs/licenses/` にあります。

| パック | もとにしたもの | ライセンス |
|---|---|---|
| 日本語の読みの辞書（一般の語・人名・地名・会社や作品など） | [UniDic](https://clrd.ninjal.ac.jp/unidic/)（国立国語研究所）cwj 202512、[SudachiDict](https://github.com/WorksApplications/SudachiDict) 20261015、[mecab-ipadic-NEologd](https://github.com/neologd/mecab-ipadic-neologd)、[日本郵便 郵便番号データ](https://www.post.japanpost.jp/zipcode/download.html) | UniDic：BSD（GPL・LGPL との選択）、SudachiDict：Apache License 2.0（UniDic・NEologd を含む）、NEologd：Apache License 2.0（はてなキーワード・郵便番号データ・日本全国駅名一覧・人名データを含む）、郵便番号データ：日本郵便は著作権を主張していません |
| 外国語の点字 | [liblouis](https://github.com/liblouis/liblouis) 3.39.0（コミット 011cfb3）を Emscripten で WebAssembly にしたものと、liblouis の点字の表 | GNU Lesser General Public License 2.1 以降。ビルドに使ったソースは `packs/src/liblouis-3.39.0-src.tar.gz`、作り方は `tools/build-liblouis.sh` |

`js/kanji-yomi.js`（1字の漢字の読み、約1,840字）は、上の UniDic・SudachiDict・NEologd の1字の見出しから、エディタの辞書が1字だけでは読めない漢字の読みを選んだものです（UniDic：BSD、SudachiDict・NEologd：Apache License 2.0）。

# 記号・絵文字・まれな文字の表（エディタに入っているもの）

| ファイル | もとにしたもの | ライセンス |
|---|---|---|
| `js/symbols-data.js`（記号・絵文字の読みと置き換え、約8,800項目） | [Unicode Character Database](https://www.unicode.org/ucd/)（UnicodeData.txt・EquivalentUnifiedIdeograph.txt）、[Unihan](https://www.unicode.org/charts/unihan.html)（漢字の異体字：kJapaneseNewVariant・kZVariant・kSemanticVariant など）、[CLDR](https://cldr.unicode.org/) の日本語の注釈（絵文字・記号の名前。[cldr-json](https://github.com/unicode-org/cldr-json) の annotations / annotationsDerived） | Unicode License v3（© Unicode, Inc.） |
| `js/kanji-unihan.js`（まれな漢字の読み、約4万6千字） | Unihan データベースの kJapanese | Unicode License v3（© Unicode, Inc.） |

どちらも `tools/symbols/build.js` で作りました（作り方はファイルの頭に書いてあります）。異体字は、Unihan の繁体字・同じ字の別の形をたどって新字体に直せるもの（龟 → 龜 → 亀 のような2段階）も使っています。CLDR の日本語の名前は、エディタの変換エンジンで仮名にしてから、読み誤るものを直して使っています。
もとのデータ（UnicodeData.txt・Unihan・CLDR の JSON）はリポジトリに入れていません。

国際音声記号の点字は、国際英語点字協議会（ICEB）の [IPA Braille: An Updated Tactile Representation of the International Phonetic Alphabet, Second Edition 2025](https://iceb.org/icebipa.htm)（Robert Englebretson 編、CC0 1.0）の表によります。
この文書の付録の見本（Cambridge University Press の許諾で載っている文）は、出力を確かめるためだけに使い、リポジトリには入れていません。

外国語の点字パックがないときのキリル文字の点字（ロシア語の点字と、ウクライナ語・ベラルーシ語・ブルガリア語・セルビア語・マケドニア語・ウズベク語・カザフ語・タタール語・バシキール語・サハ語の字）は、liblouis の各言語の表（ru-litbrl・uk・bel・bg・sr-cyrletters・mk-g1・uz-g1・kk・tt・ba・sah）と同じ字と点の対応を、エディタに入れたものです（liblouis の内部用の点 9〜f は除いています）。
表にない古い字・まれな字（ѳ・ѵ・ҷ など）は、近い字（ф・и・ч など）で書き、そのことを校正箇所の一覧に出します。

日本語の辞書は、エディタに入っている辞書（IPA辞書）と読みが違う語・ない語だけを集め、大きな辞書どうしの読みを照らし合わせたうえで、
公式の点字データ（約164万行）に出てくる読みで確かめて作りました（点字データそのものはパックにも入れていません）。

# 参考にしたもの

- 特殊音・拗音の点字対応表、BES ファイルの構造（ヘッダ 1029 バイト、1 マス 1 バイト）は
  [bes2kana-for-checking](https://github.com/BunYoshi/bes2kana-for-checking) と
  [UniBraille Viewer（bes-viewer）](https://github.com/shunito/bes-viewer)（いずれも MIT License）を参考にしました。
- 点字の表記ルールは日本点字委員会『日本点字表記法』と全国視覚障害者情報提供施設協会『点訳のてびき』、
  広島県立広島中央特別支援学校の指導資料「点字のきまり」に基づきます。

# 点訳の確かめに使ったもの

- 厚生労働省「点字ダウンロード」（https://www.mhlw.go.jp/tenji/index.html）の点字データ（BSE）と、その元の資料。
  公式の点字をかなに読み戻したものを `test/fixtures/official_kana.json` に置き、このアプリの点訳（読み・分かち書き）と比べるテストに使っています。
  点字データそのものは置いていません。出典：厚生労働省ホームページ。
- 書き方の調査には、だれでもダウンロードできる次の点字データも使いました（調べて分かった規則だけを取り入れ、データそのものは置いていません）。
  厚生労働省「点字ダウンロード」、日本語能力試験「点字ファイルダウンロード」（https://www.jlpt.jp/tenji.html）、
  名古屋市「広報なごや点字版」・「市会だより点字版」、つくば市「広報つくば・かわら版 点字データ」、文京区の点字データ、
  千葉県文書館「収蔵資料・刊行物の点字データ」（https://www.pref.chiba.lg.jp/bunshokan/contents/shuuzoushiryou/download.html ）、
  日本年金機構「障害年金ガイド」点字版、神戸市「障害福祉のあらまし」点字版、鎌倉市「家庭ごみの分け方・出し方」点字版。
- 自治体の広報の墨字（つくば市「広報つくば」PDF、栗東市「広報りっとう」HTML版、名古屋市会「市会だより」PDF）を、同じ号の点字版と
  文ごとに対応させて比べました（墨字も点字もリポジトリには入れていません）。
- `js/spacing-data.js`（分かち書きの一覧）は、上の公式の点字データ（約164万行）を仮名に読み戻し、区切る形と続ける形の数を比べて作ったものです。
- 英語の発音記号の点字は、文部科学省「点字学習指導の手引」（令和5年）の表によります。英語の発音記号の表にない記号は、上の IPA Braille（ICEB, 2025）によります。
- 漢文の返り点は「点字では書き下し文に直して書く」（文部科学省「点字学習指導の手引」第6章）ことによります。
- 数式の点字（数学点字）は、文部科学省「点字学習指導の手引」（令和5年）第8章第3節・第4節、同「点字教科書の編集資料」（小学部算数・中学部数学）の例によります。
- 英語の点字（UEB）と、日本語の文中の英語（外字符・外国語引用符）は、文部科学省「点字学習指導の手引」（令和5年）第8章第5節と、
  日本点字委員会「日本点字表記法 2018年版 第1編第4章第6節の一部修正」（2023年）によります。
  英語の点字は、liblouis（https://github.com/liblouis/liblouis 、LGPL）の UEB の表とテストデータ、および
  Project Gutenberg のパブリックドメインの英文（約6万文）で出力を比べて確かめました。liblouis のプログラムと英文は、このアプリには入れていません。
- `js/ueb-g2-rules.js`（英語の縮約を使わない文脈の一覧）は、liblouis の UEB グレード２辞書テスト
  （tests/braille-specs/en-ueb-g2-dictionary_harness.yaml）から自動で学習して作ったものです。
  このファイルだけは liblouis と同じ GNU Lesser General Public License v2.1 以降で配布します（ほかのファイルは MIT License）。

# ファイル形式の解析について

- BES とエーデル（.edl）の作りは公開されている仕様書がないため、利用者から提供された実物のファイル
  （BES 3点、エーデル図 109点）を解析して実装しました。解析に使ったファイルの一部は `test/fixtures/` にテスト用として置いています。

# 同梱しているソフトウェア

| 名前 | 用途 | ライセンス |
|---|---|---|
| [kuromoji.js](https://github.com/takuyaa/kuromoji.js) 0.1.2（`vendor/kuromoji.js`、`dict/`） | 漢字かな交じり文の形態素解析（読みがなと品詞） | Apache License 2.0（`vendor/kuromoji-LICENSE.txt`）。辞書は mecab-ipadic に基づきます |
| [pdf.js](https://github.com/mozilla/pdf.js) 4.2.67（`vendor/pdfjs/`） | PDF の文字の取り出し | Apache License 2.0（`vendor/pdfjs/LICENSE.txt`） |
| [JSZip](https://github.com/Stuk/jszip) 3.10.1（`vendor/jszip.min.js`） | Word（.docx）の読み書き | MIT / GPLv3 のデュアルライセンス（`vendor/jszip-LICENSE.md`） |

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
  名古屋市「広報なごや点字版」・「市会だより点字版」、つくば市「広報つくば・かわら版 点字データ」、文京区の点字データ。
- 英語の発音記号の点字は、文部科学省「点字学習指導の手引」（令和5年）の表によります。
- 数式の点字（数学点字）は、文部科学省「点字学習指導の手引」（令和5年）第8章第3節・第4節、同「点字教科書の編集資料」（小学部算数・中学部数学）の例によります。

# ファイル形式の解析について

- BES とエーデル（.edl）の作りは公開されている仕様書がないため、利用者から提供された実物のファイル
  （BES 3点、エーデル図 109点）を解析して実装しました。解析に使ったファイルの一部は `test/fixtures/` にテスト用として置いています。

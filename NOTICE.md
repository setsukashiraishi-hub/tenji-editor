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

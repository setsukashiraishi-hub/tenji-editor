# 点訳エディタ 辞書・言語パック（dict-packs ブランチ）

このブランチには、[点訳エディタ](https://setsukashiraishi-hub.github.io/tenji-editor/)の「辞書・言語パック」でダウンロードするファイルを置いています。
main ブランチの GitHub Pages への公開のときに、`packs/` がそのまま公開されます（`https://setsukashiraishi-hub.github.io/tenji-editor/packs/`）。

| ファイル | 中身 | ライセンス |
|---|---|---|
| `packs/manifest.json` | パックの一覧（大きさ・SHA-256） | MIT |
| `packs/ja/ja-words.tsv.gz` ほか | 日本語の読みの辞書（一般の語・人名・地名・会社や作品など） | UniDic（BSD）・SudachiDict（Apache-2.0）・mecab-ipadic-NEologd（Apache-2.0）に基づく。郵便番号データは日本郵便が著作権を主張していないもの。全文は `packs/licenses/` |
| `packs/louis/` | liblouis 3.39.0 の WebAssembly 版と点字の表 | LGPL-2.1 以降（`packs/licenses/liblouis-COPYING.LESSER.txt`）。ソースは `packs/src/liblouis-3.39.0-src.tar.gz`、作り方は main ブランチの `tools/build-liblouis.sh` |

日本語の辞書の1行は「見出し・読み・発音・品詞（N 普通名詞・P 人名・L 地名・O 組織・G 固有名詞）・ほかの読み・種類・点数」のタブ区切りで、見出しの順に並んでいます。
エディタに入っている辞書（IPA辞書）と読みが違う語・ない語だけを集め、公式の点字データに出てくる読みで確かめたもので、点字データそのものは入っていません。
作り方は main ブランチの `tools/dict/README.md` を見てください。

## 謝辞

- UniDic：国立国語研究所
- SudachiDict：株式会社ワークスアプリケーションズ（UniDic と NEologd を含む）
- mecab-ipadic-NEologd：佐藤敏紀（はてなキーワード、日本郵便の郵便番号データ、スナフキん氏の日本全国駅名一覧、工藤拓氏の人名データを含む）
- 日本郵便株式会社：郵便番号データ
- liblouis：The liblouis contributors

# 大きな辞書から「漢字を含む語：読み」を取り出して、共通の形（TSV）にする
# 出力: 見出し \t 読み（カタカナ） \t 発音 \t 品詞（N 普通名詞 / P 人名 / L 地名 / O 組織 / G 固有名詞その他 / V 用言 / X その他） \t コスト \t 出典
import csv, sys, re, unicodedata, io, zipfile
import os
D = os.environ.get('TENJI_WORK', './work/') + 'bigdict/'
KANJI = re.compile(r'[一-鿿々〆ヶ㐀-䶿豈-鶴]')
KATA = re.compile(r'^[ァ-ヺー]+$')
out = open(D + 'cands.tsv', 'w', encoding='utf-8')
n = {}
def put(surf, read, pron, pos, cost, src):
    if not surf or len(surf) > 16 or not KANJI.search(surf): return
    if not read or not KATA.match(read): return
    if pron and not KATA.match(pron): pron = ''
    if re.search(r'[\t\n]', surf): return
    out.write(f'{surf}\t{read}\t{pron}\t{pos}\t{cost}\t{src}\n'); n[src] = n.get(src, 0) + 1
def tag(p1, p2, p3, p4=''):
    if p1 == '名詞' or p1 == '代名詞':
        if p2 == '固有名詞':
            if p3 == '人名': return 'P'
            if p3 == '地名' or p3 == '地域': return 'L'
            if p3 == '組織': return 'O'
            return 'G'
        return 'N'
    if p1 in ('動詞', '形容詞', '形状詞', '形容動詞', '副詞'): return 'V'
    return 'X'
# UniDic: 見出し \t コスト \t 素性（0-3 品詞, 9 発音, 20 仮名形）
for line in open(D + 'unidic_entries.tsv', encoding='utf-8'):
    s, cost, f = line.rstrip('\n').split('\t', 2)
    f = f.split(',')
    if len(f) < 21: continue
    put(s, f[20], f[9], tag(f[0], f[1], f[2]), cost, 'U')
# Sudachi: 0 見出し(トライ用) 3 コスト 4 見出し 5-10 品詞 11 読み
for fn in ('small_lex.csv', 'core_lex.csv', 'notcore_lex.csv'):
    for row in csv.reader(open(D + 'sudachi/' + fn, encoding='utf-8')):
        if len(row) < 12: continue
        put(row[4], row[11], '', tag(row[5], row[6], row[7]), row[3], 'S')
# NEologd（IPA 形式）: 0 見出し 3 コスト 4-9 品詞 11 読み 12 発音
import glob
for fn in glob.glob(D + 'neo/*.csv'):
    if 'quantity' in fn or 'date-time' in fn or 'ill-formed' in fn or 'interjection' in fn: continue
    for row in csv.reader(open(fn, encoding='utf-8')):
        if len(row) < 13: continue
        put(row[0], row[11], row[12], tag(row[4], row[5], row[6]), row[3], 'E')
# 日本郵便：住所（市区町村・町域）
def z2k(s):
    s = unicodedata.normalize('NFKC', s)
    return s
with zipfile.ZipFile(D + 'jp_utf_ken_all.zip') as z:
    name = z.namelist()[0]
    for row in csv.reader(io.TextIOWrapper(z.open(name), encoding='utf-8')):
        if len(row) < 9: continue
        city_k, town_k, city, town = z2k(row[4]), z2k(row[5]), row[7], row[8]
        put(city, city_k, '', 'L', 0, 'J')
        if '（' in town or '以下に掲載がない場合' in town or 'の次に番地がくる場合' in town or '一円' in town: continue
        put(town, town_k, '', 'L', 0, 'J')
with zipfile.ZipFile(D + 'jp_jigyosyo.zip') as z:
    name = z.namelist()[0]
    for row in csv.reader(io.TextIOWrapper(z.open(name), encoding='cp932')):
        if len(row) < 3: continue
        put(row[2].strip(), z2k(row[1]).replace(' ', ''), '', 'O', 0, 'K')
out.close()
print(n)

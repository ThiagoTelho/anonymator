# Gera src/data/first-names.txt a partir do dataset "genero-nomes" do Brasil.io (Censo 2010 do IBGE).
# Uso: python3 scripts/build-first-names.py caminho/para/nomes.csv
# Fonte: https://data.brasil.io/dataset/genero-nomes/nomes.csv.gz
# Saída: um nome por linha, minúsculo e sem acento, em ordem alfabética.
import csv, sys, unicodedata

def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()

names = {fold(r["first_name"]) for r in csv.DictReader(open(sys.argv[1], encoding="utf-8")) if r["first_name"]}
with open("src/data/first-names.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(sorted(names)) + "\n")
print(f"{len(names)} nomes gravados em src/data/first-names.txt")

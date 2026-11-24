# Dados

## `first-names.txt`

Primeiros nomes registrados no **Censo 2010 do IBGE**, um por linha, em minúsculas e sem acentos
(100.787 nomes). Usado para sugerir nomes de pessoas no documento.

- Origem: dataset [genero-nomes](https://brasil.io/dataset/genero-nomes/) do Brasil.io, compilado a partir
  da API de nomes do IBGE (`https://data.brasil.io/dataset/genero-nomes/nomes.csv.gz`).
- Regerar: `python3 scripts/build-first-names.py nomes.csv`.
- Limitação: pessoas nascidas depois de 2010 e nomes muito raros podem não estar na lista.
  O IBGE publicou em 2025 os nomes **e sobrenomes** do Censo 2022 ("Nomes no Brasil"); quando houver
  um arquivo para download, a lista deve ser trocada por ele.
- Licença: os dados de nomes são do IBGE (dados públicos); o Brasil.io publica seus datasets com atribuição.
  Pendente confirmar os termos exatos do dataset antes da publicação do site.

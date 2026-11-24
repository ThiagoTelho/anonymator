# Anonymator

Aplicação web que anonimiza dados pessoais de PDFs de processos (judiciais e do Ministério Público)
**inteiramente no navegador**, para que advogados possam usar ferramentas de IA sem enviar dados pessoais
das partes para fora da própria máquina.

O resultado é um PDF com o mesmo layout do original, em que cada dado pessoal foi **removido de verdade**
do conteúdo da página e substituído por um marcador consistente (`[PESSOA_1]`, `[CPF_2]`…). Também são
gerados o texto anonimizado (`.txt`) e uma tabela de correspondência marcador → dado original, que fica
só com o usuário — e com ela o app devolve os dados reais à resposta da IA, também localmente.

> **Estado:** pré-lançamento. Ainda não há versão publicada. Todos os testes usam documentos fictícios.

## O que é removido

| Grupo | Dados |
|---|---|
| Pessoas e empresas | Nomes sugeridos automaticamente (e revisados pelo usuário) ou digitados; grafias variantes, "Sr. Sobrenome", apelidos, iniciais (R.A.M.); razões sociais e nomes curtos de empresas |
| Documentos | CPF, CNPJ (inclusive alfanumérico) e PIS (com dígito verificador), RG, CNH, CTPS, título de eleitor (zona e seção), OAB, RENAVAM, placa |
| Contato e endereço | Telefone, e-mail, endereço (logradouro, número, complementos, bairro), CEP |
| Dados bancários | Agência, conta, chave PIX aleatória |
| Outros | Data de nascimento, escola, CIF/matrícula, registro de sociedade de advogados |
| Referências do caso | Números de processo (CNJ e MPU/MPT), protocolo, inquérito policial, BO, RAI, ordem de serviço, auto de infração, códigos de verificação e identificadores de URLs de validação |

Agentes públicos (juiz, procurador, promotor, auditor, delegado, servidor) são sugeridos, mas vêm desmarcados.
Cidade/UF, datas comuns, valores, números de lei, portaria e TAC continuam no texto.

## Como funciona

```
PDF ──► extrair texto + posição de cada caractere (MuPDF), reconstruindo linhas e parágrafos
          │
          ├─► sugerir pessoas e empresas (primeiros nomes do IBGE + regras) → o usuário revisa
          │
          ├─► localizar: nomes escolhidos + detectores de padrão
          │
          ├─► marcar áreas de remoção (anotações Redact) e aplicar a remoção
          │     • o texto sob a área é apagado do fluxo de conteúdo
          │     • pixels de imagens sob a área são apagados
          │
          ├─► escrever o marcador no lugar, encaixado no espaço do dado: comprime na horizontal,
          │     reduz a fonte até um mínimo legível ou usa a forma curta ([P5] = [PESSOA_5]),
          │     explicada numa página de legenda no fim do PDF
          │
          └─► limpar metadados, XMP, marcadores, anexos, formulários e anotações
                └─► salvar com coleta de lixo (objetos antigos não ficam no arquivo)
```

Todo o processamento roda num Web Worker com o [MuPDF](https://mupdf.com/) compilado para WebAssembly.

### Garantia de que nada sai do navegador

O build de produção injeta uma Content Security Policy no `index.html` com `connect-src 'self'`
e `form-action 'none'`: a página só consegue buscar os próprios arquivos do site (o `.wasm` do MuPDF)
e não consegue enviar dados para nenhum outro endereço. Não há backend, analytics nem chamadas a terceiros.

## Estrutura

**Aplicação**

| Caminho | Conteúdo |
|---|---|
| `src/core/text.ts` | Extração do texto com a posição de cada caractere; reconstrói linhas visuais (texto justificado partido) e parágrafos pela geometria |
| `src/core/detectors.ts` | Detectores determinísticos de dados com formato fixo, endereços e busca de nomes (ignora maiúsculas, acentos, quebras de linha; pronome de tratamento fica no texto) |
| `src/core/names.ts` | Sugestão de pessoas e empresas, agrupamento de grafias, apelidos, agentes públicos, exclusão de lugares |
| `src/core/anonymize.ts` | Motor: localização, remoção, marcadores, legenda e limpeza do arquivo |
| `src/core/labels.ts` | Encaixe legível do marcador (compressão, fonte mínima, forma curta) |
| `src/core/people.ts` | Junta as sugestões marcadas e os nomes digitados |
| `src/core/diagnose.ts` | Diagnóstico antes de anonimizar: páginas escaneadas, texto ilegível, imagens grandes, assinatura digital, senha |
| `src/core/leaks.ts` | Verificação independente: reabre o PDF gerado e procura os dados originais (mostrada na tela como verificação final) |
| `src/core/summary.ts` | Resumo do que foi removido, por tipo |
| `src/core/restore.ts` | Reversão: devolve os dados reais a um texto com marcadores (a resposta da IA), com a tabela de correspondência |
| `src/core/errors.ts` | Mensagens de erro claras (não é PDF, PDF danificado, senha, falta de memória) |
| `src/data/first-names.txt` | Primeiros nomes do Censo 2010 do IBGE (veja `src/data/README.md`) |
| `src/worker.ts` | Web Worker que executa análise e anonimização fora da thread da interface |
| `src/App.tsx` | Interface (React + Tailwind) |

**Testes e ferramentas**

| Caminho | Conteúdo |
|---|---|
| `tests/` | Testes (Vitest) |
| `fixtures/` | PDFs fictícios, cada um com um `.json` dizendo o que deve sumir e o que deve ficar |
| `fixtures/src/` | Fontes HTML das fixtures e gabaritos independentes (`*.truth.json`) |
| `fixtures/layouts-mpt/` | **Só local (no `.gitignore`)**: 50 processos fictícios do MPT com layouts variados e gabarito estruturado |
| `scripts/make-fixture.mjs` | Gera os PDFs de `fixtures/` a partir de `fixtures/src/*.html` |
| `scripts/truth-to-spec.py` | Converte um gabarito independente no `.json` da fixture |
| `scripts/eval-dataset.ts` | Relatório por categoria num conjunto com gabarito: vazamentos, apagamento em excesso, falsos positivos |
| `scripts/preview-fixture.ts` | Anonimiza uma fixture como o usuário faria e grava PDF, texto e imagem de uma página em `out/` |
| `scripts/diagnose.ts` | Diagnóstico de PDFs **reais** sem expor conteúdo: só estatísticas (páginas, avisos, contagens por tipo, tempos, memória) |
| `scripts/verify.ts` | Anonimiza uma fixture com os nomes do `.json` e grava a saída em `out/` |
| `scripts/build-first-names.py` | Regera a lista de primeiros nomes |

## Desenvolvimento

Requer Node 22.18+ (para executar TypeScript direto) e pnpm.

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
pnpm test
```

```bash
pnpm build
```

`pnpm build` faz o type-check, roda os testes e só então gera o build de produção (com a CSP).

| Comando | O que faz |
|---|---|
| `pnpm preview` | Serve o build de produção localmente |
| `pnpm test:e2e` | Testes de interface (Playwright) contra o build de produção; na primeira vez: `pnpm exec playwright install chromium` |
| `pnpm fixture` | Regera os PDFs de `fixtures/` |
| `pnpm verify [fixture.pdf]` | Anonimiza uma fixture e grava a saída em `out/` |
| `pnpm preview:fixture <nome> <página>` | Anonimiza como o usuário faria e grava PDF, texto e imagem em `out/` |
| `node scripts/eval-dataset.ts <pasta> --misses` | Avalia um conjunto com gabarito estruturado |
| `pnpm diagnose <arquivo.pdf \| pasta> [--senha=…] [--json]` | Diagnóstico de PDFs reais, só estatísticas, seguro para compartilhar |

## Testes

Todo avanço do projeto vem acompanhado de testes, no mesmo commit (regra completa no `CLAUDE.md`).

- **Detectores** (`tests/detectors.test.ts`), **extração** (`tests/text.test.ts`), **sugestões** (`tests/names.test.ts`),
  **marcadores** (`tests/labels.test.ts`), **seleção** (`tests/people.test.ts`) e **motor** (`tests/anonymize.test.ts`,
  com PDFs fictícios gerados em memória). Sempre testando também o que **não** pode ser removido.
- **Fixtures** (`tests/fixtures.test.ts`): roda o motor em cada PDF de `fixtures/` e confere, pelo `.json`, as
  sugestões esperadas, o que precisa sumir (`mustRemove`), o que precisa ficar (`mustKeep`) e lacunas conhecidas
  (`knownGaps`, que avisam quando passam a ser cobertas).
- **Gabaritos independentes**: `reclamacao-trt`, `alimentos-esaj`, `denuncia-criminal` e `procuracao-contrato` foram
  escritos, com gabarito, por quem não conhecia as regras do detector, para o teste não ser moldado pela implementação.
  O teste rejeita sugestões fora do gabarito e partes marcadas como agente público.
- **Variação de layout** (`tests/dataset.test.ts`, conjunto só local, pulado sem a pasta): 50 processos fictícios do MPT
  com fontes, papel, corpo, alinhamento, colunas, tabelas, formatos de data e moeda, máscaras e marca d'água variados.
  Hoje: 100% dos 2.625 dados pessoais removidos e nenhum dos 450 itens não pessoais conferidos apagado.
- **Interface** (`e2e/`, Playwright, contra o build de produção com a CSP): fluxo completo com sugestões,
  desmarcação e PDF baixado conferido; nome digitado à mão; página escaneada; PDF com senha; arquivo que não é PDF;
  progresso e cancelamento num processo grande; restauração da resposta da IA; e privacidade — CSP presente,
  **nenhuma requisição fora da origem e nenhuma violação de CSP** durante todo o fluxo.

**Nunca use processos reais em testes ou fixtures do repositório.** Só documentos fictícios, com dados inventados.

## Limitações conhecidas

- **PDFs escaneados não são suportados.** Páginas sem texto legível (escaneadas ou com fonte sem mapa de
  caracteres) são **avisadas** antes e depois de anonimizar, com o número da página, e a verificação final diz que
  elas não puderam ser conferidas. Páginas com imagem grande também geram aviso.
- PDFs com senha são abertos com a senha informada; o PDF anonimizado sai sem senha. Assinatura digital gera aviso
  (ela deixa de valer).
- A sugestão de nomes usa os primeiros nomes do Censo 2010: nomes muito raros ou de pessoas nascidas depois de 2010
  podem não ser sugeridos. Por isso o usuário sempre revisa e pode acrescentar nomes.
- Endereços só são detectados a partir do tipo de logradouro (Rua, Av., Rodovia…) com número, complemento ou bairro.
- Revise sempre o resultado: nenhuma ferramenta automática garante a remoção de todos os dados pessoais.
  Dados indiretos (datas, profissão, local de trabalho, fatos muito específicos) também podem identificar alguém.
  E, com a tabela de correspondência guardada, o resultado é **pseudonimização** (ainda dado pessoal na LGPD).

## Licença

[AGPL-3.0-or-later](LICENSE), a mesma do MuPDF, do qual este projeto depende.

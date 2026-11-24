# Anonymator

Aplicação web que anonimiza dados pessoais de PDFs de processos judiciais (nomes, CPF, CNPJ, e-mail,
telefone, CEP, OAB, número do processo) **inteiramente no navegador**, para que advogados possam usar
ferramentas de IA sem enviar dados pessoais das partes para fora da própria máquina.

O resultado é um PDF com o mesmo layout do original, em que cada dado pessoal foi **removido de verdade**
do conteúdo da página e substituído por um marcador consistente (`[PESSOA_1]`, `[CPF_2]`…). Também são
gerados o texto anonimizado (`.txt`) e uma tabela de correspondência marcador → dado original, que fica
só com o usuário.

## Como funciona

```
PDF ──► extrair texto + posição de cada caractere (MuPDF)
          │
          ├─► localizar: nomes declarados pelo usuário + detectores de padrão
          │
          ├─► marcar áreas de remoção (anotações Redact) e aplicar a remoção
          │     • o texto sob a área é apagado do fluxo de conteúdo
          │     • pixels de imagens sob a área são apagados
          │
          ├─► escrever o marcador no lugar (novo fluxo de conteúdo, fonte Helvetica)
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

| Caminho | Conteúdo |
|---|---|
| `src/core/detectors.ts` | Detectores determinísticos (CPF, CNPJ e PIS com dígito verificador, CTPS, e-mail, telefone, CEP, OAB, data de nascimento, nº CNJ e do MPU/MPT, CIF/matrícula, códigos de verificação, rastreio dos Correios) e busca de nomes ignorando maiúsculas, acentos e quebras de linha |
| `src/core/names.ts` | Sugestão de pessoas (primeiro nome do IBGE + sobrenomes) e empresas (sufixo societário), com agrupamento de grafias e marcação de agentes públicos |
| `src/core/people.ts` | Junta as sugestões marcadas pelo usuário e os nomes digitados à mão |
| `src/data/first-names.txt` | Primeiros nomes do Censo 2010 do IBGE (veja `src/data/README.md`) |
| `src/core/anonymize.ts` | Motor de anonimização sobre o MuPDF: localização, remoção, marcadores e limpeza do arquivo |
| `src/worker.ts` | Web Worker que executa o motor fora da thread da interface |
| `src/App.tsx` | Interface (React + Tailwind) |
| `src/core/leaks.ts` | Verificação independente: reabre o PDF gerado e procura os dados originais |
| `tests/` | Testes automatizados (Vitest) do motor, dos detectores e das fixtures |
| `fixtures/` | PDFs fictícios (só dados inventados), cada um com um `.json` dizendo o que deve sumir e o que deve ficar |
| `scripts/make-fixture.mjs` | Gera o PDF fictício no estilo do PJe |
| `scripts/verify.ts` | Anonimiza uma fixture e grava a saída em `out/` para inspeção manual |

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

`pnpm build` faz o type-check, roda os testes e só então gera o build de produção.
`pnpm verify [fixture.pdf]` grava em `out/` o PDF anonimizado, o texto e a tabela de correspondência,
para inspeção visual.

## Testes

Todo avanço do projeto vem acompanhado de testes, no mesmo commit:

- **Detectores** (`tests/detectors.test.ts`): validação de CPF/CNPJ, padrões, busca de nomes.
- **Motor** (`tests/anonymize.test.ts`): gera PDFs fictícios em memória e confere remoção real,
  preservação do texto ao redor, marcadores consistentes, opções e limpeza de metadados e anexos.
- **Sugestão de nomes** (`tests/names.test.ts`): pessoas, empresas, agentes públicos e falsos positivos
  (logradouros, leis, cabeçalhos).
- **Fixtures** (`tests/fixtures.test.ts`): roda o motor em cada PDF de `fixtures/` e confere, pelo `.json`
  ao lado, as sugestões exatas esperadas, o que precisa sumir (`mustRemove`), o que precisa ficar (`mustKeep`)
  e as lacunas conhecidas (`knownGaps`, que avisam quando passarem a ser cobertas). Para cobrir um novo
  tipo de documento, basta adicionar o par `.pdf` + `.json`.
- **Interface**: testes end-to-end (Playwright, contra o build com CSP) entram junto com a tela de revisão.

**Nunca use processos reais em testes ou fixtures do repositório.** Só documentos fictícios, com dados inventados.

## Limitações conhecidas

- PDFs escaneados (sem camada de texto) não são suportados.
- A sugestão de nomes depende da lista de primeiros nomes do Censo 2010: nomes muito raros ou de pessoas
  nascidas depois de 2010 podem não ser sugeridos. Por isso o usuário sempre revisa e pode acrescentar nomes.
- Endereços, números de protocolo, ordens de serviço e autos de infração ainda não são detectados.
- Revise sempre o resultado: nenhuma ferramenta automática garante a remoção de 100% dos dados pessoais.
  Dados indiretos (datas, profissão, local de trabalho, fatos muito específicos) também podem identificar alguém.

## Licença

[AGPL-3.0-or-later](LICENSE), a mesma do MuPDF, do qual este projeto depende.

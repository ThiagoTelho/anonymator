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
| `src/core/detectors.ts` | Detectores determinísticos (CPF e CNPJ com dígito verificador, e-mail, telefone, CEP, OAB, nº CNJ) e busca de nomes ignorando maiúsculas, acentos e quebras de linha |
| `src/core/anonymize.ts` | Motor de anonimização sobre o MuPDF: localização, remoção, marcadores e limpeza do arquivo |
| `src/worker.ts` | Web Worker que executa o motor fora da thread da interface |
| `src/App.tsx` | Interface (React + Tailwind) |
| `scripts/make-fixture.mjs` | Gera um PDF fictício no estilo do PJe para testes, só com dados inventados |
| `scripts/verify.ts` | Anonimiza o PDF fictício e confere, reabrindo o resultado, que nenhum dado original sobrou |

## Desenvolvimento

Requer Node 22.18+ (para executar TypeScript direto) e pnpm.

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
pnpm verify
```

```bash
pnpm build
```

`pnpm verify` grava em `out/` o PDF anonimizado, o texto e a tabela de correspondência, e termina com
erro se algum dado original ainda puder ser extraído do PDF gerado.

**Nunca use processos reais em testes ou fixtures do repositório.** Use `pnpm fixture` para gerar
documentos fictícios.

## Limitações conhecidas

- PDFs escaneados (sem camada de texto) não são suportados.
- A detecção de nomes depende da lista declarada pelo usuário; a sugestão automática de nomes ainda não existe.
- Endereços ainda não são detectados automaticamente.
- Revise sempre o resultado: nenhuma ferramenta automática garante a remoção de 100% dos dados pessoais.
  Dados indiretos (datas, profissão, local de trabalho, fatos muito específicos) também podem identificar alguém.

## Licença

[AGPL-3.0-or-later](LICENSE), a mesma do MuPDF, do qual este projeto depende.

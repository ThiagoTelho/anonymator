# Anonymator — instruções para agentes

Web app que anonimiza dados pessoais de PDFs de processos judiciais inteiramente no navegador.
Visão geral e arquitetura: [README.md](README.md). Plano de implementação: `ROADMAP.md` (local, fora do git).

## Regra principal: todo avanço vem com testes

Nenhuma funcionalidade, correção ou mudança de comportamento entra sem testes que a cubram, no mesmo commit.

- **Motor e detectores** (`src/core/`): testes em `tests/*.test.ts` (Vitest). Cubra o caso feliz, os casos de
  borda e, principalmente, o que **não** deve ser removido (falsos positivos importam tanto quanto vazamentos).
- **Correção de bug**: primeiro um teste que reproduz o bug e falha; depois a correção.
- **Novo tipo de documento** (ex.: layout de outro tribunal ou órgão): adicione uma fixture fictícia
  em `fixtures/` com o `.json` ao lado (veja o cabeçalho de `tests/fixtures.test.ts`).
- **Conjuntos com gabarito estruturado** (ex.: `fixtures/layouts-mpt/`, que fica **só na máquina local**: está no
  `.gitignore` e nunca deve ir para o remoto, nem valores copiados dele para testes commitados): `node scripts/eval-dataset.ts <pasta> --misses`
  mostra a remoção por categoria e cada vazamento com contexto; `tests/dataset.test.ts` exige 100% e zero
  apagamento em excesso. Novos conjuntos de outros órgãos devem seguir o mesmo caminho.
- **Interface**: toda mudança de tela vem com teste em `e2e/app.spec.ts` (Playwright, contra o build de produção
  com a CSP). O teste de privacidade (nenhuma requisição fora da origem e nenhuma violação de CSP) nunca pode ser
  afrouxado. Lógica de tela que puder ser pura vai para `src/core/` e ganha teste Vitest.
- Antes de commitar: `pnpm test`, `pnpm lint`, `pnpm build` (o build também roda os testes) e, se a interface
  mudou, `pnpm test:e2e`.
- Ao mudar algo que um teste cobre, atualize o teste junto. Nunca apague ou enfraqueça um teste para fazê-lo passar
  sem explicar o motivo no commit.

## Privacidade (inegociável)

- **Nunca** coloque PDFs reais, nem trechos deles, em fixtures, testes, commits, issues ou conversas.
  Use só documentos fictícios com dados inventados (CPFs e CNPJs válidos podem ser gerados).
- PDFs reais só são examinados pelo autor, na máquina dele, com `pnpm diagnose` (que não imprime conteúdo nem nome
  de arquivo). Ao pedir ajuda com um problema real, peça a saída do diagnóstico e reproduza o caso numa fixture fictícia.
- Nada pode sair do navegador: sem backend, analytics, fontes ou scripts de terceiros. A CSP em
  `vite.config.ts` (`connect-src 'self'`) precisa continuar valendo; não a afrouxe.

## Convenções

- Código e comentários em português; nomes de identificadores em inglês.
- `ROADMAP.md` está no `.gitignore`: atualize-o ao concluir etapas, mas nunca o commite.
- MuPDF é AGPL; o projeto inteiro é AGPL-3.0-or-later.
- Publicação: só por tag `vX.Y.Z` (workflow `deploy.yml`). **Criar e enviar tag, ativar o Pages ou mudar DNS/domínio
  exige pedido explícito do autor** a cada vez. Ao preparar uma versão: atualizar `version` no `package.json` e o
  `CHANGELOG.md`.
- Textos legais e de privacidade ficam em `src/ui/Pages.tsx`; se o app passar a fazer algo novo com dados, atualize-os
  no mesmo commit.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento (sem CSP) |
| `pnpm test` | Testes (Vitest) |
| `pnpm test:watch` | Testes em modo observação |
| `pnpm test:e2e` | Testes de interface (Playwright) contra o build de produção |
| `pnpm lint` | Oxlint |
| `pnpm build` | Type-check + testes + build de produção (com CSP) |
| `pnpm fixture` | Regera os PDFs de `fixtures/` a partir de `fixtures/src/*.html` |
| `pnpm preview` | Serve o build de produção (para testar com a CSP) |
| `pnpm preview:fixture <nome> <página>` | Anonimiza uma fixture como o usuário faria e grava em `out/` |
| `node scripts/eval-dataset.ts <pasta> --misses` | Avalia um conjunto com gabarito estruturado |
| `pnpm diagnose <pdf\|pasta> [--senha=…]` | Diagnóstico de PDFs reais sem conteúdo (o autor roda e compartilha) |
| `pnpm verify [pdf]` | Anonimiza um PDF fictício e grava a saída em `out/` para inspeção |

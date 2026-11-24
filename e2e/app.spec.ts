import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { extractText } from "../src/core/leaks.ts";

const TMP = "e2e/.tmp";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");

/** Etapa 1: escolhe o PDF e espera a leitura. */
async function choose(page: Page, path: string) {
  await page.locator("#pdf").setInputFiles(path);
}

/** Etapas 1 → 2: escolhe o PDF e abre a revisão. */
async function review(page: Page, path: string) {
  await choose(page, path);
  await page.getByRole("button", { name: "Revisar o que será removido" }).click({ timeout: 60_000 });
  await expect(page.getByRole("list", { name: "Lista de pessoas e empresas" })).toBeVisible();
}

/** Etapa 2 → 3. */
async function anonymize(page: Page) {
  await page.getByRole("button", { name: "Anonimizar", exact: true }).click();
  await expect(page.getByTestId("verificacao")).toBeVisible({ timeout: 30_000 });
}

async function downloadBytes(page: Page, button: string): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button }).click()]);
  return new Uint8Array(readFileSync((await download.path())!));
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
});

test("fluxo completo nas quatro etapas: revisão, PDF baixado sem os dados e restauração", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Revisão/ })).toHaveAttribute("aria-disabled", "true");
  await choose(page, "fixtures/alimentos-esaj.pdf");
  await expect(page.getByRole("region", { name: "Leitura do documento" })).toContainText("Páginas");
  await page.getByRole("button", { name: "Revisar o que será removido" }).click();

  // Agentes públicos vêm desmarcados; partes vêm marcadas. O usuário desmarca a advogada.
  await expect(page.getByRole("checkbox", { name: "Lívia Montenegro Saraiva" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Diego Henrique Medeiros" })).toBeChecked();
  await page.getByRole("checkbox", { name: "TAINA HOLANDA REIS" }).uncheck();

  await anonymize(page);
  await expect(page.getByTestId("verificacao")).toContainText("nenhum dos dados substituídos pôde ser encontrado");
  await expect(page.getByRole("button", { name: /Resultado/ })).toHaveAttribute("aria-current", "step");

  const pdf = norm(extractText(await downloadBytes(page, "Baixar PDF anonimizado")));
  expect(pdf).not.toContain("diego henrique medeiros");
  expect(pdf).not.toContain("ravi alcantara medeiros");
  expect(pdf).toContain("livia montenegro saraiva");
  expect(pdf).toContain("taina holanda reis");

  await page.getByRole("button", { name: "Restaurar a resposta da IA" }).click();
  await page.getByLabel("Resposta da IA").fill("O réu [PESSOA_1] deve pagar alimentos.");
  await expect(page.getByTestId("restaurados")).toContainText("1 marcador restaurado");
  expect(await page.getByLabel("Texto restaurado").inputValue()).not.toContain("[PESSOA_1]");
});

test("pré-visualização mostra o que será removido e acompanha as escolhas", async ({ page }) => {
  await review(page, "fixtures/peticao-ficticia.pdf");
  await expect(page.getByRole("img", { name: "Página 1" })).toBeVisible();
  const removed = page.getByTestId("destaque-removido");
  await expect(removed.first()).toBeVisible();
  const before = await removed.count();

  // Desligar um tipo de dado: o CEP deixa de ser removido e aparece como mantido.
  await page.getByRole("button", { name: /^CEP/ }).click();
  await expect(page.getByRole("button", { name: /^CEP/ })).toHaveAttribute("aria-pressed", "false");
  await expect(removed).toHaveCount(before - 1);
  await expect(page.getByTestId("destaque-mantido")).toHaveCount(1);

  // Desmarcar uma pessoa: os destaques dela passam a tracejado.
  await page.getByRole("checkbox", { name: "Carlos Eduardo Ferreira" }).uncheck();
  await expect(page.getByRole("button", { name: "Carlos Eduardo Ferreira: não será removido" }).first()).toBeVisible();

  // Clicar num destaque abre a pessoa correspondente na lista.
  await page.getByRole("button", { name: "João Pedro Almeida: será removido" }).first().click();
  await expect(page.getByRole("button", { name: "Grafias de João Pedro Almeida" })).toHaveAttribute("aria-expanded", "true");
});

test("revisão mostra o marcador que vai substituir cada pessoa, igual ao do resultado", async ({ page }) => {
  await review(page, "fixtures/peticao-ficticia.pdf");
  const row = (name: string) => page.getByRole("listitem").filter({ has: page.getByRole("checkbox", { name }) });
  const tag = (name: string) => row(name).getByTestId("marcador");
  const label = async (name: string) => (await tag(name).textContent())!.replace("→", "").trim();

  // Numeração pela ordem de aparição: Maria, Carlos (advogado), João.
  await expect(tag("Maria Aparecida dos Santos Oliveira")).toHaveText("→ [PESSOA_1]");
  await expect(tag("Carlos Eduardo Ferreira")).toHaveText("→ [PESSOA_2]");
  await expect(tag("João Pedro Almeida")).toHaveText("→ [PESSOA_3]");

  // Desmarcar Carlos: ele fica "mantido" e João passa a ser [PESSOA_2], como no PDF final.
  await page.getByRole("checkbox", { name: "Carlos Eduardo Ferreira" }).uncheck();
  await expect(row("Carlos Eduardo Ferreira")).toContainText("mantido");
  await expect(tag("João Pedro Almeida")).toHaveText("→ [PESSOA_2]");

  // Digitada e ausente do documento: "não encontrado".
  await page.getByLabel("Nova pessoa").fill("Pessoa Que Não Está No Documento");
  await page.getByRole("button", { name: "Acrescentar" }).click();
  await expect(row("Pessoa Que Não Está No Documento")).toContainText("não encontrado");

  // A dica do destaque na página também traz o marcador.
  const mariaLabel = await label("Maria Aparecida dos Santos Oliveira");
  const joaoLabel = await label("João Pedro Almeida");
  await expect(page.getByRole("button", { name: `João Pedro Almeida: será removido como ${joaoLabel}` }).first()).toBeVisible();

  // E o resultado usa exatamente esses marcadores.
  await anonymize(page);
  const txt = new TextDecoder().decode(await downloadBytes(page, "Baixar texto para a IA"));
  expect(txt).toContain(`${mariaLabel}, brasileira`);
  expect(txt).toContain(`O sócio ${joaoLabel}`);
  expect(txt).toContain("Carlos Eduardo Ferreira");
});

test("editar a lista: remover e acrescentar grafia, nome digitado e juntar pessoas", async ({ page }) => {
  await review(page, "fixtures/peticao-ficticia.pdf");
  const maria = "Maria Aparecida dos Santos Oliveira";
  const variants = page.getByRole("list", { name: `Grafias procuradas de ${maria}` });
  // A sugestão já liga "Sra. Oliveira" a Maria: remove e acrescenta de novo.
  await page.getByRole("button", { name: `Grafias de ${maria}` }).click();
  await expect(variants).toContainText("Sra. Oliveira");
  await page.getByRole("button", { name: "Remover Sra. Oliveira" }).click();
  await expect(variants).not.toContainText("Sra. Oliveira");
  await page.getByLabel(`Nova grafia de ${maria}`).fill("Sra. Oliveira");
  await page.getByRole("button", { name: "+ grafia" }).click();
  await expect(variants).toContainText("Sra. Oliveira");

  // Nome digitado à mão ("Goiânia", só para o teste) e depois juntado com João.
  await page.getByLabel("Nova pessoa").fill("Goiânia");
  await page.getByRole("button", { name: "Acrescentar" }).click();
  await expect(page.getByRole("checkbox", { name: "Goiânia" })).toBeChecked();
  await page.getByRole("button", { name: "Grafias de João Pedro Almeida" }).click();
  await page.getByLabel("Juntar João Pedro Almeida com").selectOption({ label: "Goiânia" });
  await expect(page.getByRole("checkbox", { name: "Goiânia" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Grafias procuradas de João Pedro Almeida" })).toContainText("Goiânia");

  await anonymize(page);
  const txt = new TextDecoder().decode(await downloadBytes(page, "Baixar texto para a IA"));
  expect(norm(txt)).not.toMatch(/oliveira|almeida|goiania/);
  expect(txt).toMatch(/Sra\. \[PESSOA_\d+\]/);
  // Goiânia virou grafia de João: mesmo marcador que ele.
  const joao = /O Sr\. (\[PESSOA_\d+\])/.exec(txt)![1];
  expect(txt).toContain(`${joao}, 15 de setembro`);
});

test("selecionar um trecho na página cria uma pessoa nova", async ({ page }) => {
  await review(page, "fixtures/peticao-ficticia.pdf");
  await expect(page.getByRole("img", { name: "Página 1" })).toBeVisible();
  const words = page.getByTestId("palavra");
  const texts = await page.evaluate(() => [...document.querySelectorAll('[data-testid="palavra"]')].length);
  expect(texts).toBeGreaterThan(20);
  // "brasileira," não está em nenhum destaque (destaques ficam por cima das palavras).
  const target = words.nth(await findWord(page, "brasileira,"));
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.up();
  const group = page.getByRole("group", { name: "Trecho selecionado" });
  await expect(group).toContainText("brasileira");
  await group.getByRole("button", { name: "Nova pessoa" }).click();
  // A pontuação final é descartada; o trecho vira pessoa marcada e passa a ser destacado na página.
  await expect(page.getByRole("checkbox", { name: "brasileira" })).toBeChecked();
  await expect(page.getByRole("button", { name: "brasileira: será removido" })).toBeVisible();
});

/** Índice da palavra da pré-visualização cujo texto é `text` (lido do worker via o título da imagem). */
async function findWord(page: Page, text: string): Promise<number> {
  // As palavras não têm texto visível; o teste reconstrói a ordem pela mesma extração do PDF.
  const { previewPage } = await import("../src/core/preview.ts");
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(readFileSync("fixtures/peticao-ficticia.pdf"), "application/pdf");
  const p = previewPage(doc, 0, { people: [], selected: [] }, 1);
  const i = p.words.findIndex((w) => w.text === text);
  expect(i, `palavra ${text}`).toBeGreaterThanOrEqual(0);
  expect(await page.getByTestId("palavra").count()).toBe(p.words.length);
  return i;
}

test("página escaneada é avisada e a verificação final diz que ela não pôde ser conferida", async ({ page }) => {
  await choose(page, `${TMP}/escaneado.pdf`);
  await expect(page.getByRole("list", { name: "Avisos" })).toContainText("página 2");
  await expect(page.getByRole("list", { name: "Avisos" })).toContainText("provavelmente escaneada");
  await page.getByRole("button", { name: "Revisar o que será removido" }).click();
  await anonymize(page);
  await expect(page.getByTestId("verificacao")).toContainText("página 2 não pôde ser verificada");
});

test("PDF com senha: pede a senha, recusa a errada e abre com a certa", async ({ page }) => {
  await choose(page, `${TMP}/senha.pdf`);
  await expect(page.getByText("Este PDF é protegido por senha")).toBeVisible();
  await page.locator("#password").fill("errada");
  await page.getByRole("button", { name: "Abrir" }).click();
  await expect(page.getByText("Senha incorreta")).toBeVisible();
  await page.locator("#password").fill("segredo123");
  await page.getByRole("button", { name: "Abrir" }).click();
  await page.getByRole("button", { name: "Revisar o que será removido" }).click();
  await expect(page.getByRole("img", { name: "Página 1" })).toBeVisible();
  await anonymize(page);
  await expect(page.getByTestId("verificacao")).toContainText("nenhum dos dados");
});

test("arquivo que não é PDF mostra mensagem clara", async ({ page }) => {
  await choose(page, `${TMP}/nao-e-pdf.pdf`);
  await expect(page.getByText("O arquivo escolhido não é um PDF")).toBeVisible();
});

test("processo grande: progresso por página e cancelar volta para a revisão", async ({ page }) => {
  await choose(page, `${TMP}/grande.pdf`);
  await page.getByRole("button", { name: "Revisar o que será removido" }).click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Anonimizar", exact: true }).click();
  const status = page.getByRole("status", { name: "Progresso" });
  await expect(status).toContainText(/página \d+ de \d+/);
  await status.getByRole("button", { name: "Cancelar" }).click();
  await expect(status).toBeHidden();
  await expect(page.getByRole("button", { name: "Anonimizar", exact: true })).toBeVisible();
  await expect(page.getByTestId("verificacao")).toHaveCount(0);
});

test("restaurar com a tabela .json carregada (sem anonimizar nesta sessão)", async ({ page }) => {
  await page.getByRole("button", { name: /Restaurar/ }).click();
  await expect(page.getByTestId("tabela-status")).toContainText("Nenhuma carregada");
  await expect(page.getByText("Carregar tabela (.json)")).toBeVisible();
  await page.locator("#tabela").setInputFiles({
    name: "correspondencia.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ placeholder: "[PESSOA_1]", kind: "PESSOA", originals: ["Ana Souza"], occurrences: 1 }])),
  });
  await expect(page.getByTestId("tabela-status")).toContainText("correspondencia.json · 1 marcador");
  await page.getByLabel("Resposta da IA").fill("[PESSOA_1] e [P1] e PESSOA_1; [PESSOA_99].");
  await expect(page.getByTestId("restaurados")).toContainText("3 marcadores restaurados");
  await expect(page.getByTestId("restaurados")).toContainText("[PESSOA_99]");
  expect(await page.getByLabel("Texto restaurado").inputValue()).toBe("Ana Souza e Ana Souza e Ana Souza; [PESSOA_99].");

  // Arquivo que não é a tabela: mensagem clara.
  await page.locator("#tabela").setInputFiles({ name: "outro.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByText("não é uma tabela de correspondência")).toBeVisible();
});

test("privacidade: CSP ativa, nenhuma requisição fora da origem e nenhuma violação de CSP", async ({ page, baseURL }) => {
  const requests: string[] = [];
  const cspViolations: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  // Tentativa bloqueada pela CSP não vira requisição, mas é um bug: o código tentou enviar algo para fora.
  page.on("console", (m) => {
    if (m.text().includes("Content Security Policy")) cspViolations.push(m.text());
  });
  await page.goto("./");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("form-action 'none'");

  await review(page, "fixtures/reclamacao-trt.pdf");
  await expect(page.getByRole("img", { name: "Página 1" })).toBeVisible();
  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(page.getByRole("img", { name: "Página 2" })).toBeVisible();
  await anonymize(page);
  await downloadBytes(page, "Baixar PDF anonimizado");
  // Páginas do rodapé também não buscam nada fora (links externos só abrem se clicados).
  await page.getByRole("link", { name: "Privacidade" }).click();
  await page.getByRole("link", { name: "Sobre e termos" }).click();

  const external = requests.filter((u) => !u.startsWith(baseURL!) && !u.startsWith("blob:") && !u.startsWith("data:"));
  expect(external).toEqual([]);
  expect(cspViolations).toEqual([]);
});

test("rodapé: versão, privacidade, sobre e termos (com créditos) e link para o código-fonte", async ({ page }) => {
  const footer = page.getByRole("navigation", { name: "Rodapé" });
  await expect(footer).toContainText("Anonimador v0.1.0 (beta)");
  await expect(footer.getByRole("link", { name: "Código-fonte (AGPL-3.0)" })).toHaveAttribute("href", "https://github.com/ThiagoTelho/anonymator");

  await footer.getByRole("link", { name: "Privacidade" }).click();
  await expect(page.getByRole("heading", { name: "Como o Anonimador protege seus documentos" })).toBeVisible();
  // Fora do fluxo, nenhuma etapa aparece como atual.
  await expect(page.locator('nav[aria-label="Etapas"] [aria-current="step"]')).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Privacidade" })).toContainText("pseudonimização");

  await footer.getByRole("link", { name: "Sobre e termos" }).click();
  const about = page.getByRole("region", { name: "Sobre e termos" });
  await expect(about).toContainText("sem garantia");
  await expect(about).toContainText("IBGE — Censo 2010");
  await expect(about).toContainText("MuPDF");
});

test("abrir uma página do rodapé no meio da revisão não perde o trabalho", async ({ page }) => {
  await review(page, "fixtures/peticao-ficticia.pdf");
  await page.getByRole("checkbox", { name: "Carlos Eduardo Ferreira" }).uncheck();
  await page.getByRole("navigation", { name: "Rodapé" }).getByRole("link", { name: "Sobre e termos" }).click();
  await expect(page.getByRole("region", { name: "Sobre e termos" })).toBeVisible();
  await page.getByRole("button", { name: /Revisão/ }).click();
  await expect(page.getByRole("checkbox", { name: "Carlos Eduardo Ferreira" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "João Pedro Almeida" })).toBeChecked();
});

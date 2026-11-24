import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { extractText } from "../src/core/leaks.ts";

const TMP = "e2e/.tmp";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");

async function choose(page: Page, path: string) {
  await page.locator("#pdf").setInputFiles(path);
}

async function anonymize(page: Page) {
  await page.getByRole("button", { name: "Anonimizar" }).click();
  await expect(page.getByTestId("verificacao")).toBeVisible({ timeout: 30_000 });
}

async function downloadBytes(page: Page, button: string): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button }).click()]);
  return new Uint8Array(readFileSync((await download.path())!));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("fluxo completo: sugestões, desmarcar, anonimizar, verificação final e PDF baixado sem os dados", async ({ page }) => {
  await choose(page, "fixtures/alimentos-esaj.pdf");
  const list = page.getByRole("list", { name: "Sugestões" });
  await expect(list).toBeVisible();

  // Agentes públicos vêm desmarcados; partes vêm marcadas.
  await expect(page.getByRole("checkbox", { name: "Lívia Montenegro Saraiva" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Diego Henrique Medeiros" })).toBeChecked();
  // O usuário desmarca a advogada.
  await page.getByRole("checkbox", { name: "TAINA HOLANDA REIS" }).uncheck();

  await anonymize(page);
  await expect(page.getByTestId("verificacao")).toContainText("nenhum dos dados substituídos pôde ser encontrado");
  await expect(page.getByRole("table", { name: "Resumo" })).toContainText("Pessoas");

  const pdf = norm(extractText(await downloadBytes(page, "Baixar PDF")));
  expect(pdf).not.toContain("diego henrique medeiros");
  expect(pdf).not.toContain("ravi alcantara medeiros");
  expect(pdf).toContain("livia montenegro saraiva"); // juíza: desmarcada por padrão
  expect(pdf).toContain("taina holanda reis"); // desmarcada pelo usuário
});

test("nome digitado à mão é anonimizado, mantendo o pronome de tratamento", async ({ page }) => {
  await choose(page, "fixtures/peticao-ficticia.pdf");
  await expect(page.getByRole("list", { name: "Sugestões" })).toBeVisible();
  // Desmarca a sugestão automática e declara à mão, com a forma "Sra. Oliveira".
  await page.getByRole("checkbox", { name: "Maria Aparecida dos Santos Oliveira" }).uncheck();
  await page.getByLabel("3. Acrescente nomes que faltaram").fill("Maria Aparecida dos Santos Oliveira; Sra. Oliveira");
  await anonymize(page);
  const txt = new TextDecoder().decode(await downloadBytes(page, "Baixar texto (.txt)"));
  expect(norm(txt)).not.toContain("oliveira");
  expect(txt).toMatch(/Sra\. \[PESSOA_\d+\]/);
});

test("página escaneada é avisada e a verificação final diz que ela não pôde ser conferida", async ({ page }) => {
  await choose(page, `${TMP}/escaneado.pdf`);
  await expect(page.getByRole("list", { name: "Avisos" })).toContainText("página 2");
  await expect(page.getByRole("list", { name: "Avisos" })).toContainText("provavelmente escaneada");
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
  await expect(page.getByRole("list", { name: "Sugestões" })).toBeVisible();
  await anonymize(page);
  await expect(page.getByTestId("verificacao")).toContainText("nenhum dos dados");
});

test("arquivo que não é PDF mostra mensagem clara", async ({ page }) => {
  await choose(page, `${TMP}/nao-e-pdf.pdf`);
  await expect(page.getByText("O arquivo escolhido não é um PDF")).toBeVisible();
});

test("processo grande: mostra progresso por página e permite cancelar", async ({ page }) => {
  await choose(page, `${TMP}/grande.pdf`);
  await expect(page.getByRole("list", { name: "Sugestões" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Anonimizar" }).click();
  const status = page.getByRole("status", { name: "Progresso" });
  await expect(status).toContainText(/página \d+ de \d+/);
  await status.getByRole("button", { name: "Cancelar" }).click();
  await expect(status).toBeHidden();
  await expect(page.getByRole("button", { name: "Anonimizar" })).toBeEnabled();
  await expect(page.getByRole("region", { name: "Resultado" })).toHaveCount(0);
});

test("restaura os nomes na resposta da IA, inclusive formas curtas e variações", async ({ page }) => {
  await choose(page, "fixtures/peticao-ficticia.pdf");
  await expect(page.getByRole("list", { name: "Sugestões" })).toBeVisible();
  await anonymize(page);
  await page.getByLabel("Resposta da IA").fill("A autora [PESSOA_1] (ou PESSOA_1) e [P1]; [PESSOA_99] não existe.");
  await expect(page.getByTestId("restaurados")).toContainText("3 marcadores restaurados");
  await expect(page.getByTestId("restaurados")).toContainText("[PESSOA_99]");
  const restored = await page.getByLabel("Texto restaurado").inputValue();
  expect(restored).not.toContain("[PESSOA_1]");
  expect(restored).toContain("[PESSOA_99]");
});

test("privacidade: CSP ativa e nenhuma requisição sai da origem durante todo o fluxo", async ({ page, baseURL }) => {
  const requests: string[] = [];
  const cspViolations: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  // Tentativa bloqueada pela CSP não vira requisição, mas é um bug: o código tentou enviar algo para fora.
  page.on("console", (m) => {
    if (m.text().includes("Content Security Policy")) cspViolations.push(m.text());
  });
  await page.goto("/");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("form-action 'none'");

  await choose(page, "fixtures/reclamacao-trt.pdf");
  await expect(page.getByRole("list", { name: "Sugestões" })).toBeVisible();
  await anonymize(page);
  await downloadBytes(page, "Baixar PDF");

  const external = requests.filter((u) => !u.startsWith(baseURL!) && !u.startsWith("blob:") && !u.startsWith("data:"));
  expect(external).toEqual([]);
  expect(cspViolations).toEqual([]);
});

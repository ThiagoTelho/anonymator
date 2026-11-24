import { describe, expect, it } from "vitest";
import { documentText } from "../src/core/text.ts";
import { makePdf } from "./helpers/pdf.ts";

describe("documentText — reconstrução de linhas", () => {
  it("junta numa linha as palavras de texto justificado", () => {
    const words = "a guarnição comandada pelo SD PM GLEIDSON ARAÚJO TELES localizou o veículo abandonado no acostamento da rodovia estadual";
    const text = documentText(makePdf([`<p style="text-align: justify; width: 300px">${words} ${words}</p>`]));
    expect(text).toContain("comandada pelo SD PM");
    expect(text).not.toMatch(/comandada\s*\n\s*pelo/);
  });

  it("mantém células de tabela em linhas separadas", () => {
    const text = documentText(makePdf(['<table><tr><td style="width:200px">Nome</td><td>Josué Cardoso Ribamar</td></tr></table>']));
    expect(text).not.toContain("Nome Josué");
    expect(text).toMatch(/Nome\s*\n\s*Josué Cardoso Ribamar/);
  });

  it("marca parágrafos com linha em branco e linhas seguidas com uma quebra só", () => {
    const text = documentText(makePdf(["<p>primeiro parágrafo</p><p>segundo parágrafo</p>", "<p>linha um<br/>linha dois</p>"]));
    expect(text).toContain("primeiro parágrafo\n\nsegundo parágrafo");
    expect(text).toContain("linha um\nlinha dois");
  });
});

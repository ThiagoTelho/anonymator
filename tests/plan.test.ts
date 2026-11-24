import { readFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { anonymizePdf } from "../src/core/anonymize.ts";
import { extractText } from "../src/core/leaks.ts";
import { planPage } from "../src/core/plan.ts";
import { makePdf, norm } from "./helpers/pdf.ts";

const pages = (pdf: Uint8Array) => {
  const doc = mupdf.Document.openDocument(pdf, "application/pdf");
  return Array.from({ length: doc.countPages() }, (_, i) => doc.loadPage(i));
};

describe("planPage — fonte única da pré-visualização e do motor", () => {
  it("prevê exatamente os trechos que o motor remove (mesma contagem, nas fixtures)", () => {
    for (const name of ["peticao-ficticia", "processo-mpt-ficticio", "denuncia-criminal"]) {
      const pdf = readFileSync(`fixtures/${name}.pdf`);
      const people = JSON.parse(readFileSync(`fixtures/${name}.json`, "utf8")).people;
      const planned = pages(pdf).reduce((n, p) => n + planPage(p, { people }).matches.length, 0);
      const removed = anonymizePdf(pdf, { people }).replacements.reduce((n, r) => n + r.occurrences, 0);
      expect(planned, name).toBe(removed);
    }
  });

  it("devolve retângulos na página e o índice da pessoa que originou o trecho", () => {
    const [page] = pages(makePdf(["<p>Contrato entre Ana Souza e Bruno Lima, CPF 111.444.777-35.</p>"]));
    const plan = planPage(page, { people: [{ variants: ["Ana Souza"] }, { variants: ["Bruno Lima"] }] });
    expect(plan.matches.map((m) => [m.kind, m.text, m.person])).toEqual([
      ["PESSOA", "Ana Souza", 0],
      ["PESSOA", "Bruno Lima", 1],
      ["CPF", "111.444.777-35", undefined],
    ]);
    for (const m of plan.matches) {
      expect(m.rects.length).toBe(1);
      const [x0, y0, x1, y1] = m.rects[0];
      expect(x1).toBeGreaterThan(x0);
      expect(y1).toBeGreaterThan(y0);
    }
  });

  it("não remove tipos de dado desligados pelo usuário", () => {
    const input = makePdf(["<p>CPF 111.444.777-35, telefone (62) 99812-4471.</p>"]);
    const result = anonymizePdf(input, { people: [], skipKinds: ["TELEFONE"] });
    const text = norm(extractText(result.pdf));
    expect(text).not.toContain("111.444.777-35");
    expect(text).toContain("(62) 99812-4471");
    expect(planPage(pages(input)[0], { people: [], skipKinds: ["TELEFONE"] }).matches.map((m) => m.kind)).toEqual(["CPF"]);
  });
});

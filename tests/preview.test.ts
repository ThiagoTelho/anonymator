import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { detectedCounts, previewPage } from "../src/core/preview.ts";
import { makePdf } from "./helpers/pdf.ts";

const open = (pdf: Uint8Array) => mupdf.Document.openDocument(pdf, "application/pdf");
const pdf = () =>
  makePdf(["<p>Contrato entre Ana Souza e Bruno Lima, CPF 111.444.777-35, telefone (62) 99812-4471. Juíza Carla Dias.</p>"]);

describe("previewPage", () => {
  const people = [{ variants: ["Ana Souza"] }, { variants: ["Bruno Lima"] }, { variants: ["Carla Dias"] }];

  it("gera a imagem da página e as caixas: removidas e desmarcadas", () => {
    const p = previewPage(open(pdf()), 0, { people, selected: [true, true, false], skipKinds: ["TELEFONE"] }, 1.5);
    expect(p.png.length).toBeGreaterThan(1000);
    expect(p.width).toBeGreaterThan(0);
    // Um trecho que quebra de linha tem uma caixa por linha: compara os trechos distintos.
    const summary = [...new Set(p.boxes.map((b) => JSON.stringify([b.kind, b.text, b.removed])))].map((s) => JSON.parse(s)).sort();
    expect(summary).toEqual(
      [
        ["CPF", "111.444.777-35", true],
        ["PESSOA", "Ana Souza", true],
        ["PESSOA", "Bruno Lima", true],
        ["PESSOA", "Carla Dias", false],
        ["TELEFONE", "(62) 99812-4471", false],
      ].sort(),
    );
  });

  it("caixas ficam dentro da imagem, na escala pedida", () => {
    const p = previewPage(open(pdf()), 0, { people, selected: [true, true, true] }, 2);
    for (const b of p.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(p.width);
      expect(b.y + b.h).toBeLessThanOrEqual(p.height);
    }
  });

  it("indica a pessoa de origem de cada caixa", () => {
    const p = previewPage(open(pdf()), 0, { people, selected: [true, false, true] }, 1);
    const persons = [...new Set(p.boxes.filter((b) => b.kind === "PESSOA").map((b) => JSON.stringify([b.text, b.person])))].map((s) => JSON.parse(s));
    expect(persons.sort()).toEqual(
      [
        ["Ana Souza", 0],
        ["Bruno Lima", 1],
        ["Carla Dias", 2],
      ].sort(),
    );
  });
});

describe("previewPage — palavras para seleção na página", () => {
  it("devolve as palavras na ordem de leitura, com a posição na imagem", () => {
    const p = previewPage(open(makePdf(["<p>Testemunha: Otávio Ramos Salgueiro.</p>"])), 0, { people: [], selected: [] }, 1.5);
    expect(p.words.map((w) => w.text)).toEqual(["Testemunha:", "Otávio", "Ramos", "Salgueiro."]);
    for (let i = 1; i < p.words.length; i++) expect(p.words[i].x).toBeGreaterThan(p.words[i - 1].x);
    expect(p.words.every((w) => w.w > 0 && w.h > 0 && w.x + w.w <= p.width)).toBe(true);
  });
});

describe("detectedCounts", () => {
  it("conta os dados de formato fixo por tipo", () => {
    expect(detectedCounts("CPF 111.444.777-35 e 529.982.247-25; fone (62) 99812-4471")).toEqual({ CPF: 2, TELEFONE: 1 });
  });
});

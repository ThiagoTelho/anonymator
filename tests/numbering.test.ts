import { readFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { anonymizePdf } from "../src/core/anonymize.ts";
import { planLabels, PlaceholderNumbering } from "../src/core/numbering.ts";
import { makePdf } from "./helpers/pdf.ts";

const open = (pdf: Uint8Array) => new mupdf.PDFDocument(pdf);

describe("PlaceholderNumbering", () => {
  it("numera por tipo, na ordem em que cada entidade aparece, e repete o marcador da mesma entidade", () => {
    const n = new PlaceholderNumbering();
    expect(n.assign("PESSOA:#3", "PESSOA", "Ana").full).toBe("[PESSOA_1]");
    expect(n.assign("CPF:111", "CPF", "111").full).toBe("[CPF_1]");
    expect(n.assign("PESSOA:#0", "PESSOA", "Bruno").full).toBe("[PESSOA_2]");
    expect(n.assign("PESSOA:#3", "PESSOA", "ANA").full).toBe("[PESSOA_1]");
    expect(n.assign("PESSOA:#0", "PESSOA", "Bruno").short).toBe("[P2]");
    expect(n.replacements()).toEqual([
      { placeholder: "[PESSOA_1]", kind: "PESSOA", originals: ["Ana", "ANA"], occurrences: 2 },
      { placeholder: "[CPF_1]", kind: "CPF", originals: ["111"], occurrences: 1 },
      { placeholder: "[PESSOA_2]", kind: "PESSOA", originals: ["Bruno"], occurrences: 2 },
    ]);
  });
});

describe("planLabels — o marcador mostrado na revisão é o do PDF final", () => {
  it("bate com a anonimização nas fixtures (pessoas e dados detectados)", () => {
    for (const name of ["peticao-ficticia", "processo-mpt-ficticio", "reclamacao-trt"]) {
      const pdf = readFileSync(`fixtures/${name}.pdf`);
      const spec = JSON.parse(readFileSync(`fixtures/${name}.json`, "utf8"));
      const people = spec.people.length ? spec.people : [{ variants: ["Rosimeire Dutra Falcão"] }];
      const labels = planLabels(open(pdf), { people });
      const result = anonymizePdf(pdf, { people });
      const byPlaceholder = new Map(result.replacements.map((r) => [r.placeholder, r]));
      // Cada pessoa: o marcador previsto existe no resultado e é do mesmo tipo.
      people.forEach((_: unknown, i: number) => {
        const p = labels.people[i];
        if (p) expect(byPlaceholder.get(p)?.kind, `${name} pessoa ${i}`).toMatch(/PESSOA|EMPRESA/);
      });
      // O conjunto de marcadores previstos é exatamente o do resultado.
      const predicted = new Set([...Object.values(labels.people).filter(Boolean), ...Object.values(labels.keys)]);
      expect([...predicted].sort(), name).toEqual([...byPlaceholder.keys()].sort());
    }
  });

  it("pessoa marcada que não aparece no documento fica sem marcador", () => {
    const labels = planLabels(open(makePdf(["<p>Ana Souza e Bruno Lima.</p>"])), {
      people: [{ variants: ["Bruno Lima"] }, { variants: ["Carla Inexistente"] }, { variants: ["Ana Souza"] }],
    });
    expect(labels.people).toEqual({ 0: "[PESSOA_2]", 2: "[PESSOA_1]" });
  });
});

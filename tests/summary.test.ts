import { describe, expect, it } from "vitest";
import { summarize } from "../src/core/summary.ts";

describe("summarize", () => {
  it("agrupa por tipo, conta distintos e ocorrências, na ordem fixa dos tipos", () => {
    const rows = summarize([
      { placeholder: "[CPF_1]", kind: "CPF", originals: ["x"], occurrences: 2 },
      { placeholder: "[PESSOA_1]", kind: "PESSOA", originals: ["a"], occurrences: 5 },
      { placeholder: "[PESSOA_2]", kind: "PESSOA", originals: ["b"], occurrences: 1 },
    ]);
    expect(rows).toEqual([
      { kind: "PESSOA", label: "Pessoas", distinct: 2, occurrences: 6 },
      { kind: "CPF", label: "CPF", distinct: 1, occurrences: 2 },
    ]);
  });

  it("lista vazia quando nada foi removido", () => {
    expect(summarize([])).toEqual([]);
  });
});

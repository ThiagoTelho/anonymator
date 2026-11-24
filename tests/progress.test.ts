import { describe, expect, it } from "vitest";
import { anonymizePdf } from "../src/core/anonymize.ts";
import { diagnosePdf } from "../src/core/diagnose.ts";
import { documentText } from "../src/core/text.ts";
import { makePdf } from "./helpers/pdf.ts";

const threePages = () => makePdf(["<p>Ana Souza</p>", "<p>página dois</p>", "<p>fim</p>"]);

describe("progresso por página", () => {
  it("anonymizePdf informa cada página, em ordem, terminando no total", () => {
    const calls: [number, number][] = [];
    anonymizePdf(threePages(), { people: [{ variants: ["Ana Souza"] }], onProgress: (done, total) => calls.push([done, total]) });
    expect(calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("diagnosePdf e documentText também informam", () => {
    const d: number[] = [];
    const t: number[] = [];
    diagnosePdf(threePages(), undefined, (done) => d.push(done));
    documentText(threePages(), undefined, (done) => t.push(done));
    expect(d).toEqual([1, 2, 3]);
    expect(t).toEqual([1, 2, 3]);
  });
});

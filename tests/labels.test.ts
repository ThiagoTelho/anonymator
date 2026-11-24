import { describe, expect, it } from "vitest";
import { fitLabel, MIN_SCALE, MIN_SIZE, shortLabel } from "../src/core/labels.ts";

// Medida simplificada: cada caractere tem 0,6 unidade de largura por ponto de fonte.
const measure = (s: string) => s.length * 0.6;
const fit = (width: number, height = 10) => fitLabel("[PESSOA_5]", "[P5]", width, height, measure);

describe("shortLabel", () => {
  it("abrevia o tipo e mantém o número", () => {
    expect(shortLabel("PESSOA", 5)).toBe("[P5]");
    expect(shortLabel("EMPRESA", 1)).toBe("[E1]");
    expect(shortLabel("NASCIMENTO", 2)).toBe("[NASC2]");
    expect(shortLabel("ENDERECO", 3)).toBe("[END3]");
    expect(shortLabel("CPF", 10)).toBe("[CPF10]");
  });
});

describe("fitLabel", () => {
  it("usa o marcador completo, sem compressão, quando há espaço", () => {
    expect(fit(100)).toEqual({ text: "[PESSOA_5]", size: 8, scale: 1 });
  });

  it("comprime na horizontal antes de diminuir a fonte", () => {
    const r = fit(40);
    expect(r.text).toBe("[PESSOA_5]");
    expect(r.size).toBe(8);
    expect(r.scale).toBeCloseTo(40 / 48);
  });

  it("diminui a fonte até o mínimo legível, mantendo o marcador completo", () => {
    const r = fit(28);
    expect(r.text).toBe("[PESSOA_5]");
    expect(r.size).toBe(10 * MIN_SIZE);
    expect(r.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it("troca pela forma curta quando o completo não cabe legível", () => {
    const r = fit(20);
    expect(r.text).toBe("[P5]");
    expect(r.size).toBe(8);
    expect(r.scale).toBe(1);
  });

  it("em último caso, encolhe a forma curta (sem nunca transbordar o espaço)", () => {
    const r = fit(5);
    expect(r.text).toBe("[P5]");
    expect(r.scale).toBe(MIN_SCALE);
    expect(measure(r.text) * r.size * r.scale).toBeCloseTo(5);
  });

  it("nunca ocupa mais que a largura disponível", () => {
    for (const w of [3, 8, 12, 20, 30, 45, 60, 200]) {
      const r = fit(w);
      expect(measure(r.text) * r.size * r.scale).toBeLessThanOrEqual(w + 1e-9);
    }
  });
});

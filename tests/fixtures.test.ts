// Roda o motor em cada PDF fictício de fixtures/ usando o arquivo .json ao lado dele.
//
// Para adicionar um caso: coloque `fixtures/<nome>.pdf` (só dados inventados!) e `fixtures/<nome>.json`:
//   {
//     "description": "o que este PDF representa",
//     "suggest": true,              // usar as sugestões automáticas (todas, inclusive agentes públicos)
//     "people": [{ "variants": ["Nome Completo", "Sr. Sobrenome"] }],   // nomes declarados à mão
//     "expectedSuggestions": {      // lista EXATA esperada: pega nomes perdidos e falsos positivos
//       "people": ["..."], "publicAgents": ["..."], "companies": ["..."]
//     },
//     "mustRemove": ["dados que NÃO podem aparecer no PDF anonimizado"],
//     "mustKeep":   ["trechos que DEVEM continuar no PDF (evita apagar demais)"],
//     "knownGaps":  ["dados que ainda vazam, conhecidos; o teste avisa quando passarem a ser removidos"]
//   }
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anonymizePdf, type Person } from "../src/core/anonymize.ts";
import { extractText, findLeaks } from "../src/core/leaks.ts";
import { suggestEntities } from "../src/core/names.ts";
import { FIRST_NAMES } from "./helpers/names.ts";
import { markerSizeRatios, norm, openPdf } from "./helpers/pdf.ts";

interface FixtureSpec {
  description?: string;
  suggest?: boolean;
  people?: Person[];
  expectedSuggestions?: { people?: string[]; publicAgents?: string[]; companies?: string[] };
  mustRemove?: string[];
  mustKeep?: string[];
  knownGaps?: string[];
}

const DIR = join(import.meta.dirname, "..", "fixtures");
const pdfs = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
const sorted = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b));

describe.each(pdfs)("fixture %s", (file) => {
  const spec: FixtureSpec = JSON.parse(readFileSync(join(DIR, file.replace(/\.pdf$/i, ".json")), "utf8"));
  const input = readFileSync(join(DIR, file));
  const suggestions = spec.suggest ? suggestEntities(extractText(input), FIRST_NAMES) : [];
  const people: Person[] = [...suggestions.map((s) => ({ variants: s.variants, kind: s.kind })), ...(spec.people ?? [])];
  const result = anonymizePdf(input, { people });
  const text = norm(extractText(result.pdf));

  if (spec.expectedSuggestions) {
    const exp = spec.expectedSuggestions;
    it("sugere exatamente as pessoas esperadas", () => {
      expect(sorted(suggestions.filter((s) => s.kind === "PESSOA").map((s) => s.name))).toEqual(sorted(exp.people ?? []));
    });
    it("marca exatamente os agentes públicos esperados", () => {
      expect(sorted(suggestions.filter((s) => s.publicAgent).map((s) => s.name))).toEqual(sorted(exp.publicAgents ?? []));
    });
    it("sugere exatamente as empresas esperadas", () => {
      expect(sorted(suggestions.filter((s) => s.kind === "EMPRESA").map((s) => s.name))).toEqual(sorted(exp.companies ?? []));
    });
  }

  it("não deixa nenhum dado substituído legível no PDF", () => {
    expect(findLeaks(result.pdf, result.replacements)).toEqual([]);
  });

  it.each(spec.mustRemove ?? [])("remove %s", (value) => {
    expect(text).not.toContain(norm(value));
    expect(norm(result.text)).not.toContain(norm(value));
  });

  it.each(spec.mustKeep ?? [])("mantém %s", (value) => {
    expect(text).toContain(norm(value));
  });

  // Lacunas conhecidas: o teste "falha de propósito". Quando o dado passar a ser removido, ele fica
  // vermelho, avisando para mover o item de knownGaps para mustRemove.
  it.fails.each(spec.knownGaps ?? [])("lacuna conhecida: %s ainda não é removido", (value) => {
    expect(text).not.toContain(norm(value));
  });

  it("gera um PDF válido com as mesmas páginas (mais a legenda, se houver marcadores curtos)", () => {
    const out = openPdf(result.pdf);
    const original = openPdf(input).countPages();
    if (out.countPages() === original + 1) {
      expect(norm(out.loadPage(original).toStructuredText("preserve-whitespace").asText())).toContain("legenda dos marcadores");
    } else {
      expect(out.countPages()).toBe(original);
    }
  });

  it("escreve todos os marcadores com pelo menos 60% do tamanho do texto da página", () => {
    expect(Math.min(...markerSizeRatios(result.pdf))).toBeGreaterThanOrEqual(0.6);
  });

  it("encontra no documento todas as pessoas e empresas usadas", () => {
    const found = result.replacements.filter((r) => r.kind === "PESSOA" || r.kind === "EMPRESA").length;
    expect(found).toBe(people.length);
  });
});

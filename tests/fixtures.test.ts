// Roda o motor em cada PDF fictício de fixtures/ usando o arquivo .json ao lado dele.
//
// Para adicionar um caso: coloque `fixtures/<nome>.pdf` (só dados inventados!) e `fixtures/<nome>.json`:
//   {
//     "description": "o que este PDF representa",
//     "people":     [{ "variants": ["Nome Completo", "Sr. Sobrenome"] }],   // o que o usuário declararia
//     "mustRemove": ["dados que NÃO podem aparecer no PDF anonimizado"],
//     "mustKeep":   ["trechos que DEVEM continuar no PDF (evita apagar demais)"]
//   }
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anonymizePdf, type Person } from "../src/core/anonymize.ts";
import { extractText, findLeaks } from "../src/core/leaks.ts";
import { norm, openPdf } from "./helpers/pdf.ts";

interface FixtureSpec {
  description?: string;
  people: Person[];
  mustRemove?: string[];
  mustKeep?: string[];
}

const DIR = join(import.meta.dirname, "..", "fixtures");
const pdfs = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));

describe.each(pdfs)("fixture %s", (file) => {
  const spec: FixtureSpec = JSON.parse(readFileSync(join(DIR, file.replace(/\.pdf$/i, ".json")), "utf8"));
  const result = anonymizePdf(readFileSync(join(DIR, file)), { people: spec.people });
  const text = norm(extractText(result.pdf));

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

  it("gera um PDF válido com o mesmo número de páginas", () => {
    expect(openPdf(result.pdf).countPages()).toBe(openPdf(readFileSync(join(DIR, file))).countPages());
  });

  it("encontra todas as pessoas declaradas", () => {
    const found = result.replacements.filter((r) => r.kind === "PESSOA").length;
    expect(found).toBe(spec.people.length);
  });
});

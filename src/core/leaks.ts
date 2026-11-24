// Verificação independente: reabre um PDF já anonimizado e procura os dados originais.
// Usada nos testes, no `pnpm verify` e, no futuro, como checagem final na própria interface.

import * as mupdf from "mupdf";
import type { Replacement } from "./anonymize.ts";
import { fold } from "./detectors.ts";

export interface Leak {
  placeholder: string;
  original: string;
  where: "texto" | "metadados";
}

const normalize = (s: string) => fold(s).replace(/\s+/g, " ").trim();

/** Extrai o texto de todas as páginas de um PDF. */
export function extractText(pdf: Uint8Array): string {
  const doc = new mupdf.PDFDocument(pdf);
  let text = "";
  for (let i = 0; i < doc.countPages(); i++) text += doc.loadPage(i).toStructuredText("preserve-whitespace").asText() + "\n";
  return text;
}

/** Lista todo dado original que ainda possa ser lido no PDF (texto das páginas ou metadados). */
export function findLeaks(pdf: Uint8Array, replacements: Replacement[]): Leak[] {
  const doc = new mupdf.PDFDocument(pdf);
  const text = normalize(extractText(pdf));
  const meta = normalize(
    ["info:Title", "info:Author", "info:Subject", "info:Keywords", "info:Creator", "info:Producer"]
      .map((k) => doc.getMetaData(k) ?? "")
      .join(" "),
  );
  const leaks: Leak[] = [];
  for (const r of replacements) {
    for (const original of r.originals) {
      const needle = normalize(original);
      if (text.includes(needle)) leaks.push({ placeholder: r.placeholder, original, where: "texto" });
      if (meta.includes(needle)) leaks.push({ placeholder: r.placeholder, original, where: "metadados" });
    }
  }
  return leaks;
}

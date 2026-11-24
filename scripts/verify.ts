// Verificação: anonimiza o PDF fictício e confere que nenhum dado original sobrou.
// Uso: node scripts/verify.ts [entrada.pdf]
import * as mupdf from "mupdf";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { anonymizePdf } from "../src/core/anonymize.ts";

const input = process.argv[2] ?? "fixtures/peticao-ficticia.pdf";
const result = anonymizePdf(readFileSync(input), {
  people: [
    { variants: ["Maria Aparecida dos Santos Oliveira", "Sra. Oliveira"] },
    { variants: ["João Pedro Almeida", "Sr. Almeida"] },
    { variants: ["Carlos Eduardo Ferreira"] },
    { variants: ["Construtora Horizonte Ltda"] },
  ],
});

mkdirSync("out", { recursive: true });
writeFileSync("out/anonimizado.pdf", result.pdf);
writeFileSync("out/anonimizado.txt", result.text);
writeFileSync("out/correspondencia.json", JSON.stringify(result.replacements, null, 2));

// Verificação independente: reabre o PDF gerado e procura cada dado original no texto e nos bytes.
const out = new mupdf.PDFDocument(result.pdf);
let extracted = "";
for (let i = 0; i < out.countPages(); i++) extracted += out.loadPage(i).toStructuredText("preserve-whitespace").asText();
const flat = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
const raw = Buffer.from(out.saveToBuffer("decompress").asUint8Array()).toString("latin1").toLowerCase();

let leaks = 0;
for (const r of result.replacements) {
  for (const original of r.originals) {
    const inText = flat(extracted).includes(flat(original));
    const inBytes = raw.includes(original.toLowerCase());
    if (inText || inBytes) {
      leaks++;
      console.log(`VAZOU ${r.placeholder} "${original}" (texto: ${inText}, bytes: ${inBytes})`);
    }
  }
}
console.log(`Metadados: Title=${out.getMetaData("info:Title") ?? "(nenhum)"} Author=${out.getMetaData("info:Author") ?? "(nenhum)"}`);
console.table(result.replacements.map((r) => ({ marcador: r.placeholder, ocorrencias: r.occurrences, original: r.originals.join(" | ") })));
console.log(leaks === 0 ? "OK: nenhum dado original encontrado no PDF gerado." : `FALHOU: ${leaks} vazamento(s).`);
console.log("\n" + result.text);
process.exit(leaks === 0 ? 0 : 1);

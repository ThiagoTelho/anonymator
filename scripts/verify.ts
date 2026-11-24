// Verificação manual: anonimiza um PDF fictício, grava o resultado em out/ e confere vazamentos.
// Uso: node scripts/verify.ts [entrada.pdf]
// Os testes automatizados (pnpm test) cobrem o mesmo e mais; este script serve para inspecionar a saída.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { anonymizePdf } from "../src/core/anonymize.ts";
import { findLeaks } from "../src/core/leaks.ts";

const input = process.argv[2] ?? "fixtures/peticao-ficticia.pdf";
const sidecar = input.replace(/\.pdf$/i, ".json");
const people = JSON.parse(readFileSync(sidecar, "utf8")).people;
const result = anonymizePdf(readFileSync(input), { people });

mkdirSync("out", { recursive: true });
writeFileSync("out/anonimizado.pdf", result.pdf);
writeFileSync("out/anonimizado.txt", result.text);
writeFileSync("out/correspondencia.json", JSON.stringify(result.replacements, null, 2));

console.table(result.replacements.map((r) => ({ marcador: r.placeholder, ocorrencias: r.occurrences, original: r.originals.join(" | ") })));
const leaks = findLeaks(result.pdf, result.replacements);
for (const l of leaks) console.log(`VAZOU ${l.placeholder} "${l.original}" (${l.where})`);
console.log(leaks.length === 0 ? "OK: nenhum dado original encontrado no PDF gerado. Saída em out/." : `FALHOU: ${leaks.length} vazamento(s).`);
process.exit(leaks.length === 0 ? 0 : 1);

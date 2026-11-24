// Anonimiza uma fixture como o usuário faria (sugestões marcadas, agentes públicos desmarcados) e
// grava em out/ o PDF, o texto e a imagem de uma página, para conferência visual.
// Uso: pnpm preview:fixture <nome-da-fixture> <página>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as mupdf from "mupdf";
import { anonymizePdf } from "../src/core/anonymize.ts";
import { suggestEntities } from "../src/core/names.ts";
import { documentText } from "../src/core/text.ts";
import { FIRST_NAMES } from "../tests/helpers/names.ts";
const [name, pageArg] = process.argv.slice(2);
const pdf = readFileSync(`fixtures/${name}.pdf`);
const sugg = suggestEntities(documentText(pdf), FIRST_NAMES);
const r = anonymizePdf(pdf, { people: sugg.filter((s) => !s.publicAgent).map((s) => ({ variants: s.variants, kind: s.kind })) });
mkdirSync("out", { recursive: true });
writeFileSync(`out/${name}.pdf`, r.pdf); writeFileSync(`out/${name}.txt`, r.text);
const d = new mupdf.PDFDocument(r.pdf);
writeFileSync(`out/${name}-p${pageArg}.png`, d.loadPage(Number(pageArg) - 1).toPixmap(mupdf.Matrix.scale(1.4, 1.4), mupdf.ColorSpace.DeviceRGB, false, true).asPNG());
console.log(sugg.map((s) => `${s.publicAgent ? "[agente] " : ""}${s.name}`).join(" | "));

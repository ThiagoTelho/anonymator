// Gera PDFs de teste a partir de documentos HTML fictícios em fixtures/src/.
// Uso: node scripts/make-fixture.mjs                       (todos os .html de fixtures/src)
//      node scripts/make-fixture.mjs fixtures/src/x.html   (só os indicados)
// Saída: fixtures/<nome>.pdf. O .json de cada fixture (o que deve sumir/ficar) é escrito à mão.
// Só dados inventados: nunca use documentos reais.
import * as mupdf from "mupdf";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const SRC = "fixtures/src";
const inputs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(SRC).filter((f) => f.endsWith(".html")).map((f) => join(SRC, f));

for (const input of inputs) {
  const name = basename(input, ".html");
  const src = mupdf.Document.openDocument(readFileSync(input), "text/html");
  const buf = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(buf, "pdf", "");
  for (let i = 0; i < src.countPages(); i++) {
    const page = src.loadPage(i);
    const dev = writer.beginPage(page.getBounds());
    page.run(dev, mupdf.Matrix.identity);
    writer.endPage();
  }
  writer.close();
  const pdf = new mupdf.PDFDocument(buf.asUint8Array());
  // Metadados com dado pessoal fictício, para testar a limpeza.
  const title = /<title>([^<]*)<\/title>/i.exec(readFileSync(input, "utf8"))?.[1];
  if (title) pdf.setMetaData("info:Title", title);
  pdf.setMetaData("info:Author", "Gerador de fixtures do Anonymator");
  writeFileSync(`fixtures/${name}.pdf`, pdf.saveToBuffer("compress").asUint8Array());
  console.log(`fixtures/${name}.pdf (${src.countPages()} página(s))`);
}

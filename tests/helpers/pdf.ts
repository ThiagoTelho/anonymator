// Utilitários de teste: geram PDFs fictícios a partir de HTML, direto em memória.
import * as mupdf from "mupdf";

const STYLE = `<style>body{font-family:serif;font-size:11pt;line-height:1.4} p{margin:0 0 8pt 0}</style>`;

/** Gera um PDF com uma página (ou mais, se o conteúdo transbordar) para cada HTML recebido. */
export function makePdf(pages: string[], meta: Record<string, string> = {}): Uint8Array {
  const buf = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(buf, "pdf", "");
  for (const body of pages) {
    const html = `<html><head>${STYLE}</head><body>${body}</body></html>`;
    const src = mupdf.Document.openDocument(new TextEncoder().encode(html), "text/html");
    for (let i = 0; i < src.countPages(); i++) {
      const page = src.loadPage(i);
      const dev = writer.beginPage(page.getBounds());
      page.run(dev, mupdf.Matrix.identity);
      writer.endPage();
    }
  }
  writer.close();
  const doc = new mupdf.PDFDocument(buf.asUint8Array());
  for (const [k, v] of Object.entries(meta)) doc.setMetaData(k, v);
  return doc.saveToBuffer("compress").asUint8Array().slice();
}

/** Abre um PDF para inspeção nos testes. */
export const openPdf = (pdf: Uint8Array) => new mupdf.PDFDocument(pdf);

/** Normaliza texto para comparação: sem acentos, minúsculas, espaços simples. */
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

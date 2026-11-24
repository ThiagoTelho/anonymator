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

/**
 * Para cada marcador ("[PESSOA_1]", "[P1]"…) escrito no PDF, a razão entre o tamanho da fonte dele
 * e o do texto original na mesma linha visual (mesma altura na página). Sem texto vizinho, compara
 * com o tamanho mediano da página. 1 = marcador do tamanho do texto ao redor.
 */
export function markerSizeRatios(pdf: Uint8Array): number[] {
  const doc = openPdf(pdf);
  const ratios: number[] = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const chars: { c: string; size: number; y: number }[] = [];
    doc.loadPage(i).toStructuredText("preserve-whitespace").walk({
      onChar: (c, origin, _font, size) => void chars.push({ c, size, y: origin[1] }),
      endLine: () => void chars.push({ c: "\n", size: 0, y: 0 }),
    });
    const text = chars.map((ch) => (ch.c.length === 1 ? ch.c : "?")).join("");
    const inMarker = new Array<boolean>(chars.length).fill(false);
    const markers: { size: number; y: number }[] = [];
    for (const m of text.matchAll(/\[[A-Z]+(?:_[A-Z]+)*_?\d+\]/g)) {
      const own = chars.slice(m.index, m.index + m[0].length);
      for (let k = m.index; k < m.index + m[0].length; k++) inMarker[k] = true;
      markers.push({ size: Math.min(...own.map((ch) => ch.size)), y: own[0].y });
    }
    const body = chars.filter((ch, k) => !inMarker[k] && ch.size > 0 && !/\s/.test(ch.c));
    if (!body.length) continue;
    const median = [...body].map((ch) => ch.size).sort((a, b) => a - b)[Math.floor(body.length / 2)];
    for (const mk of markers) {
      const sameLine = body.filter((ch) => Math.abs(ch.y - mk.y) < mk.size).map((ch) => ch.size);
      ratios.push(mk.size / (sameLine.length ? Math.max(...sameLine) : median));
    }
  }
  return ratios;
}

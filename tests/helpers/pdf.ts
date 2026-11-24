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

/** Página "escaneada": a página renderizada vira uma imagem, sem nenhum texto extraível. */
export function scannedPagePdf(pdf: Uint8Array, pageIndex = 0): Uint8Array {
  const src = mupdf.Document.openDocument(pdf, "application/pdf");
  const page = src.loadPage(pageIndex);
  const [x0, y0, x1, y1] = page.getBounds();
  const w = x1 - x0;
  const h = y1 - y0;
  const pix = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true);
  const out = new mupdf.PDFDocument();
  const resources = out.newDictionary();
  const xobjects = out.newDictionary();
  xobjects.put("Im0", out.addImage(new mupdf.Image(pix)));
  resources.put("XObject", xobjects);
  out.insertPage(-1, out.addPage([0, 0, w, h], 0, resources, `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`));
  return out.saveToBuffer("compress").asUint8Array().slice();
}

/** Junta PDFs na ordem dada. */
export function concatPdfs(pdfs: Uint8Array[]): Uint8Array {
  const out = new mupdf.PDFDocument();
  for (const p of pdfs) {
    const src = new mupdf.PDFDocument(p);
    for (let i = 0; i < src.countPages(); i++) out.graftPage(-1, src, i);
  }
  return out.saveToBuffer("compress").asUint8Array().slice();
}

/** Remove o mapa de caracteres (ToUnicode) das fontes: o texto continua visível, mas a extração vira "�". */
export function illegiblePdf(pdf: Uint8Array): Uint8Array {
  const doc = new mupdf.PDFDocument(pdf);
  for (let i = 1; i < doc.countObjects(); i++) {
    const o = doc.newIndirect(i).resolve();
    if (o.isDictionary() && o.get("Type").isName() && o.get("Type").asName() === "Font") o.delete("ToUnicode");
  }
  return doc.saveToBuffer("garbage").asUint8Array().slice();
}

/** Protege o PDF com senha de abertura. */
export function encryptedPdf(pdf: Uint8Array, password: string): Uint8Array {
  return new mupdf.PDFDocument(pdf).saveToBuffer(`encrypt=aes-256,user-password=${password},owner-password=${password}-dono`).asUint8Array().slice();
}

/** Acrescenta um campo de assinatura digital (vazio de criptografia, só a estrutura que os leitores reconhecem). */
export function signedPdf(pdf: Uint8Array): Uint8Array {
  const doc = new mupdf.PDFDocument(pdf);
  const sig = doc.addObject(doc.newDictionary());
  sig.put("Type", doc.newName("Sig"));
  sig.put("Filter", doc.newName("Adobe.PPKLite"));
  const field = doc.addObject(doc.newDictionary());
  field.put("FT", doc.newName("Sig"));
  field.put("T", doc.newString("Assinatura1"));
  field.put("V", sig);
  const fields = doc.newArray();
  fields.push(field);
  const acro = doc.newDictionary();
  acro.put("Fields", fields);
  acro.put("SigFlags", doc.newInteger(3));
  doc.getTrailer().get("Root").put("AcroForm", acro);
  return doc.saveToBuffer("").asUint8Array().slice();
}

// Motor de anonimização: localiza os dados pessoais no PDF, remove-os de verdade
// do conteúdo das páginas (MuPDF redaction) e escreve um marcador no lugar.

import * as mupdf from "mupdf";
import { detectPatterns, findTerm, type Kind, type Match } from "./detectors.ts";
import { fitLabel, shortLabel } from "./labels.ts";
import { openPdf } from "./diagnose.ts";
import { readPage, type Char } from "./text.ts";

export interface Person {
  /** Grafias da mesma pessoa no documento (ex.: nome completo, "Sr. Almeida"). */
  variants: string[];
  /** PESSOA (padrão) ou EMPRESA: define o marcador ([PESSOA_n] ou [EMPRESA_n]). */
  kind?: "PESSOA" | "EMPRESA";
}

export interface AnonymizeOptions {
  /** Pessoas declaradas pelo usuário. Cada uma recebe um marcador [PESSOA_n]. */
  people: Person[];
  /** Detectar CPF, CNPJ, e-mail, telefone, CEP, OAB e nº de processo. Padrão: true. */
  detectPatterns?: boolean;
  /** Senha de abertura, se o PDF for protegido. O PDF anonimizado sai sem senha. */
  password?: string;
}

export interface Replacement {
  placeholder: string;
  kind: Kind;
  /** Grafias encontradas no documento que viraram este marcador. */
  originals: string[];
  occurrences: number;
}

export interface AnonymizeResult {
  pdf: Uint8Array;
  /** Texto anonimizado, página por página. */
  text: string;
  /** Tabela de correspondência marcador → dado original. Nunca sai da máquina do usuário. */
  replacements: Replacement[];
}

/** Agrupa os quads de um trecho por linha e devolve um retângulo por linha. */
function lineRects(chars: Char[], start: number, end: number): mupdf.Rect[] {
  const byLine = new Map<number, mupdf.Rect>();
  for (let i = start; i < end; i++) {
    const { quad, line } = chars[i];
    if (!quad) continue;
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const r: mupdf.Rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const prev = byLine.get(line);
    byLine.set(line, prev ? [Math.min(prev[0], r[0]), Math.min(prev[1], r[1]), Math.max(prev[2], r[2]), Math.max(prev[3], r[3])] : r);
  }
  return [...byLine.values()];
}

/** Chave que identifica a mesma entidade escrita de formas diferentes. */
function entityKey(m: Match): string {
  const digits = m.text.replace(/\D/g, "");
  switch (m.kind) {
    case "CNPJ":
      // CNPJ alfanumérico: letras fazem parte da identidade.
      return `CNPJ:${m.text.replace(/[^0-9A-Z]/g, "")}`;
    case "CPF":
    case "CEP":
    case "PROCESSO":
    case "TELEFONE":
      return `${m.kind}:${digits}`;
    default:
      return `${m.kind}:${m.text.toLowerCase().replace(/\s+/g, " ")}`;
  }
}

/** String literal PDF para fonte simples Latin: escapa \\ ( ) e codifica acentos em octal (Latin-1). */
const pdfString = (s: string) =>
  `(${Array.from(s, (ch) => {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || ch === "(" || ch === ")") return "\\" + ch;
    if (code > 126 && code < 256) return "\\" + code.toString(8).padStart(3, "0");
    return code > 255 ? "?" : ch;
  }).join("")})`;

export function anonymizePdf(input: Uint8Array, options: AnonymizeOptions): AnonymizeResult {
  const doc = openPdf(input, options.password);
  const font = new mupdf.Font("Helvetica");
  const fontRef = doc.addSimpleFont(font, "Latin");

  const replacements = new Map<string, Replacement>();
  const shortForms = new Map<string, string>();
  const counters = new Map<Kind, number>();
  const placeholderFor = (key: string, kind: Kind, original: string): { full: string; short: string } => {
    let r = replacements.get(key);
    if (!r) {
      const n = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, n);
      r = { placeholder: `[${kind}_${n}]`, kind, originals: [], occurrences: 0 };
      replacements.set(key, r);
      shortForms.set(r.placeholder, shortLabel(kind, n));
    }
    if (!r.originals.includes(original)) r.originals.push(original);
    r.occurrences++;
    return { full: r.placeholder, short: shortForms.get(r.placeholder)! };
  };
  /** Marcadores que precisaram da forma curta em algum ponto do PDF (vão para a legenda). */
  const usedShort = new Map<string, string>();
  const measure = (t: string) => Array.from(t).reduce((sum, ch) => sum + font.advanceGlyph(font.encodeCharacter(ch)), 0);

  const pageTexts: string[] = [];

  for (let p = 0; p < doc.countPages(); p++) {
    const page = doc.loadPage(p);
    const { text, chars } = readPage(page);

    // 1. Localizar: pessoas declaradas primeiro, depois os padrões, sem sobreposição.
    const matches: { m: Match; key: string }[] = [];
    const taken = (s: number, e: number) => matches.some(({ m }) => s < m.end && e > m.start);
    // Variantes mais longas primeiro, entre todas as pessoas: "Maria da Silva" (pessoa 2)
    // ganha de "Maria" (pessoa 1) no mesmo trecho.
    const variants = options.people
      .flatMap((person, idx) => person.variants.map((v) => ({ v, idx, kind: person.kind ?? "PESSOA" })))
      .sort((a, b) => b.v.length - a.v.length);
    for (const { v, idx, kind } of variants) {
      for (const m of findTerm(text, v, kind)) {
        if (!taken(m.start, m.end)) matches.push({ m, key: `${kind}:#${idx}` });
      }
    }
    if (options.detectPatterns !== false) {
      for (const m of detectPatterns(text)) {
        if (!taken(m.start, m.end)) matches.push({ m, key: entityKey(m) });
      }
    }
    matches.sort((a, b) => a.m.start - b.m.start);

    // 2. Marcar as áreas para remoção e guardar onde escrever cada marcador.
    const overlays: { rect: mupdf.Rect; label?: { full: string; short: string } }[] = [];
    let out = "";
    let cursor = 0;
    for (const { m, key } of matches) {
      const label = placeholderFor(key, m.kind, m.text.replace(/\s+/g, " "));
      out += text.slice(cursor, m.start) + label.full;
      cursor = m.end;
      // Recuo horizontal pequeno para não atingir a pontuação colada ao dado (ex.: "35,").
      const rects = lineRects(chars, m.start, m.end).map(([x0, y0, x1, y1]): mupdf.Rect => [x0 + 0.4, y0, x1 - 0.4, y1]);
      if (rects.length === 0) continue;
      const annot = page.createAnnotation("Redact");
      annot.setRect(rects.reduce((a, r) => [Math.min(a[0], r[0]), Math.min(a[1], r[1]), Math.max(a[2], r[2]), Math.max(a[3], r[3])]));
      annot.setQuadPoints(rects.map((r) => [r[0], r[1], r[2], r[1], r[0], r[3], r[2], r[3]] as mupdf.Quad));
      // O marcador vai no maior pedaço quando o dado quebra de linha; os demais ficam só com o fundo.
      const widest = rects.reduce((best, r, i) => (r[2] - r[0] > rects[best][2] - rects[best][0] ? i : best), 0);
      rects.forEach((r, i) => overlays.push({ rect: r, label: i === widest ? label : undefined }));
    }
    out += text.slice(cursor);
    pageTexts.push(out);

    if (overlays.length === 0) continue;

    // 3. Remover de verdade: texto sob as áreas some do conteúdo; pixels de imagens sob elas são apagados.
    page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_PIXELS, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE);

    // 4. Escrever os marcadores num novo fluxo de conteúdo, em coordenadas PDF.
    const toPdf = mupdf.Matrix.invert(page.getTransform());
    // Fundos cinza vão ANTES do conteúdo original (assim pontuação vizinha continua visível por cima);
    // os textos dos marcadores vão DEPOIS.
    let under = "q\n";
    let ops = "q\n";
    for (const { rect, label } of overlays) {
      const [x0, y0, x1, y1] = mupdf.Rect.transform(rect, toPdf);
      const w = x1 - x0;
      const h = y1 - y0;
      under += `0.88 g ${x0.toFixed(2)} ${y0.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;
      if (!label) continue;
      const fitted = fitLabel(label.full, label.short, Math.max(0, w - 1), h, measure);
      if (fitted.text !== label.full) usedShort.set(fitted.text, label.full);
      const baseline = y0 + (h - fitted.size * 0.7) / 2;
      ops += `0 g BT /AnonF ${fitted.size.toFixed(2)} Tf ${(fitted.scale * 100).toFixed(1)} Tz ${(x0 + 0.5).toFixed(2)} ${baseline.toFixed(2)} Td ${pdfString(fitted.text)} Tj ET\n`;
    }
    ops += "Q\n";
    under += "Q\n";

    const pageObj = page.getObject();
    const resources = pageObj.getInheritable("Resources");
    const res = resources.isNull() ? doc.newDictionary() : resources;
    let fonts = res.get("Font");
    if (fonts.isNull()) {
      fonts = doc.newDictionary();
      res.put("Font", fonts);
    }
    fonts.put("AnonF", fontRef);
    pageObj.put("Resources", res);

    // Isola o conteúdo original entre q/Q para que nosso desenho não herde estado gráfico dele.
    const contents = doc.newArray();
    contents.push(doc.addStream(under + "q\n", {}));
    const old = pageObj.get("Contents");
    if (old.isArray()) old.forEach((v) => contents.push(v));
    else if (!old.isNull()) contents.push(old);
    contents.push(doc.addStream("Q\n" + ops, {}));
    pageObj.put("Contents", contents);
  }

  if (usedShort.size > 0) addLegendPage(doc, fontRef, usedShort);

  scrub(doc);

  // garbage: descarta objetos que ficaram sem referência (inclusive o conteúdo antigo das páginas).
  const pdf = doc.saveToBuffer("encrypt=none,garbage=deduplicate,compress,clean").asUint8Array();
  return {
    pdf: pdf.slice(),
    text: pageTexts.map((t, i) => `--- Página ${i + 1} ---\n${t.trim()}`).join("\n\n"),
    replacements: [...replacements.values()],
  };
}

/**
 * Página final explicando as formas curtas usadas onde o marcador completo não cabia.
 * Só contém marcadores e texto fixo: nenhum dado do documento.
 */
function addLegendPage(doc: mupdf.PDFDocument, fontRef: mupdf.PDFObject, usedShort: Map<string, string>) {
  const last = doc.loadPage(doc.countPages() - 1);
  const [x0, y0, x1, y1] = mupdf.Rect.transform(last.getBounds(), mupdf.Matrix.invert(last.getTransform()));
  const pairs = [...usedShort].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const lines = [
    { text: "Legenda dos marcadores", size: 14 },
    { text: "Este PDF foi anonimizado. Onde o dado original era curto demais para o marcador completo,", size: 10 },
    { text: "foi usada uma forma abreviada, equivalente ao marcador completo do texto (.txt):", size: 10 },
    { text: "", size: 10 },
    ...pairs.map(([short, full]) => ({ text: `${short} = ${full}`, size: 10 })),
    { text: "", size: 10 },
    { text: "Esta página não faz parte do documento original.", size: 9 },
  ];
  let y = y1 - 60;
  let ops = "BT\n";
  for (const { text, size } of lines) {
    if (text) ops += `/AnonF ${size} Tf 1 0 0 1 ${(x0 + 56).toFixed(2)} ${y.toFixed(2)} Tm ${pdfString(text)} Tj\n`;
    y -= size * 1.6;
    if (y < y0 + 40) break;
  }
  ops += "ET\n";
  const resources = doc.newDictionary();
  const fonts = doc.newDictionary();
  fonts.put("AnonF", fontRef);
  resources.put("Font", fonts);
  doc.insertPage(-1, doc.addPage([x0, y0, x1, y1], 0, resources, ops));
}

/** Remove partes do PDF que podem carregar dados pessoais fora do texto das páginas. */
function scrub(doc: mupdf.PDFDocument) {
  const trailer = doc.getTrailer();
  trailer.delete("Info");
  const root = trailer.get("Root");
  for (const key of ["Metadata", "Outlines", "AcroForm", "Names", "OpenAction", "PieceInfo"]) root.delete(key);
  for (let p = 0; p < doc.countPages(); p++) {
    const page = doc.loadPage(p);
    for (const annot of page.getAnnotations()) page.deleteAnnotation(annot);
    page.getObject().delete("Metadata");
    page.getObject().delete("PieceInfo");
  }
}

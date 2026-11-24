// Diagnóstico do PDF antes de anonimizar: tudo o que faria a anonimização falhar EM SILÊNCIO.
//
// O motor só encontra o que consegue ler como texto. Uma página escaneada (só imagem), uma fonte sem
// mapa de caracteres (o texto extraído vira "�") ou uma imagem grande com dados (carimbo, assinatura,
// trecho escaneado) passariam sem nenhuma remoção e sem nenhum erro. Aqui isso vira aviso explícito.

import * as mupdf from "mupdf";

/** Recebe (páginas concluídas, total de páginas) a cada página processada. */
export type OnProgress = (done: number, total: number) => void;

export class PdfPasswordError extends Error {
  /** true quando uma senha foi informada e está errada. */
  readonly wrong: boolean;
  constructor(wrong: boolean) {
    super(wrong ? "Senha do PDF incorreta." : "Este PDF é protegido por senha.");
    this.name = "PdfPasswordError";
    this.wrong = wrong;
  }
}

/** Abre o PDF, autenticando com a senha quando ele for protegido. */
export function openPdf(input: Uint8Array, password?: string): mupdf.PDFDocument {
  const doc = new mupdf.PDFDocument(input);
  if (doc.needsPassword()) {
    if (!password) throw new PdfPasswordError(false);
    if (!doc.authenticatePassword(password)) throw new PdfPasswordError(true);
  }
  return doc;
}

export type PageStatus = "ok" | "sem-texto" | "imagem" | "ilegivel";

export interface PageStats {
  /** Caracteres visíveis (sem espaços). */
  chars: number;
  /** Desses, quantos não puderam ser convertidos em letra (�, área de uso privado, controle). */
  illegible: number;
  /** Fração da área da página coberta por imagens (0 a 1). */
  imageCoverage: number;
}

/** Abaixo disto, a página é tratada como sem texto. */
const MIN_CHARS = 30;
/** Imagem que cobre ao menos esta fração da página merece aviso. */
const LARGE_IMAGE = 0.3;
/** Fração de caracteres ilegíveis a partir da qual a página é ilegível. */
const ILLEGIBLE_RATIO = 0.2;

export function classifyPage({ chars, illegible, imageCoverage }: PageStats): PageStatus {
  if (chars < MIN_CHARS) return imageCoverage >= LARGE_IMAGE ? "sem-texto" : "ok";
  if (illegible / chars >= ILLEGIBLE_RATIO) return "ilegivel";
  if (imageCoverage >= LARGE_IMAGE) return "imagem";
  return "ok";
}

const isIllegible = (c: string) => {
  const cp = c.codePointAt(0)!;
  return c === "�" || (cp >= 0xe000 && cp <= 0xf8ff) || cp < 0x20;
};

export function pageStats(page: mupdf.Page): PageStats {
  const [x0, y0, x1, y1] = page.getBounds();
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  let chars = 0;
  let illegible = 0;
  let imageArea = 0;
  page.toStructuredText("preserve-images").walk({
    onChar(c) {
      if (/\s/.test(c)) return;
      chars++;
      if (isIllegible(c)) illegible++;
    },
    onImageBlock([ix0, iy0, ix1, iy1]) {
      const w = Math.max(0, Math.min(ix1, x1) - Math.max(ix0, x0));
      const h = Math.max(0, Math.min(iy1, y1) - Math.max(iy0, y0));
      imageArea += w * h;
    },
  });
  return { chars, illegible, imageCoverage: Math.min(1, imageArea / area) };
}

export type WarningKind = "SEM_TEXTO" | "ILEGIVEL" | "IMAGEM" | "ASSINATURA";

export interface Warning {
  kind: WarningKind;
  /** Páginas afetadas (1 = primeira). */
  pages?: number[];
  message: string;
}

export interface Diagnosis {
  pages: number;
  warnings: Warning[];
}

const MESSAGES: Record<WarningKind, string> = {
  SEM_TEXTO:
    "Página sem texto legível (provavelmente escaneada). Nada nela pode ser anonimizado automaticamente: remova a página ou trate-a à parte antes de usar o PDF.",
  ILEGIVEL:
    "Página com texto que não pôde ser lido (fonte sem mapa de caracteres). Os dados dela não são encontrados: confira o resultado com atenção ou não use estas páginas.",
  IMAGEM:
    "Página com imagem grande. O que estiver só na imagem (assinaturas, carimbos, trechos escaneados) não é verificado.",
  ASSINATURA: "O PDF tem assinatura digital. Depois de anonimizado, a assinatura deixa de valer: o resultado não é um documento oficial.",
};

/** Campos de assinatura digital no formulário do PDF. */
function hasSignature(doc: mupdf.PDFDocument): boolean {
  const acro = doc.getTrailer().get("Root").get("AcroForm");
  if (acro.isNull()) return false;
  let found = false;
  const visit = (field: mupdf.PDFObject, depth: number) => {
    if (found || depth > 20 || field.isNull()) return;
    const ft = field.get("FT");
    if (ft.isName() && ft.asName() === "Sig") found = true;
    const kids = field.get("Kids");
    if (kids.isArray()) kids.forEach((k) => visit(k, depth + 1));
  };
  const fields = acro.get("Fields");
  if (fields.isArray()) fields.forEach((f) => visit(f, 0));
  return found;
}

export function diagnoseDocument(doc: mupdf.PDFDocument, onProgress?: OnProgress): Diagnosis {
  const byKind = new Map<WarningKind, number[]>();
  const pages = doc.countPages();
  for (let i = 0; i < pages; i++) {
    const status = classifyPage(pageStats(doc.loadPage(i)));
    const kind: WarningKind | null = status === "sem-texto" ? "SEM_TEXTO" : status === "ilegivel" ? "ILEGIVEL" : status === "imagem" ? "IMAGEM" : null;
    if (kind) byKind.set(kind, [...(byKind.get(kind) ?? []), i + 1]);
    onProgress?.(i + 1, pages);
  }
  const warnings: Warning[] = [];
  for (const kind of ["SEM_TEXTO", "ILEGIVEL", "IMAGEM"] as const) {
    const list = byKind.get(kind);
    if (list) warnings.push({ kind, pages: list, message: MESSAGES[kind] });
  }
  if (hasSignature(doc)) warnings.push({ kind: "ASSINATURA", message: MESSAGES.ASSINATURA });
  return { pages, warnings };
}

export function diagnosePdf(input: Uint8Array, password?: string, onProgress?: OnProgress): Diagnosis {
  return diagnoseDocument(openPdf(input, password), onProgress);
}

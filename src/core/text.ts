// Extração do texto da página com a posição de cada caractere.
//
// O MuPDF devolve o texto em "linhas" internas que nem sempre são linhas visuais: em texto
// justificado, uma linha da página pode vir partida em vários pedaços (às vezes uma palavra
// por pedaço). Aqui juntamos de volta, com um espaço, os pedaços que estão na mesma altura e
// próximos na horizontal. Colunas de tabela (distantes) continuam separadas por quebra de linha.

import * as mupdf from "mupdf";
import { openPdf, type OnProgress } from "./diagnose.ts";

export interface Char {
  c: string;
  quad: mupdf.Quad | null;
  /** Linha visual: caracteres com o mesmo número ficam na mesma linha da página. */
  line: number;
}

export interface PageText {
  /** Texto da página; `text[i]` corresponde a `chars[i]`. */
  text: string;
  chars: Char[];
}

/** Distância horizontal máxima, em tamanhos de fonte, para considerar dois pedaços a mesma linha. */
const MAX_GAP_EM = 2.5;
/** Salto vertical, em tamanhos de fonte, a partir do qual há um parágrafo (entrelinha normal fica entre 1,1 e 1,5). */
const PARAGRAPH_GAP_EM = 1.75;

export function readPage(page: mupdf.Page): PageText {
  const chars: Char[] = [];
  let line = 0;
  let pending: "" | "line" | "block" = "";
  let last: { y: number; x: number; size: number } | null = null;

  page.toStructuredText("preserve-whitespace").walk({
    onChar(c, origin, _font, size, quad) {
      if (pending) {
        const sameLine =
          last !== null &&
          Math.abs(origin[1] - last.y) < Math.max(1, last.size * 0.3) &&
          origin[0] >= last.x - 1 &&
          origin[0] - last.x < MAX_GAP_EM * Math.max(size, last.size);
        if (sameLine) {
          if (chars.length && chars[chars.length - 1].c !== " " && c !== " ") chars.push({ c: " ", quad: null, line });
        } else {
          line++;
          chars.push({ c: "\n", quad: null, line });
          // Parágrafo (linha em branco) pela geometria: salto vertical maior que o espaçamento normal entre
          // linhas, ou volta para cima (nova coluna). Os blocos do MuPDF não são confiáveis para isso:
          // alguns geradores põem cada linha num bloco.
          const dy = last === null ? 0 : origin[1] - last.y;
          if (last !== null && (dy > PARAGRAPH_GAP_EM * Math.max(size, last.size) || dy < -size)) chars.push({ c: "\n", quad: null, line });
        }
        pending = "";
      }
      chars.push({ c, quad, line });
      last = { y: origin[1], x: quad ? Math.max(quad[2], quad[6]) : origin[0], size };
    },
    endLine() {
      if (pending !== "block") pending = "line";
    },
    endTextBlock() {
      pending = "block";
    },
  });
  if (chars.length) chars.push({ c: "\n", quad: null, line });

  // Caracteres fora do BMP viram 2 unidades UTF-16; substituímos por um só para manter o alinhamento.
  const text = chars.map((ch) => (ch.c.length === 1 ? ch.c : "�")).join("");
  return { text, chars };
}

/** Texto de todas as páginas, com as linhas visuais reconstruídas (para sugestões e análise). */
export function documentText(pdf: Uint8Array, password?: string, onProgress?: OnProgress): string {
  const doc = openPdf(pdf, password);
  const pages: string[] = [];
  const total = doc.countPages();
  for (let i = 0; i < total; i++) {
    pages.push(readPage(doc.loadPage(i)).text);
    onProgress?.(i + 1, total);
  }
  return pages.join("\n");
}

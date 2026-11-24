// Pré-visualização da revisão: imagem da página com o que será removido (e o que ficou desmarcado).
//
// As caixas "removidas" vêm do MESMO planejamento usado pelo motor (plan.ts), com as mesmas opções:
// o que aparece em destaque é exatamente o que será removido.

import * as mupdf from "mupdf";
import { detectPatterns, type Kind } from "./detectors.ts";
import { planPage, type Person, type PlannedMatch } from "./plan.ts";
import { readPage } from "./text.ts";
import { KIND_LABELS } from "./summary.ts";

export interface PreviewOptions {
  /** Todas as pessoas/empresas da lista (marcadas e desmarcadas). */
  people: Person[];
  /** Quais estão marcadas para remoção (mesmo índice de `people`). */
  selected: boolean[];
  detectPatterns?: boolean;
  skipKinds?: Kind[];
}

export interface PreviewBox {
  kind: Kind;
  /** Chave da entidade (dados detectados): casa com o marcador previsto em `planLabels`. */
  key: string;
  text: string;
  /** Índice em `people`, quando veio de um nome. */
  person?: number;
  /** true = será removido; false = encontrado, mas desmarcado. */
  removed: boolean;
  /** Em pixels da imagem. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PreviewWord {
  text: string;
  /** Em pixels da imagem. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PagePreview {
  png: Uint8Array;
  width: number;
  height: number;
  boxes: PreviewBox[];
  /** Palavras da página, na ordem de leitura (para selecionar um trecho e anonimizá-lo). */
  words: PreviewWord[];
}

const ALL_KINDS = Object.keys(KIND_LABELS) as Kind[];

export function previewPage(doc: mupdf.Document, index: number, opts: PreviewOptions, scale: number): PagePreview {
  const page = doc.loadPage(index);
  const [bx0, by0] = page.getBounds();
  const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
  const width = pix.getWidth();
  const height = pix.getHeight();

  // Pessoas marcadas mantêm o índice original; as desmarcadas entram como lista vazia (não casam).
  const selectedPeople = opts.people.map((p, i) => (opts.selected[i] ? p : { ...p, variants: [] }));
  const removed = planPage(page, { people: selectedPeople, detectPatterns: opts.detectPatterns, skipKinds: opts.skipKinds }).matches;

  // O que foi encontrado mas não será removido: pessoas desmarcadas e tipos desligados.
  const unselectedPeople = opts.people.map((p, i) => (opts.selected[i] ? { ...p, variants: [] } : p));
  const skipped = new Set(opts.skipKinds ?? []);
  const kept = planPage(page, {
    people: unselectedPeople,
    detectPatterns: opts.detectPatterns !== false && skipped.size > 0,
    skipKinds: ALL_KINDS.filter((k) => !skipped.has(k)),
  }).matches.filter((k) => !removed.some((r) => k.start < r.end && k.end > r.start));

  const toBoxes = (list: PlannedMatch[], isRemoved: boolean): PreviewBox[] =>
    list.flatMap((m) =>
      m.rects.map(([x0, y0, x1, y1]) => {
        const x = Math.max(0, (x0 - bx0) * scale);
        const y = Math.max(0, (y0 - by0) * scale);
        return {
          kind: m.kind,
          key: m.key,
          text: m.text.replace(/\s+/g, " "),
          person: m.person,
          removed: isRemoved,
          x,
          y,
          w: Math.min(width - x, (x1 - x0) * scale),
          h: Math.min(height - y, (y1 - y0) * scale),
        };
      }),
    );

  // Palavras: sequências sem espaço do texto reconstruído, com o retângulo dos seus caracteres.
  const { text, chars } = readPage(page);
  const words: PreviewWord[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = m.index; i < m.index + m[0].length; i++) {
      const q = chars[i].quad;
      if (!q) continue;
      x0 = Math.min(x0, q[0], q[4]); y0 = Math.min(y0, q[1], q[3]);
      x1 = Math.max(x1, q[2], q[6]); y1 = Math.max(y1, q[5], q[7]);
    }
    if (!Number.isFinite(x0)) continue;
    const x = Math.max(0, (x0 - bx0) * scale);
    const y = Math.max(0, (y0 - by0) * scale);
    words.push({ text: m[0], x, y, w: Math.min(width - x, (x1 - x0) * scale), h: Math.min(height - y, (y1 - y0) * scale) });
  }

  return { png: pix.asPNG().slice(), width, height, boxes: [...toBoxes(removed, true), ...toBoxes(kept, false)], words };
}

/** Quantidade de dados de formato fixo encontrados, por tipo (para os botões de "Dados detectados"). */
export function detectedCounts(text: string): Partial<Record<Kind, number>> {
  const counts: Partial<Record<Kind, number>> = {};
  for (const m of detectPatterns(text)) counts[m.kind] = (counts[m.kind] ?? 0) + 1;
  return counts;
}

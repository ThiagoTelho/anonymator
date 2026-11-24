// Planejamento da remoção: o que será removido em cada página, onde (retângulos) e de que tipo.
//
// É a fonte única usada tanto pelo motor (anonymize.ts) quanto pela pré-visualização na tela: o
// que aparece destacado na revisão é exatamente o que o motor remove.

import type * as mupdf from "mupdf";
import { detectPatterns, findTerm, type Kind, type Match } from "./detectors.ts";
import { readPage, type Char } from "./text.ts";

export interface Person {
  /** Grafias da mesma pessoa no documento (ex.: nome completo, "Sr. Almeida"). */
  variants: string[];
  /** PESSOA (padrão) ou EMPRESA: define o marcador ([PESSOA_n] ou [EMPRESA_n]). */
  kind?: "PESSOA" | "EMPRESA";
}

export interface PlanOptions {
  /** Pessoas e empresas a remover. */
  people: Person[];
  /** Detectar dados de formato fixo (CPF, endereço…). Padrão: true. */
  detectPatterns?: boolean;
  /** Tipos de dado detectado que o usuário desligou (não são removidos). */
  skipKinds?: Kind[];
}

export interface PlannedMatch extends Match {
  /** Identidade da entidade: mesmas chaves recebem o mesmo marcador. */
  key: string;
  /** Índice em `people`, quando o trecho veio de um nome. */
  person?: number;
  /** Retângulos na página (um por linha), já com o recuo que protege a pontuação vizinha. */
  rects: mupdf.Rect[];
}

export interface PagePlan {
  text: string;
  chars: Char[];
  matches: PlannedMatch[];
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
export function entityKey(m: Match): string {
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

/** Localiza na página tudo o que será removido: pessoas declaradas primeiro, depois os padrões, sem sobreposição. */
export function planPage(page: mupdf.Page, options: PlanOptions): PagePlan {
  const { text, chars } = readPage(page);
  const matches: PlannedMatch[] = [];
  const taken = (s: number, e: number) => matches.some((m) => s < m.end && e > m.start);
  const add = (m: Match, key: string, person?: number) => {
    // Recuo horizontal pequeno para não atingir a pontuação colada ao dado (ex.: "35,").
    const rects = lineRects(chars, m.start, m.end).map(([x0, y0, x1, y1]): mupdf.Rect => [x0 + 0.4, y0, x1 - 0.4, y1]);
    matches.push({ ...m, key, person, rects });
  };

  // Variantes mais longas primeiro, entre todas as pessoas: "Maria da Silva" (pessoa 2)
  // ganha de "Maria" (pessoa 1) no mesmo trecho.
  const variants = options.people
    .flatMap((person, idx) => person.variants.map((v) => ({ v, idx, kind: person.kind ?? "PESSOA" })))
    .sort((a, b) => b.v.length - a.v.length);
  for (const { v, idx, kind } of variants) {
    for (const m of findTerm(text, v, kind)) {
      if (!taken(m.start, m.end)) add(m, `${kind}:#${idx}`, idx);
    }
  }
  if (options.detectPatterns !== false) {
    const skip = new Set(options.skipKinds ?? []);
    for (const m of detectPatterns(text)) {
      if (!skip.has(m.kind) && !taken(m.start, m.end)) add(m, entityKey(m));
    }
  }
  matches.sort((a, b) => a.start - b.start);
  return { text, chars, matches };
}

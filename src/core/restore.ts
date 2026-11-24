// Reversão: devolve os dados reais a um texto com marcadores (ex.: a resposta da IA), usando a tabela de
// correspondência que ficou na máquina do usuário. Roda localmente, como todo o resto.

import type { Replacement } from "./anonymize.ts";
import { shortLabel } from "./labels.ts";

export interface RestoreResult {
  text: string;
  /** Quantos marcadores foram trocados. */
  restored: number;
  /** Marcadores encontrados no texto que não estão na tabela (ficam como estão). */
  unknown: string[];
}

/** Grafia preferida: a mais longa com minúsculas ("Maria da Silva Souza" em vez de "MARIA DA SILVA SOUZA"). */
function preferred(r: Replacement): string {
  const byLength = [...r.originals].sort((a, b) => b.length - a.length);
  return byLength.find((o) => /\p{Ll}/u.test(o)) ?? byLength[0] ?? r.placeholder;
}

/**
 * Formas aceitas: [PESSOA_1], [pessoa_1], [ PESSOA_1 ], PESSOA_1 (sem colchetes) e a forma curta do PDF
 * entre colchetes ([P1], [NASC1]).
 */
const MARKER = /\[\s*([A-Za-z]+)_(\d+)\s*\]|(?<![\p{L}\d_])([A-Z]+)_(\d+)(?![\p{L}\d_])|\[([A-Za-z]+)(\d+)\]/gu;

export function restoreText(text: string, table: Replacement[]): RestoreResult {
  const byFull = new Map<string, string>();
  const byShort = new Map<string, string>();
  for (const r of table) {
    const m = /^\[([A-Z]+)_(\d+)\]$/.exec(r.placeholder);
    if (!m) continue;
    const value = preferred(r);
    byFull.set(`${m[1]}_${m[2]}`, value);
    byShort.set(shortLabel(m[1], Number(m[2])), value);
  }
  let restored = 0;
  const unknown = new Set<string>();
  const out = text.replace(MARKER, (match, k1, n1, k2, n2, k3, n3) => {
    const value = k1 ? byFull.get(`${k1.toUpperCase()}_${n1}`) : k2 ? byFull.get(`${k2}_${n2}`) : byShort.get(`[${k3.toUpperCase()}${n3}]`);
    if (value === undefined) {
      // Só reporta o que tem cara de marcador do app (com "_" ou entre colchetes).
      if (k1 || k2 || k3) unknown.add(k1 ? `[${k1.toUpperCase()}_${n1}]` : k2 ? `[${k2}_${n2}]` : match);
      return match;
    }
    restored++;
    return value;
  });
  return { text: out, restored, unknown: [...unknown] };
}

/** Lê o JSON da tabela de correspondência baixado do app. */
export function parseCorrespondence(json: string): Replacement[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("O arquivo não é uma tabela de correspondência do Anonymator.");
  }
  const ok =
    Array.isArray(data) &&
    data.every((r) => r && typeof r.placeholder === "string" && Array.isArray(r.originals) && typeof r.kind === "string");
  if (!ok) throw new Error("O arquivo não é uma tabela de correspondência do Anonymator.");
  return data as Replacement[];
}

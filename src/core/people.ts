// Monta a lista final de pessoas/empresas a anonimizar a partir das sugestões revisadas
// e dos nomes digitados à mão. Sem dependência de React, para ser testável.

import type { Person } from "./anonymize.ts";
import type { Suggestion } from "./names.ts";

/** Uma pessoa por linha; grafias da mesma pessoa separadas por ";". Linhas com "#" no início são ignoradas. */
export function parseManual(raw: string): Person[] {
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .map((line) => line.split(";").map((v) => v.trim()).filter(Boolean))
    .filter((variants) => variants.length > 0)
    .map((variants) => ({ variants }));
}

/** Seleção inicial: tudo marcado, menos agentes públicos. */
export const defaultSelection = (suggestions: Suggestion[]) => suggestions.map((s) => !s.publicAgent);

export function buildPeople(suggestions: Suggestion[], selected: boolean[], manual: string): Person[] {
  const chosen = suggestions.filter((_, i) => selected[i]).map((s) => ({ variants: s.variants, kind: s.kind }));
  return [...chosen, ...parseManual(manual)];
}

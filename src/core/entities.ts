// Lista editável de pessoas e empresas da revisão. Funções puras: recebem a lista e devolvem uma nova.

import { fold } from "./detectors.ts";
import type { Suggestion } from "./names.ts";
import type { Person } from "./plan.ts";

export interface Entity {
  id: string;
  kind: "PESSOA" | "EMPRESA";
  /** Forma exibida. */
  name: string;
  /** Grafias procuradas no documento. */
  variants: string[];
  /** Marcada para remoção. */
  selected: boolean;
  publicAgent: boolean;
  occurrences: number;
  source: "sugestao" | "manual";
}

let nextId = 0;
const newId = () => `e${++nextId}`;
const same = (a: string, b: string) => fold(a).replace(/\s+/g, " ").trim() === fold(b).replace(/\s+/g, " ").trim();

export function fromSuggestions(suggestions: Suggestion[]): Entity[] {
  return suggestions.map((s) => ({
    id: newId(),
    kind: s.kind,
    name: s.name,
    variants: [...s.variants],
    selected: !s.publicAgent,
    publicAgent: s.publicAgent,
    occurrences: s.occurrences,
    source: "sugestao",
  }));
}

const update = (list: Entity[], id: string, f: (e: Entity) => Entity) => list.map((e) => (e.id === id ? f(e) : e));

export const setSelected = (list: Entity[], id: string, selected: boolean) => update(list, id, (e) => ({ ...e, selected }));

export const setKind = (list: Entity[], id: string, kind: Entity["kind"]) => update(list, id, (e) => ({ ...e, kind }));

export function addVariant(list: Entity[], id: string, variant: string): Entity[] {
  const v = variant.trim();
  if (!v) return list;
  return update(list, id, (e) => (e.variants.some((x) => same(x, v)) ? e : { ...e, variants: [...e.variants, v] }));
}

/** Remove a grafia; uma pessoa sem nenhuma grafia sai da lista. */
export function removeVariant(list: Entity[], id: string, variant: string): Entity[] {
  return update(list, id, (e) => ({ ...e, variants: e.variants.filter((x) => x !== variant) })).filter((e) => e.variants.length > 0);
}

/** Junta as entidades na primeira da lista de ids. */
export function merge(list: Entity[], ids: string[]): Entity[] {
  const [keep, ...rest] = ids;
  const target = list.find((e) => e.id === keep);
  const others = list.filter((e) => rest.includes(e.id));
  if (!target || others.length === 0) return list;
  const variants = [...target.variants];
  for (const o of others) for (const v of o.variants) if (!variants.some((x) => same(x, v))) variants.push(v);
  const merged: Entity = {
    ...target,
    variants,
    selected: target.selected || others.some((o) => o.selected),
    publicAgent: target.publicAgent && others.every((o) => o.publicAgent),
    occurrences: target.occurrences + others.reduce((n, o) => n + o.occurrences, 0),
  };
  return list.filter((e) => !rest.includes(e.id)).map((e) => (e.id === keep ? merged : e));
}

/** Tira uma grafia da entidade e cria uma entidade nova com ela, logo depois da original. */
export function split(list: Entity[], id: string, variant: string): Entity[] {
  const i = list.findIndex((e) => e.id === id);
  if (i < 0 || !list[i].variants.includes(variant) || list[i].variants.length < 2) return list;
  const original = { ...list[i], variants: list[i].variants.filter((v) => v !== variant) };
  const created: Entity = { ...list[i], id: newId(), name: variant, variants: [variant], publicAgent: false, occurrences: 0, source: "manual" };
  return [...list.slice(0, i), original, created, ...list.slice(i + 1)];
}

/** Cria uma entidade marcada. Se o nome já é grafia de alguém, não duplica. */
export function addEntity(list: Entity[], name: string, kind: Entity["kind"]): Entity[] {
  const v = name.trim();
  if (!v || list.some((e) => e.variants.some((x) => same(x, v)))) return list;
  return [...list, { id: newId(), kind, name: v, variants: [v], selected: true, publicAgent: false, occurrences: 0, source: "manual" }];
}

/** Pessoas marcadas, no formato do motor. */
export const toPeople = (list: Entity[]): Person[] => list.filter((e) => e.selected).map((e) => ({ variants: e.variants, kind: e.kind }));

/** Todas as pessoas, com a seleção ao lado (a pré-visualização mostra também as desmarcadas). */
export const toPreview = (list: Entity[]) => ({
  people: list.map((e): Person => ({ variants: e.variants, kind: e.kind })),
  selected: list.map((e) => e.selected),
});

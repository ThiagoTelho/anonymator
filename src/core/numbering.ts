// Numeração dos marcadores ([PESSOA_1], [CPF_2]…): por tipo, na ordem em que cada entidade aparece no
// documento. Compartilhada pelo motor e pela revisão, para o marcador mostrado na tela ser o do PDF final.

import type * as mupdf from "mupdf";
import type { Replacement } from "./anonymize.ts";
import type { Kind } from "./detectors.ts";
import { shortLabel } from "./labels.ts";
import { planPage, type PlanOptions } from "./plan.ts";

export class PlaceholderNumbering {
  private byKey = new Map<string, Replacement & { short: string }>();
  private counters = new Map<Kind, number>();

  /** Marcador da entidade `key` (cria na primeira vez) e registra mais uma ocorrência com a grafia `original`. */
  assign(key: string, kind: Kind, original: string): { full: string; short: string } {
    let r = this.byKey.get(key);
    if (!r) {
      const n = (this.counters.get(kind) ?? 0) + 1;
      this.counters.set(kind, n);
      r = { placeholder: `[${kind}_${n}]`, kind, originals: [], occurrences: 0, short: shortLabel(kind, n) };
      this.byKey.set(key, r);
    }
    if (!r.originals.includes(original)) r.originals.push(original);
    r.occurrences++;
    return { full: r.placeholder, short: r.short };
  }

  /** Marcador já atribuído a `key`, se houver. */
  get(key: string): string | undefined {
    return this.byKey.get(key)?.placeholder;
  }

  keys(): string[] {
    return [...this.byKey.keys()];
  }

  replacements(): Replacement[] {
    return [...this.byKey.values()].map(({ placeholder, kind, originals, occurrences }) => ({ placeholder, kind, originals, occurrences }));
  }
}

export interface PlannedLabels {
  /** Marcador de cada pessoa/empresa (índice em `people`); ausente se ela não aparece no documento. */
  people: Record<number, string>;
  /** Marcador de cada dado detectado, pela chave da entidade (ex.: "CPF:11144477735"). */
  keys: Record<string, string>;
}

/** Percorre o documento como o motor faria e devolve os marcadores que cada entidade vai receber. */
export function planLabels(doc: mupdf.Document, options: PlanOptions): PlannedLabels {
  const numbering = new PlaceholderNumbering();
  for (let p = 0; p < doc.countPages(); p++) {
    for (const m of planPage(doc.loadPage(p), options).matches) numbering.assign(m.key, m.kind, m.text);
  }
  const people: Record<number, string> = {};
  const keys: Record<string, string> = {};
  for (const key of numbering.keys()) {
    const person = /^(?:PESSOA|EMPRESA):#(\d+)$/.exec(key);
    if (person) people[Number(person[1])] = numbering.get(key)!;
    else keys[key] = numbering.get(key)!;
  }
  return { people, keys };
}

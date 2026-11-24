// Resumo do que foi anonimizado, para a tela de resultado.

import type { Replacement } from "./anonymize.ts";
import type { Kind } from "./detectors.ts";

export const KIND_LABELS: Record<Kind, string> = {
  PESSOA: "Pessoas",
  EMPRESA: "Empresas",
  CPF: "CPF",
  CNPJ: "CNPJ",
  RG: "RG",
  CNH: "CNH",
  PIS: "PIS/PASEP",
  CTPS: "CTPS",
  ELEITOR: "Título de eleitor",
  OAB: "OAB",
  RENAVAM: "RENAVAM",
  PLACA: "Placas",
  EMAIL: "E-mails",
  TELEFONE: "Telefones",
  ENDERECO: "Endereços",
  CEP: "CEP",
  CONTA: "Dados bancários",
  PIX: "Chaves PIX",
  NASCIMENTO: "Datas de nascimento",
  INICIAIS: "Iniciais",
  ESCOLA: "Escolas",
  REGISTRO: "CIF/matrícula/registro",
  PROCESSO: "Números de processo",
  PROTOCOLO: "Protocolos e autos",
  CODIGO: "Códigos de verificação",
  RASTREIO: "Rastreio dos Correios",
};

export interface SummaryRow {
  kind: Kind;
  label: string;
  /** Pessoas/documentos distintos. */
  distinct: number;
  /** Trechos removidos no PDF. */
  occurrences: number;
}

/** Agrupa as substituições por tipo, na ordem de KIND_LABELS. */
export function summarize(replacements: Replacement[]): SummaryRow[] {
  const rows = new Map<Kind, SummaryRow>();
  for (const r of replacements) {
    const row = rows.get(r.kind) ?? { kind: r.kind, label: KIND_LABELS[r.kind], distinct: 0, occurrences: 0 };
    row.distinct++;
    row.occurrences += r.occurrences;
    rows.set(r.kind, row);
  }
  const order = Object.keys(KIND_LABELS) as Kind[];
  return [...rows.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

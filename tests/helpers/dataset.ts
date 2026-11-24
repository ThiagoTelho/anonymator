// Avalia o Anonymator num conjunto de PDFs fictícios gerados com gabarito estruturado
// (um <nome>.json ao lado de cada <nome>.pdf, no formato do gerador de processos do MPT).
//
// Roda o fluxo como o usuário faria: sugestões automáticas com a seleção padrão (agentes públicos
// desmarcados) + detectores. Para cada dado pessoal do gabarito que aparece no PDF original,
// confere se ele ainda pode ser lido no PDF anonimizado.
//
// Usado por tests/dataset.test.ts e pelo relatório scripts/eval-dataset.ts.
import { readFileSync } from "node:fs";
import { anonymizePdf } from "../../src/core/anonymize.ts";
import { fold } from "../../src/core/detectors.ts";
import { extractText } from "../../src/core/leaks.ts";
import { suggestEntities } from "../../src/core/names.ts";
import { buildPeople, defaultSelection } from "../../src/core/people.ts";
import { documentText } from "../../src/core/text.ts";
import { FIRST_NAMES } from "./names.ts";

export interface Expected {
  category: string;
  value: string;
  /** Padrões que encontram o valor em qualquer formatação (máscara, data por extenso…). */
  patterns: RegExp[];
}

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const flatten = (s: string) => fold(s).replace(/\s+/g, " ");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Dígitos com qualquer separador (ou nenhum) entre eles: 155.375.037-35 = 15537503735 = 155 375 037 35. */
const digitsPattern = (v: string) => new RegExp(`(?<!\\d)${[...v.replace(/\D/g, "")].join("[\\s.\\-/]?")}(?!\\d)`);
const textPattern = (v: string) => new RegExp(`(?<![\\p{L}\\d])${flatten(v).split(" ").map(esc).join("\\s+")}(?![\\p{L}\\d])`, "u");
const datePatterns = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return [
    new RegExp(`(?<!\\d)0?${d}[/.]0?${m}[/.](?:${y}|${String(y).slice(2)})(?!\\d)`),
    new RegExp(`(?<!\\d)${dd}[/.]${mm}[/.]${y}(?!\\d)`),
    new RegExp(`(?<!\\d)${d}(?:º)?\\s+de\\s+${MONTHS[m - 1]}\\s+de\\s+${y}`),
  ];
};
/** Parte do endereço antes da cidade/UF: "Rua dos Ipês, nº 63" de "Rua dos Ipês, nº 63, Guarulhos/SP, CEP …". */
const streetPart = (addr: string) => addr.split(/,\s*[^,]+\/[A-Z]{2}\b/)[0];

/** Valor em reais em qualquer formatação: R$ 1.234,56 / R$ 1234,56 / R$1.234,56. */
const moneyPattern = (v: number) => {
  const [int, dec] = v.toFixed(2).split(".");
  const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, "\\.?");
  return new RegExp(`R\\$\\s?${withDots},${dec}`);
};

/** O que NÃO é dado pessoal e precisa continuar no PDF (detecta apagamento em excesso). */
export function keepFrom(truth: any): Expected[] {
  const keep: Expected[] = [];
  const n = truth.numeros ?? {};
  if (n.portaria) keep.push({ category: "portaria", value: n.portaria, patterns: [digitsPattern(n.portaria)] });
  if (n.tac) keep.push({ category: "nº do TAC", value: n.tac, patterns: [digitsPattern(n.tac)] });
  if (n.vara_relacionada) keep.push({ category: "vara", value: n.vara_relacionada, patterns: [textPattern(n.vara_relacionada)] });
  for (const k of ["instauracao_ic", "audiencia_e_tac", "relatorio"]) {
    const d = truth.datas?.[k];
    if (d) keep.push({ category: "data comum", value: d, patterns: datePatterns(d) });
  }
  for (const k of ["dano_moral_coletivo", "total_horas_extras"]) {
    const v = truth.valores?.[k];
    if (typeof v === "number") keep.push({ category: "valor", value: String(v), patterns: [moneyPattern(v)] });
  }
  if (truth.orgao?.ramo) keep.push({ category: "órgão", value: truth.orgao.ramo, patterns: [textPattern(truth.orgao.ramo)] });
  return keep;
}

export function expectedFrom(truth: any): { pii: Expected[]; agents: string[]; people: string[]; company: string } {
  const pii: Expected[] = [];
  const add = (category: string, value: string | undefined, kind: "text" | "digits" | "date" | "code" = "text") => {
    if (!value) return;
    const patterns =
      kind === "digits" ? [digitsPattern(value)] : kind === "date" ? datePatterns(value) : kind === "code" ? [new RegExp(`(?<![A-Za-z0-9])${esc(value)}(?![A-Za-z0-9])`, "i")] : [textPattern(value)];
    pii.push({ category, value, patterns });
  };
  const inv = truth.investigada;
  const den = truth.denunciante;
  const adv = truth.advogado;
  add("empresa", inv.razao_social);
  add("cnpj", inv.cnpj, "digits");
  add("endereço", streetPart(inv.endereco));
  add("pessoa", inv.socio_administrador?.nome);
  add("cpf", inv.socio_administrador?.cpf, "digits");
  add("pessoa", den.nome);
  add("cpf", den.cpf, "digits");
  add("pis", den.pis, "digits");
  add("ctps", den.ctps?.split(/\s+/)[0], "digits");
  add("nascimento", den.nascimento, "date");
  add("endereço", streetPart(den.endereco));
  add("telefone", den.telefone, "digits");
  add("email", den.email);
  add("pessoa", adv.nome);
  add("oab", adv.oab?.replace(/\D/g, ""), "digits");
  add("cpf", adv.cpf, "digits");
  add("email", adv.email);
  for (const t of truth.trabalhadores ?? []) {
    add("pessoa", t.nome);
    add("cpf", t.cpf, "digits");
    add("pis", t.pis, "digits");
  }
  add("registro (CIF)", truth.auditor_fiscal?.cif, "digits");
  const n = truth.numeros ?? {};
  add("processo", n.inquerito_civil, "digits");
  add("processo", n.noticia_de_fato, "digits");
  add("processo", n.processo_cnj_relacionado, "digits");
  for (const a of n.autos_de_infracao ?? []) add("auto de infração", a, "digits");
  for (const d of truth.documentos ?? []) add("código de verificação", d.codigo_verificacao, "code");
  return {
    pii,
    agents: [truth.membro_oficiante?.nome, truth.auditor_fiscal?.nome].filter(Boolean),
    people: [inv.socio_administrador?.nome, den.nome, adv.nome, ...(truth.trabalhadores ?? []).map((t: any) => t.nome)].filter(Boolean),
    company: inv.razao_social,
  };
}

export interface DocResult {
  file: string;
  layout: Record<string, unknown>;
  present: Expected[];
  leaked: { e: Expected; context: string }[];
  /** Sugestões que não são ninguém do gabarito. */
  falseSuggestions: string[];
  /** Agentes públicos que não vieram marcados como tal (ficariam marcados para anonimizar: não vaza, mas atrapalha). */
  agentsNotFlagged: string[];
  /** Partes/advogado/trabalhadores marcados como agente público (viriam desmarcados: vazam). */
  wronglyFlagged: string[];
  ms: number;
  /** Itens não pessoais presentes no original que sumiram do PDF anonimizado (apagamento em excesso). */
  overRemoved: Expected[];
  keptChecked: number;
}

const found = (text: string, e: Expected) => {
  const t = flatten(text);
  for (const p of e.patterns) {
    const m = p.exec(e.patterns[0].source.includes("\\p{L}") ? t : text) ?? p.exec(t);
    if (m) return m;
  }
  return null;
};

export function evaluate(pdfPath: string, truth: any): DocResult {
  const pdf = readFileSync(pdfPath);
  const { pii, agents, people, company } = expectedFrom(truth);
  const original = documentText(pdf);
  const present = pii.filter((e) => found(original, e));
  const t0 = performance.now();
  const suggestions = suggestEntities(original, FIRST_NAMES);
  const result = anonymizePdf(pdf, { people: buildPeople(suggestions, defaultSelection(suggestions), "") });
  const ms = performance.now() - t0;
  const out = extractText(result.pdf);
  const leaked = present
    .map((e) => ({ e, m: found(out, e) }))
    .filter((x) => x.m)
    .map(({ e, m }) => ({ e, context: flatten(out).slice(Math.max(0, m!.index - 50), m!.index + 70) }));
  const everyone = [...people, ...agents, company].map(flatten);
  // Agente público fora do gabarito (ex.: servidor que assina a certidão) não é falso positivo: vem desmarcado.
  const falseSuggestions = suggestions
    .filter((s) => !s.publicAgent)
    .map((s) => s.name)
    .filter((n) => !everyone.some((p) => p.includes(flatten(n)) || flatten(n).includes(p)));
  const isAgent = (name: string) => agents.some((a) => flatten(a).includes(flatten(name)) || flatten(name).includes(flatten(a)));
  const agentsNotFlagged = agents.filter((a) => !suggestions.some((s) => s.publicAgent && s.variants.some((v) => flatten(a).includes(flatten(v)))));
  const isParty = (name: string) => [...people, company].some((p) => flatten(p).includes(flatten(name)) || flatten(name).includes(flatten(p)));
  const wronglyFlagged = suggestions.filter((s) => s.publicAgent && !isAgent(s.name) && isParty(s.name)).map((s) => s.name);
  const keep = keepFrom(truth).filter((e) => found(original, e));
  const overRemoved = keep.filter((e) => !found(out, e));
  return { file: pdfPath, layout: truth.layout, present, leaked, falseSuggestions, agentsNotFlagged, wronglyFlagged, ms, overRemoved, keptChecked: keep.length };
}


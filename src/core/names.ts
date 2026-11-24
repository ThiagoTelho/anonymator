// Sugestão automática de pessoas e empresas citadas no documento.
//
// Regra para pessoas: um primeiro nome conhecido (lista do IBGE), seguido de pelo menos mais uma
// palavra iniciada por maiúscula (sobrenomes), admitindo os conectivos "da", "de", "do", "das", "dos", "e"
// e iniciais ("Rosimeire C."). Regra para empresas: sequência de palavras com maiúscula terminada em
// sufixo societário (Ltda., S.A., EIRELI, ME, EPP).
//
// São sugestões: o usuário revisa antes de anonimizar. Por isso a regra prefere não perder nomes,
// e as listas abaixo existem para cortar os falsos positivos mais comuns em peças jurídicas.

import { fold } from "./detectors.ts";

export type EntityKind = "PESSOA" | "EMPRESA";

export interface Suggestion {
  kind: EntityKind;
  /** Forma mais completa encontrada, para exibir. */
  name: string;
  /** Grafias encontradas no documento (o motor ainda ignora maiúsculas, acentos e quebras de linha). */
  variants: string[];
  occurrences: number;
  /** Juiz, procurador, auditor, servidor…: sugerido, mas desmarcado por padrão. */
  publicAgent: boolean;
}

/** Monta o conjunto de primeiros nomes a partir do arquivo de dados (um nome por linha). */
export function parseFirstNames(raw: string): Set<string> {
  return new Set(raw.split("\n").map((s) => s.trim()).filter(Boolean));
}

const CONNECTORS = new Set(["da", "de", "do", "das", "dos", "e", "d'"]);

/** Palavras que interrompem uma sequência de nome mesmo com maiúscula (cargos, termos jurídicos, palavras comuns). */
const STOP = new Set(
  `nao sem com por para pela pelo pelos pelas em no na nos nas ao aos a o as os um uma que se seu sua
  senhor senhora senhoria sr sra dr dra doutor doutora excelentissimo excelentissima ilustrissimo ilustrissima vossa
  procurador procuradora procuradoria promotor promotora juiz juiza desembargador desembargadora ministro ministra
  advogado advogada auditor auditora auditor-fiscal auditora-fiscal servidor servidora perito perita relator relatora
  socio socia socio-administrador socia-administradora administrador administradora diretor diretora gerente presidente
  reclamante reclamado reclamada autor autora reu re requerente requerido requerida impetrante impetrado exequente executado executada
  investigado investigada denunciante denunciado denunciada compromissaria compromissario testemunha empregado empregada
  lei rua geral nada ata saude amparo gerado gerada termo documento processo inquerito oficio portaria despacho clausula anexo artigo art
  capitulo secao paragrafo inciso alinea ministerio publico tribunal justica vara comarca regiao superintendencia estado uniao federal
  municipio prefeitura codigo civil penal trabalho consolidacao constituicao empresa total nome cpf cnpj data valor funcao
  assunto certidao certifico notifico informo atenciosamente goiania brasil`
    .split(/\s+/)
    .filter(Boolean),
);

/** Palavras que, logo antes de uma sequência, indicam lugar ou lei, e não pessoa ("Rua Maria Pereira", "Lei Maria da Penha"). */
const PLACE_BEFORE = new Set(
  `rua avenida av travessa alameda praca rodovia estrada jardim setor bairro vila residencial parque condominio edificio
  fazenda chacara sitio escola colegio hospital lei instituto fundacao hotel loteamento quadra conjunto cidade distrito`
    .split(/\s+/)
    .filter(Boolean),
);

const COMPANY_SUFFIX = /^(ltda|eireli|me|epp|s\/a|s\.a|sa|cia)\.?$/;

const PUBLIC_AGENT_CONTEXT =
  /\b(procurador(a)?|promotor(a)?|ju[ií]z(a)?|desembargador(a)?|ministro|ministra|auditor(a)?(-fiscal)?|servidor(a)?|escriv[aã]o|escriv[ãa]|oficial de justi[çc]a|analista judici[áa]rio|t[ée]cnico judici[áa]rio|delegad[oa]|magistrad[oa]|matr[ií]cula)\b/iu;

interface Token {
  text: string;
  start: number;
  end: number;
  folded: string;
  kind: "cap" | "upper" | "lower" | "initial" | "title";
  /** Termina com ponto final (encerra a sequência, salvo títulos e iniciais). */
  dotted: boolean;
}

/** Pronome de tratamento seguido de uma palavra com maiúscula (candidata a sobrenome). */
const TITLE_MENTION = /(?<![\p{L}])(Sr|Sra|Srta|Dr|Dra|Senhor|Senhora|Senhorita|Doutor|Doutora)\.?\s+(\p{Lu}[\p{L}'’-]+)/gu;

const TITLES = new Set(["sr", "sra", "srs", "dr", "dra", "drs", "exmo", "exma", "ilmo", "ilma"]);

function tokenize(line: string, offset: number): Token[] {
  const tokens: Token[] = [];
  for (const m of line.matchAll(/\p{L}[\p{L}'’-]*\.?|\p{L}\/\p{L}\.?/gu)) {
    const raw = m[0];
    const dotted = raw.endsWith(".");
    const word = dotted ? raw.slice(0, -1) : raw;
    const folded = fold(word);
    let kind: Token["kind"];
    if (TITLES.has(folded)) kind = "title";
    else if (/^\p{Lu}$/u.test(word) && dotted) kind = "initial";
    else if (/^\p{Lu}[\p{Lu}'’/-]+$/u.test(word)) kind = "upper";
    else if (/^\p{Lu}/u.test(word)) kind = "cap";
    else kind = "lower";
    tokens.push({ text: raw, start: offset + m.index, end: offset + m.index + raw.length, folded, kind, dotted });
  }
  return tokens;
}

interface Run {
  tokens: Token[];
  /** Token imediatamente anterior à sequência, na mesma linha. */
  before?: Token;
}

/** Quebra a linha em sequências de palavras com maiúscula, unidas só por espaço e conectivos. */
function runsOf(text: string, tokens: Token[], firstNames: Set<string>): Run[] {
  const runs: Run[] = [];
  let cur: Token[] = [];
  let before: Token | undefined;
  const flush = () => {
    while (cur.length && CONNECTORS.has(cur[cur.length - 1].folded)) cur.pop();
    if (cur.length) runs.push({ tokens: cur, before });
    cur = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];
    const gap = prev ? text.slice(prev.end, t.start) : "";
    const joined = cur.length > 0 && /^[ \t]+$/.test(gap) && !cur[cur.length - 1].dotted;
    if (!joined) flush();
    const isName = (t.kind === "cap" || t.kind === "upper") && !STOP.has(t.folded) && !PLACE_BEFORE.has(t.folded);
    // "e" entre duas pessoas ("Ana Souza e Ana Lima") separa, não une: só conecta se a palavra seguinte não for primeiro nome.
    const next = tokens[i + 1];
    const separatesPeople = t.folded === "e" && next !== undefined && firstNames.has(next.folded);
    const isConnector = CONNECTORS.has(t.folded) && cur.length > 0 && !separatesPeople;
    const isInitial = t.kind === "initial" && cur.length > 0;
    if (isName || isConnector || isInitial || (t.kind === "upper" && COMPANY_SUFFIX.test(t.text.toLowerCase()) && cur.length > 0)) {
      if (cur.length === 0) before = prev && /^[ \t]+$/.test(gap) ? prev : undefined;
      cur.push(t);
      if (t.dotted && t.kind !== "initial") flush();
    } else {
      flush();
    }
  }
  flush();
  return runs;
}

interface Candidate {
  kind: EntityKind;
  text: string;
  start: number;
  end: number;
  /** Palavras significativas (sem conectivos), normalizadas. */
  key: string[];
}

function candidatesIn(text: string, firstNames: Set<string>): Candidate[] {
  const out: Candidate[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const tokens = tokenize(line, offset);
    for (const run of runsOf(text, tokens, firstNames)) {
      const ts = run.tokens;
      const last = ts[ts.length - 1];
      const words = (list: Token[]) => list.filter((t) => !CONNECTORS.has(t.folded)).map((t) => t.folded);
      if (COMPANY_SUFFIX.test(last.text.toLowerCase()) && ts.length >= 2) {
        out.push({ kind: "EMPRESA", text: text.slice(ts[0].start, last.end), start: ts[0].start, end: last.end, key: words(ts) });
        continue;
      }
      if (run.before && PLACE_BEFORE.has(run.before.folded)) continue;
      const first = ts.findIndex((t) => (t.kind === "cap" || t.kind === "upper") && firstNames.has(t.folded));
      if (first < 0) continue;
      const span = ts.slice(first, first + 8);
      while (span.length && CONNECTORS.has(span[span.length - 1].folded)) span.pop();
      const significant = span.filter((t) => !CONNECTORS.has(t.folded));
      if (significant.length < 2) continue;
      const end = span[span.length - 1].end;
      out.push({ kind: "PESSOA", text: text.slice(span[0].start, end), start: span[0].start, end, key: words(span) });
    }
    offset += line.length + 1;
  }
  return out;
}

const isPrefix = (a: string[], b: string[]) => a.length <= b.length && a.every((w, i) => w === b[i]);

/** `a` aparece como trecho contínuo de `b` ("Pedro Almeida" em "João Pedro Almeida"). */
const isContiguousPart = (a: string[], b: string[]) => {
  for (let i = 0; i + a.length <= b.length; i++) if (a.every((w, j) => w === b[i + j])) return true;
  return false;
};

/** Contexto ao redor de uma menção, sem atravessar parágrafos (linha em branco). */
function contextAround(text: string, start: number, end: number, radius = 60): { before: string; after: string } {
  const before = text.slice(Math.max(0, start - radius), start).split(/\n\s*\n/).pop()!;
  const after = text.slice(end, end + radius).split(/\n\s*\n/)[0];
  return { before, after };
}

/**
 * Sugere pessoas e empresas citadas no texto, agrupando grafias da mesma entidade
 * (CAIXA ALTA, nome partido em linhas de tabela, só o primeiro nome).
 */
export function suggestEntities(text: string, firstNames: Set<string>): Suggestion[] {
  const cands = candidatesIn(text, firstNames);

  // Agrupa: mesma sequência de palavras, ou uma é início da outra ("Hortênsia Maranhão" ⊂ "Hortênsia Maranhão Quintela").
  const groups: { kind: EntityKind; key: string[]; items: Candidate[] }[] = [];
  for (const c of [...cands].sort((a, b) => b.key.length - a.key.length)) {
    // Prefixo: nome partido em linhas de tabela. Trecho contínuo com 2+ palavras: nome que começou no fim
    // da linha anterior ("JOÃO" / "PEDRO ALMEIDA"), pessoa de qualquer forma já citada por inteiro.
    const g = groups.find(
      (g) => g.kind === c.kind && (isPrefix(c.key, g.key) || (c.kind === "PESSOA" && c.key.length >= 2 && isContiguousPart(c.key, g.key))),
    );
    if (g) g.items.push(c);
    else groups.push({ kind: c.kind, key: c.key, items: [c] });
  }

  // Menções só pelo primeiro nome ("o colega Gilmar"), quando ele identifica uma única pessoa.
  const byFirst = new Map<string, (typeof groups)[number][]>();
  for (const g of groups.filter((g) => g.kind === "PESSOA")) byFirst.set(g.key[0], [...(byFirst.get(g.key[0]) ?? []), g]);
  const covered = (s: number, e: number) => cands.some((c) => s < c.end && e > c.start);
  for (const m of text.matchAll(/\p{L}+/gu)) {
    const owners = byFirst.get(fold(m[0]));
    if (!owners || owners.length !== 1 || !/^\p{Lu}\p{Ll}/u.test(m[0])) continue;
    const end = m.index + m[0].length;
    if (covered(m.index, end)) continue;
    owners[0].items.push({ kind: "PESSOA", text: m[0], start: m.index, end, key: [fold(m[0])] });
  }

  // Pronome de tratamento + sobrenome ("o Sr. Almeida"): liga à única pessoa com esse sobrenome;
  // se houver mais de uma (ou nenhuma), vira sugestão à parte para o usuário decidir.
  const people = groups.filter((g) => g.kind === "PESSOA");
  const standalone = new Map<string, (typeof groups)[number]>();
  for (const m of text.matchAll(TITLE_MENTION)) {
    const surname = fold(m[2]);
    const start = m.index;
    const end = start + m[0].length;
    if (STOP.has(surname) || PLACE_BEFORE.has(surname) || byFirst.has(surname)) continue;
    if (covered(end - m[2].length, end)) continue;
    const mention: Candidate = { kind: "PESSOA", text: m[0].replace(/\s+/g, " "), start, end, key: [surname] };
    const owners = people.filter((g) => g.key.slice(1).includes(surname));
    if (owners.length === 1) {
      owners[0].items.push(mention);
      continue;
    }
    const id = `${fold(m[1])}:${surname}`;
    const g = standalone.get(id) ?? { kind: "PESSOA" as const, key: [fold(m[1]), surname], items: [] };
    g.items.push(mention);
    standalone.set(id, g);
  }
  groups.push(...standalone.values());

  return groups
    .map((g) => {
      const variants = [...new Set(g.items.map((i) => i.text.replace(/\s+/g, " ")))].sort((a, b) => b.length - a.length);
      const display = variants.find((v) => /\p{Ll}/u.test(v) && fold(v).split(/\s+/).length >= g.key.length) ?? variants[0];
      const publicAgent =
        g.kind === "PESSOA" &&
        g.items.some((i) => {
          const { before, after } = contextAround(text, i.start, i.end);
          return PUBLIC_AGENT_CONTEXT.test(before) || PUBLIC_AGENT_CONTEXT.test(after);
        });
      return { kind: g.kind, name: display, variants, occurrences: g.items.length, publicAgent };
    })
    .sort((a, b) => (a.kind === b.kind ? b.occurrences - a.occurrences : a.kind === "PESSOA" ? -1 : 1));
}

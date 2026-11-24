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
  assunto certidao certifico notifico informo atenciosamente goiania brasil
  rito ordinario sumario sumarissimo recurso acao agravo apelacao embargos mandado habeas peticao inicial reclamacao
  trabalhista denuncia sentenca decisao acordao manifestacao contestacao replica audiencia provas pedidos pedido fatos
  direito preliminar merito conclusao requerimentos causa horas extras verbas rescisorias honorarios dano danos moral morais
  contratante contratantes contratada contratado outorgante outorgado outorgada substabelecente substabelecido`
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

/** Títulos e cargos que aparecem em nomes de logradouro entre o tipo e o nome ("Rua Ministro Jesuíno Cardoso"). */
const STREET_HONORIFICS = new Set(
  `ministro ministra professor professora prof engenheiro eng doutor doutora dr dra tenente ten coronel cel general gen
  marechal almirante capitao cap major sargento comendador desembargador senador deputado governador prefeito vereador
  presidente padre dom frei monsenhor santa santo sao nossa senhora irma irmao`
    .split(/\s+/)
    .filter(Boolean),
);

/** Não servem de primeiro nome: "São Paulo", "Santo Amaro", "GOIÁS" (cabeçalho) são lugares. Podem aparecer no meio do nome. */
const NOT_ANCHOR = new Set(
  `sao santo santa
  acre alagoas amapa amazonas bahia ceara goias maranhao para paraiba parana pernambuco piaui rondonia roraima sergipe tocantins`
    .split(/\s+/)
    .filter(Boolean),
);

/** Segue a sequência: "/GO", " – SP", "-SP" indicam cidade/UF, não pessoa ("Bela Vista de Goiás/GO"). */
const CITY_UF_AFTER = /^\s*(?:\/|[-–]\s*)[A-Z]{2}(?![\p{L}])/u;

const PUBLIC_AGENT_CONTEXT =
  /\b(procurador(a)?|promotor(a)?|ju[ií]z(a)?|desembargador(a)?|ministro|ministra|auditor(a)?(-fiscal)?|servidor(a)?|escriv[aã]o|escriv[ãa]|oficial de justi[çc]a|analista judici[áa]rio|t[ée]cnico judici[áa]rio|delegad[oa]|magistrad[oa])\b/iu;

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
  /** Índice, em `tokens`, do primeiro token da sequência. */
  first: number;
}

/** Espaço entre palavras: só espaços, ou uma quebra de linha simples (não um parágrafo). */
const SPACE = /^[ \t]+$/;
const SOFT_BREAK = /^[ \t]*\n[ \t]*$/;

/**
 * Quebra o texto em sequências de palavras com maiúscula, unidas por espaço e conectivos. Uma sequência
 * continua na linha seguinte (célula estreita de tabela, nome no fim da linha) se a palavra seguinte
 * tiver a mesma caixa (CAIXA ALTA com CAIXA ALTA, Inicial com Inicial).
 */
function runsOf(text: string, tokens: Token[], firstNames: Set<string>): Run[] {
  const runs: Run[] = [];
  let cur: Token[] = [];
  let first = 0;
  const flush = () => {
    while (cur.length && CONNECTORS.has(cur[cur.length - 1].folded)) cur.pop();
    if (cur.length) runs.push({ tokens: cur, first });
    cur = [];
  };
  const lastName = () => [...cur].reverse().find((t) => t.kind === "cap" || t.kind === "upper");
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];
    const gap = prev ? text.slice(prev.end, t.start) : "";
    const ref = lastName();
    const sameCase = ref !== undefined && (t.kind === ref.kind || CONNECTORS.has(t.folded) || t.kind === "initial");
    const joined =
      cur.length > 0 && !cur[cur.length - 1].dotted && (SPACE.test(gap) || (SOFT_BREAK.test(gap) && sameCase));
    if (!joined) flush();
    const isConnectorWord = CONNECTORS.has(t.folded);
    const isName = (t.kind === "cap" || t.kind === "upper") && !isConnectorWord && !STOP.has(t.folded) && !PLACE_BEFORE.has(t.folded);
    // "e" entre duas pessoas ("Ana Souza e Ana Lima", "filho de Lucinéia … e de Valdomiro …") separa, não une.
    let k = i + 1;
    while (k < tokens.length && CONNECTORS.has(tokens[k].folded)) k++;
    const separatesPeople = t.folded === "e" && k < tokens.length && firstNames.has(tokens[k].folded);
    const isConnector = isConnectorWord && cur.length > 0 && !separatesPeople;
    const isInitial = t.kind === "initial" && cur.length > 0;
    if (isName || isConnector || isInitial) {
      if (cur.length === 0) first = i;
      cur.push(t);
      if (t.dotted && t.kind !== "initial") flush();
    } else {
      flush();
    }
  }
  flush();
  return runs;
}

/** Antes da sequência há um tipo de lugar ("Rua", "Comarca de", "Av. Engenheiro")? */
function placeBefore(text: string, tokens: Token[], first: number): boolean {
  for (let i = first - 1; i >= 0 && i >= first - 4; i--) {
    const t = tokens[i];
    const gap = text.slice(t.end, tokens[i + 1].start);
    if (!SPACE.test(gap) && !SOFT_BREAK.test(gap)) return false;
    if (PLACE_BEFORE.has(t.folded) || t.folded === "comarca" || t.folded === "foro" || t.folded === "municipio") return true;
    if (!CONNECTORS.has(t.folded) && !STREET_HONORIFICS.has(t.folded)) return false;
  }
  return false;
}

interface Candidate {
  kind: EntityKind;
  text: string;
  start: number;
  end: number;
  /** Palavras significativas (sem conectivos), normalizadas. */
  key: string[];
}

function tokenizeAll(text: string): Token[] {
  return tokenize(text, 0);
}

/** Nomes de cidade citados com UF no documento ("Bela Vista de Goiás/GO", "São Paulo – SP"). */
function citiesIn(text: string): Set<string> {
  const cities = new Set<string>();
  const re = /(\p{Lu}[\p{L}'’-]+(?:[ \t]+(?:d[aeo]s?|de|\p{Lu}[\p{L}'’-]+)){0,4})[ \t]*(?:\/|[-–][ \t]*)[A-Z]{2}(?![\p{L}])/gu;
  for (const m of text.matchAll(re)) {
    const words = fold(m[1]).split(/\s+/).filter((w) => !CONNECTORS.has(w));
    // Todos os finais da sequência: "Zona Rural, Bela Vista de Goiás" → "bela vista goias", "vista goias", "goias".
    for (let i = 0; i < words.length; i++) cities.add(words.slice(i).join(" "));
  }
  return cities;
}

function personCandidates(text: string, tokens: Token[], firstNames: Set<string>): Candidate[] {
  const out: Candidate[] = [];
  const cities = citiesIn(text);
  const words = (list: Token[]) => list.filter((t) => !CONNECTORS.has(t.folded)).map((t) => t.folded);
  for (const run of runsOf(text, tokens, firstNames)) {
    const ts = run.tokens;
    if (placeBefore(text, tokens, run.first)) continue;
    const first = ts.findIndex((t) => (t.kind === "cap" || t.kind === "upper") && firstNames.has(t.folded) && !NOT_ANCHOR.has(t.folded));
    if (first < 0) continue;
    // Palavras antes do primeiro nome que sejam lugar/título ("São", "Santa") descartam a sequência.
    if (ts.slice(0, first).some((t) => NOT_ANCHOR.has(t.folded) || STREET_HONORIFICS.has(t.folded))) continue;
    const span = ts.slice(first, first + 8);
    while (span.length && CONNECTORS.has(span[span.length - 1].folded)) span.pop();
    if (span.filter((t) => !CONNECTORS.has(t.folded)).length < 2) continue;
    const lastToken = span[span.length - 1];
    // Ponto final de frase não faz parte do nome ("… Diego Henrique Medeiros."), só o de inicial ("Rosimeire C.").
    const end = lastToken.dotted && lastToken.kind !== "initial" ? lastToken.end - 1 : lastToken.end;
    if (CITY_UF_AFTER.test(text.slice(end, end + 8))) continue;
    if (cities.has(words(span).join(" "))) continue;
    out.push({ kind: "PESSOA", text: text.slice(span[0].start, end), start: span[0].start, end, key: words(span) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Empresas: palavras com maiúscula (admitindo "&", "e", "de", "em", "para") terminadas em sufixo
// societário. Cargos e palavras de ligação no começo são descartados ("Sócio-administrador de …").

const COMPANY = new RegExp(
  String.raw`(?<![\p{L}\d])((?:\p{Lu}[\p{L}\d'’.-]*|&)(?:(?:[ \t]+|[ \t]*\n[ \t]*)(?:\p{Lu}[\p{L}\d'’.-]*|&|d[aeo]s?|de|e|em|para))*?)(?:[ \t]+|[ \t]*\n[ \t]*)(ADVOGADOS ASSOCIADOS|Advogados Associados|LTDA|Ltda|EIRELI|Eireli|EPP|ME|S\.\s?A|S\/A|SA|Advogados|ADVOGADOS|Associados|ASSOCIADOS)(\.)?(?![\p{L}\d])`,
  "gu",
);
/** Instituições financeiras grandes não são dado pessoal das partes. */
const NOT_A_PARTY = /^(banco|caixa econ[ôo]mica|ordem dos advogados)/i;
/** Palavras genéricas de razão social: não servem como nome curto da empresa. */
const GENERIC_COMPANY_WORDS = new Set(
  `construtora ceramica industria comercio servicos solucoes engenharia torrefacao transportes transportadora logistica
  administradora administrativo apoio empreendimentos participacoes cafes alimentos comercial industrial imobiliaria
  incorporadora tecnologia sistemas consultoria assessoria advogados associados sociedade grupo holding brasil nacional
  distribuidora importadora exportadora agropecuaria agricola eletrica mecanica metalurgica textil saude educacao`
    .split(/\s+/)
    .filter(Boolean),
);

function companyCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(COMPANY)) {
    let start = m.index;
    const end = m.index + m[0].length;
    // Quebra de linha só faz parte do nome em CAIXA ALTA dos dois lados ou depois de conectivo
    // ("Vetoria Soluções em" / "Engenharia Elétrica Ltda."); senão é outra célula ou linha ("Estabelecimento").
    const lines = text.slice(start, end).split("\n");
    let keep = lines.length - 1;
    while (keep > 0) {
      const prevLine = lines[keep - 1].trim();
      const lastWord = prevLine.split(/\s+/).pop() ?? "";
      const bothUpper = !/\p{Ll}/u.test(prevLine) && !/\p{Ll}/u.test(lines[keep]);
      if (!bothUpper && !CONNECTORS.has(fold(lastWord)) && !["em", "para", "&"].includes(fold(lastWord))) break;
      keep--;
    }
    start = end - lines.slice(keep).join("\n").length;
    // Descarta cargos e ligações no início ("Sócio-administrador de …").
    for (const w of text.slice(start, end).matchAll(/\S+/g)) {
      const f = fold(w[0].replace(/\.$/, ""));
      if (STOP.has(f) || CONNECTORS.has(f) || f === "em" || f === "para" || f === "&" || STREET_HONORIFICS.has(f)) continue;
      start += w.index;
      break;
    }
    const name = text.slice(start, end).replace(/^\s+/, "");
    start = end - name.length;
    const key = fold(name).split(/\s+/).filter((w) => !CONNECTORS.has(w));
    if (key.length < 2 || NOT_A_PARTY.test(name)) continue;
    out.push({ kind: "EMPRESA", text: name, start, end, key });
  }
  return out;
}

const isPrefix = (a: string[], b: string[]) => a.length <= b.length && a.every((w, i) => w === b[i]);

/** `a` aparece como trecho contínuo de `b` ("Pedro Almeida" em "João Pedro Almeida"). */
const isContiguousPart = (a: string[], b: string[]) => {
  for (let i = 0; i + a.length <= b.length; i++) if (a.every((w, j) => w === b[i + j])) return true;
  return false;
};

/** Primeiro e último nome iguais, e as demais palavras na mesma ordem ("Anselmo Paiva" em "Anselmo Teodoro Paiva"). */
const isAbbreviationOf = (a: string[], b: string[]) => {
  if (a.length < 2 || a.length > b.length || a[0] !== b[0] || a[a.length - 1] !== b[b.length - 1]) return false;
  let j = 0;
  for (const w of b) if (w === a[j]) j++;
  return j === a.length;
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
  const tokens = tokenizeAll(text);
  const companies = companyCandidates(text);
  // Pessoa dentro de razão social ("Pedra Lilás…", "Horizonte Ltda.") é parte da empresa, não pessoa.
  const persons = personCandidates(text, tokens, firstNames).filter((p) => !companies.some((c) => p.start < c.end && p.end > c.start));
  const cands = [...persons, ...companies];

  // Agrupa: mesma sequência de palavras, ou uma é início da outra ("Hortênsia Maranhão" ⊂ "Hortênsia Maranhão Quintela").
  const groups: { kind: EntityKind; key: string[]; items: Candidate[] }[] = [];
  for (const c of [...cands].sort((a, b) => b.key.length - a.key.length)) {
    // Prefixo: nome partido em linhas de tabela. Trecho contínuo com 2+ palavras: nome que começou no fim
    // da linha anterior ("JOÃO" / "PEDRO ALMEIDA"), pessoa de qualquer forma já citada por inteiro.
    const g = groups.find(
      (g) =>
        g.kind === c.kind &&
        (isPrefix(c.key, g.key) || (c.kind === "PESSOA" && c.key.length >= 2 && (isContiguousPart(c.key, g.key) || isAbbreviationOf(c.key, g.key)))),
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

  const tokenStartingAt = new Map(tokens.map((t, i) => [t.start, i]));
  const isCovered = (t: Token) => covered(t.start, t.end) || groups.some((g) => g.items.some((i) => t.start < i.end && t.end > i.start));

  // Nome curto da empresa ("a LOGIMAX", "a Bellacruz"): palavra distintiva da razão social citada sozinha.
  for (const g of groups.filter((g) => g.kind === "EMPRESA")) {
    const distinctive = new Set(
      g.key.filter((w) => w.length >= 4 && !GENERIC_COMPANY_WORDS.has(w) && !firstNames.has(w) && !STOP.has(w) && !/^(ltda|eireli)\.?$/.test(w)),
    );
    for (const t of tokens) {
      if ((t.kind === "cap" || t.kind === "upper") && distinctive.has(t.folded) && !isCovered(t)) {
        g.items.push({ kind: "EMPRESA", text: t.text.replace(/\.$/, ""), start: t.start, end: t.start + t.text.replace(/\.$/, "").length, key: [t.folded] });
      }
    }
  }

  // Apelido ("WEVERTON RODRIGUES DA CUNHA, vulgo “Mosquito”"): vira grafia da pessoa citada logo antes.
  for (const m of text.matchAll(/\bvulgo\s*[“"'‘]?(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?)[”"'’]?/gu)) {
    const owner = groups.find((g) => g.kind === "PESSOA" && g.items.some((i) => i.end <= m.index && m.index - i.end < 40));
    if (!owner) continue;
    const nick = fold(m[1]);
    for (const n of text.matchAll(new RegExp(`(?<![\\p{L}])${m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "gu"))) {
      owner.items.push({ kind: "PESSOA", text: n[0], start: n.index, end: n.index + n[0].length, key: [nick] });
    }
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
    const titleToken = tokenStartingAt.get(start);
    if (titleToken !== undefined && placeBefore(text, tokens, titleToken)) continue; // "Rua Doutor Bacelar"
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

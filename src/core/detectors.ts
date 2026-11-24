// Detectores determinísticos de dados pessoais com formato fixo.
// Cada detector varre um texto e devolve os trechos encontrados com a posição no texto.

export type Kind =
  | "PESSOA"
  | "CPF"
  | "CNPJ"
  | "EMAIL"
  | "TELEFONE"
  | "CEP"
  | "EMPRESA"
  | "OAB"
  | "PROCESSO"
  | "PIS"
  | "CTPS"
  | "NASCIMENTO"
  | "REGISTRO"
  | "CODIGO"
  | "RASTREIO"
  | "ENDERECO"
  | "RG"
  | "CNH"
  | "RENAVAM"
  | "ELEITOR"
  | "CONTA"
  | "PLACA"
  | "PIX"
  | "INICIAIS"
  | "ESCOLA"
  | "PROTOCOLO";

export interface Match {
  kind: Kind;
  /** Texto exatamente como aparece no documento. */
  text: string;
  /** Posição inicial (inclusiva) no texto analisado. */
  start: number;
  /** Posição final (exclusiva) no texto analisado. */
  end: number;
}

const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Valida os dois dígitos verificadores de um CPF. */
export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

/** Valida os dois dígitos verificadores de um CNPJ numérico. */
export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13]);
}

/** Valida o dígito verificador de um PIS/PASEP/NIT. */
export function isValidPis(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
  const r = 11 - (sum % 11);
  return (r >= 10 ? 0 : r) === Number(d[10]);
}

interface Rule {
  kind: Kind;
  pattern: RegExp;
  validate?: (text: string) => boolean;
}

// Rótulos que antecedem o dado (lookbehind): só o valor é marcado, o rótulo fica.
const LABEL_SEP = String.raw`\s*(?:sob\s+o\s+)?(?:n[º°o.]\s*)?:?\s*`;
/** Código alfanumérico (letras E dígitos), com blocos separados por hífen, mesmo partidos em linhas. */
const ALNUM_CODE = String.raw`(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9]{4,}(?:-\s*[A-Za-z0-9]{3,})*`;
const rx = (source: string, flags = "g") => new RegExp(source, flags);

// Ordem importa: regras mais específicas primeiro (o nº CNJ contém sequências que parecem telefone).
const RULES: Rule[] = [
  // Número único CNJ (Judiciário) e numeração do MPU/MPT (ex.: 001873.2025.18.000/8).
  { kind: "PROCESSO", pattern: /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g },
  { kind: "PROCESSO", pattern: /\b\d{6}\.\d{4}\.\d{2}\.\d{3}\/\d\b/g },
  { kind: "PIS", pattern: /\b\d{3}\.\d{5}\.\d{2}-\d\b/g, validate: isValidPis },
  { kind: "PIS", pattern: rx(String.raw`(?<=\b(?:PIS|PASEP|NIT|PIS\/PASEP)${LABEL_SEP})\d{11}\b`), validate: isValidPis },
  { kind: "CTPS", pattern: rx(String.raw`(?<=\bCTPS${LABEL_SEP})\d{4,8}(?:,?\s*s[ée]rie\s*\d{3,5}(?:-[A-Z]{2})?)?`, "giu") },
  {
    kind: "NASCIMENTO",
    pattern: rx(String.raw`(?<=\b(?:data\s+de\s+nascimento|nascid[oa]\s+em|nasc\.)${LABEL_SEP})\d{1,2}\/\d{1,2}\/\d{2,4}`, "giu"),
  },
  // Documentos de identificação com rótulo.
  {
    kind: "RG",
    pattern: rx(String.raw`(?<=\b(?:RG|R\.G\.|identidade|C[ée]dula\s+de\s+Identidade)${LABEL_SEP})(?:\d{1,2}\.?\d{3}\.?\d{3}(?:-\s*[\dXx])?|\d{5,10}(?:-[\dXx])?)(?![\d])`, "giu"),
  },
  // RG no formato de SP sem rótulo (2.3.3-1): CPF (3.3.3-2) e CNPJ têm formatos diferentes.
  { kind: "RG", pattern: /\b\d{2}\.\d{3}\.\d{3}-\s*[\dXx](?![\d\p{L}])/gu },
  { kind: "CNH", pattern: rx(String.raw`(?<=\bCNH${LABEL_SEP})\d{9,11}\b`, "giu") },
  { kind: "RENAVAM", pattern: rx(String.raw`(?<=\bRENAVAM${LABEL_SEP})\d{9,11}\b`, "giu") },
  { kind: "ELEITOR", pattern: rx(String.raw`(?<=\bt[íi]tulo\s+(?:de\s+)?eleit(?:or|oral)${LABEL_SEP})\d{4}\s?\d{4}\s?\d{4}\b`, "giu") },
  { kind: "ELEITOR", pattern: rx(String.raw`(?<=\b(?:zona(?:\s+eleitoral)?|se[çc][ãa]o(?:\s+eleitoral)?)${LABEL_SEP})\d{1,4}\b`, "giu") },
  { kind: "PLACA", pattern: rx(String.raw`(?<=\bplaca${LABEL_SEP})[A-Z]{3}-?\d[A-Z0-9]\d{2}\b`, "giu") },
  // Dados bancários.
  { kind: "CONTA", pattern: rx(String.raw`(?<=\bag[êe]ncia${LABEL_SEP})\d{3,5}(?:-[\dXx])?\b`, "giu") },
  {
    kind: "CONTA",
    pattern: rx(String.raw`(?<=\bconta(?:\s+(?:corrente|poupan[çc]a|sal[áa]rio|de\s+pagamento))?${LABEL_SEP})\d[\d.]*-[\dXx]\b`, "giu"),
  },
  { kind: "PIX", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  // Identificação funcional: CIF (auditor-fiscal), matrícula de servidor, registro de sociedade de advogados.
  { kind: "REGISTRO", pattern: rx(String.raw`(?<=\b(?:CIF|matr[ií]cula)${LABEL_SEP})\d[\d.]*(?:-\d)?\b`, "giu") },
  { kind: "REGISTRO", pattern: /(?<=Ordem dos Advogados do Brasil[^.;]{0,60}?sob o n[º°o.]\s*)\d[\d.]*\b/g },
  // Códigos que permitem consultar o documento original em sistemas públicos (PJe, e-SAJ, MPs…).
  {
    kind: "CODIGO",
    pattern: rx(
      String.raw`(?<=\bc[óo]digo(?:\s+(?:de\s+)?(?:verifica[çc][ãa]o|autenticidade|autentica[çc][ãa]o|valida[çc][ãa]o|confer[êe]ncia|acesso))?${LABEL_SEP})${ALNUM_CODE}`,
      "giu",
    ),
  },
  // Rodapé do PJe: "Juntado em: 24/11/2026 09:15:38 - 3f8a21c".
  { kind: "CODIGO", pattern: /(?<=Juntado em:\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?\s*-\s*)[0-9a-f]{6,}\b/gi },
  // Números de protocolo, atendimento, inquérito policial, boletim de ocorrência, ordem de serviço…
  {
    kind: "PROTOCOLO",
    pattern: rx(
      String.raw`(?<=\b(?:protocolo|atendimento|inqu[ée]rito\s+policial|RAI|boletim\s+de\s+ocorr[êe]ncia|B\.?O\.?|ordem\s+de\s+servi[çc]o|n[úu]mero\s+do\s+documento|sob\s+o\s+n[úu]mero)${LABEL_SEP})(?=[A-Za-z0-9./-]*\d{4})[A-Za-z0-9][A-Za-z0-9./-]{3,}[A-Za-z0-9]`,
      "giu",
    ),
  },
  { kind: "PROTOCOLO", pattern: /(?<=\bOS\s+)\d[\d./-]{4,}\d/g },
  // Identificadores longos em URLs de validação ("…/validacao/26112409153827400000387715204?instancia=1"),
  // mesmo com a URL partida em linhas: sequência de 10+ dígitos logo após "/" ou "=".
  { kind: "PROTOCOLO", pattern: /(?<=[/=])\d{10,}(?=[?&#/\s]|$)/g },
  { kind: "RASTREIO", pattern: /\b[A-Z]{2}\d{9}BR\b/g },
  { kind: "CNPJ", pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, validate: isValidCnpj },
  { kind: "CPF", pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, validate: isValidCpf },
  { kind: "EMAIL", pattern: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  { kind: "OAB", pattern: /\bOAB\s*\/?\s*[A-Z]{2}\s*(?:sob\s+o\s+)?(?:n[º°o.]\s*)?\d{1,3}(?:\.?\d{3})*(?:-?[A-Z])?\b/g },
  { kind: "CEP", pattern: /\b\d{5}-\d{3}\b/g },
  // Telefones: (62) 99812-4471, +55 62 99812-4471, 62 99653-1208, (11) 3214-7790, DDD na linha anterior,
  // e celular só com dígitos (62996017755) — este depois do CPF, que tem dígito verificador.
  { kind: "TELEFONE", pattern: /(?:\+55\s*)?(?:\(\d{2}\)\s*|\b\d{2}[ \t]+)9?\d{4}[-\s]?\d{4}\b/g },
  { kind: "TELEFONE", pattern: /(?:\+55\s*)?\b[1-9]{2}9\d{8}\b/g },
  // Iniciais de partes em segredo de justiça (R.A.M., K.S.L.A.); "S.A." (2 letras) fica de fora.
  { kind: "INICIAIS", pattern: /(?<![\p{L}.])(?:\p{Lu}\.){3,6}(?!\p{L})/gu },
  // Escola de criança ou adolescente identifica a família.
  {
    kind: "ESCOLA",
    pattern: /(?<![\p{L}])(?:Col[ée]gio|Escola|Creche|Centro\s+Educacional|Instituto\s+Educacional|EMEF|EMEI|CMEI)(?:\s+(?:\p{Lu}[\p{L}'’-]*|d[aeo]s?|de|e)(?=[\s,.;)]|$))+/gu,
  },
];

/** Encontra dados de formato fixo. Trechos sobrepostos ficam com a primeira regra que os achou. */
export function detectPatterns(text: string): Match[] {
  // Endereços primeiro: contêm números (lote, km, nº) que outras regras poderiam pegar pela metade.
  const found: Match[] = detectAddresses(text);
  const overlaps = (s: number, e: number) => found.some((m) => s < m.end && e > m.start);
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const start = m.index;
      const end = start + m[0].length;
      if (rule.validate && !rule.validate(m[0])) continue;
      if (overlaps(start, end)) continue;
      found.push({ kind: rule.kind, text: m[0], start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------------------------
// Endereços
//
// Um endereço começa num tipo de logradouro ("Rua", "Av.", "Rodovia"…) seguido do nome, e continua
// por componentes separados por vírgula: número ("nº 123", "s/n"), complementos ("Qd. 21", "Lt. 9",
// "Apto 1202", "km 14") e bairro ("Setor Bueno", "Jardim…", "Zona Rural", ou um nome logo antes da
// cidade). Cidade/UF e CEP ficam de fora: a cidade sozinha raramente identifica alguém e o CEP tem
// marcador próprio. Exige ao menos um componente, para não marcar "na Rua das Flores" em texto corrido.

const STREET = /(?<![\p{L}\d])(rua|r\.|avenida|av\.|alameda|al\.|travessa|trav\.|tv\.|rodovia|rod\.|estrada|pra[çc]a|p[çc]a\.|largo|viela|beco|servid[ãa]o)(?=\s)/giu;
const STREET_NAME = /^\s+(?:(?:d[aeo]s?|de)\s+)?[\p{Lu}\d][^,\n]*(?:\n(?!\s*\n)[^,\n]*){0,3}/u;
const ABBREV_BEFORE_DOT = /(?:^|\s)(jd|res|ed|av|qd|lt|bl|conj|apto?|n|nº|km|al|tv|rod|p[çc]a)$/iu;

const isCityUf = (c: string) => /^[\p{L} '.-]+\s*(?:\/|-|–)\s*[A-Z]{2}$/u.test(c);
const isCep = (c: string) => /^CEP\b/i.test(c) || /^\d{5}-?\d{3}$/.test(c) || /^\d{2}\.\d{3}-\d{3}$/.test(c);
const flat = (c: string) => c.replace(/\s+/g, " ");
const isNumber = (c: string) => /^(?:n[º°o.]?\s*)?\d[\d.]*[A-Za-z]?$/u.test(c) || /^s\/?n[º°]?\.?$/i.test(c);
const isNamedComplement = (c: string) =>
  /^(?:edif[ií]cio|ed\.|condom[ií]nio|cond\.|residencial|bloco|torre|galp[ãa]o)\s+(?:\p{Lu}[\p{L}\d'’-]*|\d+[A-Z]?|d[aeo]s?|de)(?:\s+(?:\p{Lu}[\p{L}\d'’-]*|\d+|d[aeo]s?|de)){0,5}$/iu.test(c);
const isComplement = (c: string) =>
  /^(?:qd|quadra|lt|lote|apto?|apartamento|bloco|bl|casa|sala|conj|conjunto|km|andar|edif[ií]cio|ed|torre|ch[áa]cara|gleba|lj|loja|galp[ãa]o|box)\.?\s*[\w./-]+(?:\s+[\w./-]+)?$/iu.test(c);
const isNeighborhood = (c: string) =>
  c.length <= 50 && /^(?:setor|jardim|jd\.?|bairro|vila|residencial|res\.|parque|loteamento|zona rural|zona urbana|centro|distrito|n[úu]cleo|povoado)(?![\p{L}])/iu.test(c);
const isGenericName = (c: string) => /^\p{Lu}[\p{L}'.-]*(?:\s+(?:d[aeo]s?|de|\p{Lu}[\p{L}'.-]*)){0,4}$/u.test(c);

/** Corta o componente no fim da frase ("Centro. Depois…"), sem cortar abreviações ("Qd. 21", "Jd. América"). */
function cutAtSentenceEnd(c: string): string {
  for (const m of c.matchAll(/\.(?=\s+\p{Lu}|\s*$)/gu)) {
    if (!ABBREV_BEFORE_DOT.test(c.slice(0, m.index))) return c.slice(0, m.index);
  }
  return c;
}

export function detectAddresses(text: string): Match[] {
  const found: Match[] = [];
  for (const s of text.matchAll(STREET)) {
    const start = s.index;
    if (found.some((m) => start < m.end)) continue;
    const name = STREET_NAME.exec(text.slice(start + s[0].length));
    if (!name || name[0].trim().length > 60) continue;
    let end = start + s[0].length + cutAtSentenceEnd(name[0]).trimEnd().length;
    if (cutAtSentenceEnd(name[0]) !== name[0]) continue; // a frase acabou no nome da rua: sem componentes

    // Lê os componentes seguintes, separados por vírgula.
    const comps: { text: string; end: number }[] = [];
    let pos = start + s[0].length + name[0].length;
    while (comps.length < 10) {
      const sep = /^,[ \t]*(?:\n(?![ \t]*\n)[ \t]*)?/.exec(text.slice(pos));
      if (!sep) break;
      const from = pos + sep[0].length;
      // Componente pode quebrar de linha (célula estreita de tabela), mas não atravessa parágrafo.
      const raw = /^(?:[^,;\n]|\n(?![ \t]*\n))*/.exec(text.slice(from))![0];
      const cut = cutAtSentenceEnd(raw).trim();
      comps.push({ text: cut, end: from + cut.length });
      if (cut.length !== raw.trim().length) break; // fim de frase dentro do componente
      pos = from + raw.length;
    }

    let included = 0;
    for (let i = 0; i < comps.length; i++) {
      const c = flat(comps[i].text);
      if (isCityUf(c) || isCep(c)) break;
      const next = flat(comps[i + 1]?.text ?? "");
      const ok = isNumber(c) || isComplement(c) || isNamedComplement(c) || isNeighborhood(c) || (isGenericName(c) && (isCityUf(next) || isCep(next)));
      if (!ok) break;
      end = comps[i].end;
      included++;
    }
    if (included === 0) continue;
    found.push({ kind: "ENDERECO", text: text.slice(start, end), start, end });
  }
  return found;
}

/** Remove acentos e passa para minúsculas, mantendo o mesmo comprimento do texto. */
export function fold(s: string): string {
  // NFD separa o acento da letra; removemos o acento e pegamos 1 caractere por caractere original.
  return Array.from(s, (ch) => ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()[0] ?? ch).join("");
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Pronomes de tratamento: cada grupo reúne as formas equivalentes (com e sem ponto, por extenso).
// Uma grafia que começa por um deles ("Sr. Almeida") casa com qualquer forma do mesmo grupo, e só o
// que vem depois do pronome é marcado: o texto anonimizado fica "Sr. [PESSOA_2]".
const TITLE_GROUPS: string[][] = [
  ["sr", "senhor"],
  ["sra", "senhora"],
  ["dr", "doutor"],
  ["dra", "doutora"],
  ["srta", "senhorita"],
];
const titleGroupOf = (word: string) => TITLE_GROUPS.find((g) => g.includes(word.replace(/\.$/, "")));

/**
 * Encontra as ocorrências de um nome declarado, ignorando maiúsculas, acentos
 * e quebras de linha/espaços múltiplos entre as palavras. Se o termo começa por pronome de
 * tratamento, o pronome é exigido no texto mas fica fora do trecho marcado.
 */
export function findTerm(text: string, term: string, kind: Kind = "PESSOA"): Match[] {
  const words = fold(term).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const title = words.length > 1 ? titleGroupOf(words[0]) : undefined;
  const rest = title ? words.slice(1) : words;
  const titlePattern = title ? `(?:${title.map((t) => `${t}\\.?`).join("|")})\\s+` : "";
  const pattern = new RegExp(`(?<![\\p{L}\\d])${titlePattern}(?<name>${rest.map(escapeRegex).join("\\s+")})(?![\\p{L}\\d])`, "gud");
  const folded = fold(text);
  return Array.from(folded.matchAll(pattern), (m) => {
    const [start, end] = m.indices!.groups!.name;
    return { kind, text: text.slice(start, end), start, end };
  });
}

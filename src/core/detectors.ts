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
  | "RASTREIO";

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
const LABEL_SEP = String.raw`\s*(?:n[º°o.]\s*)?:?\s*`;

// Ordem importa: regras mais específicas primeiro (o nº CNJ contém sequências que parecem telefone).
const RULES: Rule[] = [
  // Número único CNJ (Judiciário) e numeração do MPU/MPT (ex.: 001873.2025.18.000/8).
  { kind: "PROCESSO", pattern: /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g },
  { kind: "PROCESSO", pattern: /\b\d{6}\.\d{4}\.\d{2}\.\d{3}\/\d\b/g },
  { kind: "PIS", pattern: /\b\d{3}\.\d{5}\.\d{2}-\d\b/g, validate: isValidPis },
  { kind: "PIS", pattern: new RegExp(String.raw`(?<=\b(?:PIS|PASEP|NIT|PIS\/PASEP)${LABEL_SEP})\d{11}\b`, "g"), validate: isValidPis },
  { kind: "CTPS", pattern: new RegExp(String.raw`(?<=\bCTPS${LABEL_SEP})\d{4,8}(?:\s*s[ée]rie\s*\d{3,5}(?:-[A-Z]{2})?)?`, "gi") },
  {
    kind: "NASCIMENTO",
    pattern: new RegExp(String.raw`(?<=\b(?:data\s+de\s+nascimento|nascid[oa]\s+em|nasc\.)${LABEL_SEP})\d{1,2}\/\d{1,2}\/\d{2,4}`, "gi"),
  },
  // Identificação funcional: CIF (auditor-fiscal), matrícula de servidor.
  { kind: "REGISTRO", pattern: new RegExp(String.raw`(?<=\b(?:CIF|matr[ií]cula)${LABEL_SEP})\d[\d.]*(?:-\d)?\b`, "gi") },
  // Códigos que permitem consultar o documento original em sistemas públicos.
  {
    kind: "CODIGO",
    pattern: new RegExp(String.raw`(?<=\bc[óo]digo\s+(?:de\s+)?(?:verifica[çc][ãa]o|autenticidade|valida[çc][ãa]o)${LABEL_SEP})[A-Z0-9][A-Z0-9.-]{5,}`, "gi"),
  },
  { kind: "RASTREIO", pattern: /\b[A-Z]{2}\d{9}BR\b/g },
  { kind: "CNPJ", pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, validate: isValidCnpj },
  { kind: "CPF", pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, validate: isValidCpf },
  { kind: "EMAIL", pattern: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  { kind: "OAB", pattern: /\bOAB\s*\/?\s*[A-Z]{2}\s*(?:n[º°o.]\s*)?\d{1,3}(?:\.?\d{3})*(?:-?[A-Z])?\b/g },
  { kind: "CEP", pattern: /\b\d{5}-\d{3}\b/g },
  { kind: "TELEFONE", pattern: /(?:\(\d{2}\)\s?|\b\d{2}\s)9?\d{4}-?\d{4}\b/g },
];

/** Encontra dados de formato fixo. Trechos sobrepostos ficam com a primeira regra que os achou. */
export function detectPatterns(text: string): Match[] {
  const found: Match[] = [];
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

/** Remove acentos e passa para minúsculas, mantendo o mesmo comprimento do texto. */
export function fold(s: string): string {
  // NFD separa o acento da letra; removemos o acento e pegamos 1 caractere por caractere original.
  return Array.from(s, (ch) => ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()[0] ?? ch).join("");
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Encontra as ocorrências de um nome declarado, ignorando maiúsculas, acentos
 * e quebras de linha/espaços múltiplos entre as palavras.
 */
export function findTerm(text: string, term: string, kind: Kind = "PESSOA"): Match[] {
  const words = fold(term).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const pattern = new RegExp(`(?<![\\p{L}\\d])${words.map(escapeRegex).join("\\s+")}(?![\\p{L}\\d])`, "gu");
  const folded = fold(text);
  return Array.from(folded.matchAll(pattern), (m) => ({
    kind,
    text: text.slice(m.index, m.index + m[0].length),
    start: m.index,
    end: m.index + m[0].length,
  }));
}

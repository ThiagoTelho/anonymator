// Encaixe do marcador no espaço que o dado original ocupava no PDF.
//
// O marcador ("[PESSOA_5]") costuma ser mais largo que o dado ("Gilmar", "14/07/1991"). Para continuar
// legível, tentamos, nesta ordem:
//   1. marcador completo no tamanho natural;
//   2. o mesmo, comprimido na horizontal (até MIN_SCALE);
//   3. o mesmo, com a fonte reduzida até MIN_SIZE da altura da linha;
//   4. forma curta ("[P5]"), nas mesmas etapas — explicada numa página de legenda no fim do PDF;
//   5. em último caso, a forma curta encolhida até caber. Nunca transborda o espaço do dado.

/** Tamanho natural da fonte, em fração da altura do trecho removido. */
export const NATURAL_SIZE = 0.8;
/** Menor tamanho de fonte considerado legível, em fração da altura do trecho. */
export const MIN_SIZE = 0.65;
/** Maior compressão horizontal aceita (Tz 65%). */
export const MIN_SCALE = 0.65;

export interface FittedLabel {
  text: string;
  /** Tamanho da fonte, em pontos. */
  size: number;
  /** Escala horizontal (1 = sem compressão). */
  scale: number;
}

const ABBREVIATIONS: Record<string, string> = {
  PESSOA: "P",
  EMPRESA: "E",
  ENDERECO: "END",
  NASCIMENTO: "NASC",
  TELEFONE: "TEL",
  PROCESSO: "PROC",
  REGISTRO: "REG",
  CODIGO: "COD",
  RASTREIO: "RAST",
};

/** Forma curta do marcador: [PESSOA_5] → [P5], [NASCIMENTO_1] → [NASC1]. */
export function shortLabel(kind: string, n: number): string {
  return `[${ABBREVIATIONS[kind] ?? kind}${n}]`;
}

/**
 * Escolhe texto, tamanho e compressão do marcador para caber em `width` × `height`.
 * `measure(text)` devolve a largura do texto com fonte de 1 ponto, sem compressão.
 */
export function fitLabel(full: string, short: string, width: number, height: number, measure: (text: string) => number): FittedLabel {
  for (const text of [full, short]) {
    const unit = measure(text);
    for (const size of [height * NATURAL_SIZE, height * MIN_SIZE]) {
      const scale = width / (unit * size);
      if (scale >= MIN_SCALE) return { text, size, scale: Math.min(1, scale) };
    }
  }
  return { text: short, size: width / (measure(short) * MIN_SCALE), scale: MIN_SCALE };
}

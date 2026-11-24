import { describe, expect, it } from "vitest";
import type { Replacement } from "../src/core/anonymize.ts";
import { parseCorrespondence, restoreText } from "../src/core/restore.ts";

const table: Replacement[] = [
  { placeholder: "[PESSOA_1]", kind: "PESSOA", originals: ["MARIA DA SILVA SOUZA", "Maria da Silva Souza", "Sra. Souza"], occurrences: 3 },
  { placeholder: "[PESSOA_12]", kind: "PESSOA", originals: ["João Lima"], occurrences: 1 },
  { placeholder: "[CPF_1]", kind: "CPF", originals: ["529.982.247-25"], occurrences: 1 },
  { placeholder: "[NASCIMENTO_1]", kind: "NASCIMENTO", originals: ["14/07/1991"], occurrences: 1 },
];

describe("restoreText", () => {
  it("troca cada marcador pelo dado original, preferindo a grafia completa com minúsculas", () => {
    const r = restoreText("A autora [PESSOA_1], CPF [CPF_1], contra [PESSOA_12].", table);
    expect(r.text).toBe("A autora Maria da Silva Souza, CPF 529.982.247-25, contra João Lima.");
    expect(r.restored).toBe(3);
    expect(r.unknown).toEqual([]);
  });

  it("não confunde [PESSOA_1] com [PESSOA_12]", () => {
    expect(restoreText("[PESSOA_12] e [PESSOA_1]", table).text).toBe("João Lima e Maria da Silva Souza");
  });

  it("aceita variações que a IA costuma fazer: minúsculas, espaços e sem colchetes", () => {
    expect(restoreText("[pessoa_1], [ PESSOA_1 ] e PESSOA_1.", table).text).toBe(
      "Maria da Silva Souza, Maria da Silva Souza e Maria da Silva Souza.",
    );
  });

  it("restaura as formas curtas usadas no PDF ([P1], [NASC1])", () => {
    expect(restoreText("[P1] nasceu em [NASC1].", table).text).toBe("Maria da Silva Souza nasceu em 14/07/1991.");
  });

  it("mantém e informa marcadores que não estão na tabela", () => {
    const r = restoreText("[PESSOA_9] falou com [PESSOA_1].", table);
    expect(r.text).toBe("[PESSOA_9] falou com Maria da Silva Souza.");
    expect(r.unknown).toEqual(["[PESSOA_9]"]);
  });

  it("não mexe em texto comum parecido", () => {
    expect(restoreText("PESSOAL_1 e P1A e [CPF] continuam", table).text).toBe("PESSOAL_1 e P1A e [CPF] continuam");
  });
});

describe("parseCorrespondence", () => {
  it("lê o JSON baixado do app", () => {
    expect(parseCorrespondence(JSON.stringify(table))).toEqual(table);
  });
  it("recusa arquivo que não é a tabela", () => {
    expect(() => parseCorrespondence("{}")).toThrowError(/tabela de correspondência/);
    expect(() => parseCorrespondence("não é json")).toThrowError(/tabela de correspondência/);
  });
});

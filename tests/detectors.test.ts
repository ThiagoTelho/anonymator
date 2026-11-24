import { describe, expect, it } from "vitest";
import { detectPatterns, findTerm, fold, isValidCnpj, isValidCpf } from "../src/core/detectors.ts";

const kinds = (text: string) => detectPatterns(text).map((m) => [m.kind, m.text]);

describe("isValidCpf", () => {
  it("aceita CPFs com dígitos verificadores corretos, com ou sem pontuação", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("111.444.777-35")).toBe(true);
  });
  it("recusa dígito verificador errado, sequências repetidas e tamanho errado", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
  });
});

describe("isValidCnpj", () => {
  it("aceita CNPJs válidos", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });
  it("recusa CNPJs inválidos", () => {
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
});

describe("detectPatterns", () => {
  it("encontra CPF e CNPJ válidos e ignora números com dígito errado", () => {
    expect(kinds("CPF 529.982.247-25 e CPF 529.982.247-24")).toEqual([["CPF", "529.982.247-25"]]);
    expect(kinds("CNPJ 11.222.333/0001-81")).toEqual([["CNPJ", "11.222.333/0001-81"]]);
  });

  it("encontra e-mail, telefone, CEP e OAB", () => {
    expect(kinds("maria.oliveira@example.com")).toEqual([["EMAIL", "maria.oliveira@example.com"]]);
    expect(kinds("tel. (62) 99876-5432")).toEqual([["TELEFONE", "(62) 99876-5432"]]);
    expect(kinds("CEP 74230-010")).toEqual([["CEP", "74230-010"]]);
    expect(kinds("OAB/GO 12.345")).toEqual([["OAB", "OAB/GO 12.345"]]);
    expect(kinds("OAB/SP nº 123.456")).toEqual([["OAB", "OAB/SP nº 123.456"]]);
  });

  it("reconhece o número CNJ inteiro sem confundi-lo com telefone", () => {
    expect(kinds("Processo nº 5001234-56.2025.8.09.0051")).toEqual([["PROCESSO", "5001234-56.2025.8.09.0051"]]);
  });

  it("não marca datas, valores e artigos de lei", () => {
    expect(kinds("Em 10/03/2023, R$ 15.000,00, art. 186 do Código Civil, Lei 13.709/2018")).toEqual([]);
  });

  it("devolve as posições exatas no texto", () => {
    const text = "CPF: 529.982.247-25.";
    const [m] = detectPatterns(text);
    expect(text.slice(m.start, m.end)).toBe("529.982.247-25");
  });
});

describe("fold", () => {
  it("remove acentos e passa para minúsculas mantendo o comprimento", () => {
    const s = "JOÃO Conceição Ângela";
    expect(fold(s)).toBe("joao conceicao angela");
    expect(fold(s).length).toBe(s.length);
  });
});

describe("findTerm", () => {
  it("ignora maiúsculas e acentos", () => {
    const hits = findTerm("Autor: JOAO PEDRO ALMEIDA e João Pedro Almeida", "João Pedro Almeida");
    expect(hits.map((h) => h.text)).toEqual(["JOAO PEDRO ALMEIDA", "João Pedro Almeida"]);
  });

  it("encontra o nome quebrado em linhas ou com espaços múltiplos", () => {
    const hits = findTerm("a autora Maria Aparecida\ndos  Santos Oliveira celebrou", "Maria Aparecida dos Santos Oliveira");
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe("Maria Aparecida\ndos  Santos Oliveira");
  });

  it("não casa dentro de outra palavra", () => {
    expect(findTerm("Almeidas e Almeida", "Almeida").map((h) => h.start)).toEqual([11]);
    expect(findTerm("Mariana", "Maria")).toEqual([]);
  });

  it("trata caracteres especiais do termo como texto literal", () => {
    expect(findTerm("Sr. Almeida e Srx Almeida", "Sr. Almeida").map((h) => h.text)).toEqual(["Sr. Almeida"]);
  });

  it("ignora termos vazios", () => {
    expect(findTerm("qualquer texto", "   ")).toEqual([]);
  });
});

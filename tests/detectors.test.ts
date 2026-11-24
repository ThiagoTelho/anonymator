import { describe, expect, it } from "vitest";
import { detectAddresses, detectPatterns, findTerm, fold, isValidCnpj, isValidCpf } from "../src/core/detectors.ts";

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

describe("detectPatterns — documentos do MPT e trabalhistas", () => {
  it("reconhece a numeração do MPU/MPT", () => {
    expect(kinds("Inquérito Civil nº 001873.2025.18.000/8")).toEqual([["PROCESSO", "001873.2025.18.000/8"]]);
  });

  it("reconhece PIS/PASEP formatado com dígito válido e recusa dígito errado", () => {
    expect(kinds("PIS 122.21974.65-6")).toEqual([["PIS", "122.21974.65-6"]]);
    expect(kinds("PIS 122.21974.65-7")).toEqual([]);
  });

  it("reconhece PIS sem pontuação só com o rótulo", () => {
    expect(kinds("PIS/PASEP: 12221974656")).toEqual([["PIS", "12221974656"]]);
  });

  it("reconhece CTPS com série", () => {
    expect(kinds("CTPS\n7579208 série 236-GO")).toEqual([["CTPS", "7579208 série 236-GO"]]);
  });

  it("reconhece data de nascimento só com contexto, mantendo outras datas", () => {
    expect(kinds("Data de nascimento\n14/07/1991; admitido em 03/02/2022")).toEqual([["NASCIMENTO", "14/07/1991"]]);
    expect(kinds("nascida em 02/09/1985")).toEqual([["NASCIMENTO", "02/09/1985"]]);
  });

  it("reconhece CIF e matrícula", () => {
    expect(kinds("Auditor-Fiscal do Trabalho – CIF 15233-0")).toEqual([["REGISTRO", "15233-0"]]);
    expect(kinds("Servidor: Fulano, matrícula 91548.")).toEqual([["REGISTRO", "91548"]]);
  });

  it("reconhece códigos de verificação de documentos, inclusive na linha seguinte", () => {
    expect(kinds("Código de verificação:\n4MAV3HVE (fictício)")).toEqual([["CODIGO", "4MAV3HVE"]]);
    expect(kinds("código de autenticidade 1A2B3C4D")).toEqual([["CODIGO", "1A2B3C4D"]]);
  });

  it("reconhece código de rastreio dos Correios", () => {
    expect(kinds("AR nº BR328161340BR")).toEqual([["RASTREIO", "BR328161340BR"]]);
  });

  it("não marca números de normas, portarias e valores", () => {
    expect(kinds("Portaria nº 412/2025, NR-12, Lei nº 7.347/1985, R$ 16.840,66, OS 51371842/2025")).toEqual([]);
  });
});

describe("detectAddresses", () => {
  const addr = (text: string) => detectAddresses(text).map((m) => m.text);

  it("pega logradouro, número, quadra, lote e bairro, deixando cidade/UF e CEP de fora", () => {
    expect(addr("Rua das Seriemas, Qd. 21, Lt. 9, Jardim Bela Aurora, Nerópolis/GO, CEP 75464-312")).toEqual([
      "Rua das Seriemas, Qd. 21, Lt. 9, Jardim Bela Aurora",
    ]);
  });

  it("pega rodovia com km, s/n e zona rural", () => {
    expect(addr("com sede na Rodovia GO-080, km 14, s/n, Zona Rural, Nerópolis/GO, CEP 75460-000")).toEqual([
      "Rodovia GO-080, km 14, s/n, Zona Rural",
    ]);
  });

  it("pega endereço quebrado em linhas", () => {
    expect(addr("residente na Rua das\nAcácias, nº 123, Setor Bueno, Goiânia/GO")).toEqual(["Rua das\nAcácias, nº 123, Setor Bueno"]);
  });

  it("pega abreviações, apartamento e bloco", () => {
    expect(addr("Av. T-63, nº 1.500, Apto 1202, Bloco B, Setor Bueno, Goiânia - GO")).toEqual([
      "Av. T-63, nº 1.500, Apto 1202, Bloco B, Setor Bueno",
    ]);
  });

  it("inclui bairro sem palavra-chave quando vem antes da cidade", () => {
    expect(addr("Avenida Paulista, 1000, conjunto 52, Bela Vista, São Paulo/SP")).toEqual(["Avenida Paulista, 1000, conjunto 52, Bela Vista"]);
  });

  it("aceita logradouro em minúsculas e termina no fim da frase", () => {
    expect(addr("mora na rua 7, nº 45, Centro.")).toEqual(["rua 7, nº 45, Centro"]);
  });

  it("não marca 'rua' em texto corrido nem logradouro sem número ou complemento", () => {
    expect(addr("a rua estava interditada e a avenida também")).toEqual([]);
    expect(addr("o acidente ocorreu na Rua das Flores, segundo o boletim")).toEqual([]);
  });

  it("é usado por detectPatterns com o tipo ENDERECO, sem engolir o CEP", () => {
    expect(kinds("Rua 7, nº 45, Centro, Goiânia/GO, CEP 74230-010")).toEqual([
      ["ENDERECO", "Rua 7, nº 45, Centro"],
      ["CEP", "74230-010"],
    ]);
  });
});

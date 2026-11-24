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
    expect(findTerm("J. Almeida e Jx Almeida", "J. Almeida").map((h) => h.text)).toEqual(["J. Almeida"]);
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
    expect(kinds("Portaria nº 412/2025, NR-12, Lei nº 7.347/1985, R$ 16.840,66, art. 157, § 2º")).toEqual([]);
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

describe("findTerm — pronome de tratamento + sobrenome", () => {
  const hits = (text: string, term: string) => findTerm(text, term).map((h) => h.text);

  it("marca só o sobrenome, mantendo o pronome no texto", () => {
    const text = "O Sr. Almeida limitou-se a dizer";
    const [h] = findTerm(text, "Sr. Almeida");
    expect(h.text).toBe("Almeida");
    expect(text.slice(h.start, h.end)).toBe("Almeida");
  });

  it("aceita as formas do mesmo pronome: Sr, Sr., Senhor", () => {
    expect(hits("Sr Almeida, Sr. Almeida e Senhor Almeida", "Sr. Almeida")).toEqual(["Almeida", "Almeida", "Almeida"]);
    expect(hits("a Sra. Oliveira e a Senhora Oliveira", "Sra. Oliveira")).toEqual(["Oliveira", "Oliveira"]);
    expect(hits("Dra. Quintela e Doutora Quintela", "Dra. Quintela")).toEqual(["Quintela", "Quintela"]);
  });

  it("não marca o sobrenome sem o pronome nem com pronome de outro gênero", () => {
    expect(hits("Almeida assinou; a Sra. Almeida também", "Sr. Almeida")).toEqual([]);
  });

  it("não trata como pronome quando o termo não começa por um", () => {
    expect(hits("Maria Almeida", "Maria Almeida")).toEqual(["Maria Almeida"]);
  });
});

describe("detectPatterns — documentos pessoais e bancários", () => {
  it("RG com rótulo (vários formatos) e RG de SP sem rótulo", () => {
    expect(kinds("RG nº 5.884.213 DGPC/GO")).toEqual([["RG", "5.884.213"]]);
    expect(kinds("RG\n29.774.130-\nX SSP/SP")).toEqual([["RG", "29.774.130-\nX"]]);
    expect(kinds("portadora da cédula 27.418.093-6 SSP/SP")).toEqual([["RG", "27.418.093-6"]]);
  });

  it("CNH, RENAVAM, título de eleitor, zona e seção", () => {
    expect(kinds("CNH nº 05827364190, RENAVAM 01284736590")).toEqual([
      ["CNH", "05827364190"],
      ["RENAVAM", "01284736590"],
    ]);
    expect(kinds("título de eleitor nº 3184 2207 0159, zona 118, seção 0342")).toEqual([
      ["ELEITOR", "3184 2207 0159"],
      ["ELEITOR", "118"],
      ["ELEITOR", "0342"],
    ]);
  });

  it("placas antiga e Mercosul, só com o rótulo", () => {
    expect(kinds("placa NKE-4419 e placa QTR2F47; norma ISO-9001")).toEqual([
      ["PLACA", "NKE-4419"],
      ["PLACA", "QTR2F47"],
    ]);
  });

  it("agência, conta e chave PIX aleatória", () => {
    expect(kinds("agência 3127-4, conta\npoupança nº 41.886-0")).toEqual([
      ["CONTA", "3127-4"],
      ["CONTA", "41.886-0"],
    ]);
    expect(kinds("chave PIX 7d3f1c2a-9b4e-4f6a-8c1d-2e5b7a9c0f13")).toEqual([["PIX", "7d3f1c2a-9b4e-4f6a-8c1d-2e5b7a9c0f13"]]);
  });

  it("OAB com 'sob o nº' e registro de sociedade de advogados", () => {
    expect(kinds("inscrita na OAB/SP sob o nº 451.268")).toEqual([["OAB", "OAB/SP sob o nº 451.268"]]);
    expect(kinds("registrada na Ordem dos Advogados do Brasil, Seção de São Paulo, sob o nº 31.874, com sede")).toEqual([["REGISTRO", "31.874"]]);
  });

  it("CTPS com vírgula antes da série", () => {
    expect(kinds("CTPS nº 4417382, série\n0021-SP")).toEqual([["CTPS", "4417382, série\n0021-SP"]]);
  });

  it("telefones em vários formatos", () => {
    expect(kinds("+55 62 99812-4471")).toEqual([["TELEFONE", "+55 62 99812-4471"]]);
    expect(kinds("· (11)\n3214-7790")).toEqual([["TELEFONE", "(11)\n3214-7790"]]);
    expect(kinds("número 62996017755")).toEqual([["TELEFONE", "62996017755"]]);
  });

  it("iniciais de partes em segredo de justiça, sem pegar 'S.A.'", () => {
    expect(kinds("R.A.M. e M.A.M., representados por K.S.L.A.; Banco S.A.")).toEqual([
      ["INICIAIS", "R.A.M."],
      ["INICIAIS", "M.A.M."],
      ["INICIAIS", "K.S.L.A."],
    ]);
  });

  it("escola", () => {
    expect(kinds("cursa o 5º ano no Colégio Ciranda do Saber, instituição particular")).toEqual([["ESCOLA", "Colégio Ciranda do Saber"]]);
  });
});

describe("detectPatterns — códigos e protocolos de sistemas", () => {
  it("códigos de verificação/autenticação/validação, inclusive partidos em linhas", () => {
    expect(kinds("informe o processo e código 2B71C4E. —")).toEqual([["CODIGO", "2B71C4E"]]);
    expect(kinds("Código de\nautenticação: 8D41-77QA-K2M9. —")).toEqual([["CODIGO", "8D41-77QA-K2M9"]]);
    expect(kinds("código de validação 4B7E-91C2-\nAF03-6D58 e")).toEqual([["CODIGO", "4B7E-91C2-\nAF03-6D58"]]);
    expect(kinds("nos termos do Código Civil e do código 1234")).toEqual([]);
  });

  it("hash do rodapé do PJe", () => {
    expect(kinds("Juntado em: 24/11/2026 09:15:38 - 3f8a21c Número")).toEqual([["CODIGO", "3f8a21c"]]);
  });

  it("protocolo, atendimento, inquérito policial, RAI, BO, ordem de serviço, número do documento", () => {
    expect(kinds("Protocolo PRT18.850180/2025")).toEqual([["PROTOCOLO", "PRT18.850180/2025"]]);
    expect(kinds("Inquérito Policial nº:\n0871/2026 – DP")).toEqual([["PROTOCOLO", "0871/2026"]]);
    expect(kinds("RAI nº: 38291746")).toEqual([["PROTOCOLO", "38291746"]]);
    expect(kinds("Boletim de Ocorrência nº:\n2026/118374-PMGO")).toEqual([["PROTOCOLO", "2026/118374-PMGO"]]);
    expect(kinds("OS 51371842/2025")).toEqual([["PROTOCOLO", "51371842/2025"]]);
    expect(kinds("sob o número\nWSTA26701984236.")).toEqual([["PROTOCOLO", "WSTA26701984236"]]);
  });

  it("identificador longo em URL de validação, mesmo com a URL partida", () => {
    expect(kinds("https://pje.trt2.jus.br/pjekz/\nvalidacao/26112409153827400000387715204?instancia=1")).toEqual([
      ["PROTOCOLO", "26112409153827400000387715204"],
    ]);
  });
});

describe("detectAddresses — formatos variados", () => {
  const addr = (text: string) => detectAddresses(text).map((m) => m.text.replace(/\s+/g, " "));

  it("edifício com nome, bloco e apartamento", () => {
    expect(addr("residente na Avenida T-63, nº\n1.480, Edifício Solar das Acácias, Bloco B,\nApto 1204, Setor Bueno, Goiânia/GO")).toEqual([
      "Avenida T-63, nº 1.480, Edifício Solar das Acácias, Bloco B, Apto 1204, Setor Bueno",
    ]);
  });

  it("endereço em célula estreita, uma palavra por linha", () => {
    expect(addr("Rua\nTenente\nOtávio\nGomes, nº\n88, casa 2,\nAclimação,\nSão Paulo/SP")).toEqual(["Rua Tenente Otávio Gomes, nº 88, casa 2, Aclimação"]);
  });

  it("galpão como complemento", () => {
    expect(addr("Avenida\nEngenheiro Armando de Arruda Pereira, nº\n3.310, Galpão 7, Jabaquara, São Paulo/SP")).toEqual([
      "Avenida Engenheiro Armando de Arruda Pereira, nº 3.310, Galpão 7, Jabaquara",
    ]);
  });
});

describe("detectPatterns — variações de layout (processos do MPT)", () => {
  it("PIS sem máscara em coluna de tabela, sem confundir com celular", () => {
    expect(kinds("Operador 12221974656 31/05/2018")).toEqual([["PIS", "12221974656"]]);
    expect(kinds("número 62996017755")).toEqual([["TELEFONE", "62996017755"]]);
  });

  it("data de nascimento com pontos ou hífens", () => {
    expect(kinds("Data de nascimento 03.08.1990")).toEqual([["NASCIMENTO", "03.08.1990"]]);
    expect(kinds("nascido em 03-08-1990")).toEqual([["NASCIMENTO", "03-08-1990"]]);
  });

  it("código de verificação só de letras, com rótulo e em maiúsculas", () => {
    expect(kinds("Código de verificação: QWERTZUI\n(fictício)")).toEqual([["CODIGO", "QWERTZUI"]]);
    expect(kinds("Código de\nverificação: ASDFGHJK (fictício)")).toEqual([["CODIGO", "ASDFGHJK"]]);
    expect(kinds("código de verificação: consulte o site")).toEqual([]);
  });

  it("número de auto de infração (8 dígitos + dígito), mesmo sem rótulo", () => {
    expect(kinds("22904619-1\nDeixar de consignar")).toEqual([["PROTOCOLO", "22904619-1"]]);
    expect(kinds("CNAE 2342-7/02; R$ 16.840,66")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { parseFirstNames, suggestEntities } from "../src/core/names.ts";
import { FIRST_NAMES } from "./helpers/names.ts";

const suggest = (text: string) => suggestEntities(text, FIRST_NAMES);
const names = (text: string) => suggest(text).map((s) => s.name);

describe("lista de primeiros nomes", () => {
  it("tem os nomes do Censo, sem acento e em minúsculas", () => {
    expect(FIRST_NAMES.size).toBeGreaterThan(100_000);
    for (const n of ["maria", "jose", "hortensia", "josue", "francinete"]) expect(FIRST_NAMES.has(n)).toBe(true);
  });

  it("parseFirstNames ignora linhas vazias", () => {
    expect([...parseFirstNames("ana\n\n bruno \n")]).toEqual(["ana", "bruno"]);
  });
});

describe("suggestEntities — pessoas", () => {
  it("sugere nome + sobrenomes, com conectivos", () => {
    expect(names("A autora Maria Aparecida dos Santos Oliveira ajuizou a ação.")).toEqual(["Maria Aparecida dos Santos Oliveira"]);
  });

  it("reconhece nomes em CAIXA ALTA e agrupa com a grafia normal", () => {
    const [s] = suggest("JOSUÉ CARDOSO RIBAMAR, brasileiro. Depois, Josué Cardoso Ribamar declarou.");
    expect(s).toMatchObject({ kind: "PESSOA", name: "Josué Cardoso Ribamar", occurrences: 2 });
    expect(s.variants).toContain("JOSUÉ CARDOSO RIBAMAR");
  });

  it("agrupa o nome partido em duas linhas de tabela com o nome completo", () => {
    const [s] = suggest("Dra. Hortênsia Maranhão\nQuintela\n\nassinado por Hortênsia Maranhão Quintela");
    expect(s.name).toBe("Hortênsia Maranhão Quintela");
    expect(s.occurrences).toBe(2);
  });

  it("atribui menção só pelo primeiro nome à única pessoa com esse nome", () => {
    const [s] = suggest("o colega Gilmar sofreu acidente. Gilmar Rezende Tavares, operador.");
    expect(s.variants).toEqual(["Gilmar Rezende Tavares", "Gilmar"]);
  });

  it("não atribui o primeiro nome quando duas pessoas o compartilham", () => {
    const all = suggest("Ana Souza e Ana Lima. Depois Ana falou.");
    expect(all.flatMap((s) => s.variants)).not.toContain("Ana");
  });

  it("aceita inicial abreviada", () => {
    expect(names('recebido por "Rosimeire C.", conforme')).toEqual(["Rosimeire C."]);
  });

  it("exige ao menos um sobrenome", () => {
    expect(names("O colega Gilmar sofreu acidente.")).toEqual([]);
  });

  it("não separa a pessoa do cargo nem junta palavras de outra linha", () => {
    expect(names("Leocádio Pimenta Varjão\nSócio-administrador da investigada")).toEqual(["Leocádio Pimenta Varjão"]);
    expect(names("Ubiratan Seixas Bomfim – CIF 15233-0")).toEqual(["Ubiratan Seixas Bomfim"]);
  });
});

describe("suggestEntities — falsos positivos", () => {
  it("ignora logradouros, bairros e leis com nome de pessoa", () => {
    expect(names("Rua Maria Pereira, Jardim Bela Aurora, Avenida Getúlio Vargas")).toEqual([]);
    expect(names("nos termos da Lei Maria da Penha")).toEqual([]);
  });

  it("ignora cabeçalhos e termos jurídicos em maiúsculas", () => {
    expect(names("EXCELENTÍSSIMA SENHORA PROCURADORA DO TRABALHO\nMINISTÉRIO PÚBLICO DO TRABALHO\nNÃO HÁ")).toEqual([]);
  });

  it("ignora palavras com maiúscula que não começam por primeiro nome", () => {
    expect(names("Superintendência Regional do Trabalho em Goiás")).toEqual([]);
  });
});

describe("suggestEntities — empresas", () => {
  it("sugere empresas pelo sufixo societário", () => {
    const [s] = suggest("em face de Cerâmica Pedra Lilás Indústria e Comércio Ltda., CNPJ");
    expect(s).toMatchObject({ kind: "EMPRESA", name: "Cerâmica Pedra Lilás Indústria e Comércio Ltda." });
  });

  it("não inclui o cargo que antecede a empresa", () => {
    expect(names("Sócio-administrador de Construtora Horizonte Ltda.")).toEqual(["Construtora Horizonte Ltda."]);
  });

  it("não confunde empresa com pessoa quando o nome da empresa contém um primeiro nome", () => {
    expect(suggest("Cerâmica Pedra Lilás Ltda.").map((s) => s.kind)).toEqual(["EMPRESA"]);
  });
});

describe("suggestEntities — agentes públicos", () => {
  it("marca procuradores, auditores e servidores", () => {
    const all = suggest(
      "Dra. Hortênsia Maranhão Quintela – Procuradora do Trabalho\nAuditor responsável\nUbiratan Seixas Bomfim\nServidor: Natanael Prudente Lins, matrícula 91548.",
    );
    expect(all.every((s) => s.publicAgent)).toBe(true);
    expect(all).toHaveLength(3);
  });

  it("não marca partes e advogados", () => {
    const all = suggest("representada por sua advogada, Marília Toscano Arruda.\nNome\nJosué Cardoso Ribamar");
    expect(all.some((s) => s.publicAgent)).toBe(false);
  });
});

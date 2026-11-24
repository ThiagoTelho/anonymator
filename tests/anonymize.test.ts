import { describe, expect, it } from "vitest";
import { anonymizePdf } from "../src/core/anonymize.ts";
import { extractText, findLeaks } from "../src/core/leaks.ts";
import { makePdf, markerSizeRatios, norm, openPdf } from "./helpers/pdf.ts";

const run = (pages: string[], people: string[][] = [], detectPatterns = true) =>
  anonymizePdf(makePdf(pages), { people: people.map((variants) => ({ variants })), detectPatterns });

const placeholderOf = (result: ReturnType<typeof run>, original: string) =>
  result.replacements.find((r) => r.originals.some((o) => norm(o) === norm(original)))?.placeholder;

describe("anonymizePdf — remoção", () => {
  it("remove do PDF os nomes declarados e os dados detectados", () => {
    const result = run(
      ["<p>JOÃO PEDRO ALMEIDA, CPF 111.444.777-35, e-mail joao@example.com, contratou a empresa.</p>"],
      [["João Pedro Almeida"]],
    );
    const text = norm(extractText(result.pdf));
    expect(text).not.toContain("joao pedro almeida");
    expect(text).not.toContain("111.444.777-35");
    expect(text).not.toContain("joao@example.com");
    expect(findLeaks(result.pdf, result.replacements)).toEqual([]);
  });

  it("escreve os marcadores no PDF e preserva o texto ao redor", () => {
    const result = run(["<p>O réu João Pedro Almeida não compareceu à audiência de 10/03/2023.</p>"], [["João Pedro Almeida"]]);
    const text = norm(extractText(result.pdf));
    expect(text).toContain("[pessoa_1]");
    expect(text).toContain("o reu");
    expect(text).toContain("nao compareceu a audiencia de 10/03/2023");
  });

  it("mantém a pontuação colada ao dado removido", () => {
    const result = run(["<p>inscrito no CPF 111.444.777-35, residente em Goiânia.</p>"]);
    expect(norm(extractText(result.pdf))).toContain(", residente em goiania");
  });

  it("remove nomes que quebram de linha", () => {
    const result = run(["<p>A autora Maria Aparecida<br/>dos Santos Oliveira ajuizou a ação.</p>"], [["Maria Aparecida dos Santos Oliveira"]]);
    expect(norm(extractText(result.pdf))).not.toMatch(/maria aparecida|santos oliveira/);
    expect(result.replacements[0].occurrences).toBe(1);
  });

  it("não altera páginas sem dados pessoais", () => {
    const result = run(["<p>Página com nome Fulano Beltrano.</p>", "<p>Página sem dados: art. 186 do Código Civil.</p>"], [["Fulano Beltrano"]]);
    const page2 = openPdf(result.pdf).loadPage(1).toStructuredText("preserve-whitespace").asText();
    expect(norm(page2)).toBe("pagina sem dados: art. 186 do codigo civil.");
  });
});

describe("anonymizePdf — marcadores consistentes", () => {
  it("usa o mesmo marcador para todas as grafias da mesma pessoa, em todas as páginas", () => {
    const result = run(
      ["<p>MARIA DA SILVA ajuizou a ação.</p>", "<p>A Sra. Silva e Maria da Silva compareceram.</p>"],
      [["Maria da Silva", "Sra. Silva"]],
    );
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0]).toMatchObject({ placeholder: "[PESSOA_1]", occurrences: 3 });
    expect(result.text.match(/\[PESSOA_1\]/g)).toHaveLength(3);
  });

  it("numera pessoas diferentes em ordem de declaração", () => {
    const result = run(["<p>Ana Souza contra Bruno Lima.</p>"], [["Ana Souza"], ["Bruno Lima"]]);
    expect(placeholderOf(result, "Ana Souza")).toBe("[PESSOA_1]");
    expect(placeholderOf(result, "Bruno Lima")).toBe("[PESSOA_2]");
  });

  it("dá o mesmo marcador ao mesmo CPF escrito com e sem pontuação", () => {
    const result = run(["<p>CPF 111.444.777-35 e também 11144477735.</p>"]);
    const cpfs = result.replacements.filter((r) => r.kind === "CPF");
    expect(cpfs).toHaveLength(1);
    expect(cpfs[0].occurrences).toBe(2);
  });

  it("dá à variante mais longa prioridade sobre a mais curta", () => {
    const result = run(["<p>João Pedro Almeida assinou. Depois, Almeida sumiu.</p>"], [["Almeida", "João Pedro Almeida"]]);
    expect(result.replacements[0].occurrences).toBe(2);
    expect(result.text).toContain("[PESSOA_1] assinou. Depois, [PESSOA_1] sumiu.");
  });
});

describe("anonymizePdf — empresas e prioridade entre pessoas", () => {
  it("usa marcador de empresa para entidades do tipo EMPRESA", () => {
    const result = anonymizePdf(makePdf(["<p>Contrato com Construtora Horizonte Ltda.</p>"]), {
      people: [{ variants: ["Construtora Horizonte Ltda."], kind: "EMPRESA" }],
    });
    expect(result.text).toContain("[EMPRESA_1]");
    expect(norm(extractText(result.pdf))).not.toContain("horizonte");
  });

  it("dá prioridade à variante mais longa mesmo entre pessoas diferentes", () => {
    const result = run(["<p>Maria da Silva e Maria conversaram.</p>"], [["Maria"], ["Maria da Silva"]]);
    expect(placeholderOf(result, "Maria da Silva")).toBeDefined();
    expect(result.replacements.find((r) => r.originals.includes("Maria"))?.occurrences).toBe(1);
  });
});

describe("anonymizePdf — pronome de tratamento", () => {
  it("anonimiza o sobrenome e mantém o pronome no PDF e no texto", () => {
    const result = run(["<p>A Sra. Oliveira aguarda a entrega. O Sr. Almeida não respondeu.</p>"], [["Maria Oliveira", "Sra. Oliveira"], ["João Almeida", "Sr. Almeida"]]);
    expect(result.text).toContain("A Sra. [PESSOA_1] aguarda");
    expect(result.text).toContain("O Sr. [PESSOA_2] não respondeu");
    const pdfText = norm(extractText(result.pdf));
    expect(pdfText).toContain("a sra.");
    expect(pdfText).toContain("o sr.");
    expect(pdfText).not.toMatch(/oliveira|almeida/);
  });
});

describe("anonymizePdf — marcadores legíveis", () => {
  it("mantém o marcador perto do tamanho do texto mesmo quando o dado original é curto", () => {
    const result = run(["<p>Em agosto, o colega Gil sofreu um acidente; nascido em 14/07/1991.</p>"], [["Gil", "Gilberto Souza"]]);
    const ratios = markerSizeRatios(result.pdf);
    expect(ratios.length).toBeGreaterThan(0);
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(0.6);
  });

  it("acrescenta uma página de legenda quando usa marcadores curtos", () => {
    const input = makePdf(["<p>o colega Gil sofreu um acidente.</p>"]);
    const result = anonymizePdf(input, { people: [{ variants: ["Gil"] }] });
    const doc = openPdf(result.pdf);
    expect(doc.countPages()).toBe(2);
    const legend = norm(doc.loadPage(1).toStructuredText("preserve-whitespace").asText());
    expect(legend).toContain("legenda");
    expect(legend).toContain("[p1] = [pessoa_1]");
    expect(norm(extractText(result.pdf))).not.toContain("gil ");
  });

  it("não acrescenta legenda quando todos os marcadores cabem completos", () => {
    const result = run(["<p>A autora Maria Aparecida dos Santos Oliveira ajuizou a ação.</p>"], [["Maria Aparecida dos Santos Oliveira"]]);
    expect(openPdf(result.pdf).countPages()).toBe(1);
  });
});

describe("anonymizePdf — opções", () => {
  it("não detecta padrões quando detectPatterns é false", () => {
    const result = run(["<p>CPF 111.444.777-35 de Ana Souza.</p>"], [["Ana Souza"]], false);
    expect(result.replacements.map((r) => r.kind)).toEqual(["PESSOA"]);
    expect(norm(extractText(result.pdf))).toContain("111.444.777-35");
  });

  it("devolve o texto anonimizado separado por página", () => {
    const result = run(["<p>Ana Souza</p>", "<p>fim</p>"], [["Ana Souza"]]);
    expect(result.text).toBe("--- Página 1 ---\n[PESSOA_1]\n\n--- Página 2 ---\nfim");
  });
});

describe("anonymizePdf — limpeza do arquivo", () => {
  it("apaga metadados do documento", () => {
    const pdf = makePdf(["<p>texto</p>"], { "info:Title": "Petição de Ana Souza", "info:Author": "Ana Souza" });
    const out = openPdf(anonymizePdf(pdf, { people: [] }).pdf);
    expect(out.getMetaData("info:Title")).toBeFalsy();
    expect(out.getMetaData("info:Author")).toBeFalsy();
  });

  it("apaga anotações e arquivos anexados", () => {
    const doc = openPdf(makePdf(["<p>texto</p>"]));
    const note = doc.loadPage(0).createAnnotation("Text");
    note.setContents("Comentário sobre Ana Souza");
    note.update();
    doc.addEmbeddedFile("dados.txt", "text/plain", new TextEncoder().encode("Ana Souza"), new Date(), new Date());
    const input = doc.saveToBuffer("").asUint8Array().slice();

    const out = openPdf(anonymizePdf(input, { people: [] }).pdf);
    expect(out.loadPage(0).getAnnotations()).toHaveLength(0);
    expect(Object.keys(out.getEmbeddedFiles())).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { anonymizePdf } from "../src/core/anonymize.ts";
import { classifyPage, diagnosePdf, PdfPasswordError } from "../src/core/diagnose.ts";
import { extractText, findLeaks } from "../src/core/leaks.ts";
import { concatPdfs, encryptedPdf, illegiblePdf, makePdf, norm, openPdf, scannedPagePdf, signedPdf } from "./helpers/pdf.ts";

const text = (s: string) => makePdf([`<p>${s}</p>`]);
const body = "Maria da Silva Souza, brasileira, inscrita no CPF sob o nº 529.982.247-25, residente em Goiânia/GO.";
const kinds = (pdf: Uint8Array, password?: string) => diagnosePdf(pdf, password).warnings.map((w) => [w.kind, w.pages ?? []]);

describe("classifyPage", () => {
  it("página com texto legível e sem imagem grande está ok", () => {
    expect(classifyPage({ chars: 800, illegible: 0, imageCoverage: 0.05 })).toBe("ok");
  });
  it("página sem texto e com imagem grande é escaneada", () => {
    expect(classifyPage({ chars: 0, illegible: 0, imageCoverage: 0.95 })).toBe("sem-texto");
    expect(classifyPage({ chars: 12, illegible: 0, imageCoverage: 0.6 })).toBe("sem-texto");
  });
  it("página em branco não é aviso", () => {
    expect(classifyPage({ chars: 0, illegible: 0, imageCoverage: 0 })).toBe("ok");
  });
  it("página com texto e imagem grande: o que estiver só na imagem não é verificado", () => {
    expect(classifyPage({ chars: 600, illegible: 0, imageCoverage: 0.5 })).toBe("imagem");
  });
  it("página com muitos caracteres sem mapeamento é ilegível", () => {
    expect(classifyPage({ chars: 500, illegible: 300, imageCoverage: 0 })).toBe("ilegivel");
    expect(classifyPage({ chars: 500, illegible: 20, imageCoverage: 0 })).toBe("ok");
  });
});

describe("diagnosePdf", () => {
  it("documento normal: sem avisos", () => {
    const d = diagnosePdf(text(body));
    expect(d.pages).toBe(1);
    expect(d.warnings).toEqual([]);
  });

  it("aponta a página escaneada no meio dos autos", () => {
    const pdf = concatPdfs([text(body), scannedPagePdf(text(body)), text("fim")]);
    expect(kinds(pdf)).toEqual([["SEM_TEXTO", [2]]]);
  });

  it("aponta página com texto ilegível (fonte sem mapa de caracteres)", () => {
    expect(kinds(illegiblePdf(text(body)))).toEqual([["ILEGIVEL", [1]]]);
  });

  it("avisa sobre assinatura digital", () => {
    expect(kinds(signedPdf(text(body)))).toEqual([["ASSINATURA", []]]);
  });

  it("exige senha quando o PDF é protegido, e recusa senha errada", () => {
    const pdf = encryptedPdf(text(body), "segredo");
    expect(() => diagnosePdf(pdf)).toThrowError(PdfPasswordError);
    expect(() => diagnosePdf(pdf, "errada")).toThrowError(/incorreta/);
    expect(diagnosePdf(pdf, "segredo").warnings).toEqual([]);
  });
});

describe("anonymizePdf — PDF com senha", () => {
  it("anonimiza com a senha e devolve um PDF sem senha e sem os dados", () => {
    const pdf = encryptedPdf(text(body), "segredo");
    expect(() => anonymizePdf(pdf, { people: [] })).toThrowError(PdfPasswordError);
    const result = anonymizePdf(pdf, { people: [{ variants: ["Maria da Silva Souza"] }], password: "segredo" });
    expect(openPdf(result.pdf).needsPassword()).toBe(false);
    expect(norm(extractText(result.pdf))).not.toContain("maria da silva");
    expect(findLeaks(result.pdf, result.replacements)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { anonymizePdf } from "../src/core/anonymize.ts";
import { PdfPasswordError } from "../src/core/diagnose.ts";
import { friendlyError } from "../src/core/errors.ts";
import { makePdf } from "./helpers/pdf.ts";

const errorOf = (input: Uint8Array) => {
  try {
    anonymizePdf(input, { people: [] });
  } catch (e) {
    return friendlyError(e);
  }
  throw new Error("esperava erro");
};

describe("friendlyError", () => {
  it("arquivo vazio, texto ou imagem: não é PDF", () => {
    for (const bytes of [new Uint8Array(), new TextEncoder().encode("isto não é um pdf"), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]) {
      expect(errorOf(bytes)).toMatchObject({ code: "NAO_E_PDF" });
    }
  });

  it("PDF corrompido/truncado", () => {
    expect(errorOf(makePdf(["<p>Ana</p>"]).slice(0, 300))).toMatchObject({ code: "PDF_DANIFICADO" });
  });

  it("senha: necessária ou incorreta", () => {
    expect(friendlyError(new PdfPasswordError(false))).toMatchObject({ code: "SENHA_NECESSARIA" });
    expect(friendlyError(new PdfPasswordError(true))).toMatchObject({ code: "SENHA_INCORRETA" });
  });

  it("falta de memória vira orientação, e o resto vira erro genérico com o detalhe", () => {
    expect(friendlyError(new RangeError("Array buffer allocation failed")).code).toBe("SEM_MEMORIA");
    expect(friendlyError(new Error("algo inesperado"))).toEqual({
      code: "ERRO",
      message: "Não foi possível processar o PDF. Detalhe técnico: algo inesperado",
    });
  });

  it("toda mensagem é em português e não vazia", () => {
    for (const e of [new Error("no objects found"), new Error("invalid key in dict"), new Error("x")]) {
      expect(friendlyError(e).message.length).toBeGreaterThan(20);
    }
  });
});

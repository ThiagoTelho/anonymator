// Web Worker: roda o MuPDF fora da thread da interface, para a página não travar em PDFs grandes.
//
// O handler é registrado ANTES de carregar o MuPDF. O módulo do MuPDF usa `await` no topo
// (para baixar o .wasm) e, se fosse importado estaticamente, a mensagem com o PDF chegaria
// antes de `onmessage` existir e seria perdida.
import type { AnonymizeOptions, AnonymizeResult } from "./core/anonymize.ts";
import type { Diagnosis } from "./core/diagnose.ts";
import type { Leak } from "./core/leaks.ts";
import type { Suggestion } from "./core/names.ts";

export type WorkerRequest =
  | { type: "analyze"; pdf: ArrayBuffer; password?: string }
  | { type: "anonymize"; pdf: ArrayBuffer; options: AnonymizeOptions };

export type WorkerError = { ok: false; code: "SENHA_NECESSARIA" | "SENHA_INCORRETA" | "ERRO"; error: string };

export type WorkerResponse =
  | { ok: true; type: "analyze"; suggestions: Suggestion[]; diagnosis: Diagnosis }
  | { ok: true; type: "anonymize"; result: AnonymizeResult; leaks: Leak[] }
  | WorkerError;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const req = e.data;
    if (req.type === "analyze") {
      const [{ documentText }, { diagnosePdf }, { parseFirstNames, suggestEntities }, names] = await Promise.all([
        import("./core/text.ts"),
        import("./core/diagnose.ts"),
        import("./core/names.ts"),
        import("./data/first-names.txt?raw"),
      ]);
      const pdf = new Uint8Array(req.pdf);
      const diagnosis = diagnosePdf(pdf, req.password);
      const suggestions = suggestEntities(documentText(pdf, req.password), parseFirstNames(names.default));
      post({ ok: true, type: "analyze", suggestions, diagnosis });
    } else {
      const [{ anonymizePdf }, { findLeaks }] = await Promise.all([import("./core/anonymize.ts"), import("./core/leaks.ts")]);
      const result = anonymizePdf(new Uint8Array(req.pdf), req.options);
      // Verificação final, independente do motor: reabre o PDF gerado e procura cada dado original.
      const leaks = findLeaks(result.pdf, result.replacements);
      post({ ok: true, type: "anonymize", result, leaks }, [result.pdf.buffer]);
    }
  } catch (err) {
    // Reconhecido pelo nome (não por instanceof) para não depender de o módulo do MuPDF ter carregado.
    if (err instanceof Error && err.name === "PdfPasswordError") {
      const wrong = (err as Error & { wrong?: boolean }).wrong === true;
      post({ ok: false, code: wrong ? "SENHA_INCORRETA" : "SENHA_NECESSARIA", error: err.message });
    } else {
      post({ ok: false, code: "ERRO", error: err instanceof Error ? err.message : String(err) });
    }
  }
};

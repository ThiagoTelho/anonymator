// Web Worker: roda o MuPDF fora da thread da interface, para a página não travar em PDFs grandes.
//
// O handler é registrado ANTES de carregar o MuPDF. O módulo do MuPDF usa `await` no topo
// (para baixar o .wasm) e, se fosse importado estaticamente, a mensagem com o PDF chegaria
// antes de `onmessage` existir e seria perdida.
//
// Cancelar = a interface encerra o worker (terminate). Por isso cada pedido usa um worker novo.
import type { AnonymizeOptions, AnonymizeResult } from "./core/anonymize.ts";
import type { Diagnosis } from "./core/diagnose.ts";
import type { ErrorCode } from "./core/errors.ts";
import type { Leak } from "./core/leaks.ts";
import type { Suggestion } from "./core/names.ts";

export type WorkerRequest =
  | { type: "analyze"; pdf: ArrayBuffer; password?: string }
  | { type: "anonymize"; pdf: ArrayBuffer; options: Omit<AnonymizeOptions, "onProgress"> };

export type Phase = "carregando" | "diagnostico" | "leitura" | "anonimizacao" | "verificacao";

export type WorkerProgress = { progress: true; phase: Phase; done: number; total: number };

export type WorkerError = { ok: false; code: ErrorCode; error: string };

export type WorkerResponse =
  | { ok: true; type: "analyze"; suggestions: Suggestion[]; diagnosis: Diagnosis }
  | { ok: true; type: "anonymize"; result: AnonymizeResult; leaks: Leak[] }
  | WorkerError;

const post = (msg: WorkerResponse | WorkerProgress, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);
const progress = (phase: Phase) => (done: number, total: number) => post({ progress: true, phase, done, total });

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const req = e.data;
    progress("carregando")(0, 1);
    if (req.type === "analyze") {
      const [{ documentText }, { diagnosePdf }, { parseFirstNames, suggestEntities }, names] = await Promise.all([
        import("./core/text.ts"),
        import("./core/diagnose.ts"),
        import("./core/names.ts"),
        import("./data/first-names.txt?raw"),
      ]);
      const pdf = new Uint8Array(req.pdf);
      const diagnosis = diagnosePdf(pdf, req.password, progress("diagnostico"));
      const text = documentText(pdf, req.password, progress("leitura"));
      const suggestions = suggestEntities(text, parseFirstNames(names.default));
      post({ ok: true, type: "analyze", suggestions, diagnosis });
    } else {
      const [{ anonymizePdf }, { findLeaks }] = await Promise.all([import("./core/anonymize.ts"), import("./core/leaks.ts")]);
      const result = anonymizePdf(new Uint8Array(req.pdf), { ...req.options, onProgress: progress("anonimizacao") });
      // Verificação final, independente do motor: reabre o PDF gerado e procura cada dado original.
      progress("verificacao")(0, 1);
      const leaks = findLeaks(result.pdf, result.replacements);
      post({ ok: true, type: "anonymize", result, leaks }, [result.pdf.buffer]);
    }
  } catch (err) {
    const { friendlyError } = await import("./core/errors.ts");
    const f = friendlyError(err);
    post({ ok: false, code: f.code, error: f.message });
  }
};

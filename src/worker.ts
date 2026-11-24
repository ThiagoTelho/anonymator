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
import type { Kind } from "./core/detectors.ts";
import type { Suggestion } from "./core/names.ts";
import type { PlannedLabels } from "./core/numbering.ts";
import type { PlanOptions } from "./core/plan.ts";
import type { PreviewBox, PreviewOptions, PreviewWord } from "./core/preview.ts";

export type WorkerRequest =
  | { type: "analyze"; pdf: ArrayBuffer; password?: string }
  | { type: "anonymize"; pdf: ArrayBuffer; options: Omit<AnonymizeOptions, "onProgress"> }
  // Sessão de pré-visualização: "open" guarda o documento no worker; "preview" desenha uma página.
  | { type: "open"; pdf: ArrayBuffer; password?: string }
  | { type: "preview"; index: number; options: PreviewOptions; scale: number; seq?: number }
  | { type: "labels"; options: PlanOptions; seq?: number };

export type Phase = "carregando" | "diagnostico" | "leitura" | "anonimizacao" | "verificacao";

export type WorkerProgress = { progress: true; phase: Phase; done: number; total: number };

export type WorkerError = { ok: false; code: ErrorCode; error: string };

export type WorkerResponse =
  | { ok: true; type: "analyze"; suggestions: Suggestion[]; diagnosis: Diagnosis; detected: Partial<Record<Kind, number>> }
  | { ok: true; type: "opened"; pages: number }
  | { ok: true; type: "labels"; labels: PlannedLabels }
  | { ok: true; type: "preview"; index: number; png: Uint8Array; width: number; height: number; boxes: PreviewBox[]; words: PreviewWord[] }
  | { ok: true; type: "anonymize"; result: AnonymizeResult; leaks: Leak[] }
  | WorkerError;

const post = (msg: WorkerResponse | WorkerProgress, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);
const progress = (phase: Phase) => (done: number, total: number) => post({ progress: true, phase, done, total });

/** Documento aberto pela sessão de pré-visualização. */
let session: import("mupdf").PDFDocument | null = null;

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const req = e.data;
    if (req.type === "open") {
      const { openPdf } = await import("./core/diagnose.ts");
      session = openPdf(new Uint8Array(req.pdf), req.password);
      return post({ ok: true, type: "opened", pages: session.countPages() });
    }
    if (req.type === "preview") {
      if (!session) throw new Error("Documento não aberto para pré-visualização.");
      const { previewPage } = await import("./core/preview.ts");
      const p = previewPage(session, req.index, req.options, req.scale);
      // `seq` volta na resposta para a interface casar pedido e resposta.
      return (self as unknown as Worker).postMessage({ ok: true, type: "preview", index: req.index, seq: req.seq, ...p }, [p.png.buffer]);
    }
    if (req.type === "labels") {
      if (!session) throw new Error("Documento não aberto para pré-visualização.");
      const { planLabels } = await import("./core/numbering.ts");
      return (self as unknown as Worker).postMessage({ ok: true, type: "labels", labels: planLabels(session, req.options), seq: req.seq });
    }
    progress("carregando")(0, 1);
    if (req.type === "analyze") {
      const [{ documentText }, { diagnosePdf }, { parseFirstNames, suggestEntities }, { detectedCounts }, names] = await Promise.all([
        import("./core/text.ts"),
        import("./core/diagnose.ts"),
        import("./core/names.ts"),
        import("./core/preview.ts"),
        import("./data/first-names.txt?raw"),
      ]);
      const pdf = new Uint8Array(req.pdf);
      const diagnosis = diagnosePdf(pdf, req.password, progress("diagnostico"));
      const text = documentText(pdf, req.password, progress("leitura"));
      const suggestions = suggestEntities(text, parseFirstNames(names.default));
      post({ ok: true, type: "analyze", suggestions, diagnosis, detected: detectedCounts(text) });
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
    const seq = (e.data as { seq?: number }).seq;
    (self as unknown as Worker).postMessage({ ok: false, code: f.code, error: f.message, seq });
  }
};

// Web Worker: roda o MuPDF fora da thread da interface, para a página não travar em PDFs grandes.
//
// O handler é registrado ANTES de carregar o MuPDF. O módulo do MuPDF usa `await` no topo
// (para baixar o .wasm) e, se fosse importado estaticamente, a mensagem com o PDF chegaria
// antes de `onmessage` existir e seria perdida.
import type { AnonymizeOptions, AnonymizeResult } from "./core/anonymize.ts";
import type { Suggestion } from "./core/names.ts";

export type WorkerRequest =
  | { type: "analyze"; pdf: ArrayBuffer }
  | { type: "anonymize"; pdf: ArrayBuffer; options: AnonymizeOptions };

export type WorkerResponse =
  | { ok: true; type: "analyze"; suggestions: Suggestion[] }
  | { ok: true; type: "anonymize"; result: AnonymizeResult }
  | { ok: false; error: string };

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const req = e.data;
    if (req.type === "analyze") {
      const [{ documentText }, { parseFirstNames, suggestEntities }, names] = await Promise.all([
        import("./core/text.ts"),
        import("./core/names.ts"),
        import("./data/first-names.txt?raw"),
      ]);
      const suggestions = suggestEntities(documentText(new Uint8Array(req.pdf)), parseFirstNames(names.default));
      post({ ok: true, type: "analyze", suggestions });
    } else {
      const { anonymizePdf } = await import("./core/anonymize.ts");
      const result = anonymizePdf(new Uint8Array(req.pdf), req.options);
      post({ ok: true, type: "anonymize", result }, [result.pdf.buffer]);
    }
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

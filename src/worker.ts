// Web Worker: roda o MuPDF fora da thread da interface, para a página não travar em PDFs grandes.
//
// O handler é registrado ANTES de carregar o MuPDF. O módulo do MuPDF usa `await` no topo
// (para baixar o .wasm) e, se fosse importado estaticamente, a mensagem com o PDF chegaria
// antes de `onmessage` existir e seria perdida.
import type { AnonymizeOptions, AnonymizeResult } from "./core/anonymize.ts";

export type WorkerRequest = { pdf: ArrayBuffer; options: AnonymizeOptions };
export type WorkerResponse = { ok: true; result: AnonymizeResult } | { ok: false; error: string };

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const { anonymizePdf } = await import("./core/anonymize.ts");
    const result = anonymizePdf(new Uint8Array(e.data.pdf), e.data.options);
    post({ ok: true, result }, [result.pdf.buffer]);
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

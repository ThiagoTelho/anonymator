// Comunicação com o Web Worker: tarefas com progresso e cancelamento, e a sessão de pré-visualização.
import type { PreviewOptions } from "../core/preview.ts";
import type { WorkerProgress, WorkerRequest, WorkerResponse } from "../worker.ts";

const spawn = () => new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });

/** Tarefa em andamento: a resposta e uma forma de cancelar (encerra o worker). */
export interface Job {
  done: Promise<WorkerResponse | null>;
  cancel: () => void;
}

/** Envia um pedido a um worker novo; `onProgress` recebe o avanço por página. Cancelada, resolve com null. */
export function startJob(req: WorkerRequest, transfer: Transferable[], onProgress: (p: WorkerProgress) => void): Job {
  const worker = spawn();
  let finish: (r: WorkerResponse | null) => void = () => {};
  const done = new Promise<WorkerResponse | null>((resolve) => (finish = resolve));
  worker.onmessage = (e: MessageEvent<WorkerResponse | WorkerProgress>) => {
    if ("progress" in e.data) return onProgress(e.data);
    finish(e.data);
    worker.terminate();
  };
  worker.onerror = (e) => {
    finish({ ok: false, code: "ERRO", error: e.message || "Falha ao processar o PDF." });
    worker.terminate();
  };
  worker.postMessage(req, transfer);
  return {
    done,
    cancel: () => {
      worker.terminate();
      finish(null);
    },
  };
}

export interface PreviewImage {
  index: number;
  url: string;
  width: number;
  height: number;
  boxes: Extract<WorkerResponse, { type: "preview" }>["boxes"];
  words: Extract<WorkerResponse, { type: "preview" }>["words"];
}

/**
 * Sessão de pré-visualização: um worker que mantém o documento aberto e desenha páginas sob demanda.
 * Só a resposta do pedido mais recente é entregue (navegar rápido não acumula desenhos antigos).
 */
export class PreviewSession {
  private worker = spawn();
  private seq = 0;
  private pending = new Map<number, (r: WorkerResponse) => void>();
  readonly ready: Promise<number>;

  constructor(pdf: ArrayBuffer, password?: string) {
    this.worker.onmessage = (e: MessageEvent<WorkerResponse & { seq?: number }>) => {
      const handler = this.pending.get(e.data.seq ?? -1) ?? this.pending.get(0);
      handler?.(e.data);
    };
    this.ready = new Promise((resolve, reject) => {
      this.pending.set(0, (r) => {
        this.pending.delete(0);
        if (r.ok && r.type === "opened") resolve(r.pages);
        else reject(new Error(r.ok ? "resposta inesperada" : r.error));
      });
    });
    this.worker.postMessage({ type: "open", pdf, password } satisfies WorkerRequest, [pdf]);
  }

  async page(index: number, options: PreviewOptions, scale: number): Promise<PreviewImage | null> {
    await this.ready;
    const seq = ++this.seq;
    const response = await new Promise<WorkerResponse>((resolve) => {
      // O worker responde na ordem dos pedidos; guardamos um resolvedor por número de sequência.
      this.pending.set(seq, resolve);
      this.worker.postMessage({ type: "preview", index, options, scale, seq } as WorkerRequest);
    });
    this.pending.delete(seq);
    if (seq !== this.seq || !response.ok || response.type !== "preview") return null;
    const url = URL.createObjectURL(new Blob([response.png as BlobPart], { type: "image/png" }));
    return { index, url, width: response.width, height: response.height, boxes: response.boxes, words: response.words };
  }

  close() {
    this.worker.terminate();
    this.pending.clear();
  }
}

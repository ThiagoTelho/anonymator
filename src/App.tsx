import { useRef, useState } from "react";
import type { AnonymizeResult } from "./core/anonymize.ts";
import type { Suggestion } from "./core/names.ts";
import { buildPeople, defaultSelection } from "./core/people.ts";
import type { WorkerRequest, WorkerResponse } from "./worker.ts";

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Envia um pedido a um worker novo e devolve a resposta. */
function callWorker(req: WorkerRequest, transfer: Transferable[]): Promise<WorkerResponse> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => {
      resolve({ ok: false, error: e.message || "Falha ao processar o PDF." });
      worker.terminate();
    };
    worker.postMessage(req, transfer);
  });
}

type Status =
  | { state: "idle" }
  | { state: "analyzing" }
  | { state: "ready" }
  | { state: "working" }
  | { state: "done"; result: AnonymizeResult }
  | { state: "error"; message: string };

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [manual, setManual] = useState("");
  const [detect, setDetect] = useState(true);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const fileVersion = useRef(0);

  const baseName = file?.name.replace(/\.pdf$/i, "") ?? "documento";

  async function choose(f: File | null) {
    setFile(f);
    setSuggestions([]);
    setSelected([]);
    if (!f) return setStatus({ state: "idle" });
    const version = ++fileVersion.current;
    setStatus({ state: "analyzing" });
    const pdf = await f.arrayBuffer();
    const res = await callWorker({ type: "analyze", pdf }, [pdf]);
    if (version !== fileVersion.current) return;
    if (!res.ok) return setStatus({ state: "error", message: res.error });
    if (res.type === "analyze") {
      setSuggestions(res.suggestions);
      setSelected(defaultSelection(res.suggestions));
    }
    setStatus({ state: "ready" });
  }

  async function run() {
    if (!file) return;
    setStatus({ state: "working" });
    const pdf = await file.arrayBuffer();
    const res = await callWorker(
      { type: "anonymize", pdf, options: { people: buildPeople(suggestions, selected, manual), detectPatterns: detect } },
      [pdf],
    );
    if (!res.ok) setStatus({ state: "error", message: res.error });
    else if (res.type === "anonymize") setStatus({ state: "done", result: res.result });
  }

  const busy = status.state === "analyzing" || status.state === "working";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Anonymator</h1>
          <p className="mt-2 text-slate-600">
            Anonimize dados pessoais de PDFs de processos antes de usá-los com ferramentas de IA.
          </p>
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            O arquivo é processado inteiramente no seu navegador. Nada é enviado a nenhum servidor.
          </p>
        </header>

        <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="block text-sm font-semibold" htmlFor="pdf">
              1. Escolha o PDF
            </label>
            <input
              id="pdf"
              type="file"
              accept="application/pdf"
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-white hover:file:bg-slate-700"
            />
          </div>

          <div>
            <h2 className="text-sm font-semibold">2. Revise as pessoas e empresas encontradas</h2>
            {status.state === "analyzing" && <p className="mt-2 text-sm text-slate-500">Procurando nomes no documento…</p>}
            {file && status.state !== "analyzing" && suggestions.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">Nenhum nome encontrado automaticamente. Declare-os abaixo.</p>
            )}
            {suggestions.length > 0 && (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  Sugestões automáticas. Desmarque o que não deve ser anonimizado. Agentes públicos (juízes, procuradores,
                  servidores) vêm desmarcados.
                </p>
                <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200" aria-label="Sugestões">
                  {suggestions.map((s, i) => (
                    <li key={`${s.kind}:${s.name}`} className="flex items-start gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        aria-label={s.name}
                        checked={selected[i] ?? false}
                        onChange={(e) => setSelected((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{s.name}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                            {s.kind === "EMPRESA" ? "empresa" : "pessoa"}
                          </span>
                          {s.publicAgent && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">agente público</span>
                          )}
                          <span className="text-xs text-slate-500">{s.occurrences}×</span>
                        </div>
                        {s.variants.length > 1 && (
                          <div className="truncate text-xs text-slate-500">também: {s.variants.slice(1).join(" · ")}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold" htmlFor="names">
              3. Acrescente nomes que faltaram
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Um por linha. Outras formas de citar a mesma pessoa vão na mesma linha, separadas por ponto e vírgula.
              Maiúsculas, acentos e quebras de linha são ignorados.
            </p>
            <textarea
              id="names"
              rows={3}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder={"Maria Aparecida dos Santos Oliveira; Sra. Oliveira"}
              className="mt-2 w-full rounded-md border border-slate-300 p-2 font-mono text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={detect} onChange={(e) => setDetect(e.target.checked)} />
            Detectar automaticamente CPF, CNPJ, PIS, CTPS, e-mail, telefone, CEP, OAB, data de nascimento, números de
            processo e códigos de verificação
          </label>

          <button
            onClick={run}
            disabled={!file || busy}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {status.state === "working" ? "Processando…" : "Anonimizar"}
          </button>
        </section>

        {status.state === "error" && (
          <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{status.message}</p>
        )}

        {status.state === "done" && (
          <section className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Resultado</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => download(status.result.pdf as BlobPart, `${baseName}-anonimizado.pdf`, "application/pdf")}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Baixar PDF
              </button>
              <button
                onClick={() => download(status.result.text, `${baseName}-anonimizado.txt`, "text/plain;charset=utf-8")}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100"
              >
                Baixar texto (.txt)
              </button>
              <button
                onClick={() =>
                  download(JSON.stringify(status.result.replacements, null, 2), `${baseName}-correspondencia.json`, "application/json")
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100"
              >
                Baixar tabela de correspondência
              </button>
            </div>
            <p className="text-xs text-slate-500">
              A tabela de correspondência liga cada marcador ao dado original. Guarde-a só na sua máquina e não a envie à IA.
            </p>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3">Marcador</th>
                  <th className="py-1.5 pr-3">Ocorrências</th>
                  <th className="py-1.5">Original</th>
                </tr>
              </thead>
              <tbody>
                {status.result.replacements.map((r) => (
                  <tr key={r.placeholder} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 font-mono">{r.placeholder}</td>
                    <td className="py-1.5 pr-3">{r.occurrences}</td>
                    <td className="py-1.5">{r.originals.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="mt-10 text-xs text-slate-500">
          Revise sempre o resultado: a detecção automática não garante a remoção de todos os dados pessoais. Endereços ainda não
          são detectados.
        </footer>
      </div>
    </div>
  );
}

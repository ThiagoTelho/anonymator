import { useRef, useState } from "react";
import type { AnonymizeResult, Person } from "./core/anonymize.ts";
import type { WorkerRequest, WorkerResponse } from "./worker.ts";

/** Uma pessoa por linha; grafias alternativas da mesma pessoa separadas por ";". */
function parsePeople(raw: string): Person[] {
  return raw
    .split("\n")
    .map((line) => line.split(";").map((v) => v.trim()).filter(Boolean))
    .filter((variants) => variants.length > 0)
    .map((variants) => ({ variants }));
}

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Status = { state: "idle" } | { state: "working" } | { state: "done"; result: AnonymizeResult } | { state: "error"; message: string };

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [names, setNames] = useState("");
  const [detect, setDetect] = useState(true);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const workerRef = useRef<Worker | null>(null);

  const baseName = file?.name.replace(/\.pdf$/i, "") ?? "documento";

  async function run() {
    if (!file) return;
    setStatus({ state: "working" });
    workerRef.current?.terminate();
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      setStatus(e.data.ok ? { state: "done", result: e.data.result } : { state: "error", message: e.data.error });
      worker.terminate();
    };
    worker.onerror = (e) => setStatus({ state: "error", message: e.message || "Falha ao processar o PDF." });
    const pdf = await file.arrayBuffer();
    const msg: WorkerRequest = { pdf, options: { people: parsePeople(names), detectPatterns: detect } };
    worker.postMessage(msg, [pdf]);
  }

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
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setStatus({ state: "idle" });
              }}
              className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-white hover:file:bg-slate-700"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold" htmlFor="names">
              2. Declare as pessoas e empresas a anonimizar
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Uma por linha. Outras formas de citar a mesma pessoa vão na mesma linha, separadas por ponto e vírgula.
              Maiúsculas, acentos e quebras de linha são ignorados.
            </p>
            <textarea
              id="names"
              rows={5}
              value={names}
              onChange={(e) => setNames(e.target.value)}
              placeholder={"Maria Aparecida dos Santos Oliveira; Sra. Oliveira\nJoão Pedro Almeida; Sr. Almeida\nConstrutora Horizonte Ltda"}
              className="mt-2 w-full rounded-md border border-slate-300 p-2 font-mono text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={detect} onChange={(e) => setDetect(e.target.checked)} />
            Detectar automaticamente CPF, CNPJ, e-mail, telefone, CEP, OAB e número do processo
          </label>

          <button
            onClick={run}
            disabled={!file || status.state === "working"}
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
          Revise sempre o resultado: a detecção automática não garante a remoção de todos os dados pessoais.
        </footer>
      </div>
    </div>
  );
}

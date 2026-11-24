import { useRef, useState } from "react";
import type { AnonymizeResult, Replacement } from "./core/anonymize.ts";
import type { Diagnosis, Warning } from "./core/diagnose.ts";
import type { Leak } from "./core/leaks.ts";
import type { Suggestion } from "./core/names.ts";
import { buildPeople, defaultSelection } from "./core/people.ts";
import { parseCorrespondence, restoreText } from "./core/restore.ts";
import { summarize } from "./core/summary.ts";
import type { Phase, WorkerProgress, WorkerRequest, WorkerResponse } from "./worker.ts";

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Pedido em andamento: a resposta e uma forma de cancelar (encerra o worker). */
interface Job {
  done: Promise<WorkerResponse | null>;
  cancel: () => void;
}

/** Envia um pedido a um worker novo; `onProgress` recebe o avanço por página. Cancelado, resolve com null. */
function startWorker(req: WorkerRequest, transfer: Transferable[], onProgress: (p: WorkerProgress) => void): Job {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
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

const PHASE_LABELS: Record<Phase, string> = {
  carregando: "Preparando",
  diagnostico: "Verificando as páginas",
  leitura: "Procurando nomes",
  anonimizacao: "Anonimizando",
  verificacao: "Conferindo o resultado",
};

function ProgressBar({ progress, onCancel }: { progress: WorkerProgress | null; onCancel: () => void }) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const label = progress ? PHASE_LABELS[progress.phase] : "Preparando";
  const pages = progress && progress.total > 1 ? ` — página ${progress.done} de ${progress.total}` : "";
  return (
    <div className="mt-3 flex items-center gap-3" role="status" aria-label="Progresso">
      <div className="flex-1">
        <div className="text-xs text-slate-600">
          {label}
          {pages}…
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded bg-slate-200">
          <div className="h-full bg-slate-900 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button onClick={onCancel} className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100">
        Cancelar
      </button>
    </div>
  );
}

type Status =
  | { state: "idle" }
  | { state: "analyzing" }
  | { state: "password"; wrong: boolean }
  | { state: "ready" }
  | { state: "working" }
  | { state: "done"; result: AnonymizeResult; leaks: Leak[] }
  | { state: "error"; message: string };

const pagesText = (pages: number[]) => (pages.length === 1 ? `página ${pages[0]}` : `páginas ${pages.join(", ")}`);
const SEVERE = new Set(["SEM_TEXTO", "ILEGIVEL"]);

function Warnings({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Avisos">
      {warnings.map((w) => (
        <li
          key={w.kind}
          className={`rounded-md border px-3 py-2 text-sm ${SEVERE.has(w.kind) ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
        >
          {w.pages && w.pages.length > 0 && <strong className="font-semibold">{pagesText(w.pages)}: </strong>}
          {w.message}
        </li>
      ))}
    </ul>
  );
}

/** Devolve os dados reais à resposta da IA, usando a tabela de correspondência (tudo local). */
function RestorePanel({ current }: { current: Replacement[] | null }) {
  const [aiText, setAiText] = useState("");
  const [loaded, setLoaded] = useState<Replacement[] | null>(null);
  const [error, setError] = useState("");
  const table = loaded ?? current;
  const result = table && aiText ? restoreText(aiText, table) : null;

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Restaurar">
      <h2 className="text-lg font-semibold">Restaurar os nomes na resposta da IA</h2>
      <p className="text-sm text-slate-600">
        Cole a resposta da IA. Os marcadores ([PESSOA_1], [CPF_2]…) voltam a ser os dados reais, usando a tabela de
        correspondência. Também acontece só no seu navegador.
      </p>
      <div className="text-sm">
        {current && !loaded && <p className="text-slate-600">Usando a tabela do documento anonimizado acima.</p>}
        <label className="mt-1 block text-slate-600" htmlFor="tabela">
          {current ? "Ou carregue outra tabela (.json):" : "Carregue a tabela de correspondência (.json) baixada do app:"}
        </label>
        <input
          id="tabela"
          type="file"
          accept="application/json,.json"
          className="mt-1 block text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              setLoaded(parseCorrespondence(await f.text()));
              setError("");
            } catch (err) {
              setLoaded(null);
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
        {error && <p className="mt-1 text-red-700">{error}</p>}
      </div>
      <textarea
        aria-label="Resposta da IA"
        rows={5}
        value={aiText}
        onChange={(e) => setAiText(e.target.value)}
        placeholder="Cole aqui o texto com marcadores…"
        className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      {aiText && !table && <p className="text-sm text-amber-800">Carregue a tabela de correspondência para restaurar.</p>}
      {result && (
        <>
          <p className="text-xs text-slate-500" data-testid="restaurados">
            {result.restored} {result.restored === 1 ? "marcador restaurado" : "marcadores restaurados"}
            {result.unknown.length > 0 && ` · não estão na tabela: ${result.unknown.join(", ")}`}
          </p>
          <textarea
            aria-label="Texto restaurado"
            readOnly
            rows={5}
            value={result.text}
            className="w-full rounded-md border border-slate-300 bg-slate-50 p-2 text-sm"
          />
          <button
            onClick={() => void navigator.clipboard.writeText(result.text)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100"
          >
            Copiar texto restaurado
          </button>
        </>
      )}
    </section>
  );
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [manual, setManual] = useState("");
  const [detect, setDetect] = useState(true);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const fileVersion = useRef(0);
  const job = useRef<Job | null>(null);
  const [progress, setProgress] = useState<WorkerProgress | null>(null);

  function start(req: WorkerRequest, transfer: Transferable[]) {
    job.current?.cancel();
    setProgress(null);
    const j = startWorker(req, transfer, setProgress);
    job.current = j;
    return j.done;
  }

  function cancel() {
    job.current?.cancel();
    job.current = null;
    setProgress(null);
    // Cancelar a leitura volta ao início; cancelar a anonimização volta para a revisão.
    setStatus(diagnosis ? { state: "ready" } : { state: "idle" });
  }

  const baseName = file?.name.replace(/\.pdf$/i, "") ?? "documento";

  async function analyze(f: File, pw?: string) {
    const version = ++fileVersion.current;
    setStatus({ state: "analyzing" });
    const pdf = await f.arrayBuffer();
    const res = await start({ type: "analyze", pdf, password: pw }, [pdf]);
    if (res === null || version !== fileVersion.current) return;
    if (!res.ok) {
      if (res.code === "SENHA_NECESSARIA" || res.code === "SENHA_INCORRETA") return setStatus({ state: "password", wrong: res.code === "SENHA_INCORRETA" });
      return setStatus({ state: "error", message: res.error });
    }
    if (res.type === "analyze") {
      setDiagnosis(res.diagnosis);
      setSuggestions(res.suggestions);
      setSelected(defaultSelection(res.suggestions));
    }
    setStatus({ state: "ready" });
  }

  function choose(f: File | null) {
    setFile(f);
    setPassword("");
    setDiagnosis(null);
    setSuggestions([]);
    setSelected([]);
    if (!f) return setStatus({ state: "idle" });
    void analyze(f);
  }

  async function run() {
    if (!file) return;
    setStatus({ state: "working" });
    const pdf = await file.arrayBuffer();
    const options = { people: buildPeople(suggestions, selected, manual), detectPatterns: detect, password: password || undefined };
    const res = await start({ type: "anonymize", pdf, options }, [pdf]);
    if (res === null) return;
    if (!res.ok) setStatus({ state: "error", message: res.error });
    else if (res.type === "anonymize") setStatus({ state: "done", result: res.result, leaks: res.leaks });
  }

  const busy = status.state === "analyzing" || status.state === "working";
  // Páginas que a verificação final não alcança: sem texto legível (escaneadas ou com fonte ilegível).
  const uncheckedPages = (diagnosis?.warnings ?? [])
    .filter((w) => SEVERE.has(w.kind))
    .flatMap((w) => w.pages ?? [])
    .sort((a, b) => a - b);
  const canRun = file !== null && diagnosis !== null && !busy;

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
            {status.state === "password" && file && (
              <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void analyze(file, password);
                }}
              >
                <label className="text-sm" htmlFor="password">
                  {status.wrong ? "Senha incorreta. Tente de novo:" : "Este PDF é protegido por senha:"}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <button type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-sm font-semibold text-white hover:bg-slate-700">
                  Abrir
                </button>
              </form>
            )}
            {diagnosis && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-500">
                  {diagnosis.pages} {diagnosis.pages === 1 ? "página" : "páginas"}
                  {diagnosis.warnings.length === 0 && " · nenhuma página com problema de leitura"}
                </p>
                <Warnings warnings={diagnosis.warnings} />
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold">2. Revise as pessoas e empresas encontradas</h2>
            {status.state === "analyzing" && <ProgressBar progress={progress} onCancel={cancel} />}
            {diagnosis && suggestions.length === 0 && (
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
              Um por linha. Outras formas de citar a mesma pessoa vão na mesma linha, separadas por ponto e vírgula (ex.:
              "João Pedro Almeida; Sr. Almeida" — o "Sr." é mantido no texto). Maiúsculas, acentos e quebras de linha são
              ignorados.
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
            Detectar automaticamente documentos (CPF, CNPJ, RG, CNH, PIS, CTPS, título de eleitor, OAB), endereços,
            contatos, dados bancários, placas, datas de nascimento, iniciais, escolas, números de processo e protocolo
            e códigos de verificação
          </label>

          <button
            onClick={run}
            disabled={!canRun}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {status.state === "working" ? "Processando…" : "Anonimizar"}
          </button>
          {status.state === "working" && <ProgressBar progress={progress} onCancel={cancel} />}
        </section>

        {status.state === "error" && (
          <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{status.message}</p>
        )}

        {status.state === "done" && (
          <section className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Resultado">
            <h2 className="text-lg font-semibold">Resultado</h2>

            {status.leaks.length === 0 && uncheckedPages.length === 0 && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid="verificacao">
                Verificação final: nenhum dos dados substituídos pôde ser encontrado no PDF gerado.
              </p>
            )}
            {status.leaks.length === 0 && uncheckedPages.length > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="verificacao">
                Verificação final: nenhum dos dados substituídos foi encontrado no texto do PDF gerado, mas{" "}
                <strong>{pagesText(uncheckedPages)}</strong> não {uncheckedPages.length === 1 ? "pôde" : "puderam"} ser
                {uncheckedPages.length === 1 ? " verificada" : " verificadas"} (sem texto legível). {uncheckedPages.length === 1 ? "Confira-a" : "Confira-as"} antes de usar o arquivo.
              </p>
            )}
            {status.leaks.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" data-testid="verificacao">
                <p className="font-semibold">Verificação final: dados ainda legíveis no PDF gerado. Não use este arquivo.</p>
                <ul className="mt-1 list-disc pl-5">
                  {status.leaks.map((l) => (
                    <li key={`${l.placeholder}:${l.original}:${l.where}`}>
                      {l.placeholder} ({l.where})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diagnosis && <Warnings warnings={diagnosis.warnings} />}

            <table className="w-full text-left text-sm" aria-label="Resumo">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3">Tipo</th>
                  <th className="py-1.5 pr-3">Distintos</th>
                  <th className="py-1.5">Trechos removidos</th>
                </tr>
              </thead>
              <tbody>
                {summarize(status.result.replacements).map((row) => (
                  <tr key={row.kind} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">{row.label}</td>
                    <td className="py-1.5 pr-3">{row.distinct}</td>
                    <td className="py-1.5">{row.occurrences}</td>
                  </tr>
                ))}
              </tbody>
            </table>

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
              Revise o resultado: datas, profissão, local de trabalho e fatos muito específicos também podem identificar
              alguém, e não são removidos.
            </p>

            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600">Ver a correspondência marcador → original</summary>
              <table className="mt-2 w-full text-left text-sm">
                <tbody>
                  {status.result.replacements.map((r) => (
                    <tr key={r.placeholder} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3 font-mono">{r.placeholder}</td>
                      <td className="py-1.5 pr-3">{r.occurrences}×</td>
                      <td className="py-1.5">{r.originals.join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        )}

        <RestorePanel current={status.state === "done" ? status.result.replacements : null} />

        <footer className="mt-10 text-xs text-slate-500">
          Revise sempre o resultado: a detecção automática não garante a remoção de todos os dados pessoais.
        </footer>
      </div>
    </div>
  );
}

// Anonimador: fluxo em quatro etapas — documento, revisão, resultado, restaurar.
import { useEffect, useRef, useState } from "react";
import type { AnonymizeResult } from "./core/anonymize.ts";
import type { Diagnosis } from "./core/diagnose.ts";
import type { Kind } from "./core/detectors.ts";
import { fromSuggestions, toPeople, type Entity } from "./core/entities.ts";
import type { Leak } from "./core/leaks.ts";
import { Header } from "./ui/common.tsx";
import { SOURCE_URL, viewFromHash, type Step, type View } from "./ui/helpers.ts";
import { AboutPage, PrivacyPage } from "./ui/Pages.tsx";
import { StepDocument } from "./ui/StepDocument.tsx";
import { StepRestore } from "./ui/StepRestore.tsx";
import { StepResult } from "./ui/StepResult.tsx";
import { StepReview } from "./ui/StepReview.tsx";
import { PreviewSession, startJob, type Job } from "./ui/worker-client.ts";
import type { WorkerProgress, WorkerRequest } from "./worker.ts";

export default function App() {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [passwordState, setPasswordState] = useState<"none" | "needed" | "wrong">("none");
  const [busy, setBusy] = useState<"analyzing" | "working" | null>(null);
  const [progress, setProgress] = useState<WorkerProgress | null>(null);
  const [error, setError] = useState("");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [detected, setDetected] = useState<Partial<Record<Kind, number>>>({});
  const [skipKinds, setSkipKinds] = useState<Kind[]>([]);
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [done, setDone] = useState<{ result: AnonymizeResult; leaks: Leak[] } | null>(null);
  const job = useRef<Job | null>(null);
  const version = useRef(0);
  const [view, setView] = useState<View>(() => viewFromHash(window.location.hash));

  // Páginas institucionais pelo endereço (#privacidade, #sobre); o fluxo não perde o estado ao ir e voltar.
  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goStep = (s: Step) => {
    if (window.location.hash) history.pushState(null, "", window.location.pathname);
    setView("app");
    setStep(s);
  };

  useEffect(() => () => session?.close(), [session]);

  function run(req: WorkerRequest, transfer: Transferable[]) {
    job.current?.cancel();
    setProgress(null);
    job.current = startJob(req, transfer, setProgress);
    return job.current.done;
  }

  function reset() {
    job.current?.cancel();
    setBusy(null);
    setError("");
    setDiagnosis(null);
    setEntities([]);
    setDetected({});
    setSkipKinds([]);
    setDone(null);
    setSession(null);
  }

  async function analyze(f: File, pw?: string) {
    const v = ++version.current;
    reset();
    setFile(f);
    setPassword(pw);
    setStep(1);
    setBusy("analyzing");
    const res = await run({ type: "analyze", pdf: await f.arrayBuffer(), password: pw }, []);
    if (res === null || v !== version.current) return;
    setBusy(null);
    if (!res.ok) {
      if (res.code === "SENHA_NECESSARIA" || res.code === "SENHA_INCORRETA") return setPasswordState(res.code === "SENHA_INCORRETA" ? "wrong" : "needed");
      return setError(res.error);
    }
    if (res.type !== "analyze") return;
    setPasswordState("none");
    setDiagnosis(res.diagnosis);
    setEntities(fromSuggestions(res.suggestions));
    setDetected(res.detected);
    setSession(new PreviewSession(await f.arrayBuffer(), pw));
  }

  async function anonymize() {
    if (!file) return;
    setBusy("working");
    setError("");
    const options = { people: toPeople(entities), skipKinds, password };
    const res = await run({ type: "anonymize", pdf: await file.arrayBuffer(), options }, []);
    if (res === null) return;
    setBusy(null);
    if (!res.ok) return setError(res.error);
    if (res.type === "anonymize") {
      setDone({ result: res.result, leaks: res.leaks });
      setStep(3);
    }
  }

  function cancel() {
    job.current?.cancel();
    job.current = null;
    setBusy(null);
    setProgress(null);
  }

  const available = new Set<Step>([1, 4]);
  if (diagnosis) available.add(2);
  if (done) available.add(3);
  const baseName = file?.name.replace(/\.pdf$/i, "") ?? "documento";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Header step={view === "app" ? step : null} available={available} onStep={goStep} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {view === "privacidade" && <PrivacyPage />}
        {view === "sobre" && <AboutPage />}
        {view === "app" && step === 1 && (
          <StepDocument
            file={file}
            analyzing={busy === "analyzing"}
            progress={progress}
            passwordState={passwordState}
            diagnosis={diagnosis}
            people={entities.length}
            error={error}
            onFile={(f) => void analyze(f)}
            onPassword={(pw) => file && void analyze(file, pw)}
            onCancel={() => {
              cancel();
              setFile(null);
            }}
            onNext={() => setStep(2)}
          />
        )}
        {view === "app" && step === 2 && diagnosis && (
          <>
            <StepReview
              entities={entities}
              onEntities={setEntities}
              detected={detected}
              skipKinds={skipKinds}
              onSkipKinds={setSkipKinds}
              session={session}
              pages={diagnosis.pages}
              working={busy === "working"}
              progress={progress}
              onCancel={cancel}
              onBack={() => setStep(1)}
              onRun={() => void anonymize()}
            />
            {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          </>
        )}
        {view === "app" && step === 3 && done && (
          <StepResult
            result={done.result}
            leaks={done.leaks}
            diagnosis={diagnosis}
            baseName={baseName}
            onBack={() => setStep(2)}
            onRestore={() => setStep(4)}
            onNew={() => {
              version.current++;
              reset();
              setFile(null);
              setStep(1);
            }}
          />
        )}
        {view === "app" && step === 4 && <StepRestore current={done?.result.replacements ?? null} />}
      </main>
      <footer className="mx-auto max-w-6xl space-y-2 px-4 pb-10 text-center text-xs text-stone-500">
        <p>Revise sempre o resultado: a detecção automática não garante a remoção de todos os dados pessoais.</p>
        <nav aria-label="Rodapé" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <span>Anonimador v{__APP_VERSION__} (beta)</span>
          <a href="#privacidade" className="hover:text-stone-800 hover:underline">
            Privacidade
          </a>
          <a href="#sobre" className="hover:text-stone-800 hover:underline">
            Sobre e termos
          </a>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer noopener" className="hover:text-stone-800 hover:underline">
            Código-fonte (AGPL-3.0)
          </a>
        </nav>
      </footer>
    </div>
  );
}

// Peças visuais compartilhadas pelas etapas.
import type { ReactNode } from "react";
import type { Warning } from "../core/diagnose.ts";
import type { Phase, WorkerProgress } from "../worker.ts";
import { buttonSecondary, pagesText, SEVERE, STEPS, type Step } from "./helpers.ts";

export function Header({ step, available, onStep }: { step: Step; available: Set<Step>; onStep: (s: Step) => void }) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <img src="./logo.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight text-stone-900">Anonimador</span>
          <span className="hidden rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 sm:inline">
            Processado só no seu navegador
          </span>
        </div>
        <nav aria-label="Etapas" className="max-w-full">
          <ol className="flex gap-1">
            {STEPS.map(({ step: s, label }) => {
              const current = s === step;
              const enabled = available.has(s);
              return (
                <li key={s}>
                  <button
                    onClick={() => enabled && onStep(s)}
                    aria-current={current ? "step" : undefined}
                    aria-disabled={!enabled}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      current
                        ? "bg-blue-50 font-medium text-blue-800"
                        : enabled
                          ? "text-stone-600 hover:bg-stone-100"
                          : "cursor-default text-stone-300"
                    }`}
                  >
                    <span className="tabular-nums">{s}</span>
                    {/* No celular, só a etapa atual mostra o nome (as demais, o número). */}
                    <span className={`ml-1 ${current ? "" : "hidden sm:inline"}`}>{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </header>
  );
}

export function Card({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={`rounded-xl border border-stone-200 bg-white p-5 ${className}`}>
      {children}
    </section>
  );
}

const PHASE_LABELS: Record<Phase, string> = {
  carregando: "Preparando",
  diagnostico: "Verificando as páginas",
  leitura: "Procurando nomes",
  anonimizacao: "Anonimizando",
  verificacao: "Conferindo o resultado",
};

export function ProgressBar({ progress, onCancel }: { progress: WorkerProgress | null; onCancel: () => void }) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const label = progress ? PHASE_LABELS[progress.phase] : "Preparando";
  const pages = progress && progress.total > 1 ? ` — página ${progress.done} de ${progress.total}` : "";
  return (
    <div className="flex items-center gap-3" role="status" aria-label="Progresso">
      <div className="flex-1">
        <div className="text-sm text-stone-600">
          {label}
          {pages}…
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button onClick={onCancel} className={buttonSecondary}>
        Cancelar
      </button>
    </div>
  );
}

export function Warnings({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Avisos">
      {warnings.map((w) => (
        <li
          key={w.kind}
          className={`rounded-lg border px-3 py-2 text-sm ${SEVERE.has(w.kind) ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
        >
          {w.pages && w.pages.length > 0 && <strong className="font-semibold">{pagesText(w.pages)}: </strong>}
          {w.message}
        </li>
      ))}
    </ul>
  );
}

export function Metric({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: "neutral" | "warning" }) {
  return (
    <div className={`rounded-lg px-4 py-3 ${tone === "warning" ? "bg-amber-50" : "bg-stone-100"}`}>
      <div className={`text-xs ${tone === "warning" ? "text-amber-800" : "text-stone-500"}`}>{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${tone === "warning" ? "text-amber-900" : "text-stone-900"}`}>{value}</div>
    </div>
  );
}


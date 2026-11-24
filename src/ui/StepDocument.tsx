// Etapa 1: escolher o PDF, senha, leitura e diagnóstico.
import { useState } from "react";
import type { Diagnosis } from "../core/diagnose.ts";
import type { WorkerProgress } from "../worker.ts";
import { Card, Metric, ProgressBar, Warnings } from "./common.tsx";
import { buttonPrimary, SEVERE } from "./helpers.ts";

interface Props {
  file: File | null;
  analyzing: boolean;
  progress: WorkerProgress | null;
  passwordState: "none" | "needed" | "wrong";
  diagnosis: Diagnosis | null;
  people: number;
  error: string;
  onFile: (f: File) => void;
  onPassword: (pw: string) => void;
  onCancel: () => void;
  onNext: () => void;
}

export function StepDocument({ file, analyzing, progress, passwordState, diagnosis, people, error, onFile, onPassword, onCancel, onNext }: Props) {
  const [dragging, setDragging] = useState(false);
  const [password, setPassword] = useState("");
  const unreadable = (diagnosis?.warnings ?? []).filter((w) => SEVERE.has(w.kind)).flatMap((w) => w.pages ?? []);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card>
        <label
          htmlFor="pdf"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragging ? "border-blue-500 bg-blue-50" : "border-stone-300 hover:border-stone-400 hover:bg-stone-50"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8 text-stone-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM12 11v6M9 14l3-3 3 3" />
          </svg>
          <span className="mt-3 text-base font-medium text-stone-900">{file ? file.name : "Arraste o PDF do processo aqui"}</span>
          <span className="mt-1 text-sm text-stone-500">{file ? "Escolher outro arquivo" : "ou clique para escolher. Nada sai da sua máquina."}</span>
          <input
            id="pdf"
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>

        {passwordState !== "none" && (
          <form
            className="mt-4 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onPassword(password);
            }}
          >
            <label className="text-sm text-stone-700" htmlFor="password">
              {passwordState === "wrong" ? "Senha incorreta. Tente de novo:" : "Este PDF é protegido por senha:"}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-stone-300 px-2 py-1.5 text-sm"
            />
            <button type="submit" className={buttonPrimary}>
              Abrir
            </button>
          </form>
        )}

        {analyzing && (
          <div className="mt-4">
            <ProgressBar progress={progress} onCancel={onCancel} />
          </div>
        )}
        {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      </Card>

      {diagnosis && !analyzing && (
        <Card label="Leitura do documento">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric label="Páginas" value={diagnosis.pages} />
            <Metric label="Pessoas e empresas encontradas" value={people} />
            <Metric
              label="Páginas sem texto legível"
              value={unreadable.length === 0 ? "nenhuma" : unreadable.length}
              tone={unreadable.length > 0 ? "warning" : "neutral"}
            />
          </div>
          {diagnosis.warnings.length > 0 && (
            <div className="mt-4">
              <Warnings warnings={diagnosis.warnings} />
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <button onClick={onNext} className={buttonPrimary}>
              Revisar o que será removido
            </button>
          </div>
        </Card>
      )}

      {!file && (
        <p className="px-1 text-sm leading-relaxed text-stone-500">
          O Anonimador remove de verdade, do próprio PDF, nomes, documentos (CPF, RG, CNH, PIS, OAB…), endereços, contatos,
          dados bancários, números de processo e códigos de verificação, e escreve marcadores no lugar ([PESSOA_1],
          [CPF_2]…). Você revisa tudo antes, e depois pode devolver os nomes reais à resposta da IA.
        </p>
      )}
    </div>
  );
}

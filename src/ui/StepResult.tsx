// Etapa 3: resultado — verificação final, números, avisos e downloads.
import type { AnonymizeResult } from "../core/anonymize.ts";
import type { Diagnosis } from "../core/diagnose.ts";
import type { Leak } from "../core/leaks.ts";
import { summarize } from "../core/summary.ts";
import { Card, Metric, Warnings } from "./common.tsx";
import { buttonPrimary, buttonSecondary, download, pagesText, SEVERE } from "./helpers.ts";

const DOCUMENT_KINDS = new Set(["CPF", "CNPJ", "RG", "CNH", "PIS", "CTPS", "ELEITOR", "OAB", "RENAVAM", "PLACA"]);

interface Props {
  result: AnonymizeResult;
  leaks: Leak[];
  diagnosis: Diagnosis | null;
  baseName: string;
  onBack: () => void;
  onRestore: () => void;
  onNew: () => void;
}

export function StepResult({ result, leaks, diagnosis, baseName, onBack, onRestore, onNew }: Props) {
  const rows = summarize(result.replacements);
  const count = (f: (k: string) => boolean) => rows.filter((r) => f(r.kind)).reduce((n, r) => n + r.distinct, 0);
  const unchecked = (diagnosis?.warnings ?? []).filter((w) => SEVERE.has(w.kind)).flatMap((w) => w.pages ?? []).sort((a, b) => a - b);
  const occurrences = rows.reduce((n, r) => n + r.occurrences, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card label="Resultado">
        {leaks.length > 0 ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" data-testid="verificacao">
            <p className="font-semibold">Verificação final: dados ainda legíveis no PDF gerado. Não use este arquivo.</p>
            <ul className="mt-1 list-disc pl-5">
              {leaks.map((l) => (
                <li key={`${l.placeholder}:${l.original}:${l.where}`}>
                  {l.placeholder} ({l.where})
                </li>
              ))}
            </ul>
          </div>
        ) : unchecked.length > 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="verificacao">
            Verificação final: nenhum dos dados substituídos foi encontrado no texto do PDF gerado, mas{" "}
            <strong>{pagesText(unchecked)}</strong> não {unchecked.length === 1 ? "pôde ser verificada" : "puderam ser verificadas"} (sem texto
            legível). {unchecked.length === 1 ? "Confira-a" : "Confira-as"} antes de usar o arquivo.
          </p>
        ) : (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="verificacao">
            Verificação final: nenhum dos dados substituídos pôde ser encontrado no PDF gerado.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Pessoas" value={count((k) => k === "PESSOA")} />
          <Metric label="Empresas" value={count((k) => k === "EMPRESA")} />
          <Metric label="Documentos" value={count((k) => DOCUMENT_KINDS.has(k))} />
          <Metric label="Trechos removidos" value={occurrences} />
        </div>

        {diagnosis && diagnosis.warnings.length > 0 && (
          <div className="mt-4">
            <Warnings warnings={diagnosis.warnings} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button className={buttonPrimary} onClick={() => download(result.pdf as BlobPart, `${baseName}-anonimizado.pdf`, "application/pdf")}>
            Baixar PDF anonimizado
          </button>
          <button className={buttonSecondary} onClick={() => download(result.text, `${baseName}-anonimizado.txt`, "text/plain;charset=utf-8")}>
            Baixar texto para a IA
          </button>
          <button
            className={buttonSecondary}
            onClick={() => download(JSON.stringify(result.replacements, null, 2), `${baseName}-correspondencia.json`, "application/json")}
          >
            Baixar tabela (guarde com você)
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          A tabela liga cada marcador ao dado original: guarde-a só na sua máquina e não a envie à IA. Revise o resultado: datas,
          profissão, local de trabalho e fatos muito específicos também podem identificar alguém, e não são removidos.
        </p>
      </Card>

      <Card label="Detalhes">
        <table className="w-full text-left text-sm" aria-label="Resumo">
          <thead className="border-b border-stone-200 text-xs text-stone-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Tipo</th>
              <th className="py-2 pr-3 font-medium">Distintos</th>
              <th className="py-2 font-medium">Trechos removidos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.kind} className="border-b border-stone-100">
                <td className="py-1.5 pr-3">{row.label}</td>
                <td className="py-1.5 pr-3 tabular-nums">{row.distinct}</td>
                <td className="py-1.5 tabular-nums">{row.occurrences}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-stone-600">Ver a correspondência marcador → original</summary>
          <table className="mt-2 w-full text-left text-sm">
            <tbody>
              {result.replacements.map((r) => (
                <tr key={r.placeholder} className="border-b border-stone-100">
                  <td className="py-1.5 pr-3 font-mono text-xs">{r.placeholder}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{r.occurrences}×</td>
                  <td className="py-1.5">{r.originals.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <div className="flex flex-wrap justify-between gap-2">
        <button className={buttonSecondary} onClick={onBack}>
          Voltar à revisão
        </button>
        <div className="flex gap-2">
          <button className={buttonSecondary} onClick={onNew}>
            Novo documento
          </button>
          <button className={buttonPrimary} onClick={onRestore}>
            Restaurar a resposta da IA
          </button>
        </div>
      </div>
    </div>
  );
}

// Etapa 4: devolve os dados reais à resposta da IA, com a tabela de correspondência (tudo local).
import { useState } from "react";
import type { Replacement } from "../core/anonymize.ts";
import { parseCorrespondence, restoreText } from "../core/restore.ts";
import { Card } from "./common.tsx";
import { buttonSecondary } from "./helpers.ts";

export function StepRestore({ current }: { current: Replacement[] | null }) {
  const [aiText, setAiText] = useState("");
  const [loaded, setLoaded] = useState<Replacement[] | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const table = loaded ?? current;
  const result = table && aiText ? restoreText(aiText, table) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Card label="Restaurar">
        <h2 className="text-base font-semibold text-stone-900">Restaurar os nomes na resposta da IA</h2>
        <p className="mt-1 text-sm text-stone-600">
          Cole a resposta da IA. Os marcadores ([PESSOA_1], [CPF_2]…) voltam a ser os dados reais, usando a tabela de correspondência.
          Também acontece só no seu navegador.
        </p>
        <div className="mt-3 text-sm">
          {current && !loaded && <p className="text-stone-600">Usando a tabela do documento anonimizado nesta sessão.</p>}
          <label className="mt-1 block text-stone-600" htmlFor="tabela">
            {current ? "Ou carregue outra tabela (.json):" : "Carregue a tabela de correspondência (.json) baixada do Anonimador:"}
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
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <label className="text-sm font-medium text-stone-800" htmlFor="resposta">
            Resposta da IA
          </label>
          <textarea
            id="resposta"
            aria-label="Resposta da IA"
            rows={14}
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="Cole aqui o texto com marcadores…"
            className="mt-2 w-full rounded-md border border-stone-300 p-3 text-sm focus:border-stone-500 focus:outline-none"
          />
          {aiText && !table && <p className="mt-2 text-sm text-amber-800">Carregue a tabela de correspondência para restaurar.</p>}
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-stone-800" htmlFor="restaurado">
              Com os dados reais
            </label>
            {result && (
              <button
                className={buttonSecondary}
                onClick={async () => {
                  await navigator.clipboard.writeText(result.text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copiado" : "Copiar"}
              </button>
            )}
          </div>
          <textarea
            id="restaurado"
            aria-label="Texto restaurado"
            readOnly
            rows={14}
            value={result?.text ?? ""}
            className="mt-2 w-full rounded-md border border-stone-200 bg-stone-50 p-3 text-sm"
          />
          {result && (
            <p className="mt-2 text-xs text-stone-500" data-testid="restaurados">
              {result.restored} {result.restored === 1 ? "marcador restaurado" : "marcadores restaurados"}
              {result.unknown.length > 0 && ` · não estão na tabela: ${result.unknown.join(", ")}`}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

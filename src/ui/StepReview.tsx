// Etapa 2: revisão. À esquerda, pessoas/empresas (editáveis) e tipos de dado; à direita, a página com
// o que será removido em destaque. Selecionar palavras na página cria uma pessoa ou uma grafia nova.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Kind } from "../core/detectors.ts";
import {
  addEntity,
  addVariant,
  merge,
  removeVariant,
  setKind,
  setSelected,
  split,
  toPeople,
  toPreview,
  type Entity,
} from "../core/entities.ts";
import type { PlannedLabels } from "../core/numbering.ts";
import { KIND_LABELS } from "../core/summary.ts";
import type { WorkerProgress } from "../worker.ts";
import { Card, ProgressBar } from "./common.tsx";
import { buttonGhost, buttonPrimary, buttonSecondary } from "./helpers.ts";
import type { PreviewImage, PreviewSession } from "./worker-client.ts";

interface Props {
  entities: Entity[];
  onEntities: (list: Entity[]) => void;
  detected: Partial<Record<Kind, number>>;
  skipKinds: Kind[];
  onSkipKinds: (kinds: Kind[]) => void;
  session: PreviewSession | null;
  pages: number;
  working: boolean;
  progress: WorkerProgress | null;
  onCancel: () => void;
  onBack: () => void;
  onRun: () => void;
}

export function StepReview(props: Props) {
  const { entities, onEntities, working } = props;
  const [focus, setFocus] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const selectedCount = entities.filter((e) => e.selected).length;
  const labels = useLabels(props.session, entities, props.skipKinds);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="space-y-5">
          <EntityList entities={entities} onEntities={onEntities} focus={focus} open={open} onOpen={setOpen} labels={labels} />
          <DetectedKinds detected={props.detected} skipKinds={props.skipKinds} onSkipKinds={props.onSkipKinds} />
        </div>
        <PagePreview
          session={props.session}
          pages={props.pages}
          entities={entities}
          skipKinds={props.skipKinds}
          labels={labels}
          onFocusEntity={(i) => {
            // Clicar num destaque da página abre a pessoa correspondente na lista.
            const id = entities[i]?.id ?? null;
            setFocus(id);
            setOpen(id);
          }}
          onEntities={onEntities}
        />
      </div>
      <Card>
        {working ? (
          <ProgressBar progress={props.progress} onCancel={props.onCancel} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={props.onBack} className={buttonSecondary}>
              Voltar
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm text-stone-500">
                {selectedCount} {selectedCount === 1 ? "pessoa ou empresa marcada" : "pessoas e empresas marcadas"}
              </span>
              <button onClick={props.onRun} className={buttonPrimary}>
                Anonimizar
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Marcador previsto para cada entidade (id → "[PESSOA_2]"), com a mesma numeração do PDF final. */
interface EntityLabels {
  /** undefined enquanto calcula; null = marcada mas não aparece no documento. */
  byEntity: Map<string, string | null>;
  keys: PlannedLabels["keys"];
  ready: boolean;
}

function useLabels(session: PreviewSession | null, entities: Entity[], skipKinds: Kind[]): EntityLabels {
  const [planned, setPlanned] = useState<{ labels: PlannedLabels; ids: string[] } | null>(null);
  useEffect(() => {
    if (!session) return;
    let alive = true;
    // O motor recebe só as marcadas, nesta ordem: o índice i do resultado é a i-ésima marcada.
    const ids = entities.filter((e) => e.selected).map((e) => e.id);
    const t = setTimeout(async () => {
      const labels = await session.labels({ people: toPeople(entities), skipKinds });
      if (alive && labels) setPlanned({ labels, ids });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [session, entities, skipKinds]);
  return useMemo(() => {
    const byEntity = new Map<string, string | null>();
    planned?.ids.forEach((id, i) => byEntity.set(id, planned.labels.people[i] ?? null));
    return { byEntity, keys: planned?.labels.keys ?? {}, ready: planned !== null };
  }, [planned]);
}

function EntityList({
  entities,
  onEntities,
  focus,
  open,
  onOpen: setOpen,
  labels,
}: {
  entities: Entity[];
  onEntities: (l: Entity[]) => void;
  focus: string | null;
  open: string | null;
  onOpen: (id: string | null) => void;
  labels: EntityLabels;
}) {
  const [adding, setAdding] = useState("");
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  // Rolar a lista até a pessoa em foco (sincroniza com o DOM, não com o estado).
  useEffect(() => {
    if (focus) rowRefs.current.get(focus)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus]);

  return (
    <Card label="Pessoas e empresas">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-stone-900">Pessoas e empresas</h2>
        <span className="text-xs text-stone-500">agentes públicos vêm desmarcados</span>
      </div>
      {entities.length === 0 && <p className="mt-3 text-sm text-stone-500">Nenhum nome encontrado automaticamente. Acrescente abaixo.</p>}
      <ul className="mt-3 divide-y divide-stone-100" aria-label="Lista de pessoas e empresas">
        {entities.map((e) => {
          const expanded = open === e.id;
          return (
            <li
              key={e.id}
              ref={(el) => {
                if (el) rowRefs.current.set(e.id, el);
              }}
              className={`py-2 ${focus === e.id ? "rounded-md bg-blue-50/60" : ""}`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label={e.name}
                  checked={e.selected}
                  onChange={(ev) => onEntities(setSelected(entities, e.id, ev.target.checked))}
                  className="h-4 w-4 accent-red-600"
                />
                <button
                  onClick={() => setOpen(expanded ? null : e.id)}
                  aria-expanded={expanded}
                  aria-label={`Grafias de ${e.name}`}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className={`block truncate text-sm ${e.selected ? "text-stone-900" : "text-stone-400 line-through decoration-stone-300"}`}>
                    {e.name}
                  </span>
                  <span className="text-xs text-stone-500">
                    {e.variants.length > 1 ? `${e.variants.length} grafias` : "1 grafia"}
                    {e.occurrences > 0 && ` · ${e.occurrences}×`}
                  </span>
                </button>
                <PlaceholderTag entity={e} labels={labels} />
                {e.publicAgent && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">agente público</span>}
                {e.kind === "EMPRESA" && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">empresa</span>}
              </div>
              {expanded && <EntityEditor entity={e} entities={entities} onEntities={onEntities} />}
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          onEntities(addEntity(entities, adding, "PESSOA"));
          setAdding("");
        }}
      >
        <input
          aria-label="Nova pessoa"
          value={adding}
          onChange={(ev) => setAdding(ev.target.value)}
          placeholder="Nome que faltou"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
        />
        <button type="submit" className={buttonSecondary}>
          Acrescentar
        </button>
      </form>
    </Card>
  );
}

/** "→ [PESSOA_2]" para marcadas; aviso se a marcada não aparece no documento; "mantido" para desmarcadas. */
function PlaceholderTag({ entity, labels }: { entity: Entity; labels: EntityLabels }) {
  if (!entity.selected) return <span className="shrink-0 text-xs text-stone-400">mantido</span>;
  const label = labels.byEntity.get(entity.id);
  if (label === undefined) return <span className="shrink-0 text-xs text-stone-300">…</span>;
  if (label === null)
    return (
      <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800" title="Nenhuma grafia desta pessoa foi encontrada no texto do documento">
        não encontrado
      </span>
    );
  return (
    <span data-testid="marcador" title={`Será substituído por ${label}`} className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs text-red-800">
      → {label}
    </span>
  );
}

function EntityEditor({ entity: e, entities, onEntities }: { entity: Entity; entities: Entity[]; onEntities: (l: Entity[]) => void }) {
  const [variant, setVariant] = useState("");
  const others = entities.filter((o) => o.id !== e.id);
  return (
    <div className="mt-2 space-y-2 pl-7 text-sm">
      <ul className="flex flex-wrap gap-1.5" aria-label={`Grafias procuradas de ${e.name}`}>
        {e.variants.map((v) => (
          <li key={v} className="flex items-center gap-1 rounded-md bg-stone-100 py-0.5 pl-2 pr-1 text-xs text-stone-700">
            {v}
            {e.variants.length > 1 && (
              <button className={buttonGhost} title="Separar em outra pessoa" aria-label={`Separar ${v}`} onClick={() => onEntities(split(entities, e.id, v))}>
                ⤴
              </button>
            )}
            <button className={buttonGhost} title="Remover grafia" aria-label={`Remover ${v}`} onClick={() => onEntities(removeVariant(entities, e.id, v))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          onEntities(addVariant(entities, e.id, variant));
          setVariant("");
        }}
      >
        <input
          aria-label={`Nova grafia de ${e.name}`}
          value={variant}
          onChange={(ev) => setVariant(ev.target.value)}
          placeholder="Outra grafia (ex.: Sr. Sobrenome)"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1 text-xs"
        />
        <button type="submit" className={buttonSecondary}>
          + grafia
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {others.length > 0 && (
          <select
            aria-label={`Juntar ${e.name} com`}
            value=""
            onChange={(ev) => ev.target.value && onEntities(merge(entities, [e.id, ev.target.value]))}
            className="rounded-md border border-stone-300 px-2 py-1 text-xs text-stone-700"
          >
            <option value="">Juntar com…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <button className={buttonGhost} onClick={() => onEntities(setKind(entities, e.id, e.kind === "PESSOA" ? "EMPRESA" : "PESSOA"))}>
          {e.kind === "PESSOA" ? "É uma empresa" : "É uma pessoa"}
        </button>
      </div>
    </div>
  );
}

function DetectedKinds({ detected, skipKinds, onSkipKinds }: { detected: Partial<Record<Kind, number>>; skipKinds: Kind[]; onSkipKinds: (k: Kind[]) => void }) {
  const kinds = (Object.keys(KIND_LABELS) as Kind[]).filter((k) => (detected[k] ?? 0) > 0);
  return (
    <Card label="Dados detectados">
      <h2 className="text-base font-semibold text-stone-900">Dados detectados</h2>
      <p className="mt-1 text-xs text-stone-500">Todos são removidos. Clique num tipo para mantê-lo no texto.</p>
      {kinds.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">Nenhum dado de formato fixo encontrado.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {kinds.map((k) => {
            const on = !skipKinds.includes(k);
            return (
              <button
                key={k}
                aria-pressed={on}
                onClick={() => onSkipKinds(on ? [...skipKinds, k] : skipKinds.filter((x) => x !== k))}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  on ? "border-red-200 bg-red-50 text-red-800" : "border-stone-200 bg-white text-stone-400 line-through"
                }`}
              >
                {KIND_LABELS[k]} <span className="tabular-nums">{detected[k]}</span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PagePreview({
  session,
  pages,
  entities,
  skipKinds,
  labels,
  onFocusEntity,
  onEntities,
}: {
  session: PreviewSession | null;
  pages: number;
  entities: Entity[];
  skipKinds: Kind[];
  labels: EntityLabels;
  onFocusEntity: (i: number) => void;
  onEntities: (l: Entity[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [image, setImage] = useState<PreviewImage | null>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const options = useMemo(() => ({ ...toPreview(entities), skipKinds }), [entities, skipKinds]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    const t = setTimeout(async () => {
      const img = await session.page(index, options, 1.6);
      if (!alive || !img) return;
      setImage((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return img;
      });
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [session, index, options]);

  const goTo = (i: number) => {
    setSel(null);
    setIndex(Math.max(0, Math.min(pages - 1, i)));
  };

  const range = sel ? [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)] : null;
  const selectedText = image && range ? image.words.slice(range[0], range[1] + 1).map((w) => w.text).join(" ").replace(/[.,;:]+$/, "") : "";
  const removedHere = image ? new Set(image.boxes.filter((b) => b.removed).map((b) => b.text)).size : 0;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <Card label="Pré-visualização" className="lg:sticky lg:top-4 lg:self-start">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button className={buttonGhost} aria-label="Página anterior" disabled={index === 0} onClick={() => goTo(index - 1)}>
            ‹
          </button>
          <span className="text-sm tabular-nums text-stone-700" data-testid="pagina-atual">
            página {index + 1} de {pages}
          </span>
          <button className={buttonGhost} aria-label="Próxima página" disabled={index >= pages - 1} onClick={() => goTo(index + 1)}>
            ›
          </button>
        </div>
        <span className="text-xs text-stone-500">{removedHere} trechos removidos nesta página</span>
      </div>

      <div
        className="relative mt-3 select-none overflow-hidden rounded-md border border-stone-200 bg-stone-50"
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        {image ? (
          <>
            <img src={image.url} alt={`Página ${index + 1}`} className="block w-full" draggable={false} />
            {image.words.map((w, i) => (
              <span
                key={`w${i}`}
                data-testid="palavra"
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  setDragging(true);
                  setSel({ a: i, b: i });
                }}
                onMouseEnter={() => dragging && setSel((s) => (s ? { ...s, b: i } : s))}
                className={`absolute cursor-text ${range && i >= range[0] && i <= range[1] ? "bg-blue-400/30" : ""}`}
                style={{ left: pct(w.x, image.width), top: pct(w.y, image.height), width: pct(w.w, image.width), height: pct(w.h, image.height) }}
              />
            ))}
            {image.boxes.map((b, i) => {
              const placeholder = !b.removed
                ? undefined
                : b.person !== undefined
                  ? (labels.byEntity.get(entities[b.person]?.id ?? "") ?? undefined)
                  : labels.keys[b.key];
              const what = b.removed ? `será removido${placeholder ? ` como ${placeholder}` : ""}` : "não será removido";
              return (
              <button
                key={`b${i}`}
                title={`${b.text} — ${KIND_LABELS[b.kind]}: ${what}`}
                aria-label={`${b.text}: ${what}`}
                data-testid={b.removed ? "destaque-removido" : "destaque-mantido"}
                onClick={() => b.person !== undefined && onFocusEntity(b.person)}
                className={`absolute rounded-sm ${b.removed ? "border border-red-500 bg-red-500/25" : "border border-dashed border-stone-500"}`}
                style={{ left: pct(b.x, image.width), top: pct(b.y, image.height), width: pct(b.w, image.width), height: pct(b.h, image.height) }}
              />
              );
            })}
          </>
        ) : (
          <div className="flex h-96 items-center justify-center text-sm text-stone-400">Carregando a página…</div>
        )}
      </div>

      {selectedText ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm" role="group" aria-label="Trecho selecionado">
          <span className="text-blue-900">
            Anonimizar “<strong>{selectedText}</strong>” como
          </span>
          <button className={buttonSecondary} onClick={() => (onEntities(addEntity(entities, selectedText, "PESSOA")), setSel(null))}>
            Nova pessoa
          </button>
          <button className={buttonSecondary} onClick={() => (onEntities(addEntity(entities, selectedText, "EMPRESA")), setSel(null))}>
            Nova empresa
          </button>
          {entities.length > 0 && (
            <select
              aria-label="Grafia de"
              value=""
              onChange={(ev) => {
                if (!ev.target.value) return;
                onEntities(addVariant(entities, ev.target.value, selectedText));
                setSel(null);
              }}
              className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Grafia de…</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          <button className={buttonGhost} onClick={() => setSel(null)}>
            Cancelar
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-stone-500">
          <span className="mr-1 inline-block h-2.5 w-4 rounded-sm border border-red-500 bg-red-500/25 align-middle" /> será removido
          <span className="ml-3 mr-1 inline-block h-2.5 w-4 rounded-sm border border-dashed border-stone-500 align-middle" /> desmarcado ·
          arraste sobre palavras para anonimizar um trecho
        </p>
      )}
    </Card>
  );
}

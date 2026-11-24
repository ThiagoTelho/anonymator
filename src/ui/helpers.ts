// Constantes e funções compartilhadas pelas etapas (fora dos arquivos de componentes).

export type Step = 1 | 2 | 3 | 4;

export const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "Documento" },
  { step: 2, label: "Revisão" },
  { step: 3, label: "Resultado" },
  { step: 4, label: "Restaurar" },
];

export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300";
export const buttonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 hover:bg-stone-50";
export const buttonGhost = "rounded-md px-2 py-1 text-sm text-stone-600 hover:bg-stone-100";

export const pagesText = (pages: number[]) => (pages.length === 1 ? `página ${pages[0]}` : `páginas ${pages.join(", ")}`);
export const SEVERE = new Set(["SEM_TEXTO", "ILEGIVEL"]);

export function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

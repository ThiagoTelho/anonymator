// Diagnóstico de PDFs REAIS, sem expor conteúdo: roda o fluxo completo (como o usuário faria) e imprime
// só estatísticas — páginas, avisos, tempos, memória e contagens por tipo de dado. Nenhum nome, trecho,
// número ou nome de arquivo é impresso (o nome do arquivo pode conter o nome de uma parte).
//
// Serve para o autor testar processos reais na própria máquina e compartilhar o resultado sem risco.
//
// Uso: node scripts/diagnose.ts <arquivo.pdf | pasta> [--senha=XXXX] [--json]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { anonymizePdf } from "../src/core/anonymize.ts";
import { diagnoseDocument, openPdf, pageStats, PdfPasswordError } from "../src/core/diagnose.ts";
import { findLeaks } from "../src/core/leaks.ts";
import { suggestEntities } from "../src/core/names.ts";
import { buildPeople, defaultSelection } from "../src/core/people.ts";
import { summarize } from "../src/core/summary.ts";
import { documentText } from "../src/core/text.ts";
import { FIRST_NAMES } from "../tests/helpers/names.ts";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const password = args.find((a) => a.startsWith("--senha="))?.slice("--senha=".length);
const asJson = args.includes("--json");
if (!target) {
  console.error("Uso: node scripts/diagnose.ts <arquivo.pdf | pasta> [--senha=XXXX] [--json]");
  process.exit(1);
}

const files = statSync(target).isDirectory()
  ? readdirSync(target).filter((f) => f.toLowerCase().endsWith(".pdf")).sort().map((f) => join(target, f))
  : [target];

const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

const reports = files.map((file, index) => {
  const id = `documento ${index + 1}`;
  const bytes = readFileSync(file);
  const t0 = performance.now();
  try {
    const doc = openPdf(bytes, password);
    const diagnosis = diagnoseDocument(doc);
    const stats = Array.from({ length: doc.countPages() }, (_, i) => pageStats(doc.loadPage(i)));
    const t1 = performance.now();
    const suggestions = suggestEntities(documentText(bytes, password), FIRST_NAMES);
    const t2 = performance.now();
    const result = anonymizePdf(bytes, { people: buildPeople(suggestions, defaultSelection(suggestions), ""), password });
    const t3 = performance.now();
    const leaks = findLeaks(result.pdf, result.replacements);
    return {
      documento: id,
      tamanho_mb: mb(bytes.length),
      paginas: diagnosis.pages,
      caracteres_por_pagina_mediana: median(stats.map((s) => s.chars)),
      paginas_sem_texto: stats.filter((s) => s.chars < 30).length,
      avisos: diagnosis.warnings.map((w) => ({ tipo: w.kind, paginas: w.pages ?? [] })),
      sugestoes: {
        pessoas: suggestions.filter((s) => s.kind === "PESSOA" && !s.publicAgent).length,
        agentes_publicos: suggestions.filter((s) => s.publicAgent).length,
        empresas: suggestions.filter((s) => s.kind === "EMPRESA").length,
      },
      removidos_por_tipo: Object.fromEntries(summarize(result.replacements).map((r) => [r.label, { distintos: r.distinct, trechos: r.occurrences }])),
      verificacao_final_vazamentos: leaks.length,
      tempo_ms: { diagnostico: Math.round(t1 - t0), sugestoes: Math.round(t2 - t1), anonimizacao: Math.round(t3 - t2) },
      memoria_mb: mb(process.memoryUsage().rss),
    };
  } catch (err) {
    const erro = err instanceof PdfPasswordError ? (err.wrong ? "senha incorreta" : "PDF com senha (use --senha=)") : `erro: ${err instanceof Error ? err.name : "desconhecido"}`;
    return { documento: id, tamanho_mb: mb(bytes.length), erro };
  }
});

if (asJson) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const r of reports) {
    console.log(`\n== ${r.documento} (${r.tamanho_mb} MB)`);
    if ("erro" in r) {
      console.log(`   ${r.erro}`);
      continue;
    }
    console.log(`   páginas: ${r.paginas} · caracteres/página (mediana): ${r.caracteres_por_pagina_mediana} · páginas sem texto: ${r.paginas_sem_texto}`);
    console.log(`   avisos: ${r.avisos.length ? r.avisos.map((a) => `${a.tipo} em ${a.paginas.length || "documento"}${a.paginas.length ? ` (${a.paginas.join(", ")})` : ""}`).join("; ") : "nenhum"}`);
    console.log(`   sugestões: ${r.sugestoes.pessoas} pessoas, ${r.sugestoes.agentes_publicos} agentes públicos, ${r.sugestoes.empresas} empresas`);
    console.log(`   removidos: ${Object.entries(r.removidos_por_tipo).map(([k, v]) => `${k} ${v.distintos}/${v.trechos}`).join(", ") || "nada"}`);
    console.log(`   verificação final: ${r.verificacao_final_vazamentos === 0 ? "ok" : `${r.verificacao_final_vazamentos} VAZAMENTO(S)`}`);
    console.log(`   tempo: diagnóstico ${r.tempo_ms.diagnostico} ms, sugestões ${r.tempo_ms.sugestoes} ms, anonimização ${r.tempo_ms.anonimizacao} ms · memória ${r.memoria_mb} MB`);
  }
  console.log("\nNada acima contém nomes, trechos, números ou nomes de arquivo: pode ser compartilhado.");
}

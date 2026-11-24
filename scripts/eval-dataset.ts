// Relatório de avaliação num conjunto de PDFs fictícios com gabarito estruturado (formato do gerador de
// processos do MPT): quanto de cada categoria de dado pessoal foi removido, o que sobrou, apagamentos em
// excesso e falsos positivos. A mesma lógica roda como teste em tests/dataset.test.ts.
// Uso: node scripts/eval-dataset.ts <pasta> [--misses]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, type DocResult } from "../tests/helpers/dataset.ts";

// Execução direta: relatório no terminal.
{
  const dir = process.argv[2];
  const showMisses = process.argv.includes("--misses");
  const files = readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();
  const byCat = new Map<string, { present: number; leaked: number }>();
  const results: DocResult[] = [];
  for (const f of files) {
    const truth = JSON.parse(readFileSync(join(dir, f.replace(/\.pdf$/, ".json")), "utf8"));
    const r = evaluate(join(dir, f), truth);
    results.push(r);
    for (const e of r.present) {
      const c = byCat.get(e.category) ?? { present: 0, leaked: 0 };
      c.present++;
      if (r.leaked.some((l) => l.e === e)) c.leaked++;
      byCat.set(e.category, c);
    }
  }
  console.log(`\n${files.length} documentos\n`);
  console.log("categoria".padEnd(24), "no PDF", "vazou", "removido");
  let tp = 0;
  let tl = 0;
  for (const [cat, c] of [...byCat].sort()) {
    tp += c.present;
    tl += c.leaked;
    console.log(cat.padEnd(24), String(c.present).padStart(6), String(c.leaked).padStart(5), `${(((c.present - c.leaked) / c.present) * 100).toFixed(1)}%`.padStart(9));
  }
  console.log("TOTAL".padEnd(24), String(tp).padStart(6), String(tl).padStart(5), `${(((tp - tl) / tp) * 100).toFixed(2)}%`.padStart(9));
  const fs = results.flatMap((r) => r.falseSuggestions.map((s) => `${r.file.split("/").pop()}: ${s}`));
  const wf = results.flatMap((r) => r.wronglyFlagged.map((s) => `${r.file.split("/").pop()}: ${s}`));
  const nf = results.flatMap((r) => r.agentsNotFlagged.map((s) => `${r.file.split("/").pop()}: ${s}`));
  const kept = results.reduce((a, r) => a + r.keptChecked, 0);
  const over = results.flatMap((r) => r.overRemoved.map((e) => `${r.file.split("/").pop()}: [${e.category}] ${e.value}`));
  console.log(`\nItens não pessoais conferidos: ${kept}; apagados indevidamente: ${over.length}`);
  console.log(`Sugestões fora do gabarito: ${fs.length}`);
  console.log(`Partes marcadas como agente público (vazariam): ${wf.length}`);
  console.log(`Agentes públicos não marcados como tal: ${nf.length}`);
  console.log(`Tempo médio por documento: ${(results.reduce((a, r) => a + r.ms, 0) / results.length).toFixed(0)} ms`);
  if (showMisses) {
    for (const r of results) for (const l of r.leaked) console.log(`VAZOU [${l.e.category}] ${l.e.value} | ${r.file.split("/").pop()} | ${JSON.stringify(r.layout)} | …${l.context}…`);
    for (const x of fs) console.log(`FALSO POSITIVO ${x}`);
    for (const x of over) console.log(`APAGADO A MAIS ${x}`);
    for (const x of wf) console.log(`AGENTE INDEVIDO ${x}`);
    for (const x of nf) console.log(`AGENTE NÃO MARCADO ${x}`);
  }
}

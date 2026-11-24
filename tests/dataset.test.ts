// 50 processos fictícios do MPT gerados com layouts diferentes (fonte, papel, corpo, entrelinha, alinhamento,
// margens, cabeçalho, numeração, tabelas, campos em colunas/tabela/texto, formatos de data e moeda, máscara de
// documentos, marca d'água…), cada um com gabarito estruturado (<nome>.json). Garante que a detecção não depende
// de um layout fixo. Relatório detalhado: node scripts/eval-dataset.ts fixtures/layouts-mpt --misses
//
// O conjunto fica SÓ na máquina do autor (fixtures/layouts-mpt/ está no .gitignore): sem a pasta (ex.: CI),
// estes testes são pulados.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluate } from "./helpers/dataset.ts";

const DIR = join(import.meta.dirname, "..", "fixtures", "layouts-mpt");
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".pdf")).sort() : [];

describe.skipIf(files.length === 0)("conjunto local fixtures/layouts-mpt", () => {
  it("está presente", () => expect(files.length).toBeGreaterThan(0));
});

describe.each(files)("layout %s", (file) => {
  const truth = JSON.parse(readFileSync(join(DIR, file.replace(/\.pdf$/, ".json")), "utf8"));
  const r = evaluate(join(DIR, file), truth);

  it("encontra no PDF original os dados do gabarito (o gabarito confere com o documento)", () => {
    expect(r.present.length).toBeGreaterThan(30);
  });
  it("não deixa nenhum dado pessoal do gabarito legível", () => {
    expect(r.leaked.map((l) => `[${l.e.category}] ${l.e.value}`)).toEqual([]);
  });
  it("não apaga números de portaria/TAC, vara, datas comuns, valores e órgão", () => {
    expect(r.overRemoved.map((e) => `[${e.category}] ${e.value}`)).toEqual([]);
  });
  it("não sugere ninguém fora do gabarito", () => {
    expect(r.falseSuggestions).toEqual([]);
  });
  it("não marca parte, advogado ou trabalhador como agente público", () => {
    expect(r.wronglyFlagged).toEqual([]);
  });
  it("marca o procurador e o auditor como agentes públicos", () => {
    expect(r.agentsNotFlagged).toEqual([]);
  });
});

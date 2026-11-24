import { describe, expect, it } from "vitest";
import type { Suggestion } from "../src/core/names.ts";
import { buildPeople, defaultSelection, parseManual } from "../src/core/people.ts";

const s = (name: string, publicAgent = false, kind: Suggestion["kind"] = "PESSOA"): Suggestion => ({
  kind,
  name,
  variants: [name],
  occurrences: 1,
  publicAgent,
});

describe("parseManual", () => {
  it("lê uma pessoa por linha e variantes separadas por ponto e vírgula", () => {
    expect(parseManual("Ana Souza; Sra. Souza\n\nBruno Lima")).toEqual([{ variants: ["Ana Souza", "Sra. Souza"] }, { variants: ["Bruno Lima"] }]);
  });
  it("ignora linhas comentadas com #", () => {
    expect(parseManual("# Ana Souza\nBruno Lima")).toEqual([{ variants: ["Bruno Lima"] }]);
  });
});

describe("seleção de sugestões", () => {
  it("marca tudo por padrão, menos agentes públicos", () => {
    expect(defaultSelection([s("Ana Souza"), s("Dra. Juíza", true), s("Empresa Ltda.", false, "EMPRESA")])).toEqual([true, false, true]);
  });

  it("junta as sugestões marcadas (com o tipo) e os nomes manuais", () => {
    const people = buildPeople([s("Ana Souza"), s("Bruno Lima"), s("Empresa Ltda.", false, "EMPRESA")], [true, false, true], "Carla Dias");
    expect(people).toEqual([
      { variants: ["Ana Souza"], kind: "PESSOA" },
      { variants: ["Empresa Ltda."], kind: "EMPRESA" },
      { variants: ["Carla Dias"] },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  addEntity,
  addVariant,
  fromSuggestions,
  merge,
  removeVariant,
  setKind,
  setSelected,
  split,
  toPeople,
  toPreview,
  type Entity,
} from "../src/core/entities.ts";
import type { Suggestion } from "../src/core/names.ts";

const sug = (name: string, variants = [name], extra: Partial<Suggestion> = {}): Suggestion => ({
  kind: "PESSOA",
  name,
  variants,
  occurrences: variants.length,
  publicAgent: false,
  ...extra,
});

const base = (): Entity[] =>
  fromSuggestions([
    sug("Maria da Silva", ["Maria da Silva", "MARIA DA SILVA"]),
    sug("Sra. Silva"),
    sug("Lívia Saraiva", ["Lívia Saraiva"], { publicAgent: true }),
    sug("Horizonte Ltda.", ["Horizonte Ltda."], { kind: "EMPRESA" }),
  ]);

describe("modelo editável de pessoas e empresas", () => {
  it("parte das sugestões com agentes públicos desmarcados", () => {
    expect(base().map((e) => [e.name, e.kind, e.selected, e.publicAgent])).toEqual([
      ["Maria da Silva", "PESSOA", true, false],
      ["Sra. Silva", "PESSOA", true, false],
      ["Lívia Saraiva", "PESSOA", false, true],
      ["Horizonte Ltda.", "EMPRESA", true, false],
    ]);
    expect(new Set(base().map((e) => e.id)).size).toBe(4);
  });

  it("marca e desmarca", () => {
    const list = base();
    const [, , livia] = list;
    expect(setSelected(list, livia.id, true).find((e) => e.id === livia.id)?.selected).toBe(true);
  });

  it("acrescenta grafia sem duplicar (ignora maiúsculas e acentos)", () => {
    let list = base();
    const [maria] = list;
    list = addVariant(list, maria.id, "M. da Silva");
    list = addVariant(list, maria.id, "maria da silva");
    expect(list[0].variants).toEqual(["Maria da Silva", "MARIA DA SILVA", "M. da Silva"]);
  });

  it("remove grafia; sem grafias, a pessoa sai da lista", () => {
    const list = base();
    const [maria, sra] = list;
    expect(removeVariant(list, maria.id, "MARIA DA SILVA")[0].variants).toEqual(["Maria da Silva"]);
    expect(removeVariant(list, sra.id, "Sra. Silva").map((e) => e.name)).not.toContain("Sra. Silva");
  });

  it("junta duas pessoas na primeira, somando grafias e ocorrências", () => {
    const start = base();
    const [maria, sra] = start;
    const list = merge(start, [maria.id, sra.id]);
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ id: maria.id, name: "Maria da Silva", variants: ["Maria da Silva", "MARIA DA SILVA", "Sra. Silva"], occurrences: 3 });
  });

  it("separa uma grafia numa pessoa nova, logo depois da original", () => {
    const start = base();
    const [maria] = start;
    const list = split(start, maria.id, "MARIA DA SILVA");
    expect(list[0].variants).toEqual(["Maria da Silva"]);
    expect(list[1]).toMatchObject({ name: "MARIA DA SILVA", variants: ["MARIA DA SILVA"], selected: true, source: "manual" });
  });

  it("cria pessoa nova marcada; se o nome já existe numa grafia, não duplica", () => {
    const list = addEntity(base(), "Carlos Dias", "PESSOA");
    expect(list.at(-1)).toMatchObject({ name: "Carlos Dias", variants: ["Carlos Dias"], selected: true, source: "manual" });
    expect(addEntity(base(), "maria da silva", "PESSOA")).toHaveLength(4);
    expect(addEntity(base(), "   ", "PESSOA")).toHaveLength(4);
  });

  it("muda o tipo entre pessoa e empresa", () => {
    const list = base();
    const [maria] = list;
    expect(setKind(list, maria.id, "EMPRESA")[0].kind).toBe("EMPRESA");
  });

  it("converte para o motor (só marcadas) e para a pré-visualização (todas, com seleção)", () => {
    const list = base();
    expect(toPeople(list)).toEqual([
      { variants: ["Maria da Silva", "MARIA DA SILVA"], kind: "PESSOA" },
      { variants: ["Sra. Silva"], kind: "PESSOA" },
      { variants: ["Horizonte Ltda."], kind: "EMPRESA" },
    ]);
    expect(toPreview(list).selected).toEqual([true, true, false, true]);
    expect(toPreview(list).people).toHaveLength(4);
  });
});

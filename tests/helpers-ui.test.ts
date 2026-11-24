import { describe, expect, it } from "vitest";
import { viewFromHash } from "../src/ui/helpers.ts";

describe("viewFromHash", () => {
  it("abre as páginas do rodapé pelo endereço e cai no app em qualquer outro caso", () => {
    expect(viewFromHash("#privacidade")).toBe("privacidade");
    expect(viewFromHash("#sobre")).toBe("sobre");
    expect(viewFromHash("")).toBe("app");
    expect(viewFromHash("#outra")).toBe("app");
  });
});

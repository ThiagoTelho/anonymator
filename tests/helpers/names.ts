// Carrega a lista real de primeiros nomes (Censo 2010) uma vez para todos os testes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFirstNames } from "../../src/core/names.ts";

export const FIRST_NAMES = parseFirstNames(readFileSync(join(import.meta.dirname, "..", "..", "src", "data", "first-names.txt"), "utf8"));

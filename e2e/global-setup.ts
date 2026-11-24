// Gera PDFs de teste fictícios que não ficam no repositório: página escaneada, senha, documento grande.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { concatPdfs, encryptedPdf, scannedPagePdf } from "../tests/helpers/pdf.ts";

export const TMP = "e2e/.tmp";

export default function globalSetup() {
  mkdirSync(TMP, { recursive: true });
  const peticao = readFileSync("fixtures/peticao-ficticia.pdf");
  writeFileSync(`${TMP}/escaneado.pdf`, concatPdfs([peticao, scannedPagePdf(peticao), peticao]));
  writeFileSync(`${TMP}/senha.pdf`, encryptedPdf(peticao, "segredo123"));
  writeFileSync(`${TMP}/grande.pdf`, concatPdfs(Array(40).fill(readFileSync("fixtures/reclamacao-trt.pdf"))));
  writeFileSync(`${TMP}/nao-e-pdf.pdf`, "isto não é um PDF");
}

// Gera um PDF falso no estilo de uma peça do PJe, com dados inventados.
// Uso: node scripts/make-fixture.mjs [saida.pdf]
import * as mupdf from "mupdf";
import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "fixtures/peticao-ficticia.pdf";

const html = `<html><head><style>
body { font-family: serif; font-size: 11pt; line-height: 1.4; }
h1 { font-size: 13pt; text-align: center; }
p { text-align: justify; margin: 0 0 8pt 0; }
.small { font-size: 9pt; color: #444; }
</style></head><body>
<p class="small">PODER JUDICIÁRIO — TRIBUNAL DE JUSTIÇA DO ESTADO DE GOIÁS<br/>
Processo nº 5001234-56.2025.8.09.0051 — Classe: Procedimento Comum Cível</p>
<h1>EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA CÍVEL DA COMARCA DE GOIÂNIA</h1>
<p><b>MARIA APARECIDA DOS SANTOS OLIVEIRA</b>, brasileira, casada, professora, inscrita no CPF sob o nº 529.982.247-25,
residente na Rua das Acácias, nº 123, Setor Bueno, Goiânia/GO, CEP 74230-010, e-mail maria.oliveira@example.com,
telefone (62) 99876-5432, vem, por intermédio de seu advogado Dr. Carlos Eduardo Ferreira, OAB/GO 12.345,
propor a presente</p>
<h1>AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS</h1>
<p>em face de <b>CONSTRUTORA HORIZONTE LTDA</b>, pessoa jurídica de direito privado, inscrita no CNPJ sob o
nº 11.222.333/0001-81, e de <b>JOÃO PEDRO ALMEIDA</b>, CPF 111.444.777-35, pelos fatos e fundamentos a seguir.</p>
<p>1. A autora Maria Aparecida dos Santos Oliveira celebrou contrato com a ré em 10/03/2023. O sócio João Pedro Almeida
assinou o instrumento. Desde então, a Sra. Oliveira aguarda a entrega do imóvel.</p>
<p>2. Em diversas ocasiões, MARIA APARECIDA DOS SANTOS OLIVEIRA tentou contato com João Pedro Almeida, sem sucesso.
O Sr. Almeida limitou-se a dizer que a obra estava atrasada.</p>
<p>3. Diante do exposto, requer a condenação dos réus. Nestes termos, pede deferimento.</p>
<p>Goiânia, 15 de setembro de 2025.<br/>Carlos Eduardo Ferreira — OAB/GO 12.345</p>
</body></html>`;

const src = mupdf.Document.openDocument(new TextEncoder().encode(html), "text/html");
const buf = new mupdf.Buffer();
const writer = new mupdf.DocumentWriter(buf, "pdf", "");
for (let i = 0; i < src.countPages(); i++) {
  const page = src.loadPage(i);
  const dev = writer.beginPage(page.getBounds());
  page.run(dev, mupdf.Matrix.identity);
  writer.endPage();
}
writer.close();

// Metadados com dado pessoal, para testar a limpeza.
const pdf = new mupdf.PDFDocument(buf.asUint8Array());
pdf.setMetaData("info:Author", "Carlos Eduardo Ferreira");
pdf.setMetaData("info:Title", "Petição inicial - Maria Aparecida dos Santos Oliveira");
writeFileSync(out, pdf.saveToBuffer("compress").asUint8Array());
console.log(`Gerado ${out} (${src.countPages()} página(s))`);

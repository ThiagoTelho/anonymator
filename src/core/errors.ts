// Tradução de erros técnicos (MuPDF, navegador) em mensagens claras para o usuário.

export type ErrorCode = "SENHA_NECESSARIA" | "SENHA_INCORRETA" | "NAO_E_PDF" | "PDF_DANIFICADO" | "SEM_MEMORIA" | "ERRO";

export interface FriendlyError {
  code: ErrorCode;
  message: string;
}

export function friendlyError(err: unknown): FriendlyError {
  const e = err instanceof Error ? err : new Error(String(err));
  // Pelo nome, não por instanceof: o erro pode vir de outro contexto (worker).
  if (e.name === "PdfPasswordError") {
    const wrong = (e as Error & { wrong?: boolean }).wrong === true;
    return wrong
      ? { code: "SENHA_INCORRETA", message: "Senha do PDF incorreta." }
      : { code: "SENHA_NECESSARIA", message: "Este PDF é protegido por senha." };
  }
  const m = e.message.toLowerCase();
  if (/no objects found|not a pdf|cannot recognize|cannot find version marker/.test(m)) {
    return { code: "NAO_E_PDF", message: "O arquivo escolhido não é um PDF (ou está vazio). Escolha o PDF do processo." };
  }
  if (/startxref|xref|invalid key in dict|syntax error|cannot parse|unexpected eof|corrupt|repair/.test(m)) {
    return {
      code: "PDF_DANIFICADO",
      message: "O PDF parece estar danificado ou incompleto. Baixe-o de novo no sistema do tribunal e tente outra vez.",
    };
  }
  if (e instanceof RangeError || /out of memory|allocation failed|memory/.test(m)) {
    return {
      code: "SEM_MEMORIA",
      message:
        "O navegador ficou sem memória para este PDF. Feche outras abas e tente de novo; se persistir, divida o PDF em partes menores.",
    };
  }
  return { code: "ERRO", message: `Não foi possível processar o PDF. Detalhe técnico: ${e.message}` };
}

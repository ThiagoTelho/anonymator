import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Política de segurança do conteúdo, aplicada só no build de produção (o servidor de
// desenvolvimento precisa de WebSocket para recarregar). `connect-src 'self'` permite
// apenas buscar os próprios arquivos do site (o .wasm do MuPDF); nenhum outro destino.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const csp = (): Plugin => ({
  name: "anonymator-csp",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace("<meta charset=\"UTF-8\" />", `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  // Versão exibida no rodapé (vem do package.json).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Caminhos relativos: funciona tanto em usuario.github.io/anonymator quanto em domínio próprio.
  base: "./",
  plugins: [react(), tailwindcss(), csp()],
  worker: { format: "es" },
  optimizeDeps: { exclude: ["mupdf"] },
  build: { target: "esnext" },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});

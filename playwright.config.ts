import { defineConfig, devices } from "@playwright/test";

// Testes de interface contra o build de PRODUÇÃO (com a CSP), servido pelo `vite preview`.
// Com E2E_BASE_URL, rodam contra um site já publicado (ex.: conferir o deploy), sem servidor local.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: external ?? "http://localhost:4174", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
    command: "npx vite build && npx vite preview --port 4174 --strictPort",
    url: "http://localhost:4174",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

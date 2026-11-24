// Gera os ícones PNG a partir de public/logo.svg, renderizando no Chromium do Playwright.
// Uso: node scripts/build-icons.ts   (requer: pnpm exec playwright install chromium)
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/logo.svg", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size] of [
  ["public/apple-touch-icon.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
] as const) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.locator("svg").screenshot({ path: file, omitBackground: true });
  console.log(file, size);
}
await browser.close();

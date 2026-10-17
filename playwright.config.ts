import { defineConfig, devices } from "@playwright/test";

// ADR-0017 E2E: viewport 360px (celular mostrador). Cobro feliz + reintento
// offline sin duplicar. Requiere `npm run dev` en otro terminal (baseURL dev).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: 0,
  use: { baseURL: "http://localhost:4321", trace: "on-first-retry", channel: process.env.PW_CHANNEL },
  projects: [{ name: "mobile-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 800 } } }],
  webServer: undefined,
});

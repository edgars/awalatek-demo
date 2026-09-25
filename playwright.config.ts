import { defineConfig, devices } from "@playwright/test";

// Porta dedicada para não reutilizar por engano outro serviço na 3000.
const PORT = Number(process.env.E2E_PORT ?? 3217);
// Base SQLite própria do e2e (recriada a cada execução por scripts/e2e-db.mjs).
const E2E_DATABASE_URL = "file:./e2e.db";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node scripts/e2e-db.mjs && npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Variáveis do processo têm precedência sobre o .env (Next e dotenv não sobrescrevem).
    // D4 fixo em false: o e2e verifica o comportamento padrão, independente do .env local.
    env: { DATABASE_URL: E2E_DATABASE_URL, SIFAP_USER: "E2EUSER", LEGACY_DOC_ESPECIAL_ENABLED: "false" },
    // Nunca reutilizar: um serviço alheio na porta faria o teste validar outro app.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

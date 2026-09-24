import { defineConfig, devices } from "@playwright/test";

// Porta dedicada para não reutilizar por engano outro serviço na 3000.
const PORT = Number(process.env.E2E_PORT ?? 3217);

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
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Nunca reutilizar: um serviço alheio na porta faria o teste validar outro app.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    actionTimeout: 15000,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.FOLIO_CHROMIUM || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: [
    {
      command: "npm run preview -- --port 4173",
      port: 4173,
      reuseExistingServer: false,
    },
    {
      command:
        ".venv/bin/uvicorn companion.app:app --host 127.0.0.1 --port 8765",
      port: 8765,
      env: { FOLIO_DATA: "/tmp/folio-e2e-data" },
      reuseExistingServer: false,
    },
  ],
});

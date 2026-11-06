import { defineConfig } from "@playwright/test";
const port = Number(process.env.TEST_PORT ?? 3101);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid TEST_PORT");
export default defineConfig({
  testDir: "tests",
  timeout: 240000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: `PORT=${port} PUBLIC_BASE_URL=http://localhost:${port} npm start`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});

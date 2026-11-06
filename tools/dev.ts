import { spawn } from "node:child_process";
const port = Number(process.env.PORT ?? 3001),
  uiPort = Number(process.env.DEV_PORT ?? 5173);
if (
  [port, uiPort].some((p) => !Number.isInteger(p) || p < 1024 || p > 65535) ||
  port === uiPort
)
  throw Error("PORT / DEV_PORT 必须为不同的有效端口");
const env = {
  ...process.env,
  PORT: String(port),
  DEV_PORT: String(uiPort),
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? `http://localhost:${uiPort}`,
};
const children = [
  spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], {
    stdio: "inherit",
    env,
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.ts"],
    { stdio: "inherit", env },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
}
for (const child of children) {
  child.on("error", (e) => {
    console.error(e.message);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) stop(code ?? (signal ? 1 : 0));
  });
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());

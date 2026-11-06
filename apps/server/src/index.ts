import path from "node:path";
import { createApp } from "./app";
const port = Number(process.env.PORT ?? 3001);
createApp({
  directory: path.resolve(process.env.UPLOAD_DIR ?? "var/uploads"),
  baseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
  webDirectory: path.resolve("apps/web/dist"),
}).listen(port, "0.0.0.0", () =>
  console.log(`D2P server ready on port ${port}`),
);

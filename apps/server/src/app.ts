import jpeg from "jpeg-js";
import express from "express";
import multer from "multer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
export interface StorageAdapter {
  put(data: Buffer, mime?: string): Promise<{ key: string; url: string }>;
}
export class LocalStorageAdapter implements StorageAdapter {
  constructor(
    readonly directory: string,
    readonly baseUrl: string,
  ) {}
  async put(data: Buffer, mime?: string) {
    await mkdir(this.directory, { recursive: true });
    const key =
      createHash("sha256").update(data).digest("hex") +
      (mime === "image/jpeg" ? ".jpg" : ".png");
    try {
      await writeFile(path.join(this.directory, key), data, { flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    return { key, url: `${this.baseUrl.replace(/\/$/, "")}/uploads/${key}` };
  }
}
export function createApp(options: {
  directory: string;
  baseUrl: string;
  webDirectory?: string;
  storage?: StorageAdapter;
}) {
  const base = new URL(options.baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw Error("PUBLIC_BASE_URL 必须是无凭据的 HTTP(S) URL");
  const app = express();
  const storage =
    options.storage ??
    new LocalStorageAdapter(options.directory, options.baseUrl);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 2 },
    fileFilter: (_req, file, cb) => {
      if (["image/png", "image/jpeg"].includes(file.mimetype)) cb(null, true);
      else cb(Error("仅支持 PNG/JPEG"));
    },
  });
  app.post("/api/uploads", upload.single("file"), async (req, res, next) => {
    try {
      const data = req.file?.buffer;
      if (req.file?.mimetype === "image/jpeg") {
        if (!data) return void res.status(400).json({ error: "缺少图片" });
        try {
          jpeg.decode(data, { maxResolutionInMP: 64, maxMemoryUsageInMB: 256 });
        } catch {
          return void res
            .status(400)
            .json({ error: "JPEG 内容损坏或尺寸超限" });
        }
        res.status(201).json(await storage.put(data, "image/jpeg"));
        return;
      }
      if (
        !data ||
        data.length < 33 ||
        !data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        return void res.status(400).json({ error: "无效 PNG 文件" });
      const w = data.readUInt32BE(16),
        h = data.readUInt32BE(20);
      if (!w || !h || w > 32767 || h > 32767 || w * h > 64_000_000)
        return void res.status(400).json({ error: "PNG 尺寸超过限制" });
      try {
        PNG.sync.read(data, { checkCRC: true });
      } catch {
        return void res.status(400).json({ error: "PNG 内容损坏" });
      }
      res.status(201).json(await storage.put(data));
    } catch (e) {
      next(e);
    }
  });
  app.use(
    "/uploads",
    express.static(options.directory, {
      immutable: true,
      maxAge: "1y",
      dotfiles: "deny",
      index: false,
    }),
  );
  if (options.webDirectory) app.use(express.static(options.webDirectory));
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(
          error instanceof multer.MulterError &&
            error.code === "LIMIT_FILE_SIZE"
            ? 413
            : 400,
        )
        .json({ error: error.message });
    },
  );
  return app;
}

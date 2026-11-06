import { it, expect } from "vitest";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";
import { createApp } from "../../../apps/server/src/app";
import { csv } from "../src";
it("uploads valid PNG, returns accessible durable URL, rejects fake MIME and corrupt bytes", async () => {
  const directory = await mkdtemp(tmpdir() + "/d2p-");
  try {
    const app = createApp({ directory, baseUrl: "https://example.test" });
    const png = PNG.sync.write(new PNG({ width: 2, height: 2 }));
    const res = await request(app)
      .post("/api/uploads")
      .attach("file", png, {
        filename: "../../attack.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(
      /^https:\/\/example.test\/uploads\/[a-f0-9]{64}\.png$/,
    );
    expect(
      (await request(app).get(new URL(res.body.url).pathname)).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/uploads")
          .attach("file", Buffer.from("bad"), {
            filename: "a.png",
            contentType: "image/png",
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/uploads")
          .attach("file", png, { filename: "a.png", contentType: "text/plain" })
      ).status,
    ).toBe(400);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it("escapes CSV and neutralizes spreadsheet formulas", () => {
  expect(csv([{ name: '=cmd,"x"', status: "failed" }])).toContain(
    '"\'=cmd,""x"""',
  );
});

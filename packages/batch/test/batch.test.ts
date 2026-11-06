import { it, expect } from "vitest";
import { BatchManager } from "../src";
it("runs 50 tasks serially, isolates failures and retries", async () => {
  let active = 0,
    max = 0;
  let failing = true;
  const b = new BatchManager({
    parse: (t) => {
      if (t.name === "17" && failing) throw Error("bad");
      return t;
    },
    render: async () => {
      active++;
      max = Math.max(max, active);
      await Promise.resolve();
      active--;
      return new Blob(["png"]);
    },
    upload: async () => "https://example.test/result.png",
  });
  b.add(
    Array.from({ length: 50 }, (_, i) => ({ name: String(i), source: "x" })),
  );
  await b.run();
  expect(b.tasks.filter((t) => t.status === "success")).toHaveLength(49);
  expect(max).toBe(1);
  failing = false;
  b.retry(b.tasks[17]!.id);
  await b.run();
  expect(b.tasks.every((t) => t.status === "success")).toBe(true);
  expect(b.tasks[17]!.attempt).toBe(2);
});
it("cancels active and pending work without uploading", async () => {
  let uploads = 0;
  const b = new BatchManager({
    parse: () => 1,
    render: async () => {
      b.cancel();
      return new Blob();
    },
    upload: async () => {
      uploads++;
      return "x";
    },
  });
  b.add([
    { name: "a", source: "" },
    { name: "b", source: "" },
  ]);
  await b.run();
  expect(uploads).toBe(0);
  expect(b.tasks.map((t) => t.status)).toEqual(["cancelled", "cancelled"]);
  expect(b.running).toBe(false);
});
it("retries upload without re-rendering or re-uploading successful tasks", async () => {
  let renders = 0,
    uploads = 0;
  const b = new BatchManager({
    parse: (t) => t,
    render: async () => {
      renders++;
      return new Blob(["image"]);
    },
    upload: async () => {
      if (++uploads === 1) throw Error("network");
      return "https://example.test/a.png";
    },
  });
  b.add([
    { name: "a", source: "" },
    { name: "b", source: "" },
  ]);
  await b.run();
  expect(renders).toBe(2);
  b.retry(b.tasks[0]!.id);
  await b.run();
  expect(renders).toBe(2);
  expect(uploads).toBe(3);
  expect(b.tasks[1]!.attempt).toBe(1);
});
it("keeps successful delivery successful even when cache cleanup fails", async () => {
  let uploads = 0;
  const b = new BatchManager(
    {
      parse: () => 1,
      render: async () => new Blob(["x"]),
      upload: async () => {
        uploads++;
        return "https://example.test/a";
      },
    },
    {
      get: async () => undefined,
      put: async () => {},
      delete: async () => {
        throw Error("storage");
      },
    },
  );
  b.add([{ name: "a", source: "" }]);
  await b.run();
  expect(b.tasks[0]!.status).toBe("success");
  b.retry(b.tasks[0]!.id);
  await b.run();
  expect(uploads).toBe(1);
});

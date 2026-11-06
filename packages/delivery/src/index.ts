import type { PosterData } from "@d2p/contracts";
import JSZip from "jszip";
import { posterProjectSchema, isPackagePath } from "@d2p/contracts";
export interface Material {
  name: string;
  source: string;
  poster?: PosterData;
  templateId?: import("../../renderer/src/templates").TemplateId;
}
export interface MaterialPack {
  documents: Material[];
  assets: Record<string, Blob>;
}
export async function importFiles(files: File[]): Promise<MaterialPack> {
  const entries = new Map<string, Blob>();
  let total = 0;
  function add(name: string, data: Blob) {
    if (!isPackagePath(name) || entries.has(name))
      throw Error(`素材路径无效或重复：${name}`);
    total += data.size;
    if (total > 100 * 1024 * 1024 || entries.size >= 500)
      throw Error("素材包超出 100 MiB / 500 文件限制");
    entries.set(name, data);
  }
  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) throw Error("单个导入文件超过 50 MiB");
    if (file.name.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const original =
          (entry as typeof entry & { unsafeOriginalName?: string })
            .unsafeOriginalName ?? entry.name;
        if (original !== entry.name || !isPackagePath(original))
          throw Error("ZIP 包含越界路径");
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let size = 0;
        await new Promise<void>((resolve, reject) => {
          const stream = (
            entry as unknown as {
              internalStream(t: string): JSZip.JSZipStreamHelper<Uint8Array>;
            }
          ).internalStream("uint8array");
          stream
            .on("data", (chunk: Uint8Array) => {
              size += chunk.byteLength;
              if (size > 20 * 1024 * 1024 || total + size > 100 * 1024 * 1024) {
                stream.pause();
                reject(Error("ZIP 解压大小超限"));
                return;
              }
              chunks.push(new Uint8Array(chunk));
            })
            .on("error", reject)
            .on("end", resolve)
            .resume();
        });
        add(entry.name, new Blob(chunks));
      }
    } else add(file.webkitRelativePath || file.name, file);
  }
  const pack: MaterialPack = { documents: [], assets: {} };
  for (const [name, blob] of entries) {
    if (/\.md$/i.test(name)) {
      if (blob.size > 1024 * 1024) throw Error("Markdown 超过 1 MiB");
      pack.documents.push({ name, source: await blob.text() });
    } else {
      const ext = name.split(".").pop()?.toLowerCase();
      const mime = (
        {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          webp: "image/webp",
        } as Record<string, string>
      )[ext ?? ""];
      if (mime) pack.assets[name] = new Blob([blob], { type: mime });
    }
  }
  const manifest = entries.get("d2p.project.json");
  if (manifest) {
    if (manifest.size > 5 * 1024 * 1024) throw Error("模板配置超出大小限制");
    const config = posterProjectSchema.parse(JSON.parse(await manifest.text()));
    for (const row of config.documents) {
      const doc = pack.documents.find((d) => d.name === row.name);
      if (!doc) throw Error("模板配置找不到对应 Markdown：" + row.name);
      if (row.templateId) doc.templateId = row.templateId;
      if (row.poster) doc.poster = row.poster;
    }
  }
  if (!pack.documents.length || pack.documents.length > 50)
    throw Error("请选择包含 1–50 篇 Markdown 的素材包");
  return pack;
}
export async function uploadPng(blob: Blob, signal: AbortSignal) {
  const form = new FormData();
  form.append(
    "file",
    blob,
    blob.type === "image/jpeg" ? "page.jpg" : "page.png",
  );
  const response = await fetch("/api/uploads", {
    method: "POST",
    body: form,
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
  });
  const data = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !data.url) throw Error(data.error ?? "上传失败");
  const url = new URL(data.url);
  if (!["http:", "https:"].includes(url.protocol))
    throw Error("服务端返回了无效投放 URL");
  return data.url;
}
export function csv(
  rows: { name: string; url?: string; status: string; error?: string }[],
) {
  const cell = (s: string) =>
    '"' + (/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
  return (
    "\uFEFF" +
    [
      ["文件", "状态", "URL", "错误"],
      ...rows.map((r) => [r.name, r.status, r.url ?? "", r.error ?? ""]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportZip(
  rows: { name: string; url?: string; status: string }[],
) {
  const zip = new JSZip();
  let bytes = 0;
  for (const [i, row] of rows.entries()) {
    if (row.status !== "success" || !row.url) continue;
    const response = await fetch(row.url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw Error(`图片下载失败：${row.name}`);
    const blob = await response.blob();
    bytes += blob.size;
    if (bytes > 150 * 1024 * 1024) throw Error("ZIP 超过 150 MiB，请分批下载");
    zip.file(
      `${String(i + 1).padStart(3, "0")}.${blob.type === "image/jpeg" ? "jpg" : "png"}`,
      blob,
    );
  }
  zip.file("results.csv", csv(rows));
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

export async function exportMaterialPack(pack: MaterialPack) {
  const zip = new JSZip();
  for (const doc of pack.documents) zip.file(doc.name, doc.source);
  for (const [name, blob] of Object.entries(pack.assets)) zip.file(name, blob);
  zip.file(
    "d2p.project.json",
    JSON.stringify(
      {
        version: 1,
        documents: pack.documents.map((d) => ({
          name: d.name,
          ...(d.templateId ? { templateId: d.templateId } : {}),
          ...(d.poster ? { poster: d.poster } : {}),
        })),
      },
      null,
      2,
    ),
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

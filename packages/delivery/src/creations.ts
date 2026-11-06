import { get, update } from "idb-keyval";
import { parseMarkdown } from "@d2p/markdown";
import type { AssetRef } from "@d2p/contracts";
import type { Material, MaterialPack } from "./index";
export interface Creation {
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  savedAt: string;
  material: Material;
  assets: Record<string, Blob>;
  format: "png" | "jpeg";
  scale: number;
  failure?: { revision: number; message: string; cancelled: boolean };
  exported?: { url: string; revision: number; at: string };
}
/** Each saved work owns its immutable resource snapshot, independent of the editor. */
export function snapshotCreation(
  material: Material,
  assets: MaterialPack["assets"],
  format: "png" | "jpeg",
  scale: number,
  previous?: Creation,
): Creation {
  const parsed = parseMarkdown(material.source, {
    file: material.name,
    availableAssets: Object.keys(assets),
  });
  if (!parsed.ok)
    throw Error(
      parsed.diagnostics
        .map((d) => `${d.file}:${d.line} ${d.message}`)
        .join("\n"),
    );
  const refs: AssetRef[] = [...parsed.assets];
  const p = material.poster;
  if (p) {
    for (const ref of [
      p.heroImage,
      p.backgroundImage,
      p.logoImage,
      ...p.cards.map((c) => c.image),
    ])
      if (ref) refs.push(ref);
  }
  const owned: Record<string, Blob> = {};
  for (const ref of refs)
    if (ref.kind === "package") {
      const blob = assets[ref.path];
      if (!blob) throw Error("找不到图片素材：" + ref.path);
      owned[ref.path] = blob;
    }
  const now = new Date().toISOString();
  return {
    id: previous?.id ?? crypto.randomUUID(),
    title:
      material.templateId === "poster-blue" ||
      material.templateId === "poster-pink"
        ? (p?.title ?? parsed.page.metadata.title)
        : parsed.page.metadata.title,
    revision: (previous?.revision ?? 0) + 1,
    createdAt: previous?.createdAt ?? now,
    savedAt: now,
    material: structuredClone(material),
    assets: owned,
    format,
    scale,
    ...(previous?.exported ? { exported: previous.exported } : {}),
  };
}
export function currentUrl(c: Creation) {
  return c.exported?.revision === c.revision ? c.exported.url : undefined;
}
export function mergeCreations(existing: Creation[], incoming: Creation[]) {
  const rows = new Map(existing.map((c) => [c.id, c]));
  for (const c of incoming) rows.set(c.id, c);
  return [...rows.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export function applyExport(
  existing: Creation[],
  id: string,
  revision: number,
  url: string,
  at: string,
) {
  return existing.map((c) => {
    if (c.id !== id || c.revision !== revision) return c;
    const { failure, ...rest } = c;
    return { ...rest, exported: { url, revision, at } };
  });
}
const key = "d2p-creations";
export async function loadCreations() {
  return (await get<Creation[]>(key)) ?? [];
}
export async function saveCreations(rows: Creation[]) {
  await update<Creation[]>(key, (current) =>
    mergeCreations(current ?? [], rows),
  );
  return loadCreations();
}
export async function saveCreationExport(
  id: string,
  revision: number,
  url: string,
  at: string,
) {
  await update<Creation[]>(key, (rows) =>
    applyExport(rows ?? [], id, revision, url, at),
  );
  return loadCreations();
}

export async function saveCreationFailure(
  id: string,
  revision: number,
  message: string,
  cancelled = false,
) {
  await update<Creation[]>(key, (rows) =>
    (rows ?? []).map((c) =>
      c.id === id && c.revision === revision
        ? { ...c, failure: { revision, message, cancelled } }
        : c,
    ),
  );
  return loadCreations();
}

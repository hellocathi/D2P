import { get, update } from "idb-keyval";
import type { Task } from "../../batch/src";
export interface ExportRecord {
  id: string;
  batchId: string | null;
  name: string;
  title: string;
  templateId: NonNullable<Task["templateId"]>;
  format: "png" | "jpeg";
  scale: number | null;
  exportedAt: string | null;
  status: "success";
  url: string;
}
export function recordFromTask(task: Task): ExportRecord | undefined {
  if (task.status !== "success" || !task.url) return;
  return {
    id: task.id,
    batchId: task.batchId ?? null,
    name: task.name,
    title: task.title ?? task.poster?.title ?? task.name,
    templateId: task.templateId ?? "classic",
    format: task.format ?? "png",
    scale: task.scale ?? null,
    exportedAt: task.completedAt ?? null,
    status: "success",
    url: task.url,
  };
}
/** Task identity, not URL or filename: repeated exports must remain separate records. */
export function mergeHistory(
  existing: ExportRecord[],
  incoming: ExportRecord[],
): ExportRecord[] {
  const seen = new Set<string>();
  return [...incoming]
    .reverse()
    .concat(existing)
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .sort((a, b) => (b.exportedAt ?? "").localeCompare(a.exportedAt ?? ""));
}
const key = "d2p-export-history";
export async function loadHistory() {
  return (await get<ExportRecord[]>(key)) ?? [];
}
/** Read/modify/write within one IndexedDB transaction, including across tabs. */
export async function saveHistory(records: ExportRecord[]) {
  await update<ExportRecord[]>(key, (rows) =>
    mergeHistory(rows ?? [], records),
  );
  return loadHistory();
}

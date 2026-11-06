import type { PosterData } from "@d2p/contracts";
import type { TemplateId } from "../../renderer/src/templates";
export type Status =
  | "pending"
  | "parsing"
  | "rendering"
  | "capturing"
  | "uploading"
  | "success"
  | "failed"
  | "cancelled";
export interface Task {
  id: string;
  name: string;
  source: string;
  title?: string;
  scale?: number;
  batchId?: string;
  creationId?: string;
  creationRevision?: number;
  createdAt?: string;
  completedAt?: string;
  poster?: PosterData;
  templateId?: TemplateId;
  format?: "png" | "jpeg";
  status: Status;
  attempt: number;
  progress: number;
  url?: string;
  error?: string;
  warning?: string;
}
export interface ArtifactStore {
  put(id: string, blob: Blob): Promise<void>;
  get(id: string): Promise<Blob | undefined>;
  delete(id: string): Promise<void>;
}
class MemoryStore implements ArtifactStore {
  private data = new Map<string, Blob>();
  async put(id: string, b: Blob) {
    this.data.set(id, b);
  }
  async get(id: string) {
    return this.data.get(id);
  }
  async delete(id: string) {
    this.data.delete(id);
  }
}
export interface Pipeline<P> {
  parse(task: Task): P;
  render(
    page: P,
    signal: AbortSignal,
    task: Task,
    progress: (value: number) => void,
  ): Promise<Blob>;
  upload(blob: Blob, task: Task, signal: AbortSignal): Promise<string>;
}
export class BatchManager<P> {
  tasks: Task[] = [];
  running = false;
  private listeners = new Set<() => void>();
  private controller: AbortController | undefined;
  private active: string | undefined;
  constructor(
    private pipeline: Pipeline<P>,
    private artifacts: ArtifactStore = new MemoryStore(),
  ) {}
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }
  add(
    inputs: {
      name: string;
      source: string;
      creationId?: string;
      creationRevision?: number;
      scale?: number;
      poster?: PosterData;
      templateId?: TemplateId;
      format?: "png" | "jpeg";
    }[],
  ) {
    if (this.running) throw Error("请等待当前批次结束");
    if (inputs.length > 50) throw Error("每批最多 50 篇");
    for (const t of this.tasks)
      void this.artifacts.delete(t.id).catch(() => {});
    const batchId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    this.tasks = inputs.map((v) => ({
      batchId,
      createdAt,
      ...v,
      id: crypto.randomUUID(),
      status: "pending",
      attempt: 0,
      progress: 0,
    }));
    this.emit();
  }
  cancel(id?: string) {
    for (const task of this.tasks)
      if (
        (!id || id === task.id) &&
        ["pending", "parsing", "rendering", "capturing", "uploading"].includes(
          task.status,
        )
      ) {
        task.status = "cancelled";
        if (this.active === task.id) this.controller?.abort();
      }
    this.emit();
  }
  retry(id: string) {
    if (this.running) throw Error("请等待当前批次结束再重试");
    const task = this.tasks.find((t) => t.id === id);
    if (task && ["failed", "cancelled"].includes(task.status)) {
      task.status = "pending";
      delete task.error;
      this.emit();
    }
  }
  async dispose() {
    this.cancel();
    for (const t of this.tasks) await this.artifacts.delete(t.id);
  }
  async run() {
    if (this.running) return;
    this.running = true;
    this.emit();
    try {
      for (const task of this.tasks) {
        if (task.status !== "pending") continue;
        this.controller = new AbortController();
        const signal = this.controller.signal;
        this.active = task.id;
        task.attempt++;
        try {
          let blob = await this.artifacts.get(task.id);
          signal.throwIfAborted();
          if (!blob) {
            task.status = "parsing";
            task.progress = 5;
            this.emit();
            const page = this.pipeline.parse(task);
            task.status = "rendering";
            task.progress = 15;
            this.emit();
            signal.throwIfAborted();
            blob = await this.pipeline.render(page, signal, task, (value) => {
              if (!signal.aborted) {
                task.status = "capturing";
                task.progress = Math.max(15, Math.min(85, value));
                this.emit();
              }
            });
            signal.throwIfAborted();
            await this.artifacts.put(task.id, blob);
          }
          signal.throwIfAborted();
          task.status = "uploading";
          task.progress = 90;
          this.emit();
          signal.throwIfAborted();
          const url = await this.pipeline.upload(blob, task, signal);
          signal.throwIfAborted();
          task.url = url;
          task.completedAt = new Date().toISOString();
          task.status = "success";
          task.progress = 100;
          await this.artifacts.delete(task.id).catch(() => {
            task.warning = "上传成功，临时产物清理失败";
          });
        } catch (error) {
          task.status = signal.aborted ? "cancelled" : "failed";
          task.error = error instanceof Error ? error.message : String(error);
        } finally {
          this.active = undefined;
          this.controller = undefined;
          this.emit();
        }
      }
    } finally {
      this.running = false;
      this.emit();
    }
  }
}

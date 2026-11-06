import { CreationLibrary } from "./CreationLibrary";
import {
  loadCreations,
  saveCreations,
  saveCreationExport,
  saveCreationFailure,
  snapshotCreation,
  currentUrl,
  type Creation,
} from "../../../packages/delivery/src/creations";
import {
  loadHistory,
  saveHistory,
  recordFromTask,
  type ExportRecord,
} from "../../../packages/delivery/src/history";
import { PosterEditor } from "./PosterEditor";
import { defaultPoster, type PosterData, type AssetRef } from "@d2p/contracts";
import { isPosterTemplate } from "../../../packages/renderer/src/templates";
import { templates } from "../../../packages/renderer/src/templates";
import {
  LocalUploadAdapter,
  MockScmAdapter,
} from "../../../packages/delivery/src/adapters";
import { useEffect, useMemo, useRef, useState } from "react";
import { get, set, del } from "idb-keyval";
import { parseMarkdown } from "@d2p/markdown";
import type { PageSchema } from "@d2p/contracts";
import { PageRenderer } from "../../../packages/renderer/src";
import { exportPng } from "../../../packages/exporter/src";
import { BatchManager, type Task } from "../../../packages/batch/src";
import {
  csv,
  download,
  exportZip,
  exportMaterialPack,
  importFiles,
  uploadPng,
  type MaterialPack,
} from "../../../packages/delivery/src";
import css from "./App.module.css";
import basic from "../../../examples/basic/article.md?raw";
import complex from "../../../examples/complex/article.md?raw";
import cover from "../../../examples/basic/assets/cover.png?url";
const initial: MaterialPack = {
  documents: [
    {
      name: "article.md",
      source:
        '---\nid: demo\ntitle: 每一天，关注健康\nauthor: 健康编辑部\npublishDate: "2026-11-05"\n---\n::article-header{variant="centered"}\n\n::::section{padding="lg"}\n:::callout{variant="info"}\n从规律的生活开始。导入 Markdown 素材包，制作你的第一张科普长图。\n:::\n::::',
    },
  ],
  assets: {},
};
const templatePreview = parseMarkdown(initial.documents[0]!.source);
const labels = {
  pending: "等待",
  parsing: "解析",
  rendering: "渲染",
  capturing: "截图",
  uploading: "上传",
  success: "成功",
  failed: "失败",
  cancelled: "已取消",
};
export function App() {
  const [pack, setPack] = useState(initial);
  const [ready, setReady] = useState(false);
  const [history, setHistory] = useState<ExportRecord[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyScope, setHistoryScope] = useState("all");
  const recordedIds = useRef(new Set<string>());
  const failedAttempts = useRef(new Set<string>());
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState("首页");
  const [creations, setCreations] = useState<Creation[]>([]);
  const [activeCreation, setActiveCreation] = useState<string | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [creationQuery, setCreationQuery] = useState("");
  const [notice, setNotice] = useState("");
  const batchSources = useRef(new Map<string, Creation>());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(2);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [mode, setMode] = useState("local");
  const [, refresh] = useState(0);
  const urls = useRef<Record<string, string>>({});
  const current = useRef({ pack, scale, format, mode });
  current.current = { pack, scale, format, mode };
  const manager = useMemo(
    () =>
      new BatchManager<PageSchema>(
        {
          parse(task) {
            const r = parseMarkdown(task.source, {
              file: task.name,
              availableAssets: Object.keys(
                batchSources.current.get(
                  `${task.creationId}@${task.creationRevision}`,
                )?.assets ?? current.current.pack.assets,
              ),
            });
            if (!r.ok)
              throw Error(
                r.diagnostics
                  .map((d) => `${d.file}:${d.line} ${d.message}`)
                  .join("\n"),
              );
            task.title = isPosterTemplate(task.templateId ?? "classic")
              ? (task.poster?.title ?? r.page.metadata.title)
              : r.page.metadata.title;
            return r.page;
          },
          async render(page, signal, task, progress) {
            const snapshot = batchSources.current.get(
              `${task.creationId}@${task.creationRevision}`,
            );
            const assets = snapshot?.assets ?? current.current.pack.assets;
            const localUrls: Record<string, string> = {};
            try {
              for (const [name, blob] of Object.entries(assets))
                localUrls[name] = URL.createObjectURL(blob);
              return await exportPng(
                page,
                (ref) =>
                  ref.kind === "remote"
                    ? ref.path
                    : (localUrls[ref.path] ?? ""),
                signal,
                task.scale ?? current.current.scale,
                task.templateId,
                task.format,
                progress,
                task.poster,
              );
            } finally {
              for (const url of Object.values(localUrls))
                URL.revokeObjectURL(url);
            }
          },
          upload(blob, _task, signal) {
            return (
              current.current.mode === "mock"
                ? new MockScmAdapter()
                : new LocalUploadAdapter()
            ).upload(blob, signal);
          },
        },
        {
          put: (id, b) => set("artifact:" + id, b),
          get: (id) => get<Blob>("artifact:" + id),
          delete: (id) => del("artifact:" + id),
        },
      ),
    [],
  );
  useEffect(
    () =>
      manager.subscribe(() => {
        refresh((x) => x + 1);
        for (const task of manager.tasks) {
          const key = task.id + "@" + task.attempt;
          if (
            task.creationId &&
            task.creationRevision &&
            ["failed", "cancelled"].includes(task.status) &&
            !failedAttempts.current.has(key)
          ) {
            failedAttempts.current.add(key);
            void saveCreationFailure(
              task.creationId,
              task.creationRevision,
              task.error ?? "用户取消",
              task.status === "cancelled",
            )
              .then(setCreations)
              .catch(() => setError("作品状态保存失败"));
          }
        }
        const rows = manager.tasks
          .map(recordFromTask)
          .filter(
            (row): row is ExportRecord =>
              !!row && !recordedIds.current.has(row.id),
          );
        if (rows.length) {
          for (const row of rows) recordedIds.current.add(row.id);
          for (const row of rows) {
            const task = manager.tasks.find((t) => t.id === row.id);
            if (task?.creationId && task.creationRevision)
              void saveCreationExport(
                task.creationId,
                task.creationRevision,
                row.url,
                row.exportedAt ?? new Date().toISOString(),
              )
                .then(setCreations)
                .catch(() => setError("作品导出状态保存失败"));
          }
          void saveHistory(rows)
            .then(setHistory)
            .catch(() => {
              for (const row of rows) recordedIds.current.delete(row.id);
              setError("导出记录保存失败，请检查浏览器存储空间");
            });
        }
        void set("d2p-tasks", structuredClone(manager.tasks)).catch(() =>
          setError("任务记录保存失败"),
        );
      }),
    [manager],
  );
  useEffect(() => {
    let live = true;
    void Promise.all([
      get<MaterialPack>("d2p-project"),
      get<Task[]>("d2p-tasks"),
      loadHistory(),
      loadCreations(),
      get<string>("d2p-active-creation"),
      get<Creation[]>("d2p-batch-snapshots"),
      get<boolean>("d2p-creations-migrated"),
    ])
      .then(
        async ([
          saved,
          tasks,
          previousHistory,
          library,
          active,
          snapshots,
          migrated,
        ]) => {
          if (snapshots)
            batchSources.current = new Map(
              snapshots.map((c) => [`${c.id}@${c.revision}`, c]),
            );
          if (!migrated && !library.length && saved?.documents?.length) {
            library = await saveCreations(
              saved.documents.flatMap((d) => {
                try {
                  return [snapshotCreation(d, saved.assets, "png", 2)];
                } catch {
                  return [];
                }
              }),
            );
          }
          const oldResults = (tasks ?? [])
            .map(recordFromTask)
            .filter((row): row is ExportRecord => !!row);
          const restored = oldResults.length
            ? await saveHistory(oldResults)
            : previousHistory;
          if (live) {
            await set("d2p-creations-migrated", true);
            setCreations(library);
            setActiveCreation(active ?? null);
            setHistory(restored);
            recordedIds.current = new Set(restored.map((row) => row.id));
            if (saved?.documents?.length) setPack(saved);
            if (tasks) {
              manager.tasks = tasks.map((t) =>
                [
                  "pending",
                  "parsing",
                  "rendering",
                  "capturing",
                  "uploading",
                ].includes(t.status)
                  ? { ...t, status: "failed", error: "页面关闭中断，可重试" }
                  : t,
              );
              refresh((x) => x + 1);
            }
          }
        },
      )
      .catch(() => {
        if (live) setError("无法读取本地项目");
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
      manager.cancel();
    };
  }, [manager]);
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const [name, blob] of Object.entries(pack.assets))
      map[name] = URL.createObjectURL(blob);
    urls.current = map;
    refresh((x) => x + 1);
    return () => {
      for (const url of Object.values(map)) URL.revokeObjectURL(url);
    };
  }, [pack.assets]);
  useEffect(() => {
    if (ready)
      void set("d2p-project", pack).catch(() =>
        setError("本地保存失败，可能空间不足"),
      );
  }, [pack, ready]);
  const doc = pack.documents[index] ?? pack.documents[0]!;
  const parsed = useMemo(
    () =>
      parseMarkdown(doc.source, {
        file: doc.name,
        availableAssets: Object.keys(pack.assets),
      }),
    [doc, pack.assets],
  );
  const locked = busy || manager.running || !ready;
  const posterData =
    doc.poster ?? (parsed.ok ? defaultPoster(parsed.page) : undefined);
  const posterMode = isPosterTemplate(doc.templateId ?? "classic");
  function updatePoster(poster: PosterData) {
    setPack({
      ...pack,
      documents: pack.documents.map((d, i) =>
        i === index ? { ...d, poster } : d,
      ),
    });
  }
  async function uploadPoster(
    file: File,
    assign: (ref: AssetRef) => PosterData,
  ) {
    await action(async () => {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw Error("仅支持 10 MiB 内的 PNG/JPEG/WebP");
      if (
        Object.values(pack.assets).reduce((sum, b) => sum + b.size, 0) +
          file.size >
        100 * 1024 * 1024
      )
        throw Error("项目图片总量超过100 MiB，请拆分素材包");
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 16_000_000)
          throw Error("图片总像素超过1600万");
      } finally {
        bitmap.close();
      }
      const path =
        "poster-assets/" +
        crypto.randomUUID() +
        ({ "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[
          file.type
        ] ?? ".png");
      const poster = assign({ kind: "package", path });
      setPack({
        ...pack,
        documents: pack.documents.map((d, i) =>
          i === index ? { ...d, poster } : d,
        ),
        assets: { ...pack.assets, [path]: file },
      });
    });
  }
  async function action(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function load(files: File[]) {
    await action(async () => {
      setPack(await importFiles(files));
      setIndex(0);
      setActiveCreation(null);
      await del("d2p-active-creation");
      setTab("预览");
    });
  }
  async function persistEditing(all = false) {
    await action(async () => {
      const rows = (all ? pack.documents : [doc]).map((d) =>
        snapshotCreation(
          d,
          pack.assets,
          format,
          scale,
          d === doc && activeCreation
            ? creations.find((c) => c.id === activeCreation)
            : undefined,
        ),
      );
      setCreations(await saveCreations(rows));
      const savedCurrent = rows[all ? index : 0]!;
      setActiveCreation(savedCurrent.id);
      await set("d2p-active-creation", savedCurrent.id);
      setNotice(
        all
          ? `已保存 ${rows.length} 份作品`
          : "作品已保存，可在素材列表中生成 URL",
      );
      setTab("素材列表");
    });
  }
  async function openCreation(c: Creation) {
    setPack({
      documents: [structuredClone(c.material)],
      assets: { ...c.assets },
    });
    setIndex(0);
    setScale(c.scale);
    setFormat(c.format);
    setActiveCreation(c.id);
    await set("d2p-active-creation", c.id);
    setTab("预览");
    setNotice("");
  }
  async function newCreation(templateId: keyof typeof templates = "classic") {
    const fresh = structuredClone(initial);
    fresh.documents[0]!.templateId = templateId;
    setPack(fresh);
    setScale(2);
    setFormat("png");
    setIndex(0);
    setActiveCreation(null);
    await del("d2p-active-creation");
    setTab("预览");
    setNotice("");
  }
  async function generateUrls(rows: Creation[]) {
    await action(async () => {
      const pending = rows.filter((c) => !currentUrl(c));
      if (!pending.length) {
        setNotice("所选作品已有 URL，可直接下载图片或导出链接清单");
        return;
      }
      const retryTasks = pending.map((c) =>
        manager.tasks.find(
          (t) =>
            t.creationId === c.id &&
            t.creationRevision === c.revision &&
            ["failed", "cancelled"].includes(t.status),
        ),
      );
      if (retryTasks.every((t) => !!t)) {
        for (const t of retryTasks) manager.retry(t!.id);
        setNotice("正在重试所选作品，已生成的图片将直接重试上传");
        await manager.run();
        return;
      }
      if (pending.length > 50) throw Error("每批最多导出 50 份作品");
      batchSources.current = new Map(
        pending.map((c) => [`${c.id}@${c.revision}`, structuredClone(c)]),
      );
      await set("d2p-batch-snapshots", pending);
      manager.add(
        pending.map((c) => ({
          ...c.material,
          creationId: c.id,
          creationRevision: c.revision,
          format: c.format,
          scale: c.scale,
        })),
      );
      setNotice(
        `正在为 ${pending.length} 份作品生成 URL，完成后可在记录中复制或下载`,
      );
      setTab("素材列表");
      await manager.run();
    });
  }
  function resultRows(rows: Creation[]) {
    return rows.flatMap((c) => {
      const url = currentUrl(c);
      return url
        ? [
            {
              name: c.material.name,
              title: c.title,
              status: "success",
              url,
              format: c.format,
              scale: c.scale,
              templateId: c.material.templateId ?? "classic",
              exportedAt: c.exported!.at,
            },
          ]
        : [];
    });
  }
  async function downloadCreation(c: Creation) {
    await action(async () => {
      const url = currentUrl(c);
      if (!url) throw Error("请先生成该作品的 URL");
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw Error("图片下载失败");
      download(
        await response.blob(),
        `${c.title.replace(/[\\/:*?"<>|]/g, "_")}.${c.format === "jpeg" ? "jpg" : "png"}`,
      );
    });
  }
  const completed = manager.tasks.filter((t) =>
    ["success", "failed", "cancelled"].includes(t.status),
  ).length;
  const currentIds = new Set(manager.tasks.map((t) => t.id));
  const visibleHistory = history.filter(
    (row) =>
      (historyScope === "all" || currentIds.has(row.id)) &&
      `${row.name} ${row.title}`
        .toLowerCase()
        .includes(historyQuery.toLowerCase()),
  );
  return (
    <div className={css.shell}>
      <header className={css.header}>
        <div>
          <h1>D2P · 健康内容工作台</h1>
          <span>Markdown 长页面 · 批量图片生产</span>
        </div>
        <span>{pack.documents.length} 篇素材</span>
      </header>
      <nav className={css.nav}>
        {["首页", "素材列表", "预览", "导出进度", "导出历史"].map((name) => (
          <button
            key={name}
            onClick={() => setTab(name)}
            aria-current={tab === name ? "page" : undefined}
          >
            {name}
          </button>
        ))}
      </nav>
      <main className={css.main}>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <div role="alert" className={css.error}>
            {error}
          </div>
        )}
        {tab === "首页" && (
          <section>
            <h2>选择模板，开始制作</h2>
            <div className={css.templateGrid}>
              {Object.entries(templates).map(([id, template]) => (
                <button className={css.templateCard} key={id} disabled={locked}
                  onClick={() => void newCreation(id as keyof typeof templates)}>
                  <div className={css.thumbnail} aria-hidden="true">
                    <div className={css.thumbnailPage}>
                      {templatePreview.ok && <PageRenderer page={templatePreview.page}
                        templateId={id as keyof typeof templates} resolve={() => ""} />}
                    </div>
                  </div>
                  <strong>{template.name}</strong>
                  <p>{template.description}</p>
                </button>
              ))}
            </div>
          </section>
        )}
        {tab !== "首页" && <div className={css.toolbar}>
          <button
            disabled={locked}
            onClick={() =>
              void action(async () =>
                download(await exportMaterialPack(pack), "d2p-materials.zip"),
              )
            }
          >
            导出可编辑素材包
          </button>
          <label>
            导入文件 / ZIP{" "}
            <input
              aria-label="导入素材"
              type="file"
              multiple
              accept=".md,.zip,.png,.jpg,.jpeg,.webp"
              disabled={locked}
              onChange={(e) => {
                void load(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <label>
            导入目录{" "}
            <input
              aria-label="导入目录"
              type="file"
              multiple
              {...{ webkitdirectory: "" }}
              disabled={locked}
              onChange={(e) => void load(Array.from(e.target.files ?? []))}
            />
          </label>
          <button
            disabled={locked}
            onClick={() =>
              void action(async () => {
                const blob = await (await fetch(cover)).blob();
                setPack({
                  documents: [
                    { name: "basic/article.md", source: basic },
                    { name: "complex/article.md", source: complex },
                  ],
                  assets: { "basic/assets/cover.png": blob },
                });
                setIndex(0);
                setActiveCreation(null);
                await del("d2p-active-creation");
                setTab("预览");
              })
            }
          >
            加载示例
          </button>
          <select
            aria-label="导出倍率"
            value={scale}
            disabled={locked}
            onChange={(e) => setScale(Number(e.target.value))}
          >
            <option value={1}>标准 1×</option>
            <option value={2}>高清 2×</option>
            <option value={3}>超清 3×</option>
          </select>
          <select
            aria-label="图片格式"
            value={format}
            disabled={locked}
            onChange={(e) => setFormat(e.target.value as "png" | "jpeg")}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
          <select
            aria-label="上传模式"
            value={mode}
            disabled={locked}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="local">本地上传</option>
            <option value="mock">SCM Mock（本地模拟）</option>
          </select>
          <button disabled={locked} onClick={() => void persistEditing(true)}>
            保存全部素材
          </button>
        </div>}
        {tab === "素材列表" && (
          <CreationLibrary
            rows={creations}
            selected={selected}
            onSelect={setSelected}
            onOpen={(c) => void openCreation(c)}
            onGenerate={(rows) => void generateUrls(rows)}
            onDownload={(c) => void downloadCreation(c)}
            onCopy={(url) =>
              void action(async () => navigator.clipboard.writeText(url))
            }
            onZip={(rows) =>
              void action(async () =>
                download(
                  await exportZip(resultRows(rows)),
                  "creation-images.zip",
                ),
              )
            }
            onManifest={(rows) =>
              download(
                new Blob([csv(resultRows(rows))], {
                  type: "text/csv;charset=utf-8",
                }),
                "creation-urls.csv",
              )
            }
            onNew={() => setTab("首页")}
            query={creationQuery}
            onQuery={setCreationQuery}
            locked={locked}
            tasks={manager.tasks}
          />
        )}
        {tab === "预览" && (
          <>
            <div className={css.toolbar}>
              <select
                aria-label="选择文档"
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
              >
                {pack.documents.map((d, i) => (
                  <option key={d.name} value={i}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="选择模板"
                value={doc.templateId ?? "classic"}
                disabled={locked}
                onChange={(e) =>
                  setPack({
                    ...pack,
                    documents: pack.documents.map((d, i) =>
                      i === index
                        ? {
                            ...d,
                            ...(posterData ? { poster: posterData } : {}),
                            templateId: e.target
                              .value as keyof typeof templates,
                          }
                        : d,
                    ),
                  })
                }
              >
                {Object.entries(templates).map(([id, t]) => (
                  <option key={id} value={id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                disabled={locked || !parsed.ok}
                onClick={() => void persistEditing()}
              >
                保存制作
              </button>
              <span>{activeCreation ? "保存将更新当前素材，不新增记录" : "首次保存将新增素材记录"}</span>
            </div>
            <div className={css.editor}>
              <div>
                {posterMode && posterData ? (
                  <PosterEditor
                    data={posterData}
                    onChange={updatePoster}
                    onUpload={(file, assign) => void uploadPoster(file, assign)}
                    disabled={locked}
                  />
                ) : (
                  <>
                    <label htmlFor="markdown">Markdown 配置</label>
                    <textarea
                      id="markdown"
                      value={doc.source}
                      disabled={locked}
                      onChange={(e) =>
                        setPack({
                          ...pack,
                          documents: pack.documents.map((d, i) =>
                            i === index ? { ...d, source: e.target.value } : d,
                          ),
                        })
                      }
                    />
                  </>
                )}
              </div>
              <div className={css.preview}>
                {parsed.ok ? (
                  <PageRenderer
                    page={parsed.page}
                    poster={doc.poster}
                    templateId={doc.templateId ?? "classic"}
                    resolve={(ref) =>
                      ref.kind === "remote"
                        ? ref.path
                        : (urls.current[ref.path] ?? "")
                    }
                  />
                ) : (
                  <pre role="alert" className={css.error}>
                    {parsed.diagnostics
                      .map(
                        (d) => `第 ${d.line} 行 ${d.path ?? ""}: ${d.message}`,
                      )
                      .join("\n")}
                  </pre>
                )}
              </div>
            </div>
          </>
        )}
        {tab === "导出进度" && (
          <>
            <h2>
              导出进度 {completed} / {manager.tasks.length}
            </h2>
            <progress max={manager.tasks.length || 1} value={completed} />
            <div className={css.toolbar}>
              <button
                disabled={!manager.running}
                onClick={() => manager.cancel()}
              >
                取消全部
              </button>
              <button
                disabled={
                  manager.running ||
                  !manager.tasks.some(
                    (t) => t.status === "failed" || t.status === "cancelled",
                  )
                }
                onClick={() => {
                  for (const t of manager.tasks) manager.retry(t.id);
                  void manager.run();
                }}
              >
                重试失败 / 取消任务
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>文档</th>
                  <th>状态</th>
                  <th>尝试次数</th>
                  <th>详情</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {manager.tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>
                      {labels[t.status]} {t.progress}%
                    </td>
                    <td>{t.attempt}</td>
                    <td>{t.error ?? ""}</td>
                    <td>
                      {[
                        "pending",
                        "parsing",
                        "rendering",
                        "capturing",
                        "uploading",
                      ].includes(t.status) ? (
                        <button onClick={() => manager.cancel(t.id)}>
                          取消
                        </button>
                      ) : (
                        <button
                          disabled={manager.running || t.status === "success"}
                          onClick={() => {
                            manager.retry(t.id);
                            void manager.run();
                          }}
                        >
                          重试
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {tab === "导出历史" && (
          <>
            <h2>导出记录（{history.length}）</h2>
            <p className={css.muted}>
              每次成功导出均单独记录，按时间倒序排列，刷新或继续生成不会覆盖历史记录。
            </p>
            <div className={css.toolbar}>
              <input
                aria-label="搜索导出记录"
                placeholder="搜索标题或文件名"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
              />
              <select
                aria-label="导出记录范围"
                value={historyScope}
                onChange={(e) => setHistoryScope(e.target.value)}
              >
                <option value="all">全部记录</option>
                <option value="current">本次任务</option>
              </select>
              <span>当前显示 {visibleHistory.length} 条</span>
              <button
                disabled={!visibleHistory.length}
                onClick={() =>
                  download(
                    new Blob([csv(visibleHistory)], {
                      type: "text/csv;charset=utf-8",
                    }),
                    "export-history.csv",
                  )
                }
              >
                导出 URL 清单
              </button>
              <button
                disabled={busy || manager.running || !visibleHistory.length}
                onClick={() =>
                  void action(async () =>
                    download(
                      await exportZip(visibleHistory),
                      "d2p-results.zip",
                    ),
                  )
                }
              >
                下载图片 ZIP
              </button>
            </div>
            {!visibleHistory.length && (
              <p>
                {history.length
                  ? "没有匹配的导出记录。"
                  : "暂无导出记录，生成图片后会自动保存在这里。"}
              </p>
            )}
            <div className={css.grid}>
              {visibleHistory.map((t) => (
                <article
                  data-export-record={t.id}
                  className={`${css.card} ${css.result}`}
                  key={t.id}
                >
                  <h3>{t.title}</h3>
                  <p>{t.name}</p>
                  <p className={css.muted}>
                    <time dateTime={t.exportedAt ?? undefined}>
                      {t.exportedAt
                        ? new Date(t.exportedAt).toLocaleString("zh-CN")
                        : "历史记录 · 时间未知"}
                    </time>
                    <br />
                    {templates[t.templateId]?.name ?? t.templateId} ·{" "}
                    {t.format.toUpperCase()}
                    {t.scale ? ` · ${t.scale}×` : ""} · 成功
                  </p>
                  <a href={t.url} target="_blank" rel="noreferrer">
                    <img loading="lazy" src={t.url} alt={t.title} />
                  </a>
                  <a href={t.url}>{t.url}</a>
                  <button
                    onClick={() =>
                      void action(async () =>
                        navigator.clipboard.writeText(t.url),
                      )
                    }
                  >
                    复制 URL
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

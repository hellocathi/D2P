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
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState("工作台");
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
              availableAssets: Object.keys(current.current.pack.assets),
            });
            if (!r.ok)
              throw Error(
                r.diagnostics
                  .map((d) => `${d.file}:${d.line} ${d.message}`)
                  .join("\n"),
              );
            return r.page;
          },
          render(page, signal, task, progress) {
            return exportPng(
              page,
              (ref) =>
                ref.kind === "remote"
                  ? ref.path
                  : (urls.current[ref.path] ?? ""),
              signal,
              current.current.scale,
              task.templateId,
              task.format,
              progress,
            );
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
    ])
      .then(([saved, tasks]) => {
        if (live) {
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
      })
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
      setTab("工作台");
    });
  }
  function run(all: boolean) {
    manager.add((all ? pack.documents : [doc]).map((d) => ({ ...d, format })));
    setTab("批量生产");
    void manager.run();
  }
  const completed = manager.tasks.filter((t) =>
    ["success", "failed", "cancelled"].includes(t.status),
  ).length;
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
        {["工作台", "编辑与预览", "批量生产", "结果管理"].map((name) => (
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
        {error && (
          <div role="alert" className={css.error}>
            {error}
          </div>
        )}
        <div className={css.toolbar}>
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
          <button disabled={locked} onClick={() => run(true)}>
            批量生成全部
          </button>
        </div>
        {tab === "工作台" && (
          <div className={css.grid}>
            {pack.documents.map((d, i) => (
              <section className={css.card} key={d.name}>
                <span className={css.muted}>MARKDOWN 素材</span>
                <h2>{d.name}</h2>
                <p>{d.source.length} 字符 · 自动保存至本机</p>
                <button
                  onClick={() => {
                    setIndex(i);
                    setTab("编辑与预览");
                  }}
                >
                  编辑与预览
                </button>
              </section>
            ))}
          </div>
        )}
        {tab === "编辑与预览" && (
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
                onClick={() => run(false)}
              >
                生成当前长图
              </button>
            </div>
            <div className={css.editor}>
              <div>
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
              </div>
              <div className={css.preview}>
                {parsed.ok ? (
                  <PageRenderer
                    page={parsed.page}
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
        {tab === "批量生产" && (
          <>
            <h2>
              批量生产 {completed} / {manager.tasks.length}
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
        {tab === "结果管理" && (
          <>
            <div className={css.toolbar}>
              <button
                disabled={!manager.tasks.length}
                onClick={() =>
                  download(
                    new Blob([csv(manager.tasks)], {
                      type: "text/csv;charset=utf-8",
                    }),
                    "results.csv",
                  )
                }
              >
                导出 URL 清单
              </button>
              <button
                disabled={
                  busy ||
                  manager.running ||
                  !manager.tasks.some((t) => t.status === "success")
                }
                onClick={() =>
                  void action(async () =>
                    download(await exportZip(manager.tasks), "d2p-results.zip"),
                  )
                }
              >
                下载图片 ZIP
              </button>
            </div>
            <div className={css.grid}>
              {manager.tasks
                .filter((t) => t.status === "success")
                .map((t) => (
                  <article className={`${css.card} ${css.result}`} key={t.id}>
                    <h3>{t.name}</h3>
                    <a href={t.url} target="_blank" rel="noreferrer">
                      <img src={t.url} alt={t.name} />
                    </a>
                    <a href={t.url}>{t.url}</a>
                    <button
                      onClick={() =>
                        void action(async () =>
                          navigator.clipboard.writeText(t.url!),
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

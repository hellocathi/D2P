import {
  currentUrl,
  type Creation,
} from "../../../packages/delivery/src/creations";
import { templates } from "../../../packages/renderer/src/templates";
import type { Task } from "../../../packages/batch/src";
import css from "./App.module.css";
export function CreationLibrary({
  rows,
  selected,
  onSelect,
  onOpen,
  onGenerate,
  onDownload,
  onCopy,
  onZip,
  onManifest,
  onNew,
  query,
  onQuery,
  locked,
  tasks,
}: {
  rows: Creation[];
  selected: Set<string>;
  onSelect: (ids: Set<string>) => void;
  onOpen: (c: Creation) => void;
  onGenerate: (rows: Creation[]) => void;
  onDownload: (c: Creation) => void;
  onCopy: (url: string) => void;
  onZip: (rows: Creation[]) => void;
  onManifest: (rows: Creation[]) => void;
  onNew: () => void;
  query: string;
  onQuery: (q: string) => void;
  locked: boolean;
  tasks: Task[];
}) {
  const visible = rows.filter((c) =>
    `${c.title} ${c.material.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  const picked = rows.filter((c) => selected.has(c.id));
  const active = (c: Creation) =>
    tasks.find(
      (t) => t.creationId === c.id && t.creationRevision === c.revision,
    );
  return (
    <>
      <h2>制作记录（{rows.length}）</h2>
      <p className={css.muted}>
        编辑后保存到这里。选择作品生成
        URL，图片下载单独操作。制作记录保存在当前浏览器。
      </p>
      <div className={css.toolbar}>
        <button disabled={locked} onClick={onNew}>
          新建制作
        </button>
        <input
          aria-label="搜索制作记录"
          placeholder="搜索作品标题或文件名"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            aria-label="全选制作记录"
            checked={
              visible.length > 0 && visible.every((c) => selected.has(c.id))
            }
            onChange={(e) => {
              const next = new Set(selected);
              for (const c of visible)
                e.target.checked ? next.add(c.id) : next.delete(c.id);
              onSelect(next);
            }}
          />
          全选当前列表
        </label>
        <span>已选 {picked.length} 项</span>
        <button
          disabled={locked || !picked.length}
          onClick={() => onGenerate(picked)}
        >
          批量生成 URL
        </button>
        <button
          disabled={
            locked || !picked.length || picked.some((c) => !currentUrl(c))
          }
          onClick={() => onZip(picked)}
        >
          下载所选图片 ZIP
        </button>
        <button
          disabled={!picked.some((c) => currentUrl(c))}
          onClick={() => onManifest(picked)}
        >
          导出所选 URL 清单
        </button>
      </div>
      {!visible.length && (
        <p>暂无制作记录。请新建或导入素材，在制作预览页保存。</p>
      )}
      <div className={css.grid}>
        {visible.map((c) => {
          const url = currentUrl(c);
          const task = active(c);
          const pending =
            task &&
            [
              "pending",
              "parsing",
              "rendering",
              "capturing",
              "uploading",
            ].includes(task.status);
          const state = pending
            ? `正在导出 ${task.progress}%`
            : url
              ? "已生成 URL"
              : task?.status === "failed" ||
                  (c.failure?.revision === c.revision && !c.failure.cancelled)
                ? "导出失败"
                : c.failure?.revision === c.revision && c.failure.cancelled
                  ? "已取消 · 待导出"
                  : c.exported
                    ? "已修改 · 待导出"
                    : "已保存 · 待导出";
          return (
            <article
              key={c.id}
              data-creation-record={c.id}
              className={`${css.card} ${css.result}`}
            >
              <label>
                <input
                  type="checkbox"
                  aria-label={`选择作品 ${c.title}`}
                  checked={selected.has(c.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    e.target.checked ? next.add(c.id) : next.delete(c.id);
                    onSelect(next);
                  }}
                />
                选择
              </label>
              <h3>
                <button disabled={locked} onClick={() => onOpen(c)}>
                  {c.title}
                </button>
              </h3>
              <p>
                {templates[c.material.templateId ?? "classic"].name} · 第{" "}
                {c.revision} 版 · {c.format.toUpperCase()}
              </p>
              <p>
                保存时间：
                <time dateTime={c.savedAt}>
                  {new Date(c.savedAt).toLocaleString("zh-CN")}
                </time>
              </p>
              <p data-creation-status>{state}</p>
              {(task?.error ??
                (c.failure?.revision === c.revision
                  ? c.failure.message
                  : undefined)) && (
                <p role="alert">{task?.error ?? c.failure?.message}</p>
              )}
              {c.exported && (
                <button
                  disabled={locked}
                  onClick={() => onOpen(c)}
                  title="打开制作预览"
                >
                  <img loading="lazy" src={c.exported.url} alt={c.title} />
                </button>
              )}
              {url && (
                <a href={url} target="_blank" rel="noreferrer">
                  {url}
                </a>
              )}
              <div className={css.toolbar}>
                <button disabled={locked} onClick={() => onOpen(c)}>
                  查看 / 编辑
                </button>
                <button disabled={locked} onClick={() => onGenerate([c])}>
                  生成 URL
                </button>
                <button disabled={locked || !url} onClick={() => onDownload(c)}>
                  下载图片
                </button>
                <button
                  disabled={locked || !url}
                  onClick={() => url && onCopy(url)}
                >
                  复制 URL
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

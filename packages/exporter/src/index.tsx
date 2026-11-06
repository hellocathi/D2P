import type { TemplateId } from "../../renderer/src/templates";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import html2canvas from "html2canvas";
import { PageRenderer, type AssetResolver } from "../../renderer/src";
import { pageSchema, type PageSchema } from "@d2p/contracts";
export function dimensions(width: number, height: number, scale: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw Error("页面尺寸无效");
  if (!Number.isFinite(scale) || scale < 1 || scale > 3)
    throw Error("导出倍率应为 1–3");
  const w = Math.ceil(width * scale),
    h = Math.ceil(height * scale);
  if (w < 1 || h < 1 || w > 32767 || h > 32767 || w * h > 64_000_000)
    throw Error(`图片尺寸 ${w}×${h} 超出安全预算，请拆分内容或显式降低倍率`);
  return { w, h };
}
async function deadline<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error(`${label}超时`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function exportPng(
  page: PageSchema,
  resolve: AssetResolver,
  signal?: AbortSignal,
  scale = 2,
  templateId: TemplateId = "classic",
  format: "png" | "jpeg" = "png",
  progress: (value: number) => void = () => {},
): Promise<Blob> {
  pageSchema.parse(page);
  signal?.throwIfAborted();
  const host = document.createElement("div");
  host.dataset.exportHost = "true";
  Object.assign(host.style, {
    position: "absolute",
    left: "-100000px",
    top: "0",
    width: `${page.page.width}px`,
  });
  document.body.append(host);
  const root = createRoot(host);
  let output: HTMLCanvasElement | undefined;
  try {
    flushSync(() =>
      root.render(
        <PageRenderer page={page} resolve={resolve} templateId={templateId} />,
      ),
    );
    const element = host.firstElementChild as HTMLElement;
    await deadline(document.fonts.ready, 15000, "字体加载");
    if (!document.fonts.check("18px Arial")) throw Error("字体不可用");
    const urls = new Set<string>();
    for (const el of Array.from(element.querySelectorAll("*"))) {
      const bg = getComputedStyle(el).backgroundImage;
      for (const match of bg.matchAll(/url\(["']?(.*?)["']?\)/g))
        if (match[1]) urls.add(match[1]);
    }
    const backgroundImages = Array.from(urls, (src) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.src = src;
      return im;
    });
    await deadline(
      Promise.all(
        [
          ...Array.from(element.querySelectorAll("img")),
          ...backgroundImages,
        ].map(async (im) => {
          try {
            await im.decode();
            if (!im.naturalWidth) throw Error("空图片");
          } catch {
            throw Error(`图片加载失败：${im.getAttribute("src")}`);
          }
        }),
      ),
      20000,
      "图片加载",
    );
    signal?.throwIfAborted();
    const width = Math.ceil(
        Math.max(element.scrollWidth, element.getBoundingClientRect().width),
      ),
      height = Math.ceil(
        Math.max(element.scrollHeight, element.getBoundingClientRect().height),
      );
    const { w, h } = dimensions(width, height, scale);
    output = document.createElement("canvas");
    output.width = w;
    output.height = h;
    const ctx = output.getContext("2d");
    if (!ctx) throw Error("Canvas 内存不足");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    progress(25);
    const started = performance.now();
    for (let y = 0; y < height; y += 2048) {
      signal?.throwIfAborted();
      if (performance.now() - started > 90000)
        throw Error("截图超过 90 秒预算");
      const part = await html2canvas(element, {
        scale,
        width,
        height: Math.min(2048, height - y),
        y,
        useCORS: true,
        allowTaint: false,
        imageTimeout: 20000,
        logging: false,
        backgroundColor: null,
        windowWidth: Math.max(width, 1024),
      });
      try {
        signal?.throwIfAborted();
        ctx.drawImage(part, 0, Math.round(y * scale));
        progress(25 + Math.round((60 * Math.min(height, y + 2048)) / height));
      } finally {
        part.width = 0;
        part.height = 0;
      }
    }
    signal?.throwIfAborted();
    return await deadline(
      new Promise<Blob>((resolve, reject) =>
        output!.toBlob(
          (blob) => (blob ? resolve(blob) : reject(Error("图片编码失败"))),
          format === "jpeg" ? "image/jpeg" : "image/png",
          0.92,
        ),
      ),
      20000,
      "PNG 编码",
    );
  } finally {
    root.unmount();
    host.remove();
    if (output) {
      output.width = 0;
      output.height = 0;
    }
  }
}

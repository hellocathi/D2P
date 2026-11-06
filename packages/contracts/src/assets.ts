import { z } from "zod";

export function isSafeHttpsUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value) || /[\s\\\u0000-\u001f]/.test(value))
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !!url.hostname
    );
  } catch {
    return false;
  }
}

export function isPackagePath(value: string): boolean {
  return (
    value.length > 0 &&
    !/[\\:%?#\u0000-\u001f]/.test(value) &&
    !value.startsWith("/") &&
    value.split("/").every((part) => !!part && part !== "." && part !== "..")
  );
}

export const assetRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("package"),
      path: z
        .string()
        .max(2048)
        .refine(isPackagePath, "素材路径必须为规范化的包内相对路径"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("remote"),
      path: z
        .string()
        .max(2048)
        .refine(isSafeHttpsUrl, "远程素材仅允许无凭据的 HTTPS URL"),
    })
    .strict(),
]);
export type AssetRef = z.infer<typeof assetRefSchema>;

/** Resolve relative to a Markdown file inside a package; never access the filesystem. */
export function resolveAssetRef(input: string, sourceFile: string): AssetRef {
  if (isSafeHttpsUrl(input))
    return assetRefSchema.parse({ kind: "remote", path: input });
  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    throw new Error("素材路径包含无效 URL 编码");
  }
  if (
    !decoded ||
    /[\\:%?#\u0000-\u001f]/.test(decoded) ||
    decoded.startsWith("/")
  ) {
    throw new Error("素材路径必须为包内相对路径或 HTTPS URL");
  }
  if (!isPackagePath(sourceFile))
    throw new Error("Markdown 文件路径必须为规范化的包内路径");
  const segments = sourceFile.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!segments.length) throw new Error("素材路径越过素材包根目录");
      segments.pop();
    } else segments.push(part);
  }
  return assetRefSchema.parse({ kind: "package", path: segments.join("/") });
}

export const linkHrefSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    if (isSafeHttpsUrl(value)) return true;
    return /^#[A-Za-z][\w-]*$/.test(value);
  }, "链接仅允许 HTTPS URL 或页内锚点");

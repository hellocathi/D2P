import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseMarkdown } from '@d2p/markdown';

const args = process.argv.slice(2);
let packageRoot: string | undefined;
if (args[0] === '--root') {
  const root = args.splice(0, 2)[1];
  if (!root) throw new Error('--root 需要素材包根目录');
  packageRoot = path.resolve(root);
}
const files = args;
if (!files.length) {
  console.error('用法：npm run validate -- [--root 素材包根目录] 文件.md [其他文件.md]');
  process.exitCode = 1;
}
for (const file of files) {
  try {
    const root = packageRoot ?? path.dirname(path.resolve(file));
    const sourceFile = path.relative(root, path.resolve(file)).split(path.sep).join('/');
    if (sourceFile.startsWith('../') || path.isAbsolute(sourceFile)) throw new Error('Markdown 文件必须位于指定素材包根目录内');
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const availableAssets = entries.filter((entry) => entry.isFile()).map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
    const result = parseMarkdown(await readFile(file, 'utf8'), { file: sourceFile, availableAssets });
    if (!result.ok) {
      for (const d of result.diagnostics) console.error(`${file}:${d.line}:${d.column} [${d.code}] ${d.path ?? ''} ${d.message}`);
      process.exitCode = 1;
    } else console.log(`${file}: 校验通过，${result.page.nodes.length} 个根模块，${result.assets.length} 份素材，宽 ${result.page.page.width}px`);
  } catch (error) {
    console.error(`${file}: ${error instanceof Error ? error.message : '读取失败'}`);
    process.exitCode = 1;
  }
}

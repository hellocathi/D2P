# D2P · 健康内容与素材生产工作台

使用 Markdown 制作医疗健康科普、疾病知识及药品宣传长图。支持模板切换、PNG/JPEG、最多50篇串行任务、本地上传与明确标识的 SCM Mock、URL清单和ZIP导出。不负责短信编辑或发送。

## 运行

需要 Node.js 22+，推荐24。在仓库根目录运行：

```bash
npm ci
npm run check
npm start
```

生产服务器同时提供前端页面与上传API，默认端口3001。开发时启动 API（`npm start`）后在另一个终端运行 `npm run dev`，Vite会代理上传请求。

环境变量由进程注入（不会自动加载 `.env`）：

```bash
PUBLIC_BASE_URL=https://materials.example.com UPLOAD_DIR=/data/uploads PORT=3001 npm start
```

`PUBLIC_BASE_URL` 必须设为使用者和下游可访问的真实地址；默认 localhost 只适用于本机。上传文件目录应挂载持久化卷。系统面向可信本地/内网部署，公开部署请在反向代理层配置访问控制和请求限制。

## 使用

1. 点击「加载示例」，或导入Markdown及图片文件、目录、ZIP。
2. 在「编辑与预览」选择文档和模板，可为不同文档选择不同模板。
3. 选择PNG/JPEG、导出倍率和上传模式，生成当前页面或整批素材。
4. 查看任务进度、失败原因；上传失败重试复用已缓存图片，不重新截图，成功任务不会重跑。
5. 在「结果管理」复制URL、下载图片ZIP及CSV清单。

素材与任务记录保存在浏览器IndexedDB。刷新后保留已完成结果，中断任务转为失败待重试；上传失败的图片也存储于IndexedDB。新建批次会替换上个批次并清理其待上传缓存。浏览器清除站点数据会清除这些记录，服务端上传图片不受影响。

## 验证

```bash
npm run check
npm run validate -- --root examples examples/basic/article.md examples/complex/article.md
# 浏览器验收；默认使用 /usr/bin/chromium，可通过 CHROMIUM_PATH 指定
npm run test:e2e
```

浏览器测试在生产构建上验证30份真实素材、ZIP导入、模板切换、长图底部像素、上传故障与仅上传重试、ZIP内容、JPEG、图片错误清理及结果恢复。需允许本地端口及Chromium进程运行。其他平台可安装Chromium并设置CHROMIUM_PATH。

## 文档

- [当前架构、数据流与限制](docs/architecture.md)
- [Markdown DSL规范](docs/dsl.md)
- [部署及微前端入口](docs/deployment.md)
- [SCM待补充信息](docs/scm.md)
- [基础示例](examples/basic/article.md) / [复杂示例](examples/complex/article.md)

SCM Mock 使用本地真实HTTP图片存储模拟交付，**没有接入真实SCM**。待提供实际接口文档后实现专用适配器。示例封面是占位图，示例健康文案仅用于验证排版，发布前需自行审核。

## 整页海报模板

在「编辑与预览」中选择「蓝色健康海报」或「粉色专题海报」，左侧会切换为内容填充表单。背景、装饰、白色坑位由模板统一提供；表单支持标题、导语、正文、主视觉、坑位图片和品牌标识。

勾选「图片铺满坑位内部」可用已设计好的图文图片填满白框内部；不勾选时图片作为图标搭配标题与正文。支持添加、移除白色坑位，内容多时框体自动撑高。背景图片本身不要包含待替换的文字；人物、产品、图表素材可以分别上传。

点击「导出可编辑素材包」保留填充配置与上传图片，后续导入ZIP可继续编辑。原有三套Markdown模板和批量生产流程继续可用。

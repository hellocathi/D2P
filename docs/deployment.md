# 部署与集成

在仓库根目录执行npm ci、npm run build、npm start。Express同时提供apps/web/dist与上传API。GET /api/health返回就绪响应。

配置PORT（默认3001）、PUBLIC_BASE_URL（默认http://localhost:3001）、UPLOAD_DIR（默认var/uploads），通过进程环境注入。服务端当前应从仓库根目录启动。静态资源及API同源，无需在浏览器持有SCM密钥。

部署示例：`PUBLIC_BASE_URL=https://materials.example.com UPLOAD_DIR=/data/uploads PORT=3001 npm start`。为/data/uploads挂载持久卷并配置备份。PUBLIC_BASE_URL必须对应实际反向代理公开入口。服务器未提供账号体系，可信内网之外需由网关配置访问控制、TLS和请求频率限制。

上传API：POST /api/uploads，multipart字段file，PNG或JPEG，最大20MiB。返回key和url。本地内容哈希文件名使相同文件重复上传不会增加多个副本。图片持久保存，不自动删除；保留期限和清理策略由部署者制定。

开发时 npm run dev 同时启动API和Vite，默认端口3001和5173；图片URL默认指向Vite的同源代理，API与图片下载均经过同源入口。可使用PORT与DEV_PORT调整两个端口，PUBLIC_BASE_URL可显式覆盖。不要在同一端口同时运行生产API和开发API。

微前端使用apps/web/src/mount.tsx的mount(container)，返回卸载函数。宿主需要支持ESM、React和CSS Modules构建；API需同源代理。组件样式限制在根容器，卸载时取消任务并释放素材Object URL。html2canvas当前调用完成后才能最终释放离屏容器。

浏览器验收运行npm run test:e2e，Chromium路径默认/usr/bin/chromium，通过CHROMIUM_PATH覆盖。测试使用本地生产服务器，勿与同端口的人工服务同时运行。

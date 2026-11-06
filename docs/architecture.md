# 架构与执行流程

沿用原有解析与Zod契约：Markdown → unified/remark AST → PageSchema → 模板内容插槽 → Module Registry → React PageRenderer → html2canvas → 图片Blob → 产物缓存 → UploadAdapter → URL → ZIP/CSV。

## 模块

- contracts：19个模块属性、受控样式、递归Schema、路径校验与资源限制。
- markdown：纯解析，无HTML拼接、脚本执行或文件系统访问。
- renderer：全部模块组件、CSS Modules、TemplateRegistry（经典科普、健康期刊、主题宣传）。模板使用刊头、正文、资料/声明插槽包装结构，新增模板不修改解析器，Markdown内原有Directive样式继续兼容。
- exporter：与预览共用PageRenderer，等待字体、图片decode和背景图加载，读取scrollWidth/scrollHeight，分段绘制、Blob编码、finally清理。
- batch：最多50篇，串行调度，订阅进度、取消、失败隔离、重试；产物存储接口可注入。浏览器使用IndexedDB避免批量Blob常驻内存。
- delivery：素材包导入、LocalUploadAdapter、MockScmAdapter、CSV、ZIP。
- Express：PNG/JPEG签名与实际解码、20MiB文件限制、Canvas像素预算验证、内容哈希命名、HTTP静态图片访问。StorageAdapter可替换为云存储。

## 核心数据

PageSchema沿用schemaVersion、metadata、page、theme、nodes。Material记录name/source/templateId，模板选择属于项目配置，不写入Markdown。Task包含id/name/source/templateId/format/status/attempt/progress/url/error，生成产物由任务ID关联存储。

## 执行流程

pending → parsing → rendering → capturing → uploading → success；任一阶段可进入failed/cancelled。

每篇先查产物缓存，命中时直接上传；未命中才解析、按任务模板渲染和截图。截图完成先缓存再上传。成功后删除缓存；上传失败保留产物供仅上传重试。已经成功的任务不可重试。批次执行中不允许替换素材、模板和导出设置。

当前任务记录包含快照源文档，重试按该快照执行。修改文档后需要新建生成批次。刷新中断的任务转为失败，用户可显式重试。

## 稳定性边界

导出倍率1–3，最终Canvas边长不超过32767像素、总像素不超过6400万。分段高度2048px，减少中间Canvas峰值，最终单图仍受预算约束。超限报错，不静默裁剪或降清晰度。

字体等待15秒、图片等待20秒、编码20秒、截图阶段90秒预算（在分段之间检查）。html2canvas不可强制终止，取消在当前调用完成后生效。结束时卸载React、移除离屏DOM并将Canvas尺寸归零。DOM不使用display:none。

跨域图片必须支持CORS；远程资源失败会使单篇失败。PNG保留页面背景，JPEG使用白色底色。默认字体栈为Arial、Microsoft YaHei、sans-serif；不允许配置任意远程字体。

ZIP导入最多500文件、解压100MiB、单项20MiB；每篇Markdown1MiB。ZIP导出最多150MiB；大批量应拆批。浏览器IndexedDB容量不足会明确失败。没有内存堆持续增长的跨浏览器证明，现有验收检查30篇后离屏节点清理和产物生命周期。

## 已验证范围

类型检查、模块单元/集成测试、生产构建，以及Chromium生产应用端到端。真实SCM未接入；微前端入口提供mount/unmount，不绑定特定宿主框架。

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

## 整页海报模板与可填充坑位

新增poster-blue、poster-pink两套海报模板。背景、装饰、主视觉区、白色内容框、重点信息、贴士、资料与页脚是整套HTML/CSS模板的组成部分。每个白框中的标题、正文、图片属于PosterData内容槽位，配置通过Zod校验，不允许任意HTML/CSS。

Material和Task新增可选poster快照。模板选择及填充内容不改写Markdown解析器；原有Markdown自由编排模式继续使用。海报表单由解析结果生成初始内容，之后独立维护，可在模板间保留填写内容。每篇素材可选择不同模板并参加同一批次，上传重试沿用已缓存图片。

白色框使用正常文档流，长文自动撑高。图片可作为图标与正文并排，也可填满框内并隐藏该框文字。背景、主视觉、品牌标识均可独立上传；默认图标为占位装饰，不含原参考图中的医生插画或药品图表。参考图中的这些专业素材需要由运营上传。当前不承诺对参考图逐像素复刻。

「导出可编辑素材包」保存Markdown、图片和d2p.project.json清单。重新导入ZIP可恢复每篇模板和PosterData。此包与结果管理中的成品图片ZIP不同，专门用于保留可编辑内容。当前支持每张海报1–12个白色内容框，单张上传素材10MiB、1600万像素。

## 制作记录与导出解耦

新增Creation存储，包含作品ID、保存时间、版本、文案/海报配置、图片素材快照、导出格式与倍率。首页选择模板会初始化新的制作内容，首次保存新增素材记录；从素材列表打开已有素材后，保存更新原记录并递增版本，不新增记录。新素材首次保存后继续保存也更新同一条记录。预览页保存不生成Canvas，素材列表支持重新编辑及选择单个或多个素材生成URL。

导出任务绑定creationId与creationRevision，截图时为每个作品单独创建资源Object URL并在finally释放，不再依赖当前编辑器中的图片。批次快照持久化，刷新后的上传重试仍可访问原版本资源。成功URL仅回填到匹配版本，修改作品后旧URL不作为当前版本结果。失败和取消状态保存在作品中。

图片下载与生成URL分离，下载使用已有URL；同一版本已经生成URL时直接复用。制作记录和累计导出历史分别保存。前者用于继续编辑，后者用于审计与交付清单，旧版只有URL的结果不伪造可编辑源内容。

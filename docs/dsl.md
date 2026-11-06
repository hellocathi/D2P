# Markdown DSL v1

## 文档头

文件以 YAML Frontmatter 开始。必填字段：id、title、author、publishDate。id 为字母或数字开头，后接字母、数字、下划线或连字符，最长 128 字符。日期为有效的 YYYY-MM-DD，推荐加引号。

```yaml
---
id: article-001
title: 健康知识
author: 编辑部
publishDate: "2026-11-05"
page:
  width: 750
  background: "#FFFFFF"
theme:
  primary: "#176B87"
  text: "#243447"
---
```

page 和 theme 可省略并采用以上默认值。宽度为 320–1200 的整数。标题最长 200 字符，作者最长 100 字符。未知字段、重复 YAML 键、自定义标签和别名均报错。

## 指令

无正文模块使用 `::name{key="value"}`。有正文模块使用闭合容器。外层冒号数量应多于内层，避免歧义。指令独占一行，不支持 `:name[...]` 行内模块。所有容器必须显式闭合。

```markdown
::::section{padding="lg"}
:::text{color="$primary"}
正文内容
:::
::::
```

属性以字符串形式完整写在指令同一行；解析器只对指定字段转换整数和布尔值，不进行任意类型强制转换。重复属性报错。不要配置 id、type、source、style、children、content、text、items；这些字段由系统或正文生成。

## 模块

所有属性均可省略，除非标记为必填。variant 只允许本表中的值。

| Directive / 类型 | 正文 | 属性 |
| --- | --- | --- |
| article-header / ArticleHeader | 无 | title、subtitle；variant=standard/centered |
| hero / Hero | 无 | 必填 src、alt；图片公共属性；variant=plain/rounded |
| section / Section | 子模块 | backgroundImage；variant=plain/tinted |
| section-title / SectionTitle | 一个富文本段落 | level=2/3/4，默认2；number=1–999；variant=standard/accent/numbered |
| content-card / ContentCard | 子模块 | variant=plain/bordered/elevated |
| text / Text | 纯文本段落 | variant=body/lead/caption |
| rich-text / RichText | 受限富文本 | variant=standard/compact |
| image / Image | 无 | 必填 src、alt；图片公共属性 |
| image-grid / ImageGrid | 非空 Image 子模块 | columns=1–4，默认2 |
| list / List | 一个 Markdown 列表 | ordered、start 必须与正文一致；variant=standard/checklist |
| callout / Callout | 受限富文本 | title；variant=info/success/warning |
| quote / Quote | 受限富文本 | attribution；variant=standard/accent |
| row / Row | 1–4 个 Column | verticalAlign=start/center/end/stretch |
| column / Column | 子模块 | weight=1–12，默认1；只能直接位于 Row |
| divider / Divider | 无 | variant=solid/dashed |
| spacer / Spacer | 无 | height=0–400，默认24 |
| references / References | 一个 Markdown 列表，每项一个段落 | title |
| disclaimer / Disclaimer | 受限富文本 | variant=standard/muted |
| footer / Footer | 受限富文本 | variant=standard/centered |

图片公共属性：caption（最长500字符）、width（1–2400整数）、height（1–4800整数）、aspectRatio=1:1/4:3/3:4/16:9、fit=contain/cover。alt 为非空替代文本，最长500字符。

## 样式

受控样式作为指令属性直接书写，不能传入原始 style 字符串。

| 属性 | 允许值 |
| --- | --- |
| color / background | #RGB、#RRGGBB 或 $primary/$text/$surface/$muted |
| fontSize | sm/md/lg/xl/title，或 12–72 的整数 |
| fontWeight | 400/500/600/700 |
| padding / paddingX / paddingY | none/xs/sm/md/lg/xl |
| margin / marginTop / marginBottom / gap | none/xs/sm/md/lg/xl |
| radius | none/sm/md/lg/pill |
| align | left/center/right |

间距 Token：0/4/8/16/24/40px；字号 Token：14/18/24/32/48px；圆角：0/4/12/24/9999px。primary/text 来自主题，surface/muted 将由后续渲染器提供默认颜色。主题自身只允许具体十六进制颜色。

## 普通 Markdown 与富文本

正文段落自动转换 Text；含强调或链接的段落转换 RichText；二至四级标题转换 SectionTitle；列表、引用和水平线转换对应模块。一级标题使用 ArticleHeader 表达。

富文本支持段落、粗体、斜体、换行、HTTPS 链接、页内锚点、有序/无序列表和列表嵌套。保存为结构化节点，不存储 HTML。列表 start 为 1–9999，每个列表最多500项。

普通正文中的 Markdown 图片转换 Image；与文字混排时按源顺序拆分模块。RichText 内图片需改为独立 Image 模块，不能被静默丢弃。Text 内强调等格式需改用 RichText。

不支持原始 HTML、代码块、行内代码、引用式链接、表格、脚本、自定义 CSS 等扩展语法；发现相应 AST 节点时报错。

## 素材路径和限制

src/backgroundImage 支持包内相对路径或无凭据 HTTPS URL。包内路径相对于 Markdown 所在目录，允许在素材包范围内使用 `../`。拒绝越过包根目录、绝对路径、Windows 路径、data URL、协议相对 URL、双重编码及本地查询字符串。

解析器不访问网络或文件系统。传入 `availableAssets` 后校验本地素材存在性；外部图片的 CORS、加载和解码由后续渲染阶段验证。

当前上限：源文件1 MiB、AST 5000节点、AST 嵌套24层、模块5000个、模块嵌套24层、每个文本字段50000字符、每篇200份不同素材。AST 深度包括段落、列表项、富文本结构，因此不能将所有层级预算均用于容器。

## 诊断

失败返回 `ok:false` 与 diagnostics，每项包含 code、message、file、line、column 和可选 path。行列从1开始。模块属性错误定位到指令起点；Frontmatter 字段错误尽量定位到 YAML 值，缺失字段回退到最近父对象。

单篇遇到不支持的语法立即停止转换；同一模块的多个属性错误会一并返回。失败不返回部分 PageSchema。批量调用方应逐篇收集结果。

---
id: layout-showcase
title: 模块与嵌套布局示例
author: D2P 示例
publishDate: "2026-11-05"
---

::article-header

:::text{variant="lead" fontSize="24" color="$primary"}
这份示例展示图文、双列和卡片组合，仅用于验证 DSL 与布局数据。
:::

::::::section{padding="lg" gap="md" background="$surface"}
:::::row{gap="md" verticalAlign="stretch"}
::::column{weight="1"}
:::content-card{variant="bordered" padding="md"}
## 日常记录

记录日常状态，便于与专业人员沟通。
:::
::::
::::column{weight="1"}
:::content-card{variant="elevated" padding="md"}
## 专业评估

健康问题请咨询专业医务人员。
:::
::::
:::::
::::::

:::image-grid{columns="2" gap="sm"}
::image{src="../basic/assets/cover.png" alt="第一幅占位示意图" fit="cover" aspectRatio="4:3"}

::image{src="../basic/assets/cover.png" alt="第二幅占位示意图" fit="contain" width="320"}
:::

:::list{variant="checklist"}
- 记录内容
- 核对来源
  - 检查引用链接
  - 检查发布时间
:::

:::quote{attribution="示例编辑部" variant="accent"}
清晰表达、准确引用、谨慎发布。
:::

::divider{variant="dashed"}

::spacer{height="32"}

:::rich-text{variant="compact"}
支持 **重点**、*强调* 和 [HTTPS 链接](https://example.com)。
:::

:::disclaimer
示例中的健康内容不构成个体诊疗或用药建议。
:::

:::footer
D2P 模块示例
:::

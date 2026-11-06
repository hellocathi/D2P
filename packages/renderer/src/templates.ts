import type { ModuleNode, PageSchema } from "@d2p/contracts";
interface Slots {
  header: ModuleNode[];
  hero: ModuleNode[];
  body: ModuleNode[];
  notes: ModuleNode[];
  uid: () => string;
}
interface TemplateDefinition {
  name: string;
  description: string;
  compose: (slots: Slots) => ModuleNode[];
}
const banner = (s: Slots, text: string, background: string): ModuleNode => ({
  id: s.uid(),
  type: "Section",
  props: {},
  style: { padding: "lg", background },
  children: [{ id: s.uid(), type: "Text", props: { text, variant: "lead" } }],
});
const card = (
  s: Slots,
  children: ModuleNode[],
  variant: "bordered" | "elevated",
): ModuleNode => ({
  id: s.uid(),
  type: "ContentCard",
  props: { variant },
  style: { padding: "lg", margin: "md", radius: "lg" },
  children,
});
export const TemplateRegistry = {
  classic: {
    name: "经典科普",
    description: "保留模块原始编排",
    compose: (s: Slots) => [...s.header, ...s.hero, ...s.body, ...s.notes],
  },
  journal: {
    name: "健康期刊",
    description: "刊头与封面、阅读正文、资料页脚",
    compose: (s: Slots) => [
      ...s.header,
      banner(s, "健康生活 · 专题阅读", "#F0F8FA"),
      ...s.hero,
      card(s, s.body, "bordered"),
      ...s.notes,
    ],
  },
  campaign: {
    name: "主题宣传",
    description: "主题横幅与封面卡片、内容区、声明区",
    compose: (s: Slots) => [
      banner(s, "关爱健康 · 主题精选", "#FFF7ED"),
      card(s, [...s.header, ...s.hero], "elevated"),
      {
        id: s.uid(),
        type: "Section",
        props: {},
        style: { padding: "lg", background: "#FFFBF5" },
        children: s.body,
      },
      card(s, s.notes, "bordered"),
    ],
  },
} satisfies Record<string, TemplateDefinition>;
export const templates = TemplateRegistry;
export type TemplateId = keyof typeof TemplateRegistry;
export function applyTemplate(
  page: PageSchema,
  id: TemplateId = "classic",
): PageSchema {
  if (!Object.hasOwn(templates, id)) throw Error("未知模板");
  if (id === "classic") return page;
  const ids = new Set<string>();
  const walk = (nodes: ModuleNode[]) =>
    nodes.forEach((n) => {
      ids.add(n.id);
      if (n.children) walk(n.children);
    });
  walk(page.nodes);
  let count = 0;
  const uid = () => {
    let value;
    do {
      value = `template-${++count}`;
    } while (ids.has(value));
    ids.add(value);
    return value;
  };
  const slots: Slots = { header: [], hero: [], body: [], notes: [], uid };
  for (const node of page.nodes) {
    if (node.type === "ArticleHeader") slots.header.push(node);
    else if (node.type === "Hero") slots.hero.push(node);
    else if (["References", "Disclaimer", "Footer"].includes(node.type))
      slots.notes.push(node);
    else slots.body.push(node);
  }
  return { ...page, nodes: templates[id].compose(slots) };
}

import { Poster } from "./Poster";
import type { PosterData } from "@d2p/contracts";
import { applyTemplate, type TemplateId } from "./templates";
export * from "./templates";
import { createElement, type CSSProperties, type ReactNode } from "react";
import {
  fontSizeTokens,
  radiusTokens,
  spacingTokens,
  type AssetRef,
  type ControlledStyle,
  type InlineNode,
  type ModuleNode,
  type ModuleType,
  type PageSchema,
  type RichBlock,
} from "@d2p/contracts";
import css from "./styles.module.css";
export type AssetResolver = (ref: AssetRef) => string;
export interface RenderContext {
  page: PageSchema;
  resolve: AssetResolver;
}
export function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) =>
        n.type === "text" ? (
          n.value
        ) : n.type === "break" ? (
          <br key={i} />
        ) : n.type === "link" ? (
          <a key={i} href={n.href} rel="noreferrer">
            <Inline nodes={n.children} />
          </a>
        ) : (
          createElement(
            n.type === "strong" ? "strong" : "em",
            { key: i },
            <Inline nodes={n.children} />,
          )
        ),
      )}
    </>
  );
}
export function Rich({ blocks }: { blocks: RichBlock[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.type === "paragraph" ? (
          <p key={i}>
            <Inline nodes={b.children} />
          </p>
        ) : (
          createElement(
            b.ordered ? "ol" : "ul",
            { key: i, ...(b.ordered ? { start: b.start } : {}) },
            b.items.map((item, j) => (
              <li key={j}>
                <Rich blocks={item} />
              </li>
            )),
          )
        ),
      )}
    </>
  );
}
export function color(value: string, page: PageSchema) {
  return (
    (
      {
        $primary: page.theme.primary,
        $text: page.theme.text,
        $surface: "#ffffff",
        $muted: "#64748b",
      } as Record<string, string>
    )[value] ?? value
  );
}
function style(
  s: ControlledStyle | undefined,
  page: PageSchema,
): CSSProperties {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(s ?? {})) {
    if (v === undefined) continue;
    if (
      [
        "padding",
        "paddingX",
        "paddingY",
        "margin",
        "marginTop",
        "marginBottom",
        "gap",
      ].includes(k)
    ) {
      const n = spacingTokens[v as keyof typeof spacingTokens];
      if (k === "paddingX") {
        out.paddingLeft = n;
        out.paddingRight = n;
      } else if (k === "paddingY") {
        out.paddingTop = n;
        out.paddingBottom = n;
      } else out[k] = n;
    } else if (k === "color" || k === "background")
      out[k] = color(String(v), page);
    else if (k === "radius")
      out.borderRadius = radiusTokens[v as keyof typeof radiusTokens];
    else if (k === "align") out.textAlign = v;
    else if (k === "fontSize")
      out.fontSize =
        typeof v === "number"
          ? v
          : fontSizeTokens[v as keyof typeof fontSizeTokens];
    else out[k] = v;
  }
  return out;
}
function content(n: ModuleNode, c: RenderContext): ReactNode {
  const p = n.props;
  const children = n.children?.map((child) => (
    <Module key={child.id} node={child} context={c} />
  ));
  switch (n.type) {
    case "ArticleHeader":
      return (
        <header>
          <h1>{n.props.title ?? c.page.metadata.title}</h1>
          {n.props.subtitle && <p>{n.props.subtitle}</p>}
          <small>
            {c.page.metadata.author} · {c.page.metadata.publishDate}
          </small>
        </header>
      );
    case "Hero":
    case "Image":
      return (
        <figure>
          <img
            crossOrigin="anonymous"
            src={c.resolve(n.props.src)}
            alt={n.props.alt}
            style={{
              width: n.props.width ?? "100%",
              height: n.props.height,
              aspectRatio: n.props.aspectRatio?.replace(":", "/"),
              objectFit: n.props.fit ?? "cover",
            }}
          />
          {n.props.caption && (
            <figcaption className={css.caption}>{n.props.caption}</figcaption>
          )}
        </figure>
      );
    case "SectionTitle":
      return createElement(
        `h${n.props.level}`,
        {},
        <>
          {n.props.variant === "numbered" && `${n.props.number ?? 1}. `}
          <Inline nodes={n.props.content} />
        </>,
      );
    case "Text":
      return <p>{n.props.text}</p>;
    case "RichText":
    case "Disclaimer":
    case "Footer":
      return <Rich blocks={n.props.content} />;
    case "Callout":
      return (
        <aside>
          {n.props.title && <strong>{n.props.title}</strong>}
          <Rich blocks={n.props.content} />
        </aside>
      );
    case "Quote":
      return (
        <blockquote>
          <Rich blocks={n.props.content} />
          {n.props.attribution && <cite>{n.props.attribution}</cite>}
        </blockquote>
      );
    case "List":
      return createElement(
        n.props.ordered ? "ol" : "ul",
        { ...(n.props.ordered ? { start: n.props.start } : {}) },
        n.props.items.map((item, i) => (
          <li key={i}>
            <Rich blocks={item} />
          </li>
        )),
      );
    case "References":
      return (
        <section>
          <h3>{n.props.title ?? "参考资料"}</h3>
          <ol>
            {n.props.items.map((item, i) => (
              <li key={i}>
                <Inline nodes={item} />
              </li>
            ))}
          </ol>
        </section>
      );
    case "Divider":
      return (
        <hr
          style={{
            border: 0,
            borderTop: `1px ${n.props.variant ?? "solid"} #cbd5e1`,
          }}
        />
      );
    case "Spacer":
      return <div style={{ height: n.props.height }} />;
    default:
      void p;
      return children;
  }
}
const base: Partial<Record<ModuleType, string>> = {
  ArticleHeader: "header",
  Hero: "image",
  ContentCard: "card",
  Section: "section",
  Row: "row",
  Column: "column",
  ImageGrid: "grid",
  Callout: "callout",
  Disclaimer: "footer",
  Footer: "footer",
};
type Component = (props: {
  node: ModuleNode;
  context: RenderContext;
}) => ReactNode;
// Explicit registration makes omission of any module a TypeScript error.
const component: Component = ({ node, context }) => content(node, context);
export const ModuleRegistry: Record<ModuleType, Component> = {
  ArticleHeader: component,
  Hero: component,
  Section: component,
  SectionTitle: component,
  ContentCard: component,
  Text: component,
  RichText: component,
  Image: component,
  ImageGrid: component,
  List: component,
  Callout: component,
  Quote: component,
  Row: component,
  Column: component,
  Divider: component,
  Spacer: component,
  References: component,
  Disclaimer: component,
  Footer: component,
};
function Module({
  node,
  context,
}: {
  node: ModuleNode;
  context: RenderContext;
}) {
  const Component = ModuleRegistry[node.type];
  const extra: CSSProperties = {};
  if (node.type === "Column") extra.flex = node.props.weight;
  if (node.type === "Row")
    extra.alignItems = node.props.verticalAlign ?? "stretch";
  if (node.type === "ImageGrid")
    extra.gridTemplateColumns = `repeat(${node.props.columns},minmax(0,1fr))`;
  if (node.type === "Section" && node.props.backgroundImage)
    extra.backgroundImage = `url(${JSON.stringify(context.resolve(node.props.backgroundImage))})`;
  const variant = "variant" in node.props ? node.props.variant : undefined;
  return (
    <div
      data-module={node.type}
      className={[css.node, css[base[node.type] ?? ""], css[variant ?? ""]]
        .filter(Boolean)
        .join(" ")}
      style={{ ...extra, ...style(node.style, context.page) }}
    >
      <Component node={node} context={context} />
    </div>
  );
}
export function PageRenderer({
  page: input,
  resolve,
  templateId = "classic",
  poster,
}: {
  page: PageSchema;
  resolve: AssetResolver;
  templateId?: TemplateId;
  poster?: PosterData | undefined;
}) {
  if (templateId === "poster-blue" || templateId === "poster-pink")
    return (
      <Poster
        page={input}
        data={poster}
        resolve={resolve}
        pink={templateId === "poster-pink"}
      />
    );
  const page = applyTemplate(input, templateId);
  return (
    <article
      data-page-id={page.metadata.id}
      className={css.page}
      style={
        {
          width: page.page.width,
          background: color(page.page.background, page),
          color: page.theme.text,
          "--primary": page.theme.primary,
        } as CSSProperties
      }
    >
      {page.nodes.map((node) => (
        <Module key={node.id} node={node} context={{ page, resolve }} />
      ))}
    </article>
  );
}

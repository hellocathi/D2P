import {
  posterSchema,
  defaultPoster,
  type PosterData,
  type PageSchema,
  type AssetRef,
} from "@d2p/contracts";
import css from "./Poster.module.css";
export function Poster({
  page,
  data,
  resolve,
  pink,
}: {
  page: PageSchema;
  data?: PosterData | undefined;
  resolve: (ref: AssetRef) => string;
  pink: boolean;
}) {
  const result = posterSchema.safeParse(data ?? defaultPoster(page));
  if (!result.success)
    return (
      <article data-page-id={page.metadata.id} role="alert">
        海报内容配置无效，请检查填写内容。
      </article>
    );
  const p = result.data;
  return (
    <article
      data-page-id={page.metadata.id}
      data-poster={pink ? "pink" : "blue"}
      className={`${css.poster} ${pink ? css.pink : css.blue}`}
      style={{
        width: page.page.width,
        ...(p.backgroundImage
          ? {
              backgroundImage: `url(${JSON.stringify(resolve(p.backgroundImage))})`,
            }
          : {}),
      }}
    >
      <header className={css.top}>
        <p className={css.eyebrow}>{p.eyebrow}</p>
        <h1 className={css.title}>{p.title}</h1>
        <p className={css.subtitle}>{p.subtitle}</p>
      </header>
      <section className={css.intro}>
        <div className={css.introText}>
          <strong>
            {pink ? "这份健康知识，与你有关" : "WHAT’S HERE / 本期关注"}
          </strong>
          {p.intro}
        </div>
        <figure className={css.hero}>
          {p.heroImage ? (
            <img
              crossOrigin="anonymous"
              src={resolve(p.heroImage)}
              alt="主视觉"
            />
          ) : (
            <div className={css.emptyHero} aria-label="待上传主视觉">
              ✚
            </div>
          )}
        </figure>
      </section>
      <div className={css.slots}>
        {p.cards.map((card, i) => (
          <section className={css.card} data-slot={`card-${i + 1}`} key={i}>
            {card.imageOnly && card.image ? (
              <img
                className={css.replace}
                crossOrigin="anonymous"
                src={resolve(card.image)}
                alt={card.title || `坑位 ${i + 1}`}
              />
            ) : (
              <>
                <div className={css.icon}>
                  {card.image ? (
                    <img
                      crossOrigin="anonymous"
                      src={resolve(card.image)}
                      alt={card.title}
                    />
                  ) : (
                    <span className={css.symbol}>
                      {["♡", "✚", "✓", "✦"][i % 4]}
                    </span>
                  )}
                </div>
                <div className={css.cardText}>
                  <h2>{card.title}</h2>
                  <p>{card.body}</p>
                </div>
              </>
            )}
          </section>
        ))}
      </div>
      <section className={css.stat}>
        <div className={css.statTitle}>{p.statTitle}</div>
        <div className={css.statValue}>{p.statValue}</div>
        <p>{p.statBody}</p>
        <div className={css.bar} aria-hidden="true">
          <span />
        </div>
      </section>
      <section className={css.tips}>
        <h2>{p.tipsTitle}</h2>
        <ul>
          {p.tips.filter(Boolean).map((tip, i) => (
            <li key={i}>
              <span className={css.check}>☑</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </section>
      <div className={css.references}>{p.references}</div>
      <footer className={css.footer}>
        {p.logoImage && (
          <img
            className={css.logo}
            crossOrigin="anonymous"
            src={resolve(p.logoImage)}
            alt="品牌标识"
          />
        )}
        {p.footer}
      </footer>
    </article>
  );
}

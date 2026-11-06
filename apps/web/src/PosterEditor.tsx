import type { AssetRef, PosterData } from "@d2p/contracts";
import css from "./PosterEditor.module.css";
export function PosterEditor({
  data,
  onChange,
  onUpload,
  disabled,
}: {
  data: PosterData;
  onChange: (data: PosterData) => void;
  onUpload: (file: File, assign: (ref: AssetRef) => PosterData) => void;
  disabled: boolean;
}) {
  const field = (
    key:
      | "title"
      | "subtitle"
      | "eyebrow"
      | "intro"
      | "statTitle"
      | "statValue"
      | "statBody"
      | "tipsTitle"
      | "references"
      | "footer",
    label: string,
    multiline = false,
  ) => (
    <label>
      {label}
      {multiline ? (
        <textarea
          aria-label={label}
          maxLength={key === "title" ? 160 : 6000}
          value={data[key]}
          onChange={(e) => onChange({ ...data, [key]: e.target.value })}
        />
      ) : (
        <input
          aria-label={label}
          maxLength={key === "subtitle" ? 300 : 160}
          value={data[key]}
          onChange={(e) => onChange({ ...data, [key]: e.target.value })}
        />
      )}
    </label>
  );
  const image = (
    label: string,
    ref: AssetRef | undefined,
    assign: (ref: AssetRef | undefined) => PosterData,
  ) => (
    <div className={css.image}>
      <label>
        {label}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file, (r) => assign(r));
            e.target.value = "";
          }}
        />
      </label>
      {ref && (
        <>
          <small>{ref.path}</small>
          <button type="button" onClick={() => onChange(assign(undefined))}>
            移除{label}
          </button>
        </>
      )}
    </div>
  );
  function picture(
    key: "heroImage" | "backgroundImage" | "logoImage",
    value: AssetRef | undefined,
  ) {
    const next = { ...data };
    if (value) next[key] = value;
    else delete next[key];
    return next;
  }
  function cardPicture(i: number, value: AssetRef | undefined) {
    const next = { ...data, cards: data.cards.map((c) => ({ ...c })) };
    if (value) next.cards[i]!.image = value;
    else {
      delete next.cards[i]!.image;
      next.cards[i]!.imageOnly = false;
    }
    return next;
  }
  return (
    <fieldset className={css.editor} disabled={disabled}>
      <legend>海报内容填充</legend>
      <p>
        背景、装饰和白色坑位由整套模板提供。你只需填写文字或上传图片；内容框会自动撑高。
      </p>
      <section>
        <h3>封面与大背景</h3>
        {field("eyebrow", "顶部栏目")}
        {field("title", "海报主标题", true)}
        {field("subtitle", "副标题")}
        {field("intro", "专题导语", true)}
        {image("主视觉图片", data.heroImage, (r) => picture("heroImage", r))}
        {image("整页背景图片", data.backgroundImage, (r) =>
          picture("backgroundImage", r),
        )}
      </section>
      {data.cards.map((card, i) => (
        <section key={i}>
          <h3>白色坑位 {i + 1}</h3>
          <button
            type="button"
            disabled={data.cards.length <= 1}
            onClick={() =>
              onChange({ ...data, cards: data.cards.filter((_, j) => j !== i) })
            }
          >
            移除坑位 {i + 1}
          </button>
          <label>
            坑位 {i + 1} 标题
            <input
              maxLength={160}
              value={card.title}
              onChange={(e) =>
                onChange({
                  ...data,
                  cards: data.cards.map((c, j) =>
                    j === i ? { ...c, title: e.target.value } : c,
                  ),
                })
              }
            />
          </label>
          <label>
            坑位 {i + 1} 正文
            <textarea
              aria-label={`坑位 ${i + 1} 正文`}
              maxLength={6000}
              value={card.body}
              onChange={(e) =>
                onChange({
                  ...data,
                  cards: data.cards.map((c, j) =>
                    j === i ? { ...c, body: e.target.value } : c,
                  ),
                })
              }
            />
          </label>
          {image(`坑位 ${i + 1} 图片`, card.image, (r) => cardPicture(i, r))}
          <label className={css.checkbox}>
            <input
              type="checkbox"
              disabled={!card.image}
              checked={card.imageOnly}
              onChange={(e) =>
                onChange({
                  ...data,
                  cards: data.cards.map((c, j) =>
                    j === i ? { ...c, imageOnly: e.target.checked } : c,
                  ),
                })
              }
            />
            图片铺满坑位内部（隐藏该坑位文字）
          </label>
        </section>
      ))}
      <button
        type="button"
        disabled={data.cards.length >= 12}
        onClick={() =>
          onChange({
            ...data,
            cards: [
              ...data.cards,
              {
                title: "新增内容标题",
                body: "请填写正文或上传图片。",
                imageOnly: false,
              },
            ],
          })
        }
      >
        添加白色坑位
      </button>
      <section>
        <h3>重点信息与页脚</h3>
        {field("statTitle", "重点信息标题")}
        {field("statValue", "重点数据或短语")}
        {field("statBody", "重点信息说明", true)}
        {field("tipsTitle", "贴士标题")}
        <label>
          贴士列表（每行一项，最多 8 项）
          <textarea
            value={data.tips.join("\n")}
            onChange={(e) =>
              onChange({
                ...data,
                tips: e.target.value
                  .split("\n")
                  .slice(0, 8)
                  .map((s) => s.slice(0, 500)),
              })
            }
          />
        </label>
        {field("references", "参考资料", true)}
        {field("footer", "页脚品牌文字")}
        {image("品牌标识", data.logoImage, (r) => picture("logoImage", r))}
      </section>
    </fieldset>
  );
}

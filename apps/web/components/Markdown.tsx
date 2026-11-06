import { Fragment, type ReactNode } from "react";

/**
 * Rendu Markdown volontairement simple et sûr : aucun HTML n'est interprété, tout est construit en éléments React.
 * Pris en charge : # ## ### titres, **gras**, *italique*, `code`, [lien](url), ![image](url),
 * listes (- ou 1.), citations (>), séparateur (---) et blocs de code (```).
 */

const SAFE_LINK = /^(https?:\/\/|\/)/i;
const SAFE_IMAGE = /^(\/api\/files\/[0-9a-f-]{36}|https:\/\/)/i;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*\s][^*]*)\*)|(`([^`]+)`)|(!\[([^\]]*)\]\(([^)\s]+)\))|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<strong key={k} className="font-semibold text-cream">{inline(m[2], k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(m[4], k)}</em>);
    else if (m[5]) out.push(<code key={k} className="rounded bg-night-600 px-1.5 py-0.5 font-mono text-[0.85em] text-sand">{m[6]}</code>);
    else if (m[7])
      out.push(
        SAFE_IMAGE.test(m[9]) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={k} src={m[9]} alt={m[8]} className="my-2 inline-block max-h-96 max-w-full rounded-lg border border-night-500" />
        ) : (
          m[0]
        ),
      );
    else if (m[10])
      out.push(
        SAFE_LINK.test(m[12]) ? (
          <a key={k} href={m[12]} target={m[12].startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="text-sand underline underline-offset-2 hover:text-cream">
            {m[11]}
          </a>
        ) : (
          m[0]
        ),
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function lines(parts: string[], key: string): ReactNode[] {
  return parts.map((p, i) => (
    <Fragment key={`${key}-${i}`}>
      {i > 0 && <br />}
      {inline(p, `${key}-${i}`)}
    </Fragment>
  ));
}

export function Markdown({ source }: { source: string }) {
  const src = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let b = 0;

  while (i < src.length) {
    const line = src[i];
    const key = `b${b++}`;

    if (!line.trim()) {
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < src.length && !src[i].startsWith("```")) code.push(src[i++]);
      i++;
      blocks.push(
        <pre key={key} className="overflow-x-auto rounded-lg border border-night-500 bg-night-900 p-3 font-mono text-sm text-cream-muted">
          {code.join("\n")}
        </pre>,
      );
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? "mt-6 font-display text-2xl uppercase tracking-wide text-cream"
          : level === 2
            ? "mt-5 font-display text-xl uppercase tracking-wide text-sand"
            : "mt-4 text-base font-semibold text-cream";
      const content = inline(h[2], key);
      blocks.push(level === 1 ? <h2 key={key} className={cls}>{content}</h2> : level === 2 ? <h3 key={key} className={cls}>{content}</h3> : <h4 key={key} className={cls}>{content}</h4>);
      i++;
      continue;
    }

    if (/^-{3,}\s*$/.test(line)) {
      blocks.push(<hr key={key} className="my-5 border-night-500" />);
      i++;
      continue;
    }

    if (line.startsWith(">")) {
      const q: string[] = [];
      while (i < src.length && src[i].startsWith(">")) q.push(src[i++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={key} className="rounded-r-lg border-l-4 border-sand bg-sand/10 px-4 py-2 text-cream">
          {lines(q, key)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const nested = /^\s{2,}[-*]\s+/.test(line);
      const items: string[] = [];
      while (i < src.length && /^\s*[-*]\s+/.test(src[i])) items.push(src[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(
        <ul key={key} className={nested ? "list-[circle] space-y-1 pl-12 marker:text-sand" : "list-disc space-y-1 pl-6 marker:text-sand"}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      // La numérotation reprend au bon chiffre après une sous-liste (« 5. » reste 5).
      const start = Number(/^\s*(\d+)/.exec(line)?.[1] ?? 1);
      const items: string[] = [];
      while (i < src.length && /^\s*\d+[.)]\s+/.test(src[i])) items.push(src[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={key} start={start} className="list-decimal space-y-1 pl-6 marker:font-semibold marker:text-sand">
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraphe : lignes consécutives jusqu'à une ligne vide ou un autre bloc.
    const para: string[] = [];
    while (
      i < src.length &&
      src[i].trim() &&
      !/^(#{1,3}\s|>|```|-{3,}\s*$|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(src[i])
    )
      para.push(src[i++]);
    if (para.length === 0) {
      // Ligne non reconnue (sécurité) : affichée telle quelle.
      para.push(src[i++]);
    }
    blocks.push(
      <p key={key} className="leading-relaxed">
        {lines(para, key)}
      </p>,
    );
  }

  return <div className="space-y-3 text-[0.95rem] text-cream-muted">{blocks}</div>;
}

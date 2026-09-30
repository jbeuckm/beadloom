// A post's body, with a little formatting: "# " and "## " headings, "- "
// lists, **bold**, *italic*, and links (each with a preview card below).
// Built as React elements, never as HTML, so nothing written can inject markup.

import type { ReactNode } from 'react';
import { LinkCard, URL_RE } from './Comments';

const INLINE = new RegExp(`(${URL_RE.source})|\\*\\*([^*\\n]+)\\*\\*|\\*([^*\\n]+)\\*`, 'gi');

function inline(text: string, links: URL[]): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out.push(text.slice(last, m.index));
    const key = m.index;
    if (m[1]) {
      let url: URL | null = null;
      try {
        url = new URL(m[1]);
      } catch {
        url = null;
      }
      if (url) {
        links.push(url);
        out.push(
          <a key={key} href={url.href} target="_blank" rel="noopener noreferrer nofollow">
            {url.href}
          </a>,
        );
      } else out.push(m[0]);
    } else if (m[2]) out.push(<strong key={key}>{m[2]}</strong>);
    else out.push(<em key={key}>{m[3]}</em>);
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

export default function Markup({ text }: { text: string }) {
  const links: URL[] = [];
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join('\n'), links)}</p>);
    if (list.length)
      blocks.push(
        <ul key={blocks.length}>
          {list.map((li, i) => (
            <li key={i}>{inline(li, links)}</li>
          ))}
        </ul>,
      );
    para = [];
    list = [];
  };
  for (const line of lines) {
    const h = /^(#{1,2})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push(
        h[1].length === 1 ? (
          <h3 key={blocks.length}>{inline(h[2], links)}</h3>
        ) : (
          <h4 key={blocks.length}>{inline(h[2], links)}</h4>
        ),
      );
    } else if (li) {
      if (para.length) flush();
      list.push(li[1]);
    } else if (!line.trim()) flush();
    else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  const unique = [...new Map(links.map((u) => [u.href, u])).values()].slice(0, 6);
  return (
    <div className="markup">
      {blocks}
      {unique.map((u) => (
        <LinkCard key={u.href} url={u} />
      ))}
    </div>
  );
}

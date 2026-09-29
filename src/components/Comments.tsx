// Comments on a design, for signed-in users who can see it; and sharing a
// link to a design.

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store/useStore';
import Avatar from './Avatar';
import { Icon } from './icons';
import { cloud } from '../lib/cloud';
import type { Comment, GalleryItem } from '../lib/cloud/backend';
import { designThumbnail } from '../lib/library';

export default function Comments({ itemId, onCount }: { itemId: string; onCount?: (n: number) => void }) {
  const user = useStore((s) => s.cloudUser);
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!cloud.backend) return;
    try {
      const c = await cloud.backend.comments(itemId);
      setList(c);
      onCount?.(c.length);
    } catch (e) {
      setError((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);
  useEffect(() => {
    if (user) void reload();
  }, [user, reload]);

  if (!user) return <p className="hint comments-signin">Sign in to read and write comments.</p>;

  const post = async (e: FormEvent) => {
    e.preventDefault();
    if (!cloud.backend || !text.trim()) return;
    setBusy(true);
    try {
      const r = await cloud.backend.addComment(itemId, text);
      if (!r.ok) setError(r.error ?? 'Could not post the comment');
      else {
        setText('');
        setError(null);
        await reload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="comments" aria-label="Comments">
      <h3>
        <Icon name="comment" size={15} /> Comments{list?.length ? ` (${list.length})` : ''}
      </h3>
      {list && list.length === 0 && <p className="hint">No comments yet.</p>}
      <ul className="comment-list">
        {list?.map((c) => (
          <li key={c.id}>
            {c.author ? <Avatar user={c.author} size={28} /> : <span className="avatar initial" style={{ width: 28, height: 28 }} />}
            <div className="comment-body">
              <span className="comment-head">
                <b>{c.author ? '@' + c.author.username : 'someone'}</b>
                <span className="hint">{new Date(c.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </span>
              <CommentText body={c.body} />
            </div>
            {c.canDelete && (
              <button
                className="btn ghost mini"
                aria-label="Delete comment"
                onClick={() => {
                  if (!confirm('Delete this comment?')) return;
                  cloud.backend
                    ?.deleteComment(c.id)
                    .then(reload)
                    .catch((e) => setError((e as Error).message));
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <form className="comment-form" onSubmit={post}>
        <textarea
          aria-label="Write a comment"
          placeholder="Write a comment…"
          value={text}
          maxLength={2000}
          rows={2}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={busy || !text.trim()}>
          Post
        </button>
      </form>
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** The link that opens a design on the home page (#design=<id>). */
export const designLink = (id: string) => `${location.origin}${location.pathname}#design=${id}`;
/** The design id in a shared link, if the page was opened with one. */
export const designIdFromUrl = (): string | null =>
  /(?:^|[#&])design=([0-9a-f-]{36})/i.exec(location.hash)?.[1] ?? null;

/** Share a design's link: the system share sheet where there is one, else copy it. */
export function ShareLinkButton({ id, name }: { id: string; name: string }) {
  const notify = useStore((s) => s.notify);
  const share = async () => {
    const url = designLink(id);
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} — Chromattice`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      notify('Link copied');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') prompt('Copy this link:', url);
    }
  };
  return (
    <button className="btn" onClick={() => void share()}>
      <Icon name="link" size={16} /> Share link
    </button>
  );
}

// ---- links in comments -------------------------------------------------------

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

/** A comment's text with its links clickable, and a preview card per link. */
function CommentText({ body }: { body: string }) {
  const parts: Array<string | URL> = [];
  let last = 0;
  for (const m of body.matchAll(URL_RE)) {
    let url: URL | null = null;
    try {
      url = new URL(m[0]);
    } catch {
      url = null;
    }
    if (!url) continue;
    parts.push(body.slice(last, m.index), url);
    last = m.index! + m[0].length;
  }
  parts.push(body.slice(last));
  const links = [...new Map(parts.filter((p): p is URL => p instanceof URL).map((u) => [u.href, u])).values()];
  return (
    <>
      <p>
        {parts.map((p, i) =>
          typeof p === 'string' ? (
            p
          ) : (
            <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow">
              {p.href}
            </a>
          ),
        )}
      </p>
      {links.slice(0, 3).map((u) => (
        <LinkCard key={u.href} url={u} />
      ))}
    </>
  );
}

/** Our own design links get the design itself; anything else, where it goes. */
function LinkCard({ url }: { url: URL }) {
  const own = url.origin === location.origin && url.pathname === location.pathname;
  const id = own ? /(?:^|[#&])design=([0-9a-f-]{36})/i.exec(url.hash)?.[1] : undefined;
  return id ? <DesignCard id={id} /> : <SiteCard url={url} />;
}

function SiteCard({ url }: { url: URL }) {
  // a static site can't read other sites' pages (no server to fetch their
  // titles or images), so the card says where the link goes
  const path = decodeURIComponent(url.pathname + url.search).replace(/\/$/, '');
  return (
    <a className="link-card" href={url.href} target="_blank" rel="noopener noreferrer nofollow">
      <span className="link-card-icon">
        <Icon name="link" size={22} />
      </span>
      <span className="link-card-text">
        <b>{url.hostname.replace(/^www\./, '')}</b>
        {path && <span className="hint">{path}</span>}
      </span>
    </a>
  );
}

function DesignCard({ id }: { id: string }) {
  const [d, setD] = useState<GalleryItem | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    cloud.backend
      ?.design(id)
      .then((x) => live && setD(x))
      .catch(() => live && setD(null));
    return () => {
      live = false;
    };
  }, [id]);
  const thumb = useMemo(() => (d ? designThumbnail(JSON.stringify(d.doc), 112) : null), [d]);
  if (d === undefined) return null;
  const name = d ? String((d.doc as { meta?: { name?: string } })?.meta?.name || 'Untitled Pattern') : '';
  return d ? (
    <a className="link-card" href={designLink(id)}>
      {thumb ? <img src={thumb} alt="" /> : <span className="link-card-icon" />}
      <span className="link-card-text">
        <b>{name}</b>
        <span className="hint">
          {d.owner ? `@${d.owner.username} · ` : ''}Chromattice design
        </span>
      </span>
    </a>
  ) : (
    <span className="link-card">
      <span className="link-card-icon">
        <Icon name="lock" size={20} />
      </span>
      <span className="link-card-text">
        <b>A Chromattice design</b>
        <span className="hint">Private, or no longer shared</span>
      </span>
    </span>
  );
}

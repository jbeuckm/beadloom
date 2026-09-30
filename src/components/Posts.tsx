// The journal: posts about designs. Home lists them (everyone's you can read,
// or just yours, drafts included); a post opens to read; its author edits it.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import Avatar from './Avatar';
import Markup from './Markup';
import { Icon } from './icons';
import { ShareLinkButton } from './Comments';
import { ReportButton } from './Moderation';
import { cloud } from '../lib/cloud';
import type { GalleryItem, Post, PostVisibility } from '../lib/cloud/backend';
import { cloudDesigns, designThumbnail, isInTrash } from '../lib/library';

const MAX_DESIGNS = 12;
const VISIBILITY: Array<{ v: PostVisibility; label: string; hint: string }> = [
  { v: 'draft', label: 'Draft', hint: 'Only you' },
  { v: 'friends', label: 'Friends', hint: 'Your friends' },
  { v: 'public', label: 'Anyone', hint: 'Everyone, signed in or not' },
];
const nameOf = (doc: unknown) => String((doc as { meta?: { name?: string } })?.meta?.name || 'Untitled Pattern');
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { dateStyle: 'medium' }) : '');
/** The body as plain text, for a card's excerpt. */
const excerpt = (body: string) =>
  body
    .replace(/^#{1,2}\s+/gm, '')
    .replace(/\*\*?([^*]+)\*\*?/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

/** A post's attached designs, as whoever's reading can see them. */
function useDesigns(ids: string[]) {
  const [map, setMap] = useState<Map<string, GalleryItem | null>>(new Map());
  const key = ids.join(',');
  useEffect(() => {
    let live = true;
    Promise.all(ids.map((id) => cloud.backend!.design(id).catch(() => null))).then((list) => {
      if (live) setMap(new Map(ids.map((id, i) => [id, list[i]])));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}

function Thumb({ item, size }: { item: GalleryItem | null | undefined; size: number }) {
  const src = useMemo(() => (item ? designThumbnail(JSON.stringify(item.doc), size) : null), [item, size]);
  return <span className="post-thumb">{src ? <img src={src} alt="" /> : <Icon name="lock" size={16} />}</span>;
}

// ---- the list on Home ---------------------------------------------------------

export function Journal({
  openId,
  onOpen,
  onOpenDesign,
}: {
  /** The post being read (from the route: #/journal/<id>), if any. */
  openId: string | null;
  /** Read a post, or none: changes the route. */
  onOpen: (id: string | null) => void;
  onOpenDesign: (id: string) => void;
}) {
  const user = useStore((s) => s.cloudUser);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<Post | null>(null);
  const [editing, setEditing] = useState<Post | 'new' | null>(null);

  const reload = useCallback(() => {
    if (!cloud.backend) return;
    cloud.backend
      .posts({ mine: tab === 'mine', limit: 40 })
      .then((p) => {
        setPosts(p);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, [tab]);
  useEffect(() => {
    if (!user && tab === 'mine') setTab('all');
    reload();
  }, [reload, user, tab]);

  // the route says which post is open: one in the list, or any the reader
  // can see (a shared link; a friends-only post needs signing in first)
  useEffect(() => {
    if (!openId) {
      setReading(null);
      return;
    }
    const listed = posts?.find((p) => p.id === openId);
    if (listed) {
      setReading(listed);
      return;
    }
    if (!cloud.backend) return;
    let live = true;
    cloud.backend
      .post(openId)
      .then((p) => {
        if (!live) return;
        if (p) setReading(p);
        else {
          useStore.getState().notify(user ? "That post isn't available" : 'Sign in to read that post');
          onOpen(null);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, user, posts]);

  return (
    <section className="home-gallery journal" aria-label="Journal">
      <h2>Journal</h2>
      <div className="journal-bar">
        {user && (
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
              Everyone
            </button>
            <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
              Mine
            </button>
          </div>
        )}
        <span className="grow" />
        {user && (
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="pencil" size={16} /> Write a post
          </button>
        )}
      </div>
      {error ? (
        <p className="acct-error">Couldn't load posts: {error}</p>
      ) : !posts ? (
        <p className="hint">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="hint">
          {tab === 'mine' ? "You haven't written anything yet." : 'No posts yet.'}
          {user ? '' : ' Sign in to write about your designs.'}
        </p>
      ) : (
        <ul className="post-list">
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} onClick={() => onOpen(p.id)} />
            </li>
          ))}
        </ul>
      )}
      {reading && (
        <PostView
          post={reading}
          onClose={() => onOpen(null)}
          onEdit={() => {
            setEditing(reading);
            onOpen(null);
          }}
          onDeleted={() => {
            onOpen(null);
            reload();
          }}
          onOpenDesign={onOpenDesign}
        />
      )}
      {editing && (
        <PostEditor
          post={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            setEditing(null);
            reload();
            if (p) {
              setReading(p);
              onOpen(p.id);
            }
          }}
        />
      )}
    </section>
  );
}

function PostCard({ post, onClick }: { post: Post; onClick: () => void }) {
  const designs = useDesigns(post.designIds.slice(0, 4));
  return (
    <button className="post-card" onClick={onClick}>
      <span className="post-card-head">
        <b className="post-title">{post.title}</b>
        {post.visibility !== 'public' && <span className="post-badge">{post.visibility === 'draft' ? 'Draft' : 'Friends'}</span>}
      </span>
      <span className="gallery-by">
        {post.author && (
          <>
            <Avatar user={post.author} size={20} /> @{post.author.username} ·{' '}
          </>
        )}
        {when(post.publishedAt ?? post.updatedAt)}
      </span>
      {post.body && <span className="post-excerpt">{excerpt(post.body)}</span>}
      {post.designIds.length > 0 && (
        <span className="post-thumbs">
          {post.designIds.slice(0, 4).map((id) => (
            <Thumb key={id} item={designs.get(id)} size={96} />
          ))}
          {post.designIds.length > 4 && <span className="hint">+{post.designIds.length - 4}</span>}
        </span>
      )}
    </button>
  );
}

// ---- reading ------------------------------------------------------------------

function PostView({
  post,
  onClose,
  onEdit,
  onDeleted,
  onOpenDesign,
}: {
  post: Post;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  onOpenDesign: (id: string) => void;
}) {
  const user = useStore((s) => s.cloudUser);
  const designs = useDesigns(post.designIds);
  const mine = !!user && user.id === post.authorId;
  return (
    <Modal title={post.title} onClose={onClose} wide>
      <p className="gallery-by post-byline">
        {post.author && (
          <>
            <Avatar user={post.author} size={24} /> @{post.author.username} ·{' '}
          </>
        )}
        {when(post.publishedAt ?? post.updatedAt)}
        {mine && ` · ${VISIBILITY.find((v) => v.v === post.visibility)!.label}`}
      </p>
      {mine && post.hiddenReason && (
        <p className="home-callout suspended">
          A moderator hid this post from everyone else. Reason: {post.hiddenReason}
        </p>
      )}
      <Markup text={post.body} />
      {post.designIds.length > 0 && (
        <ul className="post-designs">
          {post.designIds.map((id) => {
            const d = designs.get(id);
            return (
              <li key={id}>
                <button className="gallery-card" disabled={!d} onClick={() => d && onOpenDesign(id)}>
                  <span className="gallery-thumb">
                    <Thumb item={d} size={220} />
                  </span>
                  <span className="gallery-name">{d ? nameOf(d.doc) : d === null ? 'Not available' : '…'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="actions">
        {post.visibility !== 'draft' && <ShareLinkButton id={post.id} name={post.title} kind="post" />}
        <ReportButton kind="post" targetId={post.id} ownerId={post.authorId} />
        <span className="grow" />
        {mine && (
          <>
            <button
              className="btn"
              onClick={() => {
                if (!confirm(`Delete “${post.title}”? You can’t undo this.`)) return;
                cloud.backend
                  ?.deletePost(post.id)
                  .then(onDeleted)
                  .catch((e) => useStore.getState().notify((e as Error).message));
              }}
            >
              Delete
            </button>
            <button className="btn" onClick={onEdit}>
              Edit
            </button>
          </>
        )}
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

// ---- writing ------------------------------------------------------------------

/** Write a new post (optionally about some Cloud Storage designs) or edit one. */
export function PostEditor({
  post,
  initialPaths = [],
  onClose,
  onSaved,
}: {
  post: Post | null;
  /** Cloud Storage paths (inside the cloud store) to start with attached. */
  initialPaths?: string[];
  onClose: () => void;
  onSaved?: (p: Post | null) => void;
}) {
  const notify = useStore((s) => s.notify);
  const engine = cloud.engine!;
  const backend = cloud.backend!;
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [visibility, setVisibility] = useState<PostVisibility>(post?.visibility ?? 'draft');
  // attached designs by Cloud Storage path; ids not on this device are kept as they are
  const [paths, setPaths] = useState<string[]>(() => {
    const known = (post?.designIds ?? []).map((id) => engine.pathOfId(id)).filter((x) => x?.collection === 'design');
    return [...new Set([...known.map((x) => x!.path), ...initialPaths])];
  });
  const kept = useMemo(() => (post?.designIds ?? []).filter((id) => !engine.pathOfId(id)), [post, engine]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const files = useMemo(
    () =>
      cloudDesigns
        .allFiles()
        .filter((f) => !isInTrash(f.path))
        .sort((a, b) => b.meta.modified - a.meta.modified),
    [],
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const ids: string[] = [];
      for (const p of paths) {
        const id = await engine.ensureUploaded('design', p);
        if (!id) throw new Error(`“${p}” couldn't be uploaded — check your connection and try again.`);
        ids.push(id);
      }
      const r = await backend.savePost({ id: post?.id, title, body, visibility, designIds: [...kept, ...ids] });
      if (!r.ok) {
        setError(r.error ?? 'Could not save the post');
        return;
      }
      notify(visibility === 'draft' ? 'Draft saved' : 'Posted');
      onSaved?.(r.id ? await backend.post(r.id) : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={post ? 'Edit post' : 'Write a post'} onClose={onClose} wide>
      <div className="post-editor">
        <div className="field">
          <label htmlFor="post-title">Title</label>
          <input id="post-title" type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="post-body">Post</label>
          <textarea id="post-body" value={body} maxLength={20000} rows={9} onChange={(e) => setBody(e.target.value)} />
          <span className="hint"># Heading · ## Subheading · - list item · **bold** · *italic* · links get a preview</span>
        </div>
        <div className="field">
          <label>
            Designs ({paths.length + kept.length}/{MAX_DESIGNS})
          </label>
          {files.length === 0 ? (
            <p className="hint">Designs you keep in Cloud Storage can be added here.</p>
          ) : (
            <ul className="post-picker">
              {files.map((f) => {
                const on = paths.includes(f.path);
                return (
                  <li key={f.path}>
                    <label className={'post-pick' + (on ? ' on' : '')}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && paths.length + kept.length >= MAX_DESIGNS}
                        onChange={(e) =>
                          setPaths(e.target.checked ? [...paths, f.path] : paths.filter((p) => p !== f.path))
                        }
                      />
                      {(() => {
                        const src = cloudDesigns.thumbnail(f.path);
                        return <span className="post-thumb">{src && <img src={src} alt="" />}</span>;
                      })()}
                      <span className="post-pick-name">{f.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <span className="hint">Whoever can read the post can see the designs in it.</span>
        </div>
        <div className="field">
          <label>Who can read it</label>
          <div className="seg" role="radiogroup">
            {VISIBILITY.map((o) => (
              <button
                key={o.v}
                role="radio"
                aria-checked={visibility === o.v}
                className={visibility === o.v ? 'on' : ''}
                title={o.hint}
                onClick={() => setVisibility(o.v)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="hint">{VISIBILITY.find((o) => o.v === visibility)!.hint}</span>
        </div>
        {error && (
          <p className="acct-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy || !title.trim()} onClick={() => void save()}>
          {visibility === 'draft' ? 'Save draft' : post?.visibility === visibility ? 'Save' : 'Post'}
        </button>
      </div>
    </Modal>
  );
}


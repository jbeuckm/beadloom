// A returning user's Home: the design they were on, their designs, and — with
// an account — what's happened (activity), what friends are sharing, and
// their journal. The designer stays a focused workspace; this is the overview.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import Avatar from './Avatar';
import { Icon, type IconName } from './icons';
import { PostEditor } from './Posts';
import { linkTarget } from './Comments';
import type { HomeActions } from './Home';
import { cloud, syncOnLook } from '../lib/cloud';
import type { Friend, Post, SharedItem } from '../lib/cloud/backend';
import { readActivityLog, type ActivityKind, type LoggedEvent } from '../lib/cloud/activity';
import { serializeDesign } from '../lib/designFormat';
import { designThumbnail, isInTrash, type FileEntry } from '../lib/library';
import { CLOUD_STORAGE, LOCAL_STORAGE, designLibrary, inCloudStorage } from '../lib/stores';

/** "just now", "5 min ago", "3 h ago", "2 days ago", else the date. */
function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} day${s < 2 * 86400 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="home-section" aria-label={title}>
      <div className="home-section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function PersonalHome(actions: HomeActions) {
  const user = useStore((s) => s.cloudUser);
  useEffect(syncOnLook, []);
  return (
    <div className="personal-home">
      <Continue onClose={actions.onClose} />
      <YourDesigns {...actions} />
      {user && cloud.available && (
        <>
          <Activity {...actions} />
          <FromFriends {...actions} />
          <YourJournal {...actions} />
        </>
      )}
    </div>
  );
}

// ---- the design you were on ---------------------------------------------------

function Continue({ onClose }: { onClose: () => void }) {
  const design = useStore((s) => s.design);
  const slotPath = useStore((s) => s.slotPath);
  const dirty = useStore((s) => s.dirty);
  const thumb = useMemo(() => designThumbnail(serializeDesign(design), 240), [design]);
  const where = slotPath
    ? `${inCloudStorage(slotPath) ? 'Cloud Storage' : 'Local Storage'}${dirty ? ' · unsaved changes' : ''}`
    : 'Not saved yet';
  return (
    <button className="continue-card" onClick={onClose}>
      <span className="continue-thumb">{thumb && <img src={thumb} alt="" />}</span>
      <span className="continue-text">
        <span className="hint">Continue designing</span>
        <b>{design.meta.name || 'Untitled Pattern'}</b>
        <span className="hint">
          {design.loom.columns}×{design.loom.rows} · {where}
        </span>
      </span>
      <Icon name="chevron-right" size={28} />
    </button>
  );
}

// ---- your designs -------------------------------------------------------------

type Where = 'all' | 'local' | 'cloud';
type SortBy = 'recent' | 'name' | 'size';
const COLLAPSED_KEY = 'beadloom.home.collapsed';

/** Every saved design (both stores when signed in), by folder, with filters. */
function YourDesigns({ onClose, onNewDesign, onOpenFiles }: HomeActions) {
  const nonce = useStore((s) => s.libraryNonce);
  const user = useStore((s) => s.cloudUser);
  const [query, setQuery] = useState('');
  const [where, setWhere] = useState<Where>('all');
  const [grid, setGrid] = useState('');
  const [sort, setSort] = useState<SortBy>('recent');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = (folder: string) => {
    const next = new Set(collapsed);
    if (next.has(folder)) next.delete(folder);
    else next.add(folder);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => designLibrary.allFiles().filter((f) => !isInTrash(f.path)), [nonce, user]);
  const gridTypes = useMemo(() => [...new Set(all.map((f) => f.meta.typeLabel))].sort(), [all]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = all.filter(
      (f) =>
        (!q || f.name.toLowerCase().includes(q) || f.folder.toLowerCase().includes(q)) &&
        (where === 'all' || inCloudStorage(f.path) === (where === 'cloud')) &&
        (!grid || f.meta.typeLabel === grid),
    );
    const by: Record<SortBy, (a: FileEntry, b: FileEntry) => number> = {
      recent: (a, b) => b.meta.modified - a.meta.modified,
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
      size: (a, b) => b.meta.sizeValue - a.meta.sizeValue,
    };
    return list.sort(by[sort]);
  }, [all, q, where, grid, sort]);
  // grouped by folder (in the order their designs come); flat while searching
  const groups = useMemo(() => {
    const m = new Map<string, FileEntry[]>();
    for (const f of shown) m.set(f.folder, [...(m.get(f.folder) ?? []), f]);
    const list = [...m];
    if (sort === 'name') list.sort(([a], [b]) => a.localeCompare(b));
    return list;
  }, [shown, sort]);

  const open = (e: FileEntry) => {
    const s = useStore.getState();
    if (s.dirty && e.path !== s.slotPath && !confirm(`Discard unsaved changes and open “${e.name}”?`)) return;
    s.loadFromSlot(e.path);
    onClose();
  };
  const filtering = !!q || where !== 'all' || !!grid;

  return (
    <Section
      title="Your designs"
      action={
        <>
          <button className="btn" onClick={onNewDesign}>
            <Icon name="plus" size={16} /> New design
          </button>
          <button className="btn" onClick={onOpenFiles}>
            <Icon name="folder" size={16} /> All designs…
          </button>
        </>
      }
    >
      {all.length === 0 ? (
        <p className="hint">Nothing saved yet. Designs you save appear here.</p>
      ) : (
        <>
          <div className="design-filters">
            <label className="fb-search">
              <Icon name="search" size={14} />
              <input
                type="search"
                aria-label="Find a design"
                placeholder="Find by name or folder"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {cloud.available && user && (
              <div className="seg" role="radiogroup" aria-label="Where">
                {(['all', 'local', 'cloud'] as const).map((w) => (
                  <button key={w} role="radio" aria-checked={where === w} className={where === w ? 'on' : ''} onClick={() => setWhere(w)}>
                    {w === 'all' ? 'All' : w === 'local' ? 'Local' : 'Cloud'}
                  </button>
                ))}
              </div>
            )}
            {gridTypes.length > 1 && (
              <select aria-label="Grid type" value={grid} onChange={(e) => setGrid(e.target.value)}>
                <option value="">Any grid</option>
                {gridTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortBy)}>
              <option value="recent">Most recent</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
            </select>
            <span className="hint design-count">
              {filtering ? `${shown.length} of ${all.length}` : all.length} design{all.length === 1 ? '' : 's'}
            </span>
          </div>
          {shown.length === 0 ? (
            <p className="hint">No designs match.</p>
          ) : q ? (
            <ul className="design-grid">
              {shown.map((e) => (
                <li key={e.path}>
                  <DesignTile entry={e} showFolder onOpen={open} />
                </li>
              ))}
            </ul>
          ) : (
            groups.map(([folder, files]) => {
              const shut = collapsed.has(folder);
              return (
                <section key={folder} className="design-folder" aria-label={folderLabel(folder)}>
                  <button className="design-folder-head" aria-expanded={!shut} onClick={() => toggle(folder)}>
                    <Icon name="chevron-right" size={14} className={shut ? '' : 'open'} />
                    <Icon name={folderIcon(folder)} size={16} />
                    <b>{folderLabel(folder)}</b>
                    <span className="hint">{files.length}</span>
                  </button>
                  {!shut && (
                    <ul className="design-grid">
                      {files.map((e) => (
                        <li key={e.path}>
                          <DesignTile entry={e} onOpen={open} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          )}
          {user && !all.some((e) => e.path.startsWith(CLOUD_STORAGE + '/')) && (
            <p className="hint">
              These are in Local Storage, on this device only. Move one to Cloud Storage in All designs… to have it
              everywhere, or to share it.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

/** Which store a folder is in, as an icon (no accounts: just a folder). */
function folderIcon(folder: string): IconName {
  const store = folder.split('/')[0];
  return store === CLOUD_STORAGE ? 'cloud' : store === LOCAL_STORAGE ? 'device' : 'folder';
}

/** "Cloud Storage › C64 Homage", "Local Storage", or (no accounts) the folder. */
function folderLabel(folder: string): string {
  if (!folder) return 'Designs';
  return folder.split('/').join(' › ');
}

/** A design, compact; its thumbnail drawn once it scrolls into view. */
function DesignTile({ entry: e, showFolder, onOpen }: { entry: FileEntry; showFolder?: boolean; onOpen: (e: FileEntry) => void }) {
  const [seen, setSeen] = useState(false);
  const watching = useRef<IntersectionObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    watching.current?.disconnect(); // unmounting (el is null), or a new element
    watching.current = null;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return setSeen(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((x) => x.isIntersecting)) return;
        setSeen(true);
        io.disconnect();
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    watching.current = io;
  }, []);
  const src = seen ? designLibrary.thumbnail(e.path) : null;
  const cloudy = inCloudStorage(e.path);
  const badge = useStore((st) => !!st.cloudUser) && cloud.available; // signed out, everything is local
  return (
    <button ref={ref} className="design-tile" onClick={() => onOpen(e)} title={`${e.name} · ${e.meta.sizeLabel}`}>
      <span className="design-tile-thumb">
        {src && <img src={src} alt="" />}
        {badge && (
          <span className={'store-badge ' + (cloudy ? 'cloud' : 'local')}>
            <Icon name={cloudy ? 'cloud' : 'device'} size={12} />
            {cloudy ? 'Cloud' : 'Local'}
          </span>
        )}
      </span>
      <span className="design-tile-name">{e.name}</span>
      <span className="hint">
        {showFolder ? folderLabel(e.folder) : ago(e.meta.modified ? new Date(e.meta.modified).toISOString() : null)}
      </span>
    </button>
  );
}

// ---- activity -----------------------------------------------------------------

const KIND_ICON: Record<ActivityKind, IconName> = {
  friendRequest: 'users',
  friendAccepted: 'users',
  sharedWithMe: 'share',
  comment: 'comment',
  reaction: 'heart',
  friendPost: 'pencil',
};

function Activity({ onSignIn, onOpenItem }: HomeActions) {
  const user = useStore((s) => s.cloudUser)!;
  const username = useStore((s) => s.cloudUsername);
  const notify = useStore((s) => s.notify);
  const [incoming, setIncoming] = useState<Friend[]>([]);
  const [log, setLog] = useState<LoggedEvent[]>(() => readActivityLog(user.id));

  const reload = useCallback(() => {
    setLog(readActivityLog(user.id));
    cloud.backend
      ?.friends()
      .then((f) => setIncoming(f.filter((x) => x.status === 'incoming')))
      .catch(() => setIncoming([]));
  }, [user.id]);
  useEffect(() => {
    reload();
    void cloud.activity?.check(); // news since the last look
    const on = () => reload();
    window.addEventListener('chromattice:activity', on);
    return () => window.removeEventListener('chromattice:activity', on);
  }, [reload]);

  const answer = async (f: Friend, accept: boolean) => {
    try {
      if (accept) await cloud.backend!.acceptFriend(f.user.id);
      else await cloud.backend!.removeFriend(f.user.id);
      notify(accept ? `You and @${f.user.username} are friends` : 'Request declined');
      reload();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const go = (e: LoggedEvent) => {
    if (!e.url) return;
    const t = linkTarget(new URL(e.url).hash);
    if (t.design) onOpenItem('design', t.design);
    else if (t.post) onOpenItem('post', t.post);
  };

  const empty = !incoming.length && !log.length;
  return (
    <Section title="Activity">
      {!username && (
        <p className="home-callout">
          Pick a username so friends can find you.{' '}
          <button className="btn mini" onClick={onSignIn}>
            Choose one
          </button>
        </p>
      )}
      {empty ? (
        <p className="hint">Nothing new. Friend requests, comments and likes on your designs show up here.</p>
      ) : (
        <ul className="activity-list">
          {incoming.map((f) => (
            <li key={'req' + f.user.id} className="activity-item request">
              <Avatar user={f.user} size={32} />
              <span className="activity-text">
                <b>@{f.user.username}</b> wants to be friends
              </span>
              <button className="btn mini" onClick={() => void answer(f, false)}>
                Decline
              </button>
              <button className="btn mini primary" onClick={() => void answer(f, true)}>
                Accept
              </button>
            </li>
          ))}
          {log
            .filter((e) => e.kind !== 'friendRequest') // pending ones are above; answered ones are done
            .slice(0, 8)
            .map((e, i) => (
              <li key={i + e.at}>
                <button className="activity-item" disabled={!e.url} onClick={() => go(e)}>
                  <span className="activity-icon">
                    <Icon name={KIND_ICON[e.kind]} size={18} />
                  </span>
                  <span className="activity-text">
                    <b>{e.title}</b>
                    <span className="hint">{e.body}</span>
                  </span>
                  <span className="hint activity-when">{ago(e.at)}</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </Section>
  );
}

// ---- from friends ---------------------------------------------------------------

function FromFriends({ onSignIn, onOpenItem }: HomeActions) {
  const user = useStore((s) => s.cloudUser)!;
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [shared, setShared] = useState<SharedItem[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => {
    const b = cloud.backend!;
    let live = true;
    Promise.all([b.friends(), b.sharedWithMe(), b.posts({ limit: 30 })])
      .then(([f, s, p]) => {
        if (!live) return;
        const mine = f.filter((x) => x.status === 'friends');
        const ids = new Set(mine.map((x) => x.user.id));
        setFriends(mine);
        setShared(
          s
            .filter((x) => x.collection === 'design')
            .sort((a, b2) => b2.modified.localeCompare(a.modified))
            .slice(0, 8),
        );
        setPosts(p.filter((x) => ids.has(x.authorId) && x.authorId !== user.id).slice(0, 4));
      })
      .catch(() => live && setFriends([]));
    return () => {
      live = false;
    };
  }, [user.id]);

  if (!friends) return null;
  return (
    <Section
      title="From friends"
      action={
        <button className="btn" onClick={onSignIn}>
          <Icon name="users" size={16} /> {friends.length ? 'Friends…' : 'Find friends…'}
        </button>
      }
    >
      {friends.length === 0 ? (
        <p className="hint">Add friends by username in your Account; what they share with you shows up here.</p>
      ) : (
        <>
          <ul className="friend-strip" aria-label="Friends">
            {friends.map((f) => (
              <li key={f.user.id} title={'@' + f.user.username}>
                <Avatar user={f.user} size={40} />
                <span className="hint">@{f.user.username}</span>
              </li>
            ))}
          </ul>
          {shared.length > 0 && (
            <ul className="design-strip">
              {shared.map((d) => (
                <li key={d.id}>
                  <SharedTile item={d} onClick={() => onOpenItem('design', d.id)} />
                </li>
              ))}
            </ul>
          )}
          {posts.length > 0 && (
            <ul className="activity-list">
              {posts.map((p) => (
                <li key={p.id}>
                  <button className="activity-item" onClick={() => onOpenItem('post', p.id)}>
                    {p.author ? <Avatar user={p.author} size={32} /> : <span className="activity-icon" />}
                    <span className="activity-text">
                      <b>{p.title}</b>
                      <span className="hint">
                        @{p.author?.username ?? 'a friend'} posted · {ago(p.publishedAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!shared.length && !posts.length && <p className="hint">Nothing shared with you yet.</p>}
        </>
      )}
    </Section>
  );
}

function SharedTile({ item, onClick }: { item: SharedItem; onClick: () => void }) {
  const thumb = useMemo(() => designThumbnail(JSON.stringify(item.doc), 160), [item.doc]);
  return (
    <button className="design-tile" onClick={onClick}>
      <span className="design-tile-thumb">{thumb && <img src={thumb} alt="" />}</span>
      <span className="design-tile-name">{item.path.split('/').pop()}</span>
      <span className="hint">@{item.owner?.username ?? 'a friend'}</span>
    </button>
  );
}

// ---- your journal -------------------------------------------------------------

function YourJournal({ onOpenItem }: HomeActions) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [writing, setWriting] = useState(false);
  const reload = useCallback(() => {
    cloud.backend
      ?.posts({ mine: true, limit: 4 })
      .then(setPosts)
      .catch(() => setPosts([]));
  }, []);
  useEffect(reload, [reload]);
  if (!posts) return null;
  return (
    <Section
      title="Your journal"
      action={
        <button className="btn" onClick={() => setWriting(true)}>
          <Icon name="pencil" size={16} /> Write a post
        </button>
      }
    >
      {posts.length === 0 ? (
        <p className="hint">Write about a design: how it came together, what it's for.</p>
      ) : (
        <ul className="activity-list">
          {posts.map((p) => (
            <li key={p.id}>
              <button className="activity-item" onClick={() => onOpenItem('post', p.id)}>
                <span className="activity-icon">
                  <Icon name="pencil" size={18} />
                </span>
                <span className="activity-text">
                  <b>{p.title}</b>
                  <span className="hint">
                    {p.visibility === 'draft' ? 'Draft' : p.visibility === 'friends' ? 'Friends' : 'Anyone'} ·{' '}
                    {ago(p.visibility === 'draft' ? p.updatedAt : p.publishedAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {writing && (
        <PostEditor
          post={null}
          onClose={() => setWriting(false)}
          onSaved={() => {
            setWriting(false);
            reload();
          }}
        />
      )}
    </Section>
  );
}

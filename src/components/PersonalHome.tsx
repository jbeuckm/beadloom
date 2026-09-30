// A returning user's Home: the design they were on, their designs, and — with
// an account — what's happened (activity), what friends are sharing, and
// their journal. The designer stays a focused workspace; this is the overview.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import Avatar from './Avatar';
import { Icon, type IconName } from './icons';
import { PostEditor } from './Posts';
import { linkTarget } from './Comments';
import type { HomeActions } from './Home';
import { cloud } from '../lib/cloud';
import type { Friend, Post, SharedItem } from '../lib/cloud/backend';
import { readActivityLog, type ActivityKind, type LoggedEvent } from '../lib/cloud/activity';
import { serializeDesign } from '../lib/designFormat';
import { designThumbnail, type FileEntry } from '../lib/library';
import { CLOUD_STORAGE, designLibrary, inCloudStorage } from '../lib/stores';

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

function YourDesigns({ onClose, onNewDesign, onOpenFiles }: HomeActions) {
  const nonce = useStore((s) => s.libraryNonce);
  const user = useStore((s) => s.cloudUser);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recent = useMemo(() => designLibrary.recent(11), [nonce, user]);
  const open = (e: FileEntry) => {
    const s = useStore.getState();
    if (s.dirty && e.path !== s.slotPath && !confirm(`Discard unsaved changes and open “${e.name}”?`)) return;
    s.loadFromSlot(e.path);
    onClose();
  };
  return (
    <Section
      title="Your designs"
      action={
        <button className="btn" onClick={onOpenFiles}>
          <Icon name="folder" size={16} /> All designs…
        </button>
      }
    >
      <ul className="design-strip">
        <li>
          <button className="design-tile new" onClick={onNewDesign}>
            <span className="design-tile-thumb">
              <Icon name="plus" size={32} />
            </span>
            <span className="design-tile-name">New design</span>
          </button>
        </li>
        {recent.map((e) => (
          <li key={e.path}>
            <button className="design-tile" onClick={() => open(e)}>
              <span className="design-tile-thumb">
                {(() => {
                  const src = designLibrary.thumbnail(e.path);
                  return src && <img src={src} alt="" />;
                })()}
                {cloud.available && (
                  <span className={'store-badge ' + (inCloudStorage(e.path) ? 'cloud' : 'local')}>
                    <Icon name={inCloudStorage(e.path) ? 'cloud' : 'device'} size={12} />
                    {inCloudStorage(e.path) ? 'Cloud' : 'Local'}
                  </span>
                )}
              </span>
              <span className="design-tile-name">{e.name}</span>
              <span className="hint">{ago(e.meta.modified ? new Date(e.meta.modified).toISOString() : null)}</span>
            </button>
          </li>
        ))}
      </ul>
      {recent.length === 0 && <p className="hint">Nothing saved yet. Designs you save appear here.</p>}
      {user && recent.length > 0 && !recent.some((e) => e.path.startsWith(CLOUD_STORAGE + '/')) && (
        <p className="hint">These are in Local Storage, on this device only. Move one to Cloud Storage in All designs… to have it everywhere, or to share it.</p>
      )}
    </Section>
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

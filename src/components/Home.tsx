// The home page, when accounts are available: how to use the app (on this
// device only, or with an account) with what each means, and the public
// gallery of published designs. Shown at launch until a way is chosen, and
// from the Home button after that.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import Avatar from './Avatar';
import { Icon } from './icons';
import { cloud } from '../lib/cloud';
import type { GalleryItem, Reactions } from '../lib/cloud/backend';
import { ReactionBar, ReactionSummary } from './Reactions';
import Comments, { ShareLinkButton } from './Comments';
import { Journal } from './Posts';
import { describeDesign, designThumbnail } from '../lib/library';
import { Logo, Zigzag, pixelScene } from './Brand';
import PersonalHome from './PersonalHome';

export const HOME_MODE_KEY = 'beadloom.homeMode';
export type HomeMode = 'local' | 'account';

export function readHomeMode(): HomeMode | null {
  try {
    const v = localStorage.getItem(HOME_MODE_KEY);
    return v === 'local' || v === 'account' ? v : null;
  } catch {
    return null;
  }
}
const writeHomeMode = (m: HomeMode) => {
  try {
    localStorage.setItem(HOME_MODE_KEY, m);
  } catch {
    /* ignore */
  }
};

/** Shown at launch: accounts exist and no way of working has been picked yet. */
export const homeAtLaunch = () => cloud.available && !readHomeMode();

export type HomePage = 'home' | 'gallery' | 'journal';

// Where the app opens: Home (default), or straight back into the last design.
const LAUNCH_KEY = 'beadloom.launchTo';
export type LaunchTo = 'home' | 'design';
export function readLaunchTo(): LaunchTo {
  try {
    return localStorage.getItem(LAUNCH_KEY) === 'design' ? 'design' : 'home';
  } catch {
    return 'home';
  }
}
export function writeLaunchTo(v: LaunchTo) {
  try {
    localStorage.setItem(LAUNCH_KEY, v);
  } catch {
    /* ignore */
  }
}

export interface HomeActions {
  onClose: () => void; // back to the designer
  onSignIn: () => void; // the Account dialog
  onGo: (page: HomePage) => void;
  /** A design (gallery) or post (journal) by its cloud id. */
  onOpenItem: (kind: 'design' | 'post', id: string) => void;
  onNewDesign: () => void;
  onOpenFiles: () => void;
}

/**
 * Home. The first time (or signed out, having chosen nothing), a welcome:
 * how to use Chromattice. After that, the user's own home: the design they
 * were on, their designs, activity, friends, journal (PersonalHome).
 */
export default function Home(actions: HomeActions) {
  const { onGo } = actions;
  const user = useStore((s) => s.cloudUser);
  const [mode, setMode] = useState<HomeMode | null>(() => readHomeMode());
  const current: HomeMode | null = user ? 'account' : mode === 'account' ? null : mode;
  const welcome = !current;

  // signing in from here settles it: this is an account user
  useEffect(() => {
    if (user) {
      writeHomeMode('account');
      setMode('account');
    }
  }, [user]);

  return (
    <div className="home" role="region" aria-label="Home">
      <header className="home-hero" style={pixelScene(160, 36, { sun: true, mesas: true })}>
        <div className="home-hero-inner">
          <Logo size={176} />
          <div className="home-title">
            <h1>Chromattice</h1>
            <blockquote className="home-quote">
              Thread, tile, bead or pixel — every maker of patterns answers one question, again and again:
              <em> what colour belongs at this address?</em>
            </blockquote>
          </div>
        </div>
      </header>
      <Zigzag />
      <div className="home-inner">
        {welcome ? (
          <ModeCards current={current} setMode={setMode} {...actions} />
        ) : (
          <PersonalHome {...actions} />
        )}
        <Explore onGo={onGo} />
        {!welcome && (
          <section className="home-section" aria-label="How you use Chromattice">
            <h2>How you use Chromattice</h2>
            <ModeCards current={current} setMode={setMode} {...actions} />
          </section>
        )}
      </div>
    </div>
  );
}

/** On this device only, or with an account: what each means, and the choice. */
function ModeCards({
  current,
  setMode,
  onClose,
  onSignIn,
}: HomeActions & { current: HomeMode | null; setMode: (m: HomeMode) => void }) {
  const user = useStore((s) => s.cloudUser);
  const useLocal = async () => {
    if (user) {
      if (!confirm('Sign out and work on this device only? Designs already on this device stay here; they stop syncing.'))
        return;
      await cloud.backend?.signOut();
    }
    writeHomeMode('local');
    setMode('local');
    onClose();
  };
  return (
    <section className="home-modes" aria-label="How to use Chromattice">
      <article className={'home-mode' + (current === 'local' ? ' current' : '')}>
        <h2>
          <Icon name="cloud-off" size={20} /> On this device only
        </h2>
        <ul>
          <li>No account needed.</li>
          <li>Designs stay in this browser only. Clearing its data erases them.</li>
          <li>No sharing.</li>
        </ul>
        <button className="btn" onClick={() => void useLocal()}>
          {current === 'local' ? 'Keep using this device' : user ? 'Sign out and use this device only' : 'Use on this device'}
        </button>
      </article>

      <article className={'home-mode' + (current === 'account' ? ' current' : '')}>
        <h2>
          <Icon name="cloud" size={20} /> With an account
        </h2>
        <ul>
          <li>Designs in Cloud Storage sync across your devices.</li>
          <li>Share with friends or publish to the gallery.</li>
          <li>Local Storage is still there for private work.</li>
        </ul>
        {user ? (
          <button className="btn primary" onClick={onClose}>
            Continue as {user.name || user.email}
          </button>
        ) : (
          <button className="btn primary" onClick={onSignIn}>
            Sign in or create an account
          </button>
        )}
      </article>
    </section>
  );
}

function Explore({ onGo }: { onGo: (page: HomePage) => void }) {
  return (
    <nav className="home-explore" aria-label="Explore">
      <button className="explore-card" onClick={() => onGo('gallery')}>
        <Icon name="grid" size={28} />
        <span>
          <b>Gallery</b>
          <span className="hint">Designs people have published, to like, rate and open a copy of.</span>
        </span>
        <Icon name="chevron-right" size={20} />
      </button>
      <button className="explore-card" onClick={() => onGo('journal')}>
        <Icon name="pencil" size={28} />
        <span>
          <b>Journal</b>
          <span className="hint">Posts about designs: how they were made, and what they're for.</span>
        </span>
        <Icon name="chevron-right" size={20} />
      </button>
    </nav>
  );
}

/** A full-screen page off Home (the Gallery, the Journal): a slim branded
 *  header to move between them, and the page itself. */
function FullPage({
  page,
  title,
  onGo,
  onClose,
  children,
}: {
  page: HomePage;
  title: string;
  onGo: (page: HomePage) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="home full-page" role="region" aria-label={title}>
      <header className="page-bar" style={pixelScene(200, 10, { sun: false, mesas: true })}>
        <button className="page-brand" onClick={() => onGo('home')} aria-label="Home">
          <Logo size={44} />
          <span>Chromattice</span>
        </button>
        <nav className="page-tabs" aria-label="Pages">
          {(['gallery', 'journal'] as const).map((p) => (
            <button key={p} className={p === page ? 'on' : ''} aria-current={p === page ? 'page' : undefined} onClick={() => onGo(p)}>
              {p === 'gallery' ? 'Gallery' : 'Journal'}
            </button>
          ))}
        </nav>
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>
          Back to designing <Icon name="chevron-right" size={16} />
        </button>
      </header>
      <Zigzag />
      <div className="home-inner">{children}</div>
    </div>
  );
}

export function GalleryPage({
  openId,
  onOpen,
  onGo,
  onClose,
}: {
  /** The design showing, from the route. */
  openId: string | null;
  onOpen: (id: string | null) => void;
  onGo: (page: HomePage) => void;
  onClose: () => void;
}) {
  const user = useStore((s) => s.cloudUser);
  return (
    <FullPage page="gallery" title="Gallery" onGo={onGo} onClose={onClose}>
      <Gallery signedIn={!!user} onOpened={onClose} openId={openId} onOpen={onOpen} />
    </FullPage>
  );
}

export function JournalPage({
  openId,
  onOpen,
  onGo,
  onClose,
  onOpenDesign,
}: {
  /** The post showing, from the route. */
  openId: string | null;
  onOpen: (id: string | null) => void;
  onGo: (page: HomePage) => void;
  onClose: () => void;
  onOpenDesign: (id: string) => void;
}) {
  return (
    <FullPage page="journal" title="Journal" onGo={onGo} onClose={onClose}>
      <Journal openId={openId} onOpen={onOpen} onOpenDesign={onOpenDesign} />
    </FullPage>
  );
}

function Gallery({
  signedIn,
  onOpened,
  openId,
  onOpen,
}: {
  signedIn: boolean;
  onOpened: () => void;
  /** The design showing (from the route: #/gallery/<id>), if any. */
  openId: string | null;
  /** Show a design, or none: changes the route. */
  onOpen: (id: string | null) => void;
}) {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [reactions, setReactions] = useState<Map<string, Reactions>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<GalleryItem | null>(null);

  // the route says which design is open: one in the list, or any design the
  // viewer can see (a shared link; a friend's needs signing in first)
  useEffect(() => {
    if (!openId) {
      setOpen(null);
      return;
    }
    const listed = items?.find((x) => x.id === openId);
    if (listed) {
      setOpen(listed);
      return;
    }
    if (!cloud.backend) return;
    let live = true;
    cloud.backend
      .design(openId)
      .then(async (d) => {
        if (!live) return;
        if (!d) {
          useStore.getState().notify(signedIn ? "That design isn't available" : 'Sign in to see that design');
          onOpen(null);
          return;
        }
        const rx = await cloud.backend!.reactions([d.id]).catch(() => new Map<string, Reactions>());
        if (!live) return;
        setReactions((m) => new Map([...m, ...rx]));
        setOpen(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [openId, signedIn, items]);

  // reload on sign-in / sign-out: signed-in visitors also see who made what
  useEffect(() => {
    if (!cloud.backend) return;
    let live = true;
    cloud.backend
      .gallery(60)
      .then(async (r) => {
        if (!live) return;
        setItems(r);
        setError(null);
        const rx = await cloud.backend!.reactions(r.map((x) => x.id)).catch(() => new Map<string, Reactions>());
        if (live) setReactions(rx);
      })
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [signedIn]);

  return (
    <section className="home-gallery" aria-label="Gallery">
      <h2>Gallery</h2>
      {error ? (
        <p className="acct-error">Couldn't load the gallery: {error}</p>
      ) : !items ? (
        <p className="hint">Loading…</p>
      ) : items.length === 0 ? (
        <p className="hint">Nothing published yet. Share a design with “Anyone” and it appears here.</p>
      ) : (
        <ul className="gallery-grid">
          {items.map((it) => (
            <li key={it.id}>
              <GalleryCard item={it} reactions={reactions.get(it.id)} onClick={() => onOpen(it.id)} />
            </li>
          ))}
        </ul>
      )}
      {open && (
        <GalleryPreview
          item={open}
          reactions={reactions.get(open.id)}
          onReact={(r) => setReactions((m) => new Map(m).set(open.id, r))}
          onClose={() => onOpen(null)}
          onOpened={onOpened}
        />
      )}
    </section>
  );
}

const nameOf = (doc: unknown) =>
  String((doc as { meta?: { name?: string } })?.meta?.name || 'Untitled Pattern');

function GalleryCard({
  item,
  reactions,
  onClick,
}: {
  item: GalleryItem;
  reactions: Reactions | undefined;
  onClick: () => void;
}) {
  const thumb = useMemo(() => designThumbnail(JSON.stringify(item.doc), 220), [item.doc]);
  return (
    <button className="gallery-card" onClick={onClick}>
      <span className="gallery-thumb">{thumb && <img src={thumb} alt="" />}</span>
      <span className="gallery-name">{nameOf(item.doc)}</span>
      {item.owner && (
        <span className="gallery-by">
          <Avatar user={item.owner} size={20} /> @{item.owner.username}
        </span>
      )}
      <ReactionSummary r={reactions} />
    </button>
  );
}

function GalleryPreview({
  item,
  reactions,
  onReact,
  onClose,
  onOpened,
}: {
  item: GalleryItem;
  reactions: Reactions | undefined;
  onReact: (r: Reactions) => void;
  onClose: () => void;
  onOpened: () => void;
}) {
  const user = useStore((s) => s.cloudUser);
  const json = useMemo(() => JSON.stringify(item.doc, null, 2), [item.doc]);
  const thumb = useMemo(() => designThumbnail(json, 520), [json]);
  const meta = useMemo(() => describeDesign(json), [json]);
  const name = nameOf(item.doc);

  const openCopy = () => {
    const s = useStore.getState();
    if (s.dirty && !confirm('Discard unsaved changes and open this design?')) return;
    try {
      s.loadDesignText(json);
    } catch (e) {
      alert('Could not open this design:\n' + (e as Error).message);
      return;
    }
    s.notify(`Opened a copy of “${name}” — Save As to keep it`);
    onClose();
    onOpened();
  };

  return (
    <Modal title={name} onClose={onClose} wide>
      <div className="gallery-preview">
        {thumb && <img src={thumb} alt={name} />}
        <p className="hint">
          {item.owner && (
            <span className="gallery-by">
              <Avatar user={item.owner} size={24} /> by @{item.owner.username} ·{' '}
            </span>
          )}
          {meta.sizeLabel} · {meta.typeLabel}
          {item.publishedAt && ` · published ${new Date(item.publishedAt).toLocaleDateString()}`}
        </p>
        <ReactionBar
          itemId={item.id}
          initial={reactions}
          canReact={!!user}
          onChange={onReact}
        />
      </div>
      <Comments
        itemId={item.id}
        onCount={(n) => reactions && reactions.comments !== n && onReact({ ...reactions, comments: n })}
      />
      <div className="actions">
        <ShareLinkButton id={item.id} name={name} />
        <span className="grow" />
        <button className="btn" onClick={onClose}>
          Close
        </button>
        <button className="btn primary" onClick={openCopy}>
          Open a copy
        </button>
      </div>
    </Modal>
  );
}

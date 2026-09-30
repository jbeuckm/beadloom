// The pages around the designer, when accounts are available: the welcome
// (how to use Chromattice), signing in, the user's own home, the Gallery and
// the Journal. The site map is below; App routes to them.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import Avatar from './Avatar';
import { Icon } from './icons';
import { cloud, refreshStanding, resetTokenFromUrl } from '../lib/cloud';
import AuthForm, { AUTH_TITLES, type AuthMode } from './AuthForm';
import type { DialogId } from './TopBar';
import type { GalleryItem, Reactions } from '../lib/cloud/backend';
import { ReactionBar, ReactionSummary } from './Reactions';
import Comments, { ShareLinkButton } from './Comments';
import { Journal } from './Posts';
import { describeDesign, designThumbnail } from '../lib/library';
import { Logo, Zigzag, pixelScene } from './Brand';
import PersonalHome from './PersonalHome';
import { AdminPanel, ReportButton } from './Moderation';

export const HOME_MODE_KEY = 'beadloom.homeMode';
export type HomeMode = 'local' | 'account';

/** How the user said they'd use the app (the welcome's choice), if they have. */
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

// Where the app opens: the start page (default), or straight back into the last design.
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

/**
 * The start page for this user: their Home when signed in, else the welcome
 * (unless they've asked to go straight back to their design).
 */
export function startPath(signedIn: boolean): string {
  if (!cloud.available) return '/design';
  if (readLaunchTo() === 'design' && (signedIn || readHomeMode() === 'local')) return '/design';
  return signedIn ? '/home' : '/welcome';
}

// ---- the site map ---------------------------------------------------------------
//
//   #/            → the start page (above)
//   #/welcome     → new or signed-out visitors: this device, or an account
//   #/signin      → sign in / create account / reset password
//   #/home        → the user's own home: their designs, activity, friends, journal
//   #/gallery(/id), #/journal(/id)
//   #/design      → the designer (every page sits over it)

/** What pages can ask of the app around them: its dialogs. */
export const PagesContext = createContext<{ openDialog: (d: DialogId) => void }>({ openDialog: () => {} });

export type SitePageId = 'home' | 'gallery' | 'journal' | 'signin' | 'admin';

/** A full-screen page with the site's header: the mark and name (Home),
 *  Home / Gallery / Journal, the account, and the way back to the designer. */
function SitePage({ page, title, children }: { page: SitePageId; title: string; children: ReactNode }) {
  const navigate = useNavigate();
  const user = useStore((s) => s.cloudUser);
  const username = useStore((s) => s.cloudUsername);
  const { openDialog } = useContext(PagesContext);
  const staff = useStore((s) => s.cloudStanding.role !== 'user');
  const tabs: Array<[SitePageId, string]> = [
    ['home', 'Home'],
    ['gallery', 'Gallery'],
    ['journal', 'Journal'],
    ...(staff ? [['admin', 'Admin'] as [SitePageId, string]] : []),
  ];
  return (
    <div className="home full-page" role="region" aria-label={title}>
      <header className="page-bar" style={pixelScene(200, 10, { sun: false, mesas: true })}>
        <button className="page-brand" onClick={() => navigate('/')} aria-label="Start page">
          <Logo size={44} />
          <span>Chromattice</span>
        </button>
        <nav className="page-tabs" aria-label="Pages">
          {tabs.map(([p, label]) => (
            <button
              key={p}
              className={p === page ? 'on' : ''}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => navigate(`/${p}`)}
            >
              {label}
            </button>
          ))}
        </nav>
        <span className="grow" />
        {user ? (
          <button
            className="page-account"
            onClick={() => openDialog('account')}
            aria-label={`Signed in as ${username ? '@' + username : user.email}`}
          >
            <Icon name="user" size={16} /> {username ? '@' + username : user.name || user.email}
          </button>
        ) : (
          page !== 'signin' && (
            <button className="page-account" onClick={() => navigate(`/signin?next=/${page}`)}>
              <Icon name="user" size={16} /> Sign in
            </button>
          )
        )}
        <button className="btn primary" onClick={() => navigate('/design')}>
          Designer <Icon name="chevron-right" size={16} />
        </button>
      </header>
      <Zigzag />
      <div className="home-inner">{children}</div>
    </div>
  );
}

// ---- welcome ------------------------------------------------------------------

/** New or signed-out visitors: the brand, and how to use Chromattice. */
export function WelcomePage() {
  const navigate = useNavigate();
  return (
    <div className="home" role="region" aria-label="Welcome">
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
        <ModeCards />
        <nav className="home-explore" aria-label="Explore">
          <button className="explore-card" onClick={() => navigate('/gallery')}>
            <Icon name="grid" size={28} />
            <span>
              <b>Gallery</b>
              <span className="hint">Designs people have published, to like, rate and open a copy of.</span>
            </span>
            <Icon name="chevron-right" size={20} />
          </button>
          <button className="explore-card" onClick={() => navigate('/journal')}>
            <Icon name="pencil" size={28} />
            <span>
              <b>Journal</b>
              <span className="hint">Posts about designs: how they were made, and what they're for.</span>
            </span>
            <Icon name="chevron-right" size={20} />
          </button>
        </nav>
      </div>
    </div>
  );
}

/** On this device only, or with an account: what each means, and the choice. */
function ModeCards() {
  const navigate = useNavigate();
  const user = useStore((s) => s.cloudUser);
  const mode = user ? 'account' : readHomeMode();
  const useLocal = async () => {
    if (user) {
      if (!confirm('Sign out and work on this device only? Designs already on this device stay here; they stop syncing.'))
        return;
      await cloud.backend?.signOut();
    }
    writeHomeMode('local');
    navigate('/home');
  };
  return (
    <section className="home-modes" aria-label="How to use Chromattice">
      <article className={'home-mode' + (mode === 'local' ? ' current' : '')}>
        <h2>
          <Icon name="cloud-off" size={20} /> On this device only
        </h2>
        <ul>
          <li>No account needed.</li>
          <li>Designs stay in this browser only. Clearing its data erases them.</li>
          <li>No sharing.</li>
        </ul>
        <button className="btn" onClick={() => void useLocal()}>
          {mode === 'local' ? 'Continue on this device' : user ? 'Sign out and use this device only' : 'Use on this device'}
        </button>
      </article>

      <article className={'home-mode' + (mode === 'account' ? ' current' : '')}>
        <h2>
          <Icon name="cloud" size={20} /> With an account
        </h2>
        <ul>
          <li>Designs in Cloud Storage sync across your devices.</li>
          <li>Share with friends or publish to the gallery.</li>
          <li>Local Storage is still there for private work.</li>
        </ul>
        {user ? (
          <button className="btn primary" onClick={() => navigate('/home')}>
            Go to your home
          </button>
        ) : (
          <button className="btn primary" onClick={() => navigate('/signin?next=/home')}>
            Sign in or create an account
          </button>
        )}
      </article>
    </section>
  );
}

// ---- sign in ------------------------------------------------------------------

/** Sign in, create an account, or reset a password; then on to `next`. */
export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore((s) => s.cloudUser);
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/home';
  const [resetToken] = useState(() => resetTokenFromUrl());
  const [mode, setMode] = useState<AuthMode>(resetToken ? 'reset' : params.get('mode') === 'signup' ? 'signup' : 'signin');

  // signed in: on to wherever they were going (a reset lands back on sign in)
  useEffect(() => {
    if (user && mode !== 'reset') {
      writeHomeMode('account');
      navigate(next, { replace: true });
    }
  }, [user, mode, next, navigate]);

  return (
    <SitePage page="signin" title={AUTH_TITLES[mode]}>
      <div className="signin-card">
        <h2>{AUTH_TITLES[mode]}</h2>
        <AuthForm initialMode={mode} resetToken={resetToken} onModeChange={setMode} />
      </div>
    </SitePage>
  );
}

// ---- the user's own home --------------------------------------------------------

export function HomePage() {
  const navigate = useNavigate();
  useEffect(refreshStanding, []);
  const user = useStore((s) => s.cloudUser);
  const username = useStore((s) => s.cloudUsername);
  const { openDialog } = useContext(PagesContext);
  const actions: HomeActions = {
    onClose: () => navigate('/design'),
    onSignIn: () => (user ? openDialog('account') : navigate('/signin?next=/home')),
    onGo: (p) => navigate(`/${p}`),
    onOpenItem: (kind, id) => navigate(kind === 'design' ? `/gallery/${id}` : `/journal/${id}`),
    onNewDesign: () => {
      if (useStore.getState().dirty && !confirm('Discard unsaved changes and start a new design?')) return;
      navigate('/design');
      openDialog('new');
    },
    onOpenFiles: () => {
      navigate('/design');
      openDialog('open');
    },
  };
  return (
    <SitePage page="home" title="Home">
      <h1 className="page-title">{user ? `Welcome back${username ? ', @' + username : ''}` : 'Your designs'}</h1>
      <SuspendedNotice />
      {!user && cloud.available && (
        <p className="home-callout">
          You're working on this device only.
          <button className="btn mini" onClick={() => navigate('/signin?next=/home')}>
            Sign in to sync and share
          </button>
        </p>
      )}
      <PersonalHome {...actions} />
    </SitePage>
  );
}

export interface HomeActions {
  onClose: () => void; // back to the designer
  onSignIn: () => void; // the account (or signing in)
  onGo: (page: 'gallery' | 'journal') => void;
  /** A design (gallery) or post (journal) by its cloud id. */
  onOpenItem: (kind: 'design' | 'post', id: string) => void;
  onNewDesign: () => void;
  onOpenFiles: () => void;
}

/** Staff only: reports, the gallery and journal, people, the log. */
export function AdminPage() {
  return (
    <SitePage page="admin" title="Admin">
      <AdminPanel />
    </SitePage>
  );
}

/** Suspended: what that means, and why. */
export function SuspendedNotice() {
  const reason = useStore((s) => s.cloudStanding.suspendedReason);
  if (!reason) return null;
  return (
    <p className="home-callout suspended" role="status">
      <b>Your account is suspended.</b> Reason: {reason}. You can still sign in and use your own designs,
      but not publish, share, post, comment or react until a moderator lifts it.
    </p>
  );
}

// ---- gallery and journal ----------------------------------------------------------

export function GalleryPage({ openId }: { openId: string | null }) {
  const navigate = useNavigate();
  const user = useStore((s) => s.cloudUser);
  return (
    <SitePage page="gallery" title="Gallery">
      <Gallery
        signedIn={!!user}
        onOpened={() => navigate('/design')}
        openId={openId}
        onOpen={(id) => navigate(id ? `/gallery/${id}` : '/gallery')}
      />
    </SitePage>
  );
}

export function JournalPage({ openId }: { openId: string | null }) {
  const navigate = useNavigate();
  return (
    <SitePage page="journal" title="Journal">
      <Journal
        openId={openId}
        onOpen={(id) => navigate(id ? `/journal/${id}` : '/journal')}
        onOpenDesign={(id) => navigate(`/gallery/${id}`)}
      />
    </SitePage>
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
        <ReportButton kind="design" targetId={item.id} ownerId={item.owner?.id} />
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

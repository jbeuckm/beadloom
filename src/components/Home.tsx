// The home page, when accounts are available: how to use the app (on this
// device only, or with an account) with what each means, and the public
// gallery of published designs. Shown at launch until a way is chosen, and
// from the Home button after that.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import Avatar from './Avatar';
import { Icon } from './icons';
import { cloud } from '../lib/cloud';
import type { GalleryItem, Reactions } from '../lib/cloud/backend';
import { ReactionBar, ReactionSummary } from './Reactions';
import Comments, { ShareLinkButton } from './Comments';
import { describeDesign, designThumbnail } from '../lib/library';

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

export default function Home({
  onClose,
  onSignIn,
  openId,
}: {
  onClose: () => void;
  onSignIn: () => void;
  /** A design to show at once (the page was opened with its link). */
  openId?: string | null;
}) {
  const user = useStore((s) => s.cloudUser);
  const [mode, setMode] = useState<HomeMode | null>(() => readHomeMode());
  const current: HomeMode | null = user ? 'account' : mode === 'account' ? null : mode;

  // signing in from here settles it: this is an account user
  useEffect(() => {
    if (user) {
      writeHomeMode('account');
      setMode('account');
    }
  }, [user]);

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
    <div className="home" role="region" aria-label="Home">
      <header className="home-hero">
        <div className="home-hero-inner">
          <Logo size={72} />
          <div className="home-title">
            <h1>Chromattice</h1>
            <p>Bead-loom &amp; colourwork patterns, cell by cell.</p>
          </div>
          {current && (
            <button className="btn primary" onClick={onClose}>
              Back to designing <Icon name="chevron-right" size={16} />
            </button>
          )}
        </div>
        <Mesas />
      </header>
      <Zigzag />
      <div className="home-inner">
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

        <Gallery signedIn={!!user} onOpened={onClose} openId={openId ?? null} />
      </div>
    </div>
  );
}

// ---- Southwest branding: a stepped-diamond lattice logo, mesas, a zigzag band

const SW = { turquoise: '#2e9c95', cream: '#f6ead4', terracotta: '#c2562f', ochre: '#d99a3a', plum: '#5b2d3b' };

/** The mark: concentric stepped diamonds laid out cell by cell, like a bead grid. */
export function Logo({ size = 64 }: { size?: number }) {
  const ring = [SW.turquoise, SW.cream, SW.terracotta, SW.ochre, SW.turquoise];
  const cells = [];
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const d = Math.abs(x - 4) + Math.abs(y - 4);
      if (d < ring.length) cells.push(<rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} fill={ring[d]} />);
    }
  return (
    <svg className="home-logo" width={size} height={size} viewBox="-0.5 -0.5 10 10" aria-hidden="true">
      {cells}
    </svg>
  );
}

/** Mesas and buttes along the bottom of the sunset. */
function Mesas() {
  return (
    <svg className="home-mesas" viewBox="0 0 1200 90" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0 90V62h70l18-22h120l14 22h160l10-14h40l8 14h210l22-34h150l20 34h110l12-18h70l10 18h156v28Z"
        fill={SW.plum}
      />
    </svg>
  );
}

/** A woven-looking band of stepped triangles under the header. */
function Zigzag() {
  return (
    <svg className="home-zigzag" height="18" width="100%" aria-hidden="true">
      <defs>
        <pattern id="sw-zig" width="24" height="18" patternUnits="userSpaceOnUse">
          <rect width="24" height="18" fill={SW.cream} />
          <path d="M0 18V12h4V8h4V4h4V0h0v4h4v4h4v4h4v6Z" fill={SW.turquoise} />
          <path d="M8 18v-4h4v-4h0v4h4v4Z" fill={SW.terracotta} />
        </pattern>
      </defs>
      <rect width="100%" height="18" fill="url(#sw-zig)" />
    </svg>
  );
}

function Gallery({
  signedIn,
  onOpened,
  openId,
}: {
  signedIn: boolean;
  onOpened: () => void;
  openId: string | null;
}) {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [reactions, setReactions] = useState<Map<string, Reactions>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<GalleryItem | null>(null);

  // a shared link: show that design (a friend's needs signing in first)
  useEffect(() => {
    if (!openId || !cloud.backend) return;
    let live = true;
    cloud.backend
      .design(openId)
      .then(async (d) => {
        if (!live) return;
        if (!d) {
          useStore.getState().notify(signedIn ? "That design isn't available" : 'Sign in to see that design');
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
  }, [openId, signedIn]);

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
              <GalleryCard item={it} reactions={reactions.get(it.id)} onClick={() => setOpen(it)} />
            </li>
          ))}
        </ul>
      )}
      {open && (
        <GalleryPreview
          item={open}
          reactions={reactions.get(open.id)}
          onReact={(r) => setReactions((m) => new Map(m).set(open.id, r))}
          onClose={() => setOpen(null)}
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
          canReact={!!user && item.owner?.id !== user.id}
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

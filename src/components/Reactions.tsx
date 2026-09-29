// Likes and 5-star ratings on a design: a compact summary for cards, and a
// bar to like and rate with (signed in, not your own design).

import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import { cloud } from '../lib/cloud';
import { NO_REACTIONS, type Reactions } from '../lib/cloud/backend';

const fmt = (avg: number | null) => (avg === null ? '' : avg.toFixed(1).replace(/\.0$/, ''));

/** "♥ 3 · ★ 4.2 (5)" — nothing when there's nothing yet. */
export function ReactionSummary({ r }: { r: Reactions | undefined }) {
  if (!r || (!r.likes && !r.ratings && !r.comments)) return null;
  return (
    <span className="reaction-summary" aria-label={`${r.likes} likes, ${r.ratings} ratings, ${r.comments} comments`}>
      {r.likes > 0 && (
        <span>
          <Icon name="heart" size={13} fill="currentColor" /> {r.likes}
        </span>
      )}
      {r.ratings > 0 && (
        <span>
          <Icon name="star" size={13} fill="currentColor" /> {fmt(r.average)} ({r.ratings})
        </span>
      )}
      {r.comments > 0 && (
        <span>
          <Icon name="comment" size={13} /> {r.comments}
        </span>
      )}
    </span>
  );
}

/**
 * Like and rate. `canReact` false shows the totals only (signed out, or it's
 * your own design). Changes show at once and are saved in the background.
 */
export function ReactionBar({
  itemId,
  initial,
  canReact,
  onChange,
}: {
  itemId: string;
  initial: Reactions | undefined;
  canReact: boolean;
  onChange?: (r: Reactions) => void;
}) {
  const notify = useStore((s) => s.notify);
  const signedIn = useStore((s) => !!s.cloudUser);
  const [r, setR] = useState<Reactions>(initial ?? NO_REACTIONS);
  const mine = r.mine ?? { liked: false, stars: null };

  const apply = (change: { liked?: boolean; stars?: number | null }) => {
    const next = { ...mine, ...change };
    // totals, recomputed locally from my old and new reaction
    const likes = r.likes - (mine.liked ? 1 : 0) + (next.liked ? 1 : 0);
    const sum = (r.average ?? 0) * r.ratings - (mine.stars ?? 0) + (next.stars ?? 0);
    const ratings = r.ratings - (mine.stars ? 1 : 0) + (next.stars ? 1 : 0);
    const updated: Reactions = { ...r, likes, ratings, average: ratings ? sum / ratings : null, mine: next };
    const before = r;
    setR(updated);
    onChange?.(updated);
    cloud.backend?.react(itemId, change).catch((e) => {
      setR(before);
      onChange?.(before);
      notify((e as Error).message);
    });
  };

  return (
    <div className="reaction-bar">
      <button
        className={'btn mini reaction-like' + (mine.liked ? ' on' : '')}
        disabled={!canReact}
        aria-pressed={mine.liked}
        aria-label={mine.liked ? 'Unlike' : 'Like'}
        onClick={() => apply({ liked: !mine.liked })}
      >
        <Icon name="heart" size={17} fill={mine.liked ? 'currentColor' : 'none'} /> {r.likes}
      </button>
      <span className="reaction-stars" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => {
          const lit = (canReact && mine.stars ? mine.stars : Math.round(r.average ?? 0)) >= n;
          return (
            <button
              key={n}
              className={'reaction-star' + (lit ? ' on' : '')}
              role="radio"
              aria-checked={mine.stars === n}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              disabled={!canReact}
              // tapping your current rating again clears it
              onClick={() => apply({ stars: mine.stars === n ? null : n })}
            >
              <Icon name="star" size={22} fill={lit ? 'currentColor' : 'none'} />
            </button>
          );
        })}
      </span>
      <span className="hint">
        {r.ratings ? `${fmt(r.average)} from ${r.ratings} rating${r.ratings === 1 ? '' : 's'}` : 'No ratings yet'}
        {!canReact && (signedIn ? ' · your design' : ' · sign in to like and rate')}
      </span>
    </div>
  );
}

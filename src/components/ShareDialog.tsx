// Sharing one saved design: with anyone (the public gallery) and/or with
// chosen friends. What's shared is the account's copy, so later saves reach
// whoever it's shared with once they sync.

import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import { cloud } from '../lib/cloud';
import type { Friend, Reactions } from '../lib/cloud/backend';
import { ReactionBar } from './Reactions';
import Comments, { ShareLinkButton } from './Comments';

type Loaded = {
  id: string;
  hiddenReason?: string | null;
  published: boolean;
  friendIds: Set<string>;
  friends: Friend[];
  reactions?: Reactions;
};

export default function ShareDialog({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const user = useStore((s) => s.cloudUser);
  const notify = useStore((s) => s.notify);
  const backend = cloud.backend;
  const engine = cloud.engine;
  const [state, setState] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !backend || !engine) return;
    let live = true;
    (async () => {
      const id = await engine.ensureUploaded('design', path);
      if (!id) throw new Error("This design isn't in your account yet — check your connection and try again.");
      const [sharing, friends, reactions] = await Promise.all([
        backend.sharing(id),
        backend.friends(),
        backend.reactions([id]).catch(() => new Map<string, Reactions>()),
      ]);
      if (!live) return;
      setState({
        id,
        hiddenReason: sharing.hiddenReason,
        published: sharing.published,
        friendIds: new Set(sharing.friendIds),
        friends,
        reactions: reactions.get(id),
      });
      setPublished(sharing.published);
      setPicked(new Set(sharing.friendIds));
    })().catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [user, backend, engine, path]);

  const save = async () => {
    if (!state || !backend) return;
    setBusy(true);
    try {
      if (published !== state.published) await backend.setPublished(state.id, published);
      const same = picked.size === state.friendIds.size && [...picked].every((id) => state.friendIds.has(id));
      if (!same) await backend.setFriendShares(state.id, [...picked]);
      notify(published || picked.size ? `Sharing updated for “${name}”` : `“${name}” is private`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accepted = state?.friends.filter((f) => f.status === 'friends') ?? [];

  return (
    <Modal title={`Share “${name}”`} onClose={onClose}>
      {!user ? (
        <p className="hint">Sign in to share designs. Without an account your designs stay on this device.</p>
      ) : !state ? (
        error ? (
          <p className="acct-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="hint">Getting it ready…</p>
        )
      ) : (
        <div className="share">
          {state.hiddenReason && (
            <p className="home-callout suspended">
              A moderator hid this design from everyone but you. Reason: {state.hiddenReason}
            </p>
          )}
          <ReactionBar itemId={state.id} initial={state.reactions} canReact />
          <label className="check share-opt">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            <span>
              <b>Anyone</b> — show it in the public gallery
              <span className="hint">
                Anyone can see it and open a copy, signed in or not. Signed-in visitors see your username.
              </span>
            </span>
          </label>

          <h3>Friends</h3>
          {accepted.length === 0 ? (
            <p className="hint">No friends yet. Add them by username in your Account.</p>
          ) : (
            <div className="share-friends">
              {accepted.map((f) => (
                <label key={f.user.id} className="check">
                  <input
                    type="checkbox"
                    checked={picked.has(f.user.id)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(f.user.id);
                      else next.delete(f.user.id);
                      setPicked(next);
                    }}
                  />
                  @{f.user.username}
                </label>
              ))}
              <p className="hint">They see it under “Shared with me” when opening a design, and can copy it.</p>
            </div>
          )}
          <p className="hint">Sharing follows your saves: people see the latest version you've saved.</p>
          {(state.published || state.friendIds.size > 0) && <Comments itemId={state.id} />}
          {error && (
            <p className="acct-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <div className="actions">
        {state && (state.published || state.friendIds.size > 0) && (
          <>
            <ShareLinkButton id={state.id} name={name} />
            <span className="grow" />
          </>
        )}
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        {state && (
          <button className="btn primary" onClick={() => void save()} disabled={busy}>
            Save
          </button>
        )}
      </div>
    </Modal>
  );
}

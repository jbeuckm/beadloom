// People, in the Account dialog: my username (needed before anyone can find
// me), my friends and friend requests, and finding others by username.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import Avatar from './Avatar';
import { cloud } from '../lib/cloud';
import type { Friend, Profile } from '../lib/cloud/backend';

export default function Friends() {
  const backend = cloud.backend!;
  const notify = useStore((s) => s.notify);
  const [me, setMe] = useState<Profile | null | undefined>(undefined); // undefined: loading
  const [friends, setFriends] = useState<Friend[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const p = await backend.myProfile();
      setMe(p);
      useStore.getState().setCloudUsername(p?.username ?? null);
      setFriends(p ? await backend.friends() : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [backend]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      const r = (await fn()) as { ok?: boolean; error?: string } | undefined;
      if (r && r.ok === false) {
        setError(r.error ?? 'Something went wrong');
        return;
      }
      if (done) notify(done);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (me === undefined) return error ? <p className="acct-error">{error}</p> : null;

  return (
    <section className="people" aria-label="Friends">
      <Username me={me} onSaved={reload} />
      {me && (
        <>
          <h3>
            <Icon name="users" size={16} /> Friends
          </h3>
          {friends.length === 0 && (
            <p className="hint">
              Friends can see the designs you share with them. Find someone by their username below.
            </p>
          )}
          <ul className="people-list friend-list">
            {friends.map((f) => (
              <li key={f.user.id}>
                <Avatar user={f.user} />
                <span className="who">@{f.user.username}</span>
                {f.status === 'incoming' && (
                  <>
                    <span className="hint">wants to be friends</span>
                    <button className="btn mini" onClick={() => void act(() => backend.removeFriend(f.user.id))}>
                      Decline
                    </button>
                    <button
                      className="btn mini primary"
                      onClick={() => void act(() => backend.acceptFriend(f.user.id), `You and @${f.user.username} are friends`)}
                    >
                      Accept
                    </button>
                  </>
                )}
                {f.status === 'outgoing' && (
                  <>
                    <span className="hint">request sent</span>
                    <button className="btn mini" onClick={() => void act(() => backend.removeFriend(f.user.id))}>
                      Cancel
                    </button>
                  </>
                )}
                {f.status === 'friends' && (
                  <button
                    className="btn mini"
                    onClick={() => {
                      if (confirm(`Remove @${f.user.username}? What you've shared with each other is unshared.`))
                        void act(() => backend.removeFriend(f.user.id));
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <FindPeople
            known={new Set(friends.map((f) => f.user.id))}
            onAdd={(p) => void act(() => backend.requestFriend(p.id), `Friend request sent to @${p.username}`)}
          />
        </>
      )}
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Pick (or change) the username others find me by. */
function Username({ me, onSaved }: { me: Profile | null; onSaved: () => void }) {
  const backend = cloud.backend!;
  const [editing, setEditing] = useState(!me);
  const [value, setValue] = useState(me?.username ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await backend.setUsername(value);
      if (!r.ok) setError(r.error ?? 'Could not save the username');
      else {
        setError(null);
        setEditing(false);
        onSaved();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!editing && me)
    return (
      <p className="acct-username">
        <Avatar user={me} size={40} />
        <span>
          Your username: <b>@{me.username}</b>
          {!me.avatar && (
            <span className="hint">
              For a profile picture, choose one of your designs in Open and pick “Use as profile picture”.
            </span>
          )}
        </span>
        <button className="btn ghost mini" onClick={() => setEditing(true)}>
          Change
        </button>
      </p>
    );
  return (
    <form className="field" onSubmit={save}>
      <label htmlFor="acct-username">{me ? 'Change your username' : 'Choose a username'}</label>
      {!me && <span className="hint">Friends find you by it. Signed-in users can see it; your email stays private.</span>}
      <div className="row-field">
        <input
          id="acct-username"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="e.g. bead_lover"
          maxLength={24}
          required
        />
        <button type="submit" className="btn primary" disabled={busy}>
          Save
        </button>
      </div>
      <span className="hint">3–24 letters, digits or underscores</span>
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function FindPeople({ known, onAdd }: { known: Set<string>; onAdd: (p: Profile) => void }) {
  const backend = cloud.backend!;
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  useEffect(() => {
    if (!q.trim()) {
      setFound([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      backend
        .searchUsers(q)
        .then((r) => live && setFound(r))
        .catch(() => live && setFound([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, backend]);

  return (
    <div className="field find-people">
      <label htmlFor="find-people">Add a friend</label>
      <input
        id="find-people"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {q.trim() && (
        <ul className="people-list">
          {found.length === 0 && <li className="hint">No one by that name</li>}
          {found.map((p) => (
            <li key={p.id}>
              <Avatar user={p} />
              <span className="who">@{p.username}</span>
              {known.has(p.id) ? (
                <span className="hint">already in your list</span>
              ) : (
                <button
                  className="btn mini"
                  onClick={() => {
                    onAdd(p);
                    setQ('');
                  }}
                >
                  Add friend
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

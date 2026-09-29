// An in-memory cloud for tests and local development (VITE_CLOUD_FAKE=1):
// the same interface as Neon, no network. Accounts and rows live in
// localStorage under their own keys, so a reload (or a second tab) sees the
// same "server", which lets tests play two devices. Tests reach it through
// `window.__beadloomCloudFake`.

import type {
  AuthResult,
  CloudBackend,
  CloudUser,
  FolderRow,
  ItemRow,
  TrashOriginRow,
} from './backend';

const KEY = 'beadloom.fakeCloud';
const SESSION = 'beadloom.fakeCloud.session';

interface Server {
  users: Array<CloudUser & { password: string }>;
  items: Array<ItemRow & { owner_id: string }>;
  folders: Array<FolderRow & { owner_id: string }>;
  trash: Array<TrashOriginRow & { owner_id: string }>;
  resets: Array<{ token: string; email: string }>;
  /** Simulated outage: every request fails while set. */
  offline: boolean;
}

const load = (): Server => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v) return v;
  } catch {
    /* fresh */
  }
  return { users: [], items: [], folders: [], trash: [], resets: [], offline: false };
};
const save = (s: Server) => localStorage.setItem(KEY, JSON.stringify(s));

export function createFakeBackend(): CloudBackend & {
  /** Test hooks. */
  fake: {
    setOffline(v: boolean): void;
    /** Rows as the server holds them (all users). */
    dump(): Server;
    /** The last reset token issued for `email` (the "email" the user got). */
    lastResetToken(email: string): string | null;
    /** Write a row as if another device had synced it. */
    seedItem(row: ItemRow & { owner_id: string }): void;
  };
} {
  const listeners = new Set<(u: CloudUser | null) => void>();
  let sessionUser: CloudUser | null = null;
  try {
    sessionUser = JSON.parse(localStorage.getItem(SESSION) || 'null');
  } catch {
    sessionUser = null;
  }
  const setUser = (u: CloudUser | null) => {
    sessionUser = u;
    if (u) localStorage.setItem(SESSION, JSON.stringify(u));
    else localStorage.removeItem(SESSION);
    listeners.forEach((fn) => fn(u));
  };
  const me = () => {
    if (!sessionUser) throw new Error('Not signed in');
    return sessionUser.id;
  };
  const guard = () => {
    if (load().offline) throw new Error('Network error');
  };
  const pub = (u: CloudUser & { password: string }): CloudUser => ({
    id: u.id,
    email: u.email,
    name: u.name,
    emailVerified: u.emailVerified,
  });

  return {
    async currentUser() {
      return sessionUser;
    },
    onUserChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async signIn(email, password): Promise<AuthResult> {
      guard();
      const s = load();
      const u = s.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
      if (!u || u.password !== password) return { ok: false, error: 'Invalid email or password' };
      setUser(pub(u));
      return { ok: true };
    },
    async signUp(email, password, name): Promise<AuthResult> {
      guard();
      const s = load();
      if (s.users.some((x) => x.email.toLowerCase() === email.toLowerCase()))
        return { ok: false, error: 'An account with this email already exists' };
      if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
      const u = { id: 'u_' + Math.random().toString(36).slice(2, 10), email, name, password, emailVerified: false };
      s.users.push(u);
      save(s);
      setUser(pub(u));
      return { ok: true };
    },
    async signOut() {
      setUser(null);
    },
    async requestPasswordReset(email): Promise<AuthResult> {
      guard();
      const s = load();
      // like the real thing: never reveal whether the email exists
      if (s.users.some((x) => x.email.toLowerCase() === email.toLowerCase())) {
        s.resets.push({ token: 'tok_' + Math.random().toString(36).slice(2, 12), email });
        save(s);
      }
      return { ok: true };
    },
    async resetPassword(token, newPassword): Promise<AuthResult> {
      guard();
      const s = load();
      const r = s.resets.find((x) => x.token === token);
      if (!r) return { ok: false, error: 'This reset link is invalid or has expired' };
      if (newPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
      const u = s.users.find((x) => x.email === r.email)!;
      u.password = newPassword;
      s.resets = s.resets.filter((x) => x !== r);
      save(s);
      return { ok: true };
    },

    async pullItems(since) {
      guard();
      const id = me();
      return load()
        .items.filter((r) => r.owner_id === id && (!since || r.modified > since || (r.deleted_at ?? '') > since))
        .map(({ owner_id: _o, ...r }) => r);
    },
    async upsertItems(rows) {
      guard();
      const id = me();
      const s = load();
      for (const row of rows) {
        const i = s.items.findIndex((r) => r.id === row.id && r.owner_id === id);
        const next = { ...row, owner_id: id };
        if (i >= 0) s.items[i] = next;
        else s.items.push(next);
      }
      save(s);
    },
    async deleteItems(ids, deletedAt) {
      guard();
      const id = me();
      const s = load();
      for (const r of s.items) if (r.owner_id === id && ids.includes(r.id)) r.deleted_at = deletedAt;
      save(s);
    },

    async pullFolders() {
      guard();
      const id = me();
      return load().folders.filter((r) => r.owner_id === id).map(({ owner_id: _o, ...r }) => r);
    },
    async addFolders(rows) {
      guard();
      const id = me();
      const s = load();
      for (const row of rows)
        if (!s.folders.some((r) => r.owner_id === id && r.collection === row.collection && r.path === row.path))
          s.folders.push({ ...row, owner_id: id });
      save(s);
    },
    async removeFolders(rows) {
      guard();
      const id = me();
      const s = load();
      s.folders = s.folders.filter(
        (r) => !(r.owner_id === id && rows.some((x) => x.collection === r.collection && x.path === r.path)),
      );
      save(s);
    },

    async pullTrashOrigins() {
      guard();
      const id = me();
      return load().trash.filter((r) => r.owner_id === id).map(({ owner_id: _o, ...r }) => r);
    },
    async setTrashOrigins(rows) {
      guard();
      const id = me();
      const s = load();
      for (const row of rows) {
        const i = s.trash.findIndex((r) => r.owner_id === id && r.collection === row.collection && r.path === row.path);
        if (i >= 0) s.trash[i] = { ...row, owner_id: id };
        else s.trash.push({ ...row, owner_id: id });
      }
      save(s);
    },
    async removeTrashOrigins(rows) {
      guard();
      const id = me();
      const s = load();
      s.trash = s.trash.filter(
        (r) => !(r.owner_id === id && rows.some((x) => x.collection === r.collection && x.path === r.path)),
      );
      save(s);
    },

    fake: {
      setOffline(v) {
        const s = load();
        s.offline = v;
        save(s);
      },
      dump: load,
      lastResetToken(email) {
        const r = load().resets.filter((x) => x.email.toLowerCase() === email.toLowerCase());
        return r.length ? r[r.length - 1].token : null;
      },
      seedItem(row) {
        const s = load();
        s.items = s.items.filter((r) => r.id !== row.id);
        s.items.push(row);
        save(s);
      },
    },
  };
}

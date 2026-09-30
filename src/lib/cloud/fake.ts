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
  Friend,
  ItemRow,
  Post,
  Profile,
  Reactions,
  TrashOriginRow,
} from './backend';
import { USERNAME_RE } from './backend';
import { REQUIRED_SCHEMA_VERSION } from './schema';

const KEY = 'beadloom.fakeCloud';
const SESSION = 'beadloom.fakeCloud.session';

interface Server {
  users: Array<CloudUser & { password: string }>;
  items: Array<ItemRow & { owner_id: string; published?: boolean; published_at?: string | null }>;
  folders: Array<FolderRow & { owner_id: string }>;
  trash: Array<TrashOriginRow & { owner_id: string }>;
  resets: Array<{ token: string; email: string }>;
  profiles?: Array<{ user_id: string; username: string; avatar?: string | null }>;
  friendships?: Array<{ requester: string; addressee: string; accepted: boolean }>;
  shares?: Array<{ item_id: string; grantee_id: string }>;
  reactions?: Array<{ item_id: string; user_id: string; liked: boolean; stars: number | null }>;
  comments?: Array<{ id: string; item_id: string; author_id: string; body: string; created_at: string }>;
  posts?: Array<{
    id: string;
    author_id: string;
    title: string;
    body: string;
    visibility: 'draft' | 'friends' | 'public';
    design_ids: string[];
    created_at: string;
    updated_at: string;
    published_at: string | null;
  }>;
  /** Simulated outage: every request fails while set. */
  offline: boolean;
  /** Pretend the database is at this migration (default: current). */
  schemaVersion?: number;
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
/** The newer tables, for a server saved before they existed. */
const people = (s: Server) => {
  s.profiles ??= [];
  s.friendships ??= [];
  s.shares ??= [];
  s.reactions ??= [];
  s.comments ??= [];
  s.posts ??= [];
  return s as Server &
    Required<Pick<Server, 'profiles' | 'friendships' | 'shares' | 'reactions' | 'comments' | 'posts'>>;
};
/** What posts_read allows. */
const canRead = (s: Server, p: NonNullable<Server['posts']>[number], uid: string | null) =>
  p.visibility === 'public' ||
  (!!uid && (p.author_id === uid || (p.visibility === 'friends' && areFriends(s, p.author_id, uid))));

/** What private.can_see() allows: published designs, my own, shared with me,
 *  and those in a post I can read. */
const canSee = (s: Server, itemId: string, uid: string | null) => {
  const i = s.items.find((x) => x.id === itemId);
  if (!i || i.deleted_at) return false;
  if (i.published && i.collection === 'design') return true;
  if (people(s).posts.some((p) => p.visibility !== 'draft' && p.design_ids.includes(itemId) && canRead(s, p, uid)))
    return true;
  if (!uid) return false;
  return (
    i.owner_id === uid ||
    (people(s).shares.some((sh) => sh.item_id === itemId && sh.grantee_id === uid) && areFriends(s, i.owner_id, uid))
  );
};
const toPost = (s: Server, p: NonNullable<Server['posts']>[number], uid: string | null): Post => {
  const a = uid ? people(s).profiles.find((x) => x.user_id === p.author_id) : undefined;
  return {
    id: p.id,
    authorId: p.author_id,
    author: a ? { id: a.user_id, username: a.username, avatar: a.avatar ?? null } : null,
    title: p.title,
    body: p.body,
    visibility: p.visibility,
    designIds: p.design_ids,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    publishedAt: p.published_at,
  };
};
const areFriends = (s: Server, a: string, b: string) =>
  people(s).friendships.some(
    (f) => f.accepted && ((f.requester === a && f.addressee === b) || (f.requester === b && f.addressee === a)),
  );
const save = (s: Server) => localStorage.setItem(KEY, JSON.stringify(s));

export function createFakeBackend(): CloudBackend & {
  /** Test hooks. */
  fake: {
    setOffline(v: boolean): void;
    setSchemaVersion(v: number | undefined): void;
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
    async schemaVersion() {
      guard();
      return load().schemaVersion ?? REQUIRED_SCHEMA_VERSION;
    },
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
        .map(({ owner_id: _o, published: _p, published_at: _pa, ...r }) => r);
    },
    async upsertItems(rows) {
      guard();
      const id = me();
      const s = load();
      for (const row of rows) {
        const i = s.items.findIndex((r) => r.id === row.id && r.owner_id === id);
        // like the Data API's upsert: columns not sent (published) are kept
        const next = { ...(i >= 0 ? s.items[i] : {}), ...row, owner_id: id };
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

    // ---- people ----------------------------------------------------------
    async myProfile() {
      guard();
      const id = me();
      const p = people(load()).profiles.find((x) => x.user_id === id);
      return p ? { id: p.user_id, username: p.username, avatar: p.avatar ?? null } : null;
    },
    async setAvatar(avatar) {
      guard();
      const id = me();
      const s = people(load());
      const p = s.profiles.find((x) => x.user_id === id);
      if (!p) return { ok: false, error: 'Pick a username first' };
      p.avatar = avatar;
      save(s);
      return { ok: true };
    },
    async setUsername(username) {
      guard();
      const id = me();
      const name = username.trim().toLowerCase();
      if (!USERNAME_RE.test(name)) return { ok: false, error: 'Use 3–24 letters, digits or underscores' };
      const s = people(load());
      if (s.profiles.some((x) => x.username === name && x.user_id !== id)) return { ok: false, error: `“${name}” is taken` };
      const p = s.profiles.find((x) => x.user_id === id);
      if (p) p.username = name;
      else s.profiles.push({ user_id: id, username: name });
      save(s);
      return { ok: true };
    },
    async searchUsers(prefix) {
      guard();
      const id = me();
      const q = prefix.trim().toLowerCase();
      if (!q) return [];
      return people(load())
        .profiles.filter((x) => x.user_id !== id && x.username.startsWith(q))
        .sort((a, b) => a.username.localeCompare(b.username))
        .slice(0, 20)
        .map((x) => ({ id: x.user_id, username: x.username, avatar: x.avatar ?? null }));
    },
    async friends() {
      guard();
      const id = me();
      const s = people(load());
      const out: Friend[] = [];
      for (const f of s.friendships) {
        if (f.requester !== id && f.addressee !== id) continue;
        const other = f.requester === id ? f.addressee : f.requester;
        const p = s.profiles.find((x) => x.user_id === other);
        if (p)
          out.push({
            user: { id: other, username: p.username, avatar: p.avatar ?? null },
            status: f.accepted ? 'friends' : f.requester === id ? 'outgoing' : 'incoming',
          });
      }
      return out.sort((a, b) => a.user.username.localeCompare(b.user.username));
    },
    async requestFriend(userId) {
      guard();
      const id = me();
      const s = people(load());
      if (!s.profiles.some((x) => x.user_id === id)) return { ok: false, error: 'Pick a username first' };
      if (s.friendships.some((f) => [f.requester, f.addressee].includes(id) && [f.requester, f.addressee].includes(userId)))
        return { ok: false, error: 'You already have a friend request with them' };
      s.friendships.push({ requester: id, addressee: userId, accepted: false });
      save(s);
      return { ok: true };
    },
    async acceptFriend(userId) {
      guard();
      const id = me();
      const s = people(load());
      for (const f of s.friendships) if (f.requester === userId && f.addressee === id) f.accepted = true;
      save(s);
    },
    async removeFriend(userId) {
      guard();
      const id = me();
      const s = people(load());
      const pair = [id, userId];
      s.friendships = s.friendships.filter((f) => !(pair.includes(f.requester) && pair.includes(f.addressee)));
      // unfriending takes back shares both ways (a trigger, on Neon)
      s.shares = s.shares.filter((sh) => {
        const owner = s.items.find((i) => i.id === sh.item_id)?.owner_id;
        return !(pair.includes(sh.grantee_id) && owner && pair.includes(owner) && owner !== sh.grantee_id);
      });
      save(s);
    },

    // ---- sharing ---------------------------------------------------------
    async gallery(limit) {
      guard();
      const s = people(load());
      const name = (uid: string): Profile | null => {
        const p = sessionUser && s.profiles.find((x) => x.user_id === uid);
        return p ? { id: uid, username: p.username, avatar: p.avatar ?? null } : null;
      };
      return s.items
        .filter((i) => i.published && i.collection === 'design' && !i.deleted_at)
        .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
        .slice(0, limit)
        .map((i) => ({ id: i.id, doc: i.doc, publishedAt: i.published_at ?? '', owner: name(i.owner_id) }));
    },
    async sharedWithMe() {
      guard();
      const id = me();
      const s = people(load());
      return s.shares
        .filter((sh) => sh.grantee_id === id)
        .map((sh) => s.items.find((i) => i.id === sh.item_id))
        .filter((i): i is NonNullable<typeof i> => !!i && !i.deleted_at && areFriends(s, i.owner_id, id))
        .map((i) => {
          const p = s.profiles.find((x) => x.user_id === i.owner_id);
          return {
            id: i.id,
            collection: i.collection,
            path: i.path,
            doc: i.doc,
            modified: i.modified,
            owner: p ? { id: i.owner_id, username: p.username, avatar: p.avatar ?? null } : null,
          };
        });
    },
    async sharing(itemId) {
      guard();
      const id = me();
      const s = people(load());
      const item = s.items.find((i) => i.id === itemId && i.owner_id === id);
      return {
        published: !!item?.published,
        friendIds: item ? s.shares.filter((sh) => sh.item_id === itemId).map((sh) => sh.grantee_id) : [],
      };
    },
    async setPublished(itemId, published) {
      guard();
      const id = me();
      const s = load();
      for (const i of s.items)
        if (i.id === itemId && i.owner_id === id) {
          i.published = published;
          i.published_at = published ? new Date().toISOString() : null;
        }
      save(s);
    },
    async myVisibleDesigns() {
      guard();
      const id = me();
      const s = people(load());
      return s.items
        .filter(
          (i) =>
            i.owner_id === id &&
            i.collection === 'design' &&
            !i.deleted_at &&
            (i.published || s.shares.some((sh) => sh.item_id === i.id)),
        )
        .map((i) => ({ id: i.id, name: i.path.split('/').pop() || i.path }));
    },
    async setFriendShares(itemId, friendIds) {
      guard();
      const id = me();
      const s = people(load());
      if (!s.items.some((i) => i.id === itemId && i.owner_id === id)) throw new Error('Sharing: not your item');
      if (friendIds.some((f) => !areFriends(s, id, f))) throw new Error('Sharing: only with friends');
      s.shares = s.shares.filter((sh) => sh.item_id !== itemId);
      for (const f of friendIds) s.shares.push({ item_id: itemId, grantee_id: f });
      save(s);
    },

    // ---- likes and ratings -------------------------------------------------
    async reactions(itemIds) {
      guard();
      const s = people(load());
      const uid = sessionUser?.id ?? null;
      const out = new Map<string, Reactions>();
      for (const id of itemIds) {
        if (!canSee(s, id, uid)) continue;
        const rs = s.reactions.filter((r) => r.item_id === id);
        const stars = rs.map((r) => r.stars).filter((x): x is number => x !== null);
        const mine = uid ? rs.find((r) => r.user_id === uid) : undefined;
        const comments = s.comments.filter((c) => c.item_id === id).length;
        if (!rs.length && !comments) continue;
        out.set(id, {
          likes: rs.filter((r) => r.liked).length,
          ratings: stars.length,
          average: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 100) / 100 : null,
          comments,
          mine: mine ? { liked: mine.liked, stars: mine.stars } : null,
        });
      }
      return out;
    },
    async react(itemId, change) {
      guard();
      const id = me();
      const s = people(load());
      const item = s.items.find((i) => i.id === itemId);
      if (!item || !canSee(s, itemId, id)) throw new Error('Saving your rating: not allowed');
      if (change.stars != null && !(change.stars >= 1 && change.stars <= 5)) throw new Error('Saving your rating: 1–5 stars');
      let r = s.reactions.find((x) => x.item_id === itemId && x.user_id === id);
      if (!r) s.reactions.push((r = { item_id: itemId, user_id: id, liked: false, stars: null }));
      if (change.liked !== undefined) r.liked = change.liked;
      if (change.stars !== undefined) r.stars = change.stars;
      save(s);
    },

    // ---- comments and links ------------------------------------------------
    async comments(itemId) {
      guard();
      const id = me();
      const s = people(load());
      if (!canSee(s, itemId, id)) return [];
      const owner = s.items.find((i) => i.id === itemId)?.owner_id;
      return s.comments
        .filter((c) => c.item_id === itemId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => {
          const p = s.profiles.find((x) => x.user_id === c.author_id);
          return {
            id: c.id,
            author: p ? { id: p.user_id, username: p.username, avatar: p.avatar ?? null } : null,
            body: c.body,
            createdAt: c.created_at,
            canDelete: c.author_id === id || owner === id,
          };
        });
    },
    async addComment(itemId, body) {
      guard();
      const id = me();
      const s = people(load());
      const text = body.trim();
      if (!text) return { ok: false, error: 'Write something first' };
      if (!s.profiles.some((p) => p.user_id === id)) return { ok: false, error: 'Pick a username (in Account) before commenting' };
      if (!canSee(s, itemId, id)) return { ok: false, error: 'Could not post the comment' };
      s.comments.push({
        id: 'c_' + Math.random().toString(36).slice(2, 10),
        item_id: itemId,
        author_id: id,
        body: text,
        created_at: new Date().toISOString(),
      });
      save(s);
      return { ok: true };
    },
    async deleteComment(commentId) {
      guard();
      const id = me();
      const s = people(load());
      s.comments = s.comments.filter((c) => {
        if (c.id !== commentId) return true;
        const owner = s.items.find((i) => i.id === c.item_id)?.owner_id;
        return !(c.author_id === id || owner === id);
      });
      save(s);
    },
    async design(itemId) {
      guard();
      const s = people(load());
      const uid = sessionUser?.id ?? null;
      const i = s.items.find((x) => x.id === itemId);
      if (!i || i.collection !== 'design' || !canSee(s, itemId, uid)) return null;
      const p = uid ? s.profiles.find((x) => x.user_id === i.owner_id) : undefined;
      return {
        id: i.id,
        doc: i.doc,
        publishedAt: i.published_at ?? '',
        owner: p ? { id: p.user_id, username: p.username, avatar: p.avatar ?? null } : null,
      };
    },

    // ---- posts ---------------------------------------------------------------
    async posts({ mine, limit }) {
      guard();
      const uid = sessionUser?.id ?? null;
      const s = people(load());
      const list = mine
        ? s.posts.filter((p) => p.author_id === me()).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        : s.posts
            .filter((p) => p.visibility !== 'draft' && canRead(s, p, uid))
            .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
      return list.slice(0, limit).map((p) => toPost(s, p, uid));
    },
    async post(postId) {
      guard();
      const uid = sessionUser?.id ?? null;
      const s = people(load());
      const p = s.posts.find((x) => x.id === postId);
      return p && canRead(s, p, uid) && (p.visibility !== 'draft' || p.author_id === uid) ? toPost(s, p, uid) : null;
    },
    async savePost(d) {
      guard();
      const id = me();
      const s = people(load());
      if (!s.profiles.some((p) => p.user_id === id)) return { ok: false, error: 'Pick a username (in Account) before posting' };
      if (!d.title.trim()) return { ok: false, error: 'Give it a title' };
      if (d.designIds.some((x) => s.items.find((i) => i.id === x)?.owner_id !== id))
        return { ok: false, error: 'Could not save the post' };
      const now = new Date().toISOString();
      let p = d.id ? s.posts.find((x) => x.id === d.id && x.author_id === id) : undefined;
      if (d.id && !p) return { ok: false, error: 'Could not save the post' };
      if (!p) {
        p = {
          id: crypto.randomUUID(),
          author_id: id,
          title: '',
          body: '',
          visibility: 'draft',
          design_ids: [],
          created_at: now,
          updated_at: now,
          published_at: null,
        };
        s.posts.push(p);
      }
      Object.assign(p, {
        title: d.title.trim(),
        body: d.body,
        visibility: d.visibility,
        design_ids: d.designIds,
        updated_at: now,
        published_at: d.visibility === 'draft' ? p.published_at : (p.published_at ?? now),
      });
      save(s);
      return { ok: true, id: p.id };
    },
    async deletePost(postId) {
      guard();
      const id = me();
      const s = people(load());
      s.posts = s.posts.filter((p) => !(p.id === postId && p.author_id === id));
      save(s);
    },

    fake: {
      setOffline(v) {
        const s = load();
        s.offline = v;
        save(s);
      },
      setSchemaVersion(v) {
        const s = load();
        s.schemaVersion = v;
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

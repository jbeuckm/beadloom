// The real cloud: Neon Auth for accounts and the Neon Data API (PostgREST) for
// rows. Row-level security (db/migrations) decides what each user may read and
// write. Reads of "my library" still filter by owner: the policies also let a
// user read what friends shared and what anyone published.

import { createClient } from '@neondatabase/neon-js';
import type {
  AuthResult,
  CloudBackend,
  CloudUser,
  FolderRow,
  Friend,
  ItemRow,
  Comment,
  GalleryItem,
  Post,
  Profile,
  Reactions,
  SharedItem,
  TrashOriginRow,
} from './backend';
import { NO_REACTIONS, USERNAME_RE } from './backend';

const ITEM_COLUMNS = 'id,collection,path,doc,modified,deleted_at';
const POST_COLUMNS = 'id,author_id,title,body,visibility,design_ids,created_at,updated_at,published_at';
type PostRow = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  visibility: Post['visibility'];
  design_ids: string[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
};
const PROFILE_COLUMNS = 'user_id,username,avatar';
type ProfileRow = { user_id: string; username: string; avatar: string | null };
const toProfile = (p: ProfileRow): Profile => ({ id: p.user_id, username: p.username, avatar: p.avatar });

export function createNeonBackend(authUrl: string, dataApiUrl: string): CloudBackend {
  // allowAnonymous: signed out, Data API requests carry an anonymous token
  // (role `anonymous`), which is what lets visitors browse the gallery
  const client = createClient({ auth: { url: authUrl, allowAnonymous: true }, dataApi: { url: dataApiUrl } });
  const ba = client.auth; // the Better Auth client: signIn.email, getSession, useSession…

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUser = (u: any): CloudUser => ({
    id: String(u.id),
    email: String(u.email ?? ''),
    name: u.name ? String(u.name) : undefined,
    emailVerified: !!u.emailVerified,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (r: { error?: any }, fallback: string): AuthResult =>
    r.error ? { ok: false, error: String(r.error.message ?? r.error.statusText ?? fallback) } : { ok: true };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const check = (r: { error: any }, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message ?? r.error.code ?? 'request failed'}`);
  };
  const myId = async (): Promise<string> => {
    const id = (await ba.getSession()).data?.user?.id;
    if (!id) throw new Error('Not signed in');
    return String(id);
  };
  const signedIn = async () => !!(await ba.getSession()).data?.user;
  /** Usernames for these user ids (signed in only; missing ids are skipped). */
  const profilesOf = async (ids: string[]): Promise<Map<string, Profile>> => {
    const out = new Map<string, Profile>();
    const want = [...new Set(ids)];
    if (!want.length) return out;
    const r = await client.from('profiles').select(PROFILE_COLUMNS).in('user_id', want);
    check(r, 'Loading usernames');
    for (const p of (r.data ?? []) as ProfileRow[]) out.set(p.user_id, toProfile(p));
    return out;
  };
  /** Where sign-up verification and password-reset links come back to. */
  const here = () => `${location.origin}${location.pathname}`;

  const backend: CloudBackend = {
    async schemaVersion() {
      const r = await client
        .from('schema_migrations')
        .select('version')
        .order('version', { ascending: false })
        .limit(1);
      if (r.error) return 0; // no table yet → nothing applied
      return Number((r.data?.[0] as { version?: number } | undefined)?.version ?? 0);
    },
    async currentUser() {
      const r = await ba.getSession();
      return r.data?.user ? toUser(r.data.user) : null;
    },
    onUserChange(fn) {
      let last: string | null | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ba.useSession.subscribe((s: any) => {
        if (s?.isPending) return;
        const u = s?.data?.user ? toUser(s.data.user) : null;
        const id = u?.id ?? null;
        if (id === last) return;
        last = id;
        fn(u);
      });
    },
    async signIn(email, password) {
      return result(await ba.signIn.email({ email, password }), 'Sign-in failed');
    },
    async signUp(email, password, name) {
      return result(
        await ba.signUp.email({ email, password, name, callbackURL: here() }),
        'Sign-up failed',
      );
    },
    async signOut() {
      await ba.signOut();
    },
    async requestPasswordReset(email, redirectTo) {
      return result(await ba.requestPasswordReset({ email, redirectTo }), 'Could not send the reset email');
    },
    async resetPassword(token, newPassword) {
      return result(await ba.resetPassword({ newPassword, token }), 'Could not reset the password');
    },

    async pullItems(since) {
      let q = client.from('library_items').select(ITEM_COLUMNS).eq('owner_id', await myId());
      if (since) q = q.or(`modified.gt.${since},deleted_at.gt.${since}`);
      const r = await q;
      check(r, 'Loading your library');
      return (r.data ?? []) as ItemRow[];
    },
    async upsertItems(rows) {
      check(await client.from('library_items').upsert(rows, { onConflict: 'id' }), 'Saving to your account');
    },
    async deleteItems(ids, deletedAt) {
      check(
        await client.from('library_items').update({ deleted_at: deletedAt }).in('id', ids),
        'Deleting from your account',
      );
    },

    async pullFolders() {
      const r = await client.from('library_folders').select('collection,path');
      check(r, 'Loading folders');
      return (r.data ?? []) as FolderRow[];
    },
    async addFolders(rows) {
      if (!rows.length) return;
      check(
        await client
          .from('library_folders')
          .upsert(rows, { onConflict: 'owner_id,collection,path', ignoreDuplicates: true }),
        'Saving folders',
      );
    },
    async removeFolders(rows) {
      for (const row of rows)
        check(
          await client.from('library_folders').delete().eq('collection', row.collection).eq('path', row.path),
          'Removing a folder',
        );
    },

    async pullTrashOrigins() {
      const r = await client.from('trash_origins').select('collection,path,origin');
      check(r, 'Loading the Trash');
      return (r.data ?? []) as TrashOriginRow[];
    },
    async setTrashOrigins(rows) {
      if (!rows.length) return;
      check(
        await client.from('trash_origins').upsert(rows, { onConflict: 'owner_id,collection,path' }),
        'Saving the Trash',
      );
    },
    async removeTrashOrigins(rows) {
      for (const row of rows)
        check(
          await client.from('trash_origins').delete().eq('collection', row.collection).eq('path', row.path),
          'Updating the Trash',
        );
    },

    // ---- people ----------------------------------------------------------
    async myProfile() {
      const id = await myId();
      const r = await client.from('profiles').select(PROFILE_COLUMNS).eq('user_id', id).maybeSingle();
      check(r, 'Loading your profile');
      const p = r.data as ProfileRow | null;
      return p ? toProfile(p) : null;
    },
    async setUsername(username) {
      const name = username.trim().toLowerCase();
      if (!USERNAME_RE.test(name))
        return { ok: false, error: 'Use 3–24 letters, digits or underscores' };
      const id = await myId();
      const has = await client.from('profiles').select('user_id').eq('user_id', id).maybeSingle();
      check(has, 'Loading your profile');
      const r = has.data
        ? await client.from('profiles').update({ username: name }).eq('user_id', id)
        : await client.from('profiles').insert({ username: name });
      if (r.error?.code === '23505') return { ok: false, error: `“${name}” is taken` };
      return result(r, 'Could not save the username');
    },
    async setAvatar(avatar) {
      const r = await client.from('profiles').update({ avatar }).eq('user_id', await myId()).select('user_id');
      if (!r.error && !r.data?.length) return { ok: false, error: 'Pick a username first' };
      return result(r, 'Could not save the picture');
    },
    async searchUsers(prefix) {
      const q = prefix.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (!q) return [];
      const r = await client
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .ilike('username', `${q}*`)
        .neq('user_id', await myId())
        .order('username')
        .limit(20);
      check(r, 'Finding people');
      return ((r.data ?? []) as ProfileRow[]).map(toProfile);
    },
    async friends() {
      const me = await myId();
      const r = await client.from('friendships').select('requester,addressee,accepted');
      check(r, 'Loading friends');
      const rows = (r.data ?? []) as Array<{ requester: string; addressee: string; accepted: boolean }>;
      const other = (f: (typeof rows)[number]) => (f.requester === me ? f.addressee : f.requester);
      const names = await profilesOf(rows.map(other));
      const out: Friend[] = [];
      for (const f of rows) {
        const user = names.get(other(f));
        if (!user) continue;
        out.push({ user, status: f.accepted ? 'friends' : f.requester === me ? 'outgoing' : 'incoming' });
      }
      return out.sort((a, b) => a.user.username.localeCompare(b.user.username));
    },
    async requestFriend(userId) {
      const r = await client.from('friendships').insert({ addressee: userId });
      if (r.error?.code === '23505') return { ok: false, error: 'You already have a friend request with them' };
      return result(r, 'Could not send the request');
    },
    async acceptFriend(userId) {
      check(
        await client.from('friendships').update({ accepted: true }).eq('requester', userId).eq('addressee', await myId()),
        'Accepting the request',
      );
    },
    async removeFriend(userId) {
      const pair = [await myId(), userId];
      check(await client.from('friendships').delete().in('requester', pair).in('addressee', pair), 'Removing the friend');
    },

    // ---- sharing ---------------------------------------------------------
    async gallery(limit) {
      const r = await client
        .from('library_items')
        .select('id,doc,published_at,owner_id')
        .eq('published', true)
        .eq('collection', 'design')
        .is('deleted_at', null)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      check(r, 'Loading the gallery');
      const rows = (r.data ?? []) as Array<{ id: string; doc: unknown; published_at: string | null; owner_id: string }>;
      const names = (await signedIn()) ? await profilesOf(rows.map((x) => x.owner_id)) : new Map<string, Profile>();
      return rows.map((x) => ({
        id: x.id,
        doc: x.doc,
        publishedAt: x.published_at ?? '',
        owner: names.get(x.owner_id) ?? null,
      }));
    },
    async sharedWithMe() {
      const r = await client
        .from('shares')
        .select('library_items(id,collection,path,doc,modified,owner_id,deleted_at)')
        .eq('grantee_id', await myId());
      check(r, 'Loading what friends shared');
      type Row = { library_items: (Omit<SharedItem, 'owner'> & { owner_id: string; deleted_at: string | null }) | null };
      const items = ((r.data ?? []) as unknown as Row[])
        .map((x) => x.library_items)
        .filter((x): x is NonNullable<Row['library_items']> => !!x && !x.deleted_at);
      const names = await profilesOf(items.map((x) => x.owner_id));
      return items.map(({ owner_id, deleted_at: _d, ...x }) => ({ ...x, owner: names.get(owner_id) ?? null }));
    },
    async sharing(itemId) {
      const [item, shares] = await Promise.all([
        client.from('library_items').select('published').eq('id', itemId).maybeSingle(),
        client.from('shares').select('grantee_id').eq('item_id', itemId),
      ]);
      check(item, 'Loading sharing');
      check(shares, 'Loading sharing');
      return {
        published: !!(item.data as { published?: boolean } | null)?.published,
        friendIds: ((shares.data ?? []) as Array<{ grantee_id: string }>).map((x) => x.grantee_id),
      };
    },
    async setPublished(itemId, published) {
      check(
        await client
          .from('library_items')
          .update({ published, published_at: published ? new Date().toISOString() : null })
          .eq('id', itemId),
        published ? 'Publishing' : 'Unpublishing',
      );
    },
    async myVisibleDesigns() {
      const me = await myId();
      const shared = await client.from('shares').select('item_id').eq('created_by', me);
      check(shared, 'Loading your shared designs');
      const ids = [...new Set(((shared.data ?? []) as Array<{ item_id: string }>).map((x) => x.item_id))];
      let q = client
        .from('library_items')
        .select('id,path')
        .eq('owner_id', me)
        .eq('collection', 'design')
        .is('deleted_at', null);
      q = ids.length ? q.or(`published.eq.true,id.in.(${ids.join(',')})`) : q.eq('published', true);
      const r = await q;
      check(r, 'Loading your shared designs');
      return ((r.data ?? []) as Array<{ id: string; path: string }>).map((x) => ({
        id: x.id,
        name: x.path.split('/').pop() || x.path,
      }));
    },
    async setFriendShares(itemId, friendIds) {
      const cur = await client.from('shares').select('grantee_id').eq('item_id', itemId);
      check(cur, 'Loading sharing');
      const have = new Set(((cur.data ?? []) as Array<{ grantee_id: string }>).map((x) => x.grantee_id));
      const want = new Set(friendIds);
      const drop = [...have].filter((id) => !want.has(id));
      const add = [...want].filter((id) => !have.has(id));
      if (drop.length)
        check(await client.from('shares').delete().eq('item_id', itemId).in('grantee_id', drop), 'Unsharing');
      if (add.length)
        check(
          await client.from('shares').insert(add.map((grantee_id) => ({ item_id: itemId, grantee_id, role: 'viewer' }))),
          'Sharing',
        );
    },

    // ---- likes and ratings -------------------------------------------------
    async reactions(itemIds) {
      const out = new Map<string, Reactions>();
      if (!itemIds.length) return out;
      const stats = await client.rpc('reaction_stats', { ids: itemIds });
      check(stats, 'Loading likes');
      type Stat = { item_id: string; likes: number; ratings: number; average: number | null; comments: number };
      for (const r of (stats.data ?? []) as Stat[])
        out.set(r.item_id, {
          likes: r.likes,
          ratings: r.ratings,
          average: r.average === null ? null : Number(r.average),
          comments: r.comments,
          mine: null,
        });
      if (await signedIn()) {
        const mine = await client.from('item_reactions').select('item_id,liked,stars').in('item_id', itemIds);
        check(mine, 'Loading your likes');
        for (const r of (mine.data ?? []) as Array<{ item_id: string; liked: boolean; stars: number | null }>)
          out.set(r.item_id, { ...(out.get(r.item_id) ?? NO_REACTIONS), mine: { liked: r.liked, stars: r.stars } });
      }
      return out;
    },
    async react(itemId, change) {
      const row: Record<string, unknown> = { item_id: itemId, user_id: await myId(), updated_at: new Date().toISOString() };
      if (change.liked !== undefined) row.liked = change.liked;
      if (change.stars !== undefined) row.stars = change.stars;
      check(await client.from('item_reactions').upsert(row, { onConflict: 'item_id,user_id' }), 'Saving your rating');
    },

    // ---- comments and links ------------------------------------------------
    async comments(itemId) {
      const me = await myId();
      const [r, item] = await Promise.all([
        client
          .from('item_comments')
          .select('id,author_id,body,created_at')
          .eq('item_id', itemId)
          .order('created_at', { ascending: true }),
        client.from('library_items').select('owner_id').eq('id', itemId).maybeSingle(),
      ]);
      check(r, 'Loading comments');
      const rows = (r.data ?? []) as Array<{ id: string; author_id: string; body: string; created_at: string }>;
      const mine = (item.data as { owner_id?: string } | null)?.owner_id === me;
      const names = await profilesOf(rows.map((x) => x.author_id));
      return rows.map((x) => ({
        id: x.id,
        author: names.get(x.author_id) ?? null,
        body: x.body,
        createdAt: x.created_at,
        canDelete: mine || x.author_id === me,
      }));
    },
    async addComment(itemId, body) {
      const text = body.trim();
      if (!text) return { ok: false, error: 'Write something first' };
      if (text.length > 2000) return { ok: false, error: 'Keep it under 2000 characters' };
      const r = await client.from('item_comments').insert({ item_id: itemId, body: text });
      if (r.error?.code === '42501') return { ok: false, error: 'Pick a username (in Account) before commenting' };
      return result(r, 'Could not post the comment');
    },
    async deleteComment(commentId) {
      check(await client.from('item_comments').delete().eq('id', commentId), 'Deleting the comment');
    },
    async design(itemId): Promise<GalleryItem | null> {
      const r = await client
        .from('library_items')
        .select('id,doc,published_at,owner_id,collection,deleted_at')
        .eq('id', itemId)
        .maybeSingle();
      check(r, 'Loading the design');
      const x = r.data as { id: string; doc: unknown; published_at: string | null; owner_id: string; collection: string; deleted_at: string | null } | null;
      if (!x || x.deleted_at || x.collection !== 'design') return null;
      const names = (await signedIn()) ? await profilesOf([x.owner_id]) : new Map<string, Profile>();
      return { id: x.id, doc: x.doc, publishedAt: x.published_at ?? '', owner: names.get(x.owner_id) ?? null };
    },

    // ---- posts ---------------------------------------------------------------
    async posts({ mine, limit }) {
      let q = client.from('posts').select(POST_COLUMNS);
      if (mine) q = q.eq('author_id', await myId()).order('updated_at', { ascending: false });
      else q = q.neq('visibility', 'draft').order('published_at', { ascending: false });
      const r = await q.limit(limit);
      check(r, 'Loading posts');
      return toPosts((r.data ?? []) as PostRow[]);
    },
    async post(postId) {
      const r = await client.from('posts').select(POST_COLUMNS).eq('id', postId).maybeSingle();
      check(r, 'Loading the post');
      return r.data ? (await toPosts([r.data as PostRow]))[0] : null;
    },
    async savePost(d) {
      const title = d.title.trim();
      if (!title) return { ok: false, error: 'Give it a title' };
      const now = new Date().toISOString();
      const row: Record<string, unknown> = {
        title,
        body: d.body,
        visibility: d.visibility,
        design_ids: d.designIds,
        updated_at: now,
      };
      let published: string | null = null;
      if (d.id) {
        const was = await client.from('posts').select('published_at').eq('id', d.id).maybeSingle();
        published = (was.data as { published_at: string | null } | null)?.published_at ?? null;
      }
      // first time out of drafts: that's when it was published
      row.published_at = d.visibility === 'draft' ? published : (published ?? now);
      const r = d.id
        ? await client.from('posts').update(row).eq('id', d.id).select('id')
        : await client.from('posts').insert(row).select('id');
      if (r.error?.code === '42501' || r.error?.code === '23503')
        return { ok: false, error: 'Pick a username (in Account) before posting' };
      const res = result(r, 'Could not save the post');
      return res.ok ? { ...res, id: String((r.data as Array<{ id: string }>)?.[0]?.id ?? d.id) } : res;
    },
    async deletePost(postId) {
      check(await client.from('posts').delete().eq('id', postId), 'Deleting the post');
    },
  };

  return backend;

  async function toPosts(rows: PostRow[]): Promise<Post[]> {
    const names = (await signedIn()) ? await profilesOf(rows.map((x) => x.author_id)) : new Map<string, Profile>();
    return rows.map((x) => ({
      id: x.id,
      authorId: x.author_id,
      author: names.get(x.author_id) ?? null,
      title: x.title,
      body: x.body,
      visibility: x.visibility,
      designIds: x.design_ids ?? [],
      createdAt: x.created_at,
      updatedAt: x.updated_at,
      publishedAt: x.published_at,
    }));
  }
}

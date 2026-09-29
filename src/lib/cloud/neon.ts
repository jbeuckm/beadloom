// The real cloud: Neon Auth for accounts and the Neon Data API (PostgREST) for
// rows. Row-level security in db/schema.sql scopes every query to the
// signed-in user, so this file never filters by owner itself.

import { createClient } from '@neondatabase/neon-js';
import type {
  AuthResult,
  CloudBackend,
  CloudUser,
  FolderRow,
  ItemRow,
  TrashOriginRow,
} from './backend';

const ITEM_COLUMNS = 'id,collection,path,doc,modified,deleted_at';

export function createNeonBackend(authUrl: string, dataApiUrl: string): CloudBackend {
  const client = createClient({ auth: { url: authUrl }, dataApi: { url: dataApiUrl } });
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
  /** Where sign-up verification and password-reset links come back to. */
  const here = () => `${location.origin}${location.pathname}`;

  return {
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
      let q = client.from('library_items').select(ITEM_COLUMNS);
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
  };
}

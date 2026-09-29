// The cloud behind accounts and sync, as the app sees it: sign-in and a few
// row operations on the user's library. `neon.ts` implements it on Neon
// (Neon Auth + Data API); `fake.ts` is an in-memory stand-in for tests and
// local development. The sync layer and UI only ever talk to this interface.

export type Collection = 'design' | 'palette';

export interface CloudUser {
  id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
}

export interface ItemRow {
  id: string; // client-generated uuid, stable across renames and moves
  collection: Collection;
  path: string;
  doc: unknown; // the design / palette JSON, parsed
  modified: string; // ISO timestamp from the document
  deleted_at: string | null;
}

export interface FolderRow {
  collection: Collection;
  path: string;
}

export interface TrashOriginRow {
  collection: Collection;
  path: string;
  origin: string;
}

export interface AuthResult {
  ok: boolean;
  error?: string; // a message fit to show
}

export interface CloudBackend {
  /** The newest applied migration (0 when the table is missing or empty). */
  schemaVersion(): Promise<number>;
  /** The signed-in user, or null. Resolves once the stored session is checked. */
  currentUser(): Promise<CloudUser | null>;
  /** Called whenever the signed-in user changes (sign-in, sign-out, expiry). */
  onUserChange(fn: (user: CloudUser | null) => void): () => void;

  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string, name: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** Emails a reset link that lands on `redirectTo` with a `token` query param. */
  requestPasswordReset(email: string, redirectTo: string): Promise<AuthResult>;
  resetPassword(token: string, newPassword: string): Promise<AuthResult>;

  /** Every row of the user's library changed after `since` (ISO), deletions included. */
  pullItems(since: string | null): Promise<ItemRow[]>;
  upsertItems(rows: ItemRow[]): Promise<void>;
  /** Soft-delete by id. */
  deleteItems(ids: string[], deletedAt: string): Promise<void>;

  pullFolders(): Promise<FolderRow[]>;
  addFolders(rows: FolderRow[]): Promise<void>;
  removeFolders(rows: FolderRow[]): Promise<void>;

  pullTrashOrigins(): Promise<TrashOriginRow[]>;
  setTrashOrigins(rows: TrashOriginRow[]): Promise<void>;
  removeTrashOrigins(rows: Omit<TrashOriginRow, 'origin'>[]): Promise<void>;
}

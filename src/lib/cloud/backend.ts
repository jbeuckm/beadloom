// The cloud behind accounts and sync, as the app sees it: sign-in, row
// operations on the user's library, usernames, friends and sharing. `neon.ts` implements it on Neon
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

/** Usernames: 3–24 of a–z, 0–9, _ (the database checks the same). */
export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

/** A signed-in user as other users see them. */
export interface Profile {
  id: string;
  username: string;
  /** Profile picture: a small PNG data URL rendered from one of their designs. */
  avatar?: string | null;
}

/** accepted both ways · incoming: they asked me · outgoing: I asked them */
export type FriendStatus = 'friends' | 'incoming' | 'outgoing';
export interface Friend {
  user: Profile;
  status: FriendStatus;
}

/** A design someone published, as the gallery shows it. */
export interface GalleryItem {
  id: string;
  doc: unknown;
  publishedAt: string;
  /** Only when signed in: users are hidden from signed-out visitors. */
  owner: Profile | null;
}

/** An item a friend shared with me. */
export interface SharedItem {
  id: string;
  collection: Collection;
  path: string;
  doc: unknown;
  modified: string;
  owner: Profile | null;
}

/** How one of my items is shared. */
export interface ItemSharing {
  published: boolean;
  friendIds: string[];
}

/** Likes and star ratings on a design: totals, and mine when signed in. */
export interface Reactions {
  likes: number;
  ratings: number;
  average: number | null; // mean stars, 1–5
  comments: number;
  mine: { liked: boolean; stars: number | null } | null;
}
export const NO_REACTIONS: Reactions = { likes: 0, ratings: 0, average: null, comments: 0, mine: null };

export interface Comment {
  id: string;
  author: Profile | null;
  body: string;
  createdAt: string;
  /** Mine, or on my design: I can delete it. */
  canDelete: boolean;
}

/** A journal post about one or more of its author's designs. */
export type PostVisibility = 'draft' | 'friends' | 'public';
export interface Post {
  id: string;
  authorId: string;
  /** Only when signed in: users are hidden from signed-out visitors. */
  author: Profile | null;
  title: string;
  body: string;
  visibility: PostVisibility;
  designIds: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}
export interface PostDraft {
  id?: string; // absent: a new post
  title: string;
  body: string;
  visibility: PostVisibility;
  designIds: string[];
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

  // ---- people: usernames and friends (signed in only) ----
  /** My username, or null until I've picked one. */
  myProfile(): Promise<Profile | null>;
  /** Claim or change my username (3–24 of a–z, 0–9, _). */
  setUsername(username: string): Promise<AuthResult>;
  /** Set (a PNG data URL) or clear my profile picture. */
  setAvatar(avatar: string | null): Promise<AuthResult>;
  /** Users whose username starts with `prefix`, me excluded. */
  searchUsers(prefix: string): Promise<Profile[]>;
  /** Everyone I'm friends with or have a pending request with. */
  friends(): Promise<Friend[]>;
  requestFriend(userId: string): Promise<AuthResult>;
  acceptFriend(userId: string): Promise<void>;
  /** Decline, cancel or unfriend; unfriending takes back shares both ways. */
  removeFriend(userId: string): Promise<void>;

  // ---- sharing ----
  /** Published designs, newest first. Works signed out. */
  gallery(limit: number): Promise<GalleryItem[]>;
  /** What friends have shared with me. */
  sharedWithMe(): Promise<SharedItem[]>;
  sharing(itemId: string): Promise<ItemSharing>;
  /** Show (or stop showing) one of my designs in the public gallery. */
  setPublished(itemId: string, published: boolean): Promise<void>;
  /** Share one of my items with exactly these friends. */
  setFriendShares(itemId: string, friendIds: string[]): Promise<void>;
  /** My designs others can see (published, or shared with a friend), for activity. */
  myVisibleDesigns(): Promise<Array<{ id: string; name: string }>>;

  // ---- likes and ratings ----
  /** Totals for designs I can see (signed out: the gallery's), plus mine. */
  reactions(itemIds: string[]): Promise<Map<string, Reactions>>;
  /** Like / unlike and rate (1–5, or null to clear) a design I can see, mine included. */
  react(itemId: string, change: { liked?: boolean; stars?: number | null }): Promise<void>;

  // ---- comments (signed in) and links ----
  /** Oldest first. */
  comments(itemId: string): Promise<Comment[]>;
  addComment(itemId: string, body: string): Promise<AuthResult>;
  deleteComment(commentId: string): Promise<void>;
  /** One design I can see (a shared link lands on it); null if not. Works signed out for published ones. */
  design(itemId: string): Promise<GalleryItem | null>;

  // ---- posts ----
  /** Posts I can read, newest first: public ones, friends' and my own (with
   *  drafts). `mine` narrows to my own. Works signed out (public only). */
  posts(opts: { mine?: boolean; limit: number }): Promise<Post[]>;
  post(postId: string): Promise<Post | null>;
  /** Create or update one of my posts; its id. */
  savePost(draft: PostDraft): Promise<AuthResult & { id?: string }>;
  deletePost(postId: string): Promise<void>;
}

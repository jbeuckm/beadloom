// Local-first sync. localStorage stays the working copy; every write to a
// library bag or folder list (storage.ts calls `noteBagWrite` / `noteListWrite`)
// is diffed against what was there and queued in an outbox, which is pushed
// to the cloud whenever we're signed in and online. Pulls merge remote
// changes back into localStorage; per item the newest `modified` wins.
//
// Cloud rows are keyed by a client-made uuid that survives renames and moves;
// the map from "collection:path" to that id lives in localStorage too.

import * as storage from '../storage';
import type { CloudBackend, CloudUser, Collection, ItemRow } from './backend';

const IDS_KEY = 'beadloom.cloud.ids';
const OUTBOX_KEY = 'beadloom.cloud.outbox';
const STATE_KEY = 'beadloom.cloud.state';

export type SyncStatus = 'off' | 'synced' | 'syncing' | 'offline' | 'error';
export interface SyncInfo {
  status: SyncStatus;
  pending: number; // queued changes not yet in the cloud
  error?: string;
  lastSync?: string; // ISO
}

interface Outbox {
  /** item id → its collection (upsert) or null (delete) */
  items: Record<string, Collection | null>;
  folders: { add: Record<string, Collection>; remove: Record<string, Collection> }; // key: "collection:path"
  trash: { set: Record<string, Collection>; remove: Record<string, Collection> };
}
interface CloudState {
  userId: string | null;
  lastPull: string | null;
}

const COLLECTION_OF_BAG: Record<string, Collection> = { [storage.DKEY]: 'design', [storage.PKEY]: 'palette' };
const COLLECTION_OF_LIST: Record<string, Collection> = { [storage.FKEY]: 'design', [storage.PFKEY]: 'palette' };
const COLLECTION_OF_TRASH: Record<string, Collection> = { [storage.TKEY]: 'design', [storage.PTKEY]: 'palette' };
const BAG_OF: Record<Collection, string> = { design: storage.DKEY, palette: storage.PKEY };
const LIST_OF: Record<Collection, string> = { design: storage.FKEY, palette: storage.PFKEY };
const TRASH_OF: Record<Collection, string> = { design: storage.TKEY, palette: storage.PTKEY };

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};
const emptyOutbox = (): Outbox => ({
  items: {},
  folders: { add: {}, remove: {} },
  trash: { set: {}, remove: {} },
});

export const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });

/** When a stored document was last changed (designs: meta.modified; palettes: modified). */
export function modifiedOf(json: string): string {
  try {
    const raw = JSON.parse(json);
    const m = raw?.meta?.modified ?? raw?.modified;
    if (typeof m === 'string' && !Number.isNaN(Date.parse(m))) return new Date(m).toISOString();
  } catch {
    /* fall through */
  }
  return new Date(0).toISOString();
}

export interface SyncEngine {
  start(): void;
  stop(): void;
  /** Push now (after a pull); resolves when the outbox is empty or a request failed. */
  flush(): Promise<void>;
  /** Queue every local item, folder and trash origin that isn't in the cloud yet. */
  uploadEverything(): Promise<void>;
  /** Local items that have never been synced to the current account. */
  unsyncedCount(): number;
  info(): SyncInfo;
  setUser(user: CloudUser | null): void;
}

export function createSyncEngine(
  backend: CloudBackend,
  onInfo: (info: SyncInfo) => void,
  onLibraryChanged: () => void,
): SyncEngine {
  let user: CloudUser | null = null;
  let ids = readJson<Record<string, string>>(IDS_KEY, {});
  let outbox = readJson<Outbox>(OUTBOX_KEY, emptyOutbox());
  let state = readJson<CloudState>(STATE_KEY, { userId: null, lastPull: null });
  let status: SyncStatus = 'off';
  let error: string | undefined;
  let lastSync: string | undefined;
  let applying = false; // true while a pull writes localStorage: don't re-queue
  let flushing: Promise<void> | null = null;
  let dirtyDuringFlush = false;
  let timer: number | null = null;
  let retryDelay = 5000;
  let started = false;

  const idKey = (c: Collection, path: string) => `${c}:${path}`;
  const pathOf = (id: string): { collection: Collection; path: string } | null => {
    for (const [k, v] of Object.entries(ids))
      if (v === id) {
        const i = k.indexOf(':');
        return { collection: k.slice(0, i) as Collection, path: k.slice(i + 1) };
      }
    return null;
  };
  const saveIds = () => writeJson(IDS_KEY, ids);
  const saveOutbox = () => writeJson(OUTBOX_KEY, outbox);
  const saveState = () => writeJson(STATE_KEY, state);

  const pendingCount = () =>
    Object.keys(outbox.items).length +
    Object.keys(outbox.folders.add).length +
    Object.keys(outbox.folders.remove).length +
    Object.keys(outbox.trash.set).length +
    Object.keys(outbox.trash.remove).length;
  const emit = () => onInfo({ status, pending: pendingCount(), error, lastSync });
  const setStatus = (s: SyncStatus, e?: string) => {
    status = s;
    error = e;
    emit();
  };

  // ---- recording local changes -------------------------------------------

  const queueItem = (id: string, c: Collection) => {
    outbox.items[id] = c;
  };
  const queueDelete = (id: string) => {
    outbox.items[id] = null;
  };

  const onBagWrite = (key: string, prev: storage.Bag, next: storage.Bag) => {
    if (applying) return;
    const c = COLLECTION_OF_BAG[key];
    if (c) {
      const removed = Object.keys(prev).filter((k) => !(k in next));
      const added = Object.keys(next).filter((k) => !(k in prev));
      const changed = Object.keys(next).filter((k) => k in prev && prev[k] !== next[k]);
      // moves: the same content under a new path keeps its id (movePrefix,
      // moveFile); a lone rename (content re-titled) does too
      const used = new Set<string>();
      for (const r of removed) {
        let a = added.find((x) => !used.has(x) && next[x] === prev[r]);
        if (!a && removed.length === 1 && added.length === 1) a = added[0];
        const id = ids[idKey(c, r)];
        delete ids[idKey(c, r)];
        if (a && id) {
          used.add(a);
          ids[idKey(c, a)] = id;
          queueItem(id, c);
        } else if (id) queueDelete(id);
      }
      for (const a of added) {
        if (used.has(a)) continue;
        const id = ids[idKey(c, a)] ?? uuid();
        ids[idKey(c, a)] = id;
        queueItem(id, c);
      }
      for (const k of changed) {
        const id = ids[idKey(c, k)] ?? uuid();
        ids[idKey(c, k)] = id;
        queueItem(id, c);
      }
      saveIds();
    } else {
      const t = COLLECTION_OF_TRASH[key];
      if (!t) return;
      for (const k of Object.keys(next))
        if (prev[k] !== next[k]) {
          outbox.trash.set[idKey(t, k)] = t;
          delete outbox.trash.remove[idKey(t, k)];
        }
      for (const k of Object.keys(prev))
        if (!(k in next)) {
          outbox.trash.remove[idKey(t, k)] = t;
          delete outbox.trash.set[idKey(t, k)];
        }
    }
    saveOutbox();
    changed_();
  };

  const onListWrite = (key: string, prev: string[], next: string[]) => {
    if (applying) return;
    const c = COLLECTION_OF_LIST[key];
    if (!c) return;
    for (const p of next)
      if (!prev.includes(p)) {
        outbox.folders.add[idKey(c, p)] = c;
        delete outbox.folders.remove[idKey(c, p)];
      }
    for (const p of prev)
      if (!next.includes(p)) {
        outbox.folders.remove[idKey(c, p)] = c;
        delete outbox.folders.add[idKey(c, p)];
      }
    saveOutbox();
    changed_();
  };

  const changed_ = () => {
    emit();
    if (user) void flush();
  };

  // ---- pushing -------------------------------------------------------------

  const itemRow = (id: string, c: Collection): ItemRow | null => {
    const at = pathOf(id);
    if (!at || at.collection !== c) return null;
    const json = storage.readBag(BAG_OF[c])[at.path];
    if (json === undefined) return null;
    let doc: unknown;
    try {
      doc = JSON.parse(json);
    } catch {
      return null;
    }
    return { id, collection: c, path: at.path, doc, modified: modifiedOf(json), deleted_at: null };
  };

  const splitKey = (k: string) => {
    const i = k.indexOf(':');
    return { collection: k.slice(0, i) as Collection, path: k.slice(i + 1) };
  };

  async function push() {
    // snapshot what we send; anything queued meanwhile stays for next time
    const snap: Outbox = JSON.parse(JSON.stringify(outbox));
    const upserts: ItemRow[] = [];
    const deletes: string[] = [];
    for (const [id, c] of Object.entries(snap.items)) {
      if (c === null) deletes.push(id);
      else {
        const row = itemRow(id, c);
        if (row) upserts.push(row);
      }
    }
    if (upserts.length) await backend.upsertItems(upserts);
    if (deletes.length) await backend.deleteItems(deletes, new Date().toISOString());

    const fAdd = Object.entries(snap.folders.add).map(([k]) => splitKey(k));
    const fRem = Object.entries(snap.folders.remove).map(([k]) => splitKey(k));
    if (fAdd.length) await backend.addFolders(fAdd);
    if (fRem.length) await backend.removeFolders(fRem);

    const tSet = Object.entries(snap.trash.set)
      .map(([k]) => splitKey(k))
      .map((r) => ({ ...r, origin: storage.readBag(TRASH_OF[r.collection])[r.path] }))
      .filter((r) => typeof r.origin === 'string');
    const tRem = Object.entries(snap.trash.remove).map(([k]) => splitKey(k));
    if (tSet.length) await backend.setTrashOrigins(tSet);
    if (tRem.length) await backend.removeTrashOrigins(tRem);

    // sent: drop exactly what we snapshotted
    for (const id of Object.keys(snap.items)) if (outbox.items[id] === snap.items[id]) delete outbox.items[id];
    for (const k of Object.keys(snap.folders.add)) delete outbox.folders.add[k];
    for (const k of Object.keys(snap.folders.remove)) delete outbox.folders.remove[k];
    for (const k of Object.keys(snap.trash.set)) delete outbox.trash.set[k];
    for (const k of Object.keys(snap.trash.remove)) delete outbox.trash.remove[k];
    saveOutbox();
  }

  // ---- pulling -------------------------------------------------------------

  async function pull() {
    const rows = await backend.pullItems(state.lastPull);
    let newest = state.lastPull ?? '';
    let touched = false;
    applying = true;
    try {
      for (const row of rows) {
        const stamp = row.deleted_at && row.deleted_at > row.modified ? row.deleted_at : row.modified;
        if (stamp > newest) newest = stamp;
        const c = row.collection;
        const bag = storage.readBag(BAG_OF[c]);
        const local = pathOf(row.id);
        const localJson = local && local.collection === c ? bag[local.path] : undefined;
        const localModified = localJson !== undefined ? modifiedOf(localJson) : null;
        const pendingLocally = outbox.items[row.id] !== undefined;

        if (row.deleted_at) {
          if (localJson === undefined || !local) continue;
          if (localModified! > row.deleted_at || pendingLocally) continue; // ours is newer: it'll re-upload
          delete bag[local.path];
          delete ids[idKey(c, local.path)];
          storage.writeBag(BAG_OF[c], bag);
          touched = true;
          continue;
        }

        if (localJson !== undefined && local) {
          if (row.modified <= localModified!) continue; // ours is newer or the same
          if (local.path !== row.path) delete bag[local.path];
          delete ids[idKey(c, local.path)];
        } else if (bag[row.path] !== undefined) {
          // a different local item sits at this path: one path, one id — adopt
          // the cloud's id, keep whichever content is newer
          const otherId = ids[idKey(c, row.path)];
          if (otherId && otherId !== row.id) {
            delete outbox.items[otherId];
            if (modifiedOf(bag[row.path]) > row.modified) {
              ids[idKey(c, row.path)] = row.id;
              queueItem(row.id, c);
              continue;
            }
          }
        }
        bag[row.path] = JSON.stringify(row.doc, null, 2);
        ids[idKey(c, row.path)] = row.id;
        storage.writeBag(BAG_OF[c], bag);
        touched = true;
      }

      // folders and trash origins are small: the cloud is the truth, except
      // for what we're about to send
      for (const c of ['design', 'palette'] as Collection[]) {
        const remote = (await backend.pullFolders()).filter((r) => r.collection === c).map((r) => r.path);
        const add = Object.keys(outbox.folders.add).filter((k) => k.startsWith(c + ':')).map((k) => splitKey(k).path);
        const rem = new Set(
          Object.keys(outbox.folders.remove).filter((k) => k.startsWith(c + ':')).map((k) => splitKey(k).path),
        );
        const next = [...new Set([...remote, ...add])].filter((p) => !rem.has(p)).sort();
        const cur = storage.readList(LIST_OF[c]);
        if (next.join('\n') !== [...cur].sort().join('\n')) {
          storage.writeList(LIST_OF[c], next);
          touched = true;
        }

        const origins = (await backend.pullTrashOrigins()).filter((r) => r.collection === c);
        const bagT: storage.Bag = {};
        for (const r of origins) bagT[r.path] = r.origin;
        const curT = storage.readBag(TRASH_OF[c]);
        for (const k of Object.keys(outbox.trash.set))
          if (k.startsWith(c + ':')) {
            const p = splitKey(k).path;
            if (curT[p] !== undefined) bagT[p] = curT[p];
          }
        for (const k of Object.keys(outbox.trash.remove)) if (k.startsWith(c + ':')) delete bagT[splitKey(k).path];
        if (JSON.stringify(bagT) !== JSON.stringify(curT)) {
          storage.writeBag(TRASH_OF[c], bagT);
          touched = true;
        }
      }
    } finally {
      applying = false;
    }
    saveIds();
    saveOutbox();
    if (newest && newest !== state.lastPull) {
      state.lastPull = newest;
      saveState();
    }
    if (touched) onLibraryChanged();
  }

  // ---- the loop --------------------------------------------------------------

  async function flush(): Promise<void> {
    if (!user) return;
    if (flushing) {
      dirtyDuringFlush = true;
      return flushing;
    }
    flushing = (async () => {
      setStatus('syncing');
      try {
        await pull();
        await push();
        retryDelay = 5000;
        lastSync = new Date().toISOString();
        setStatus('synced');
      } catch (e) {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const msg = (e as Error)?.message ?? String(e);
        const network = offline || /network|fetch|Failed to fetch|load failed/i.test(msg);
        setStatus(network ? 'offline' : 'error', network ? undefined : msg);
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(() => void flush(), retryDelay);
        retryDelay = Math.min(retryDelay * 2, 120_000);
      } finally {
        flushing = null;
      }
    })();
    await flushing;
    if (dirtyDuringFlush) {
      dirtyDuringFlush = false;
      await flush();
    }
  }

  const onOnline = () => void flush();
  const onVisible = () => {
    if (document.visibilityState === 'visible') void flush();
  };
  let interval: number | null = null;

  function start() {
    if (started) return;
    started = true;
    storage.setWriteHooks({ bag: onBagWrite, list: onListWrite });
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    interval = window.setInterval(() => void flush(), 3 * 60 * 1000);
    emit();
  }
  function stop() {
    started = false;
    storage.setWriteHooks(null);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    if (interval) clearInterval(interval);
    if (timer) clearTimeout(timer);
  }

  function unsyncedCount(): number {
    let n = 0;
    for (const c of ['design', 'palette'] as Collection[])
      for (const p of Object.keys(storage.readBag(BAG_OF[c]))) if (!ids[idKey(c, p)]) n++;
    return n;
  }

  async function uploadEverything() {
    for (const c of ['design', 'palette'] as Collection[]) {
      for (const p of Object.keys(storage.readBag(BAG_OF[c]))) {
        const id = ids[idKey(c, p)] ?? uuid();
        ids[idKey(c, p)] = id;
        queueItem(id, c);
      }
      for (const p of storage.readList(LIST_OF[c])) outbox.folders.add[idKey(c, p)] = c;
      for (const p of Object.keys(storage.readBag(TRASH_OF[c]))) outbox.trash.set[idKey(c, p)] = c;
    }
    saveIds();
    saveOutbox();
    emit();
    await flush();
  }

  function setUser(u: CloudUser | null) {
    user = u;
    if (!u) {
      if (timer) clearTimeout(timer);
      setStatus('off');
      return;
    }
    if (state.userId !== u.id) {
      // a different account: what we knew about the cloud no longer applies
      ids = {};
      outbox = emptyOutbox();
      state = { userId: u.id, lastPull: null };
      saveIds();
      saveOutbox();
      saveState();
    }
    void flush();
  }

  return {
    start,
    stop,
    flush,
    uploadEverything,
    unsyncedCount,
    info: () => ({ status, pending: pendingCount(), error, lastSync }),
    setUser,
  };
}

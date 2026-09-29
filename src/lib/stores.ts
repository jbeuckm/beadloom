// The libraries the app uses. Without accounts it's just Local Storage, as
// ever. With accounts, designs and palettes each live in two stores:
//
//   Local Storage — this device only; never uploaded.
//   Cloud Storage — the signed-in account's, cached here and synced.
//
// combineStores() shows both as one library whose top-level folders are the
// stores ("Local Storage/Gifts/Bracelet"), so the file browser needs no
// special cases. Each store keeps its own Trash; the combined Trash holds one
// folder per store (".Trash/Cloud Storage/Old"), so isInTrash still works.
// Moving between stores copies into the other store and deletes the original,
// which is how a design gets uploaded to (or kept off) the account.

import { cloudConfig } from './cloud/config';
import {
  TRASH,
  cloudDesigns,
  cloudPalettes,
  isInTrash,
  isWithin,
  localDesigns,
  localPalettes,
  splitPath,
  type Entry,
  type FileEntry,
  type FolderEntry,
  type ItemRef,
  type Library,
  type PathMap,
} from './library';

export const LOCAL_STORAGE = 'Local Storage';
export const CLOUD_STORAGE = 'Cloud Storage';

interface Store {
  label: string;
  icon: 'device' | 'cloud';
  lib: Library;
  cloud?: boolean; // shown only while signed in
}

// Cloud Storage is shown only while signed in (lib/cloud/index.ts says when).
let cloudOpen = false;
export const setCloudStoreOpen = (open: boolean) => {
  cloudOpen = open;
};

export function combineStores(rootName: string, all: Store[]): Library {
  const stores = () => all.filter((s) => !s.cloud || cloudOpen);

  /** A store's path as the combined library shows it. */
  const outer = (s: Store, inner: string) =>
    inner === ''
      ? s.label
      : inner === TRASH
        ? `${TRASH}/${s.label}`
        : isInTrash(inner)
          ? `${TRASH}/${s.label}/${inner.slice(TRASH.length + 1)}`
          : `${s.label}/${inner}`;

  /** Which store a combined path is in, and its path there; null for the
   *  top level and the combined Trash itself. */
  function where(path: string): { store: Store; inner: string } | null {
    const trash = isInTrash(path);
    const rest = trash ? path.slice(TRASH.length + 1) : path;
    if (!rest) return null;
    const i = rest.indexOf('/');
    const label = i < 0 ? rest : rest.slice(0, i);
    const tail = i < 0 ? '' : rest.slice(i + 1);
    const store = stores().find((s) => s.label === label);
    if (!store) return null;
    return { store, inner: trash ? (tail ? `${TRASH}/${tail}` : TRASH) : tail };
  }
  /** A store's own top folder or its Trash: fixed, can't be renamed or moved. */
  const isStoreRoot = (path: string) => {
    const w = where(path);
    return !!w && (w.inner === '' || w.inner === TRASH);
  };
  /** Where to put something aimed at the top level: the first store. */
  const into = (folder: string) => where(folder) ?? { store: stores()[0], inner: '' };

  const mapEntry =
    (s: Store) =>
    <E extends Entry>(e: E): E => ({ ...e, path: outer(s, e.path), folder: outer(s, e.folder) });
  const mapPaths = (s: Store, m: PathMap, into: PathMap) => {
    for (const [a, b] of m) into.set(outer(s, a), outer(s, b));
  };
  /** Group refs by store (store roots dropped), each with its inner path. */
  const byStore = (items: ItemRef[]) => {
    const out = new Map<Store, ItemRef[]>();
    for (const it of items) {
      const w = where(it.path);
      if (!w || isStoreRoot(it.path)) continue;
      out.set(w.store, [...(out.get(w.store) ?? []), { kind: it.kind, path: w.inner }]);
    }
    return out;
  };

  const rootFolder = (s: Store, trash: boolean): FolderEntry => {
    const inside = s.lib.listFolder(trash ? TRASH : '');
    const files = s.lib.allFiles().filter((f) => isInTrash(f.path) === trash);
    return {
      kind: 'folder',
      path: trash ? `${TRASH}/${s.label}` : s.label,
      folder: trash ? TRASH : '',
      name: s.label,
      count: inside.length,
      modified: Math.max(0, ...files.map((f) => f.meta.modified)),
    };
  };

  const allFiles = (): FileEntry[] => stores().flatMap((s) => s.lib.allFiles().map(mapEntry(s)));
  const allFolders = (): string[] =>
    [
      TRASH,
      ...stores().flatMap((s) => [s.label, ...s.lib.allFolders().map((f) => outer(s, f))]),
    ].sort((a, b) => a.localeCompare(b));
  const childFolders = (parent: string) =>
    parent === ''
      ? stores().map((s) => s.label) // in their own order, not the alphabet's
      : allFolders().filter((f) => splitPath(f).folder === parent && f !== TRASH);

  /** Copy one item into another store's folder; the original is deleted by the caller. */
  function copyAcross(from: Store, it: ItemRef, to: Store, dest: string, map: PathMap): string {
    const name = splitPath(it.path).name;
    if (it.kind === 'file') {
      const json = from.lib.load(it.path);
      if (json === null) return dest;
      const made = to.lib.importFile(dest, name, json);
      map.set(outer(from, it.path), outer(to, made.path));
      return made.path;
    }
    const folder = to.lib.createFolder(dest, name);
    for (const e of from.lib.listFolder(it.path)) copyAcross(from, e, to, folder, map);
    return folder;
  }

  return {
    rootName,
    storesAtTop: true,
    // signed in, new work goes to the account unless put elsewhere
    defaultFolder: () => (stores().find((s) => s.cloud) ?? stores()[0]).label,
    folderIcon: (path: string) => {
      const w = where(path);
      return w && w.inner === '' ? w.store.icon : null;
    },
    folderName: (path: string) => {
      if (path === '') return rootName;
      if (path === TRASH) return 'Trash';
      if (isStoreRoot(path)) return where(path)!.store.label;
      return splitPath(path).name;
    },
    allFiles,
    allFolders,
    childFolders,
    listFolder(folder: string): Entry[] {
      if (folder === '') return stores().map((s) => rootFolder(s, false));
      if (folder === TRASH) return stores().map((s) => rootFolder(s, true));
      const w = where(folder);
      return w ? w.store.lib.listFolder(w.inner).map(mapEntry(w.store)) : [];
    },
    recent: (limit = 24) =>
      stores()
        .flatMap((s) => s.lib.recent(limit).map(mapEntry(s)))
        .sort((a, b) => b.meta.modified - a.meta.modified)
        .slice(0, limit),
    search: (q: string) => stores().flatMap((s) => s.lib.search(q).map(mapEntry(s))),
    trashCount: () => stores().reduce((n, s) => n + s.lib.trashCount(), 0),
    load(path: string) {
      const w = where(path);
      return w ? w.store.lib.load(w.inner) : null;
    },
    has(path: string) {
      const w = where(path);
      return !!w && w.store.lib.has(w.inner);
    },
    uniqueName(folder: string, base: string) {
      const w = into(folder);
      return w.store.lib.uniqueName(w.inner, base);
    },
    save(folder: string, name: string, json: string) {
      const w = into(folder);
      return outer(w.store, w.store.lib.save(w.inner, name, json));
    },
    createFolder(parent: string, name?: string) {
      const w = into(parent);
      return outer(w.store, w.store.lib.createFolder(w.inner, name));
    },
    rename(item: ItemRef, newName: string) {
      const map: PathMap = new Map();
      const w = where(item.path);
      if (!w || isStoreRoot(item.path))
        return { map, path: item.path, error: `“${splitPath(item.path).name}” can’t be renamed.` };
      const r = w.store.lib.rename({ kind: item.kind, path: w.inner }, newName);
      mapPaths(w.store, r.map, map);
      return { map, path: outer(w.store, r.path), error: r.error };
    },
    canMove(items: ItemRef[], dest: string) {
      const d = where(dest);
      // into a store's own folders; the Trash is reached through trash()
      if (!d || isInTrash(dest)) return false;
      return (
        items.length > 0 &&
        items.every((it) => {
          const w = where(it.path);
          if (!w || isStoreRoot(it.path)) return false;
          return w.store === d.store
            ? w.store.lib.canMove([{ kind: it.kind, path: w.inner }], d.inner)
            : !isInTrash(it.path);
        })
      );
    },
    move(items: ItemRef[], dest: string) {
      const map: PathMap = new Map();
      const d = where(dest);
      if (!d) return map;
      for (const [s, refs] of byStore(items)) {
        if (s === d.store) {
          mapPaths(s, s.lib.move(refs, d.inner), map);
          continue;
        }
        const movable = refs.filter((r) => !isInTrash(r.path));
        for (const r of movable) copyAcross(s, r, d.store, d.inner, map);
        s.lib.deleteForever(movable);
      }
      return map;
    },
    importFile(dest: string, name: string, json: string) {
      const w = into(dest);
      const r = w.store.lib.importFile(w.inner, name, json);
      return { kind: r.kind, path: outer(w.store, r.path) };
    },
    duplicate(items: ItemRef[]) {
      const made: ItemRef[] = [];
      for (const [s, refs] of byStore(items))
        for (const r of s.lib.duplicate(refs)) made.push({ kind: r.kind, path: outer(s, r.path) });
      return made;
    },
    trash(items: ItemRef[]) {
      const map: PathMap = new Map();
      for (const [s, refs] of byStore(items)) mapPaths(s, s.lib.trash(refs), map);
      return map;
    },
    putBack(items: ItemRef[]) {
      const map: PathMap = new Map();
      for (const [s, refs] of byStore(items)) mapPaths(s, s.lib.putBack(refs), map);
      return map;
    },
    deleteForever(items: ItemRef[]) {
      for (const it of items) {
        // a store's folder inside the Trash: empty that store's Trash
        const w = where(it.path);
        if (w && w.inner === TRASH) w.store.lib.emptyTrash();
      }
      for (const [s, refs] of byStore(items)) s.lib.deleteForever(refs);
    },
    emptyTrash: () => stores().forEach((s) => s.lib.emptyTrash()),
    thumbnail(path: string) {
      const w = where(path);
      return w ? w.store.lib.thumbnail(w.inner) : null;
    },
  };
}

/** Is `path` (a combined path) in Cloud Storage? */
export const inCloudStorage = (path: string | null | undefined) =>
  !!path && cloudConfig.available && (isWithin(path, CLOUD_STORAGE) || isWithin(path, `${TRASH}/${CLOUD_STORAGE}`));
/** A combined Cloud Storage path → the path inside the cloud store (what syncs). */
export const cloudInnerPath = (path: string) =>
  path.startsWith(CLOUD_STORAGE + '/') ? path.slice(CLOUD_STORAGE.length + 1) : path;

export const designLibrary: Library = cloudConfig.available
  ? combineStores('Designs', [
      { label: LOCAL_STORAGE, icon: 'device', lib: localDesigns },
      { label: CLOUD_STORAGE, icon: 'cloud', lib: cloudDesigns, cloud: true },
    ])
  : localDesigns;

export const paletteLibrary: Library = cloudConfig.available
  ? combineStores('Palettes', [
      { label: LOCAL_STORAGE, icon: 'device', lib: localPalettes },
      { label: CLOUD_STORAGE, icon: 'cloud', lib: cloudPalettes, cloud: true },
    ])
  : localPalettes;

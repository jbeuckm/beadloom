// Finder-style file management over named JSON slots in localStorage, shared
// by saved designs and saved palettes.
//
// A collection's items are files (a slot key "Folder/Sub/Name") or folders (a
// path "Folder/Sub"). Folders exist implicitly while they hold a file and
// explicitly in the collection's folder registry, so empty ones persist. The
// Trash is the reserved top-level folder TRASH; trashed items remember where
// they came from so they can be put back.

import * as storage from './storage';
import { DEFAULT_GRID_TYPE, gridTypeFor } from './gridTypes';

export const TRASH = '.Trash';

export type ItemKind = 'file' | 'folder';
export interface ItemRef {
  kind: ItemKind;
  path: string;
}

/** What the browser shows about a file, read from its stored JSON. */
export interface FileMeta {
  modified: number; // ms since epoch, 0 when unknown
  typeLabel: string; // "Type" column text
  typeValue: string; // sorts the "Type" column
  sizeLabel: string; // "Size" column text
  sizeValue: number; // sorts the "Size" column
  aspect?: number; // designs: cell height / width, for the cell glyph
  colors?: string[]; // palettes: swatch hexes, for the colour strip
}

export interface FileEntry {
  kind: 'file';
  path: string;
  folder: string;
  name: string;
  meta: FileMeta;
  readonly?: boolean; // e.g. a built-in preset
}

export interface FolderEntry {
  kind: 'folder';
  path: string;
  folder: string;
  name: string;
  modified: number; // newest file inside (recursively)
  count: number; // items directly inside, as Finder counts them
  readonly?: boolean; // a group inside a read-only location
}

export type Entry = FileEntry | FolderEntry;
export type PathMap = Map<string, string>;

export const joinPath = storage.designPath;
export const splitPath = storage.splitDesignPath;

export const itemKey = (r: ItemRef) => `${r.kind === 'folder' ? 'f' : 'i'}:${r.path}`;
export const parseItemKey = (k: string): ItemRef => ({
  kind: k[0] === 'f' ? 'folder' : 'file',
  path: k.slice(2),
});

export const isInTrash = (path: string) => path === TRASH || path.startsWith(TRASH + '/');
/** True when `path` is `folder` itself or somewhere beneath it. */
export const isWithin = (path: string, folder: string) =>
  folder === '' || path === folder || path.startsWith(folder + '/');

/** Every ancestor folder of `path`, nearest last ("a/b/c" -> ["a", "a/b"]). */
function ancestors(path: string): string[] {
  const parts = path.split('/');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'));
  return out;
}

export interface CollectionConfig {
  rootName: string; // the top-level location, e.g. "Designs"
  bagKey: string; // slot bag
  folderKey: string; // folder registry
  trashKey: string; // trashed path -> original folder
  describe: (json: string) => FileMeta;
  /** Keep the stored item's own title in step with its file name. */
  withName: (json: string, name: string) => string;
  thumbnail?: (json: string) => string | null;
}

export type Library = ReturnType<typeof makeLibrary>;

export function makeLibrary(cfg: CollectionConfig) {
  const bag = () => storage.readBag(cfg.bagKey);
  const writeBagOf = (b: storage.Bag) => storage.writeBag(cfg.bagKey, b);
  const folderList = () => storage.readList(cfg.folderKey);
  const writeFolderList = (f: string[]) => storage.writeList(cfg.folderKey, f);
  const origins = () => storage.readBag(cfg.trashKey);
  const writeOrigins = (b: storage.Bag) => storage.writeBag(cfg.trashKey, b);

  const folderName = (path: string) =>
    path === '' ? cfg.rootName : path === TRASH ? 'Trash' : splitPath(path).name;

  // ---- reading -------------------------------------------------------

  const metaCache = new Map<string, FileMeta>();
  const meta = (json: string) => {
    let m = metaCache.get(json);
    if (!m) {
      m = cfg.describe(json);
      metaCache.set(json, m);
    }
    return m;
  };

  function allFiles(): FileEntry[] {
    const b = bag();
    return Object.keys(b).map((path) => ({
      kind: 'file',
      path,
      ...splitPath(path),
      meta: meta(b[path]),
    }));
  }

  /** Every folder path, including implied ancestors (the Trash included). */
  function allFolders(): string[] {
    const set = new Set<string>();
    const add = (f: string) => {
      if (!f) return;
      set.add(f);
      for (const a of ancestors(f)) set.add(a);
    };
    folderList().forEach(add);
    for (const p of Object.keys(bag())) add(splitPath(p).folder);
    set.add(TRASH);
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  const childFolders = (parent: string) =>
    allFolders().filter((f) => splitPath(f).folder === parent && f !== TRASH);

  /** The folders and files directly inside `folder`. */
  function listFolder(folder: string): Entry[] {
    const files = allFiles();
    const folders: FolderEntry[] = childFolders(folder).map((f) => {
      const inside = files.filter((d) => isWithin(d.folder, f));
      return {
        kind: 'folder',
        path: f,
        ...splitPath(f),
        count: files.filter((d) => d.folder === f).length + childFolders(f).length,
        modified: Math.max(0, ...inside.map((d) => d.meta.modified)),
      };
    });
    return [...folders, ...files.filter((d) => d.folder === folder)];
  }

  const recent = (limit = 24): FileEntry[] =>
    allFiles()
      .filter((d) => !isInTrash(d.path))
      .sort((a, b) => b.meta.modified - a.meta.modified)
      .slice(0, limit);

  function search(q: string): Entry[] {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const hit = (name: string) => name.toLowerCase().includes(needle);
    const folders: FolderEntry[] = allFolders()
      .filter((f) => !isInTrash(f) && hit(splitPath(f).name))
      .map((f) => ({ kind: 'folder', path: f, ...splitPath(f), count: 0, modified: 0 }));
    return [...folders, ...allFiles().filter((d) => !isInTrash(d.path) && hit(d.name))];
  }

  const trashCount = () =>
    allFiles().filter((d) => isInTrash(d.path)).length +
    allFolders().filter((f) => splitPath(f).folder === TRASH).length;

  const load = (path: string): string | null => bag()[path] ?? null;
  const has = (path: string) => path in bag();

  // ---- naming --------------------------------------------------------

  const exists = (folder: string, name: string) => {
    const p = joinPath(folder, name);
    return has(p) || allFolders().includes(p);
  };

  /** `base`, or "base 2", "base 3"… — the first name free in `folder`. */
  function uniqueName(folder: string, base: string): string {
    if (!exists(folder, base)) return base;
    const m = /^(.*?)(?: (\d+))?$/.exec(base)!;
    let n = Math.max(2, Number(m[2] || 1) + 1);
    while (exists(folder, `${m[1]} ${n}`)) n++;
    return `${m[1]} ${n}`;
  }

  // ---- writing -------------------------------------------------------
  // Mutations return a map of old -> new file paths so callers can keep an
  // open document pointing at its file.

  function save(folder: string, name: string, json: string): string {
    const path = joinPath(folder, storage.cleanSegment(name));
    const b = bag();
    b[path] = json;
    writeBagOf(b);
    return path;
  }

  /** Rewrite every file, folder and trash record under `from` to sit under `to`. */
  function movePrefix(from: string, to: string, map: PathMap) {
    const out: storage.Bag = {};
    for (const [p, json] of Object.entries(bag())) {
      if (isWithin(p, from) && p !== from) {
        const np = to + p.slice(from.length);
        out[np] = json;
        map.set(p, np);
      } else out[p] = json;
    }
    writeBagOf(out);
    writeFolderList(
      folderList()
        .map((f) => (isWithin(f, from) ? to + f.slice(from.length) : f))
        .concat(to),
    );
    const next: storage.Bag = {};
    for (const [p, o] of Object.entries(origins()))
      next[isWithin(p, from) ? to + p.slice(from.length) : p] = o;
    writeOrigins(next);
  }

  function moveFile(path: string, to: string, map: PathMap) {
    const b = bag();
    if (!(path in b) || path === to) return;
    b[to] = b[path];
    delete b[path];
    writeBagOf(b);
    map.set(path, to);
  }

  function createFolder(parent: string, name = 'untitled folder'): string {
    const seg = storage.cleanSegment(name) || 'untitled folder';
    const path = joinPath(parent, uniqueName(parent, seg));
    writeFolderList(folderList().concat(path));
    return path;
  }

  /** Rename in place. Returns an error message when the name can't be used. */
  function rename(
    item: ItemRef,
    newName: string,
  ): { map: PathMap; path: string; error?: string } {
    const map: PathMap = new Map();
    const seg = storage.cleanSegment(newName);
    const { folder, name } = splitPath(item.path);
    if (!seg) return { map, path: item.path, error: 'Please enter a name.' };
    if (seg === name) return { map, path: item.path };
    if (exists(folder, seg))
      return {
        map,
        path: item.path,
        error: `The name “${seg}” is already taken. Please choose a different name.`,
      };
    const to = joinPath(folder, seg);
    if (item.kind === 'folder') movePrefix(item.path, to, map);
    else {
      const b = bag();
      b[item.path] = cfg.withName(b[item.path], seg);
      writeBagOf(b);
      moveFile(item.path, to, map);
    }
    return { map, path: to };
  }

  /** Can `items` be dropped into `dest`? (Not into themselves or where they are.) */
  const canMove = (items: ItemRef[], dest: string) =>
    items.length > 0 &&
    items.every(
      (it) =>
        splitPath(it.path).folder !== dest &&
        !(it.kind === 'folder' && isWithin(dest, it.path)),
    );

  /** Move one item into `dest` (renaming on a clash); returns its new path. */
  function moveOne(it: ItemRef, dest: string, map: PathMap): string | null {
    if (!canMove([it], dest)) return null;
    const to = joinPath(dest, uniqueName(dest, splitPath(it.path).name));
    if (it.kind === 'folder') movePrefix(it.path, to, map);
    else moveFile(it.path, to, map);
    return to;
  }

  function move(items: ItemRef[], dest: string): PathMap {
    const map: PathMap = new Map();
    for (const it of items) moveOne(it, dest, map);
    return map;
  }

  /** Copy a stored item (from anywhere) into `dest` under a free name. */
  function importFile(dest: string, name: string, json: string): ItemRef {
    const n = uniqueName(dest, storage.cleanSegment(name) || 'untitled');
    return { kind: 'file', path: save(dest, n, cfg.withName(json, n)) };
  }

  function duplicate(items: ItemRef[]): ItemRef[] {
    const made: ItemRef[] = [];
    for (const it of items) {
      const { folder, name } = splitPath(it.path);
      const to = joinPath(folder, uniqueName(folder, `${name} copy`));
      if (it.kind === 'folder') {
        const b = bag();
        for (const [p, json] of Object.entries(b))
          if (isWithin(p, it.path) && p !== it.path) b[to + p.slice(it.path.length)] = json;
        writeBagOf(b);
        writeFolderList(
          folderList()
            .filter((f) => isWithin(f, it.path))
            .map((f) => to + f.slice(it.path.length))
            .concat(folderList(), to),
        );
      } else {
        const json = load(it.path);
        if (json === null) continue;
        save(folder, splitPath(to).name, cfg.withName(json, splitPath(to).name));
      }
      made.push({ kind: it.kind, path: to });
    }
    return made;
  }

  function trash(items: ItemRef[]): PathMap {
    const map: PathMap = new Map();
    for (const it of items) {
      if (isInTrash(it.path)) continue;
      const from = splitPath(it.path).folder;
      const to = moveOne(it, TRASH, map);
      // read after the move: movePrefix rewrites trash records under it
      if (to) writeOrigins({ ...origins(), [to]: from });
    }
    return map;
  }

  /** Return trashed items to where they came from (or the top level). */
  function putBack(items: ItemRef[]): PathMap {
    const map: PathMap = new Map();
    for (const it of items) {
      const o = origins();
      const dest = o[it.path] ?? '';
      delete o[it.path];
      writeOrigins(o);
      moveOne(it, dest, map);
    }
    return map;
  }

  /** Permanently remove items (used inside the Trash). */
  function deleteForever(items: ItemRef[]) {
    const b = bag();
    const o = origins();
    for (const it of items) {
      for (const p of Object.keys(b))
        if (it.kind === 'file' ? p === it.path : isWithin(p, it.path)) delete b[p];
      delete o[it.path];
    }
    writeBagOf(b);
    writeOrigins(o);
    writeFolderList(
      folderList().filter(
        (f) => !items.some((it) => it.kind === 'folder' && isWithin(f, it.path)),
      ),
    );
  }

  function emptyTrash() {
    const b = bag();
    for (const p of Object.keys(b)) if (isInTrash(p)) delete b[p];
    writeBagOf(b);
    writeFolderList(folderList().filter((f) => !isInTrash(f)));
    writeOrigins({});
  }

  const thumbs = new Map<string, string>();
  /** A cached preview image of a stored file, when the collection has one. */
  function thumbnail(path: string): string | null {
    if (!cfg.thumbnail) return null;
    const json = load(path);
    if (!json) return null;
    let t = thumbs.get(json);
    if (t === undefined) {
      t = cfg.thumbnail(json) ?? '';
      thumbs.set(json, t);
    }
    return t || null;
  }

  return {
    rootName: cfg.rootName,
    folderName,
    allFiles,
    allFolders,
    childFolders,
    listFolder,
    recent,
    search,
    trashCount,
    load,
    has,
    uniqueName,
    save,
    createFolder,
    rename,
    canMove,
    move,
    importFile,
    duplicate,
    trash,
    putBack,
    deleteForever,
    emptyTrash,
    thumbnail,
  };
}

const withJson = (json: string, set: (raw: any) => void) => {
  try {
    const raw = JSON.parse(json);
    set(raw);
    return JSON.stringify(raw, null, 2);
  } catch {
    return json; // unreadable — leave it as it is
  }
};

// ---- designs ---------------------------------------------------------------

function describeDesign(json: string): FileMeta {
  let raw: any = {};
  try {
    raw = JSON.parse(json);
  } catch {
    /* unreadable — show it with defaults */
  }
  const loom = raw?.loom ?? {};
  const aspect = Number(loom.cellAspect) || DEFAULT_GRID_TYPE.cellAspect;
  const columns = Number(loom.columns) || 0;
  const rows = Number(loom.rows) || 0;
  const type = gridTypeFor(aspect)?.label ?? `Aspect ${aspect.toFixed(2)}`;
  return {
    modified: Date.parse(raw?.meta?.modified ?? '') || 0,
    typeLabel: type,
    typeValue: type,
    sizeLabel: columns && rows ? `${columns}×${rows}` : '—',
    sizeValue: columns * rows,
    aspect,
  };
}

/** A small PNG data-URL of a saved design's flattened cells. */
function designThumbnail(json: string, box = 112): string | null {
  try {
    const raw = JSON.parse(json);
    const data: number[][] = raw?.cells?.data ?? [];
    const colors: string[] = (raw?.palette?.colors ?? []).map((c: any) => c.hex);
    const rows = data.length;
    const cols = rows ? data[0].length : 0;
    if (!rows || !cols) return null;
    const asp = Number(raw?.loom?.cellAspect) || DEFAULT_GRID_TYPE.cellAspect;
    const cw = Math.min(box / cols, box / (rows * asp));
    const ch = cw * asp;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(cols * cw));
    cv.height = Math.max(1, Math.round(rows * ch));
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = raw?.background || '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const v = data[r][c];
        if (v < 0 || !colors[v]) continue;
        ctx.fillStyle = colors[v];
        ctx.fillRect(c * cw, r * ch, Math.ceil(cw), Math.ceil(ch));
      }
    return cv.toDataURL();
  } catch {
    return null;
  }
}

export const designLibrary = makeLibrary({
  rootName: 'Designs',
  bagKey: storage.DKEY,
  folderKey: storage.FKEY,
  trashKey: storage.TKEY,
  describe: describeDesign,
  withName: (json, name) =>
    withJson(json, (raw) => {
      raw.meta = { ...raw.meta, name };
    }),
  thumbnail: designThumbnail,
});

// ---- palettes --------------------------------------------------------------

export function describePalette(json: string): FileMeta {
  let raw: any = {};
  try {
    raw = JSON.parse(json);
  } catch {
    /* unreadable */
  }
  const list: any[] = Array.isArray(raw?.palette?.colors) ? raw.palette.colors : [];
  const coded = list.some((c) => c?.code);
  const n = list.length;
  const kind =
    typeof raw?.palette?.kind === 'string' ? raw.palette.kind : coded ? 'Bead colours' : 'Colours';
  return {
    modified: Date.parse(raw?.modified ?? '') || 0,
    typeLabel: kind,
    typeValue: kind,
    sizeLabel: `${n} colour${n === 1 ? '' : 's'}`,
    sizeValue: n,
    colors: list.map((c) => String(c?.hex ?? '')),
  };
}

export const paletteLibrary = makeLibrary({
  rootName: 'Palettes',
  bagKey: storage.PKEY,
  folderKey: storage.PFKEY,
  trashKey: storage.PTKEY,
  describe: describePalette,
  withName: (json, name) =>
    withJson(json, (raw) => {
      raw.palette = { ...raw.palette, name };
    }),
});

/** A palette file stamped with when it was saved to the library. */
export const stampPaletteJson = (json: string) =>
  withJson(json, (raw) => {
    raw.modified = new Date().toISOString();
  });

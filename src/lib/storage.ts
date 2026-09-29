// Thin wrappers over localStorage. Named "slots" are stored as JSON-string bags.

export const DKEY = 'beadloom.designs';
export const PKEY = 'beadloom.palettes';
const AUTO = 'beadloom.autosave';
const SET = 'beadloom.settings';
export const FKEY = 'beadloom.folders';
export const TKEY = 'beadloom.trash';
export const PFKEY = 'beadloom.paletteFolders';
export const PTKEY = 'beadloom.paletteTrash';
// Cloud Storage: the signed-in account's designs and palettes, cached on the
// device. Only these are synced (lib/cloud/sync.ts); the keys above are Local
// Storage and never leave the device.
export const CDKEY = 'beadloom.cloud.designs';
export const CFKEY = 'beadloom.cloud.folders';
export const CTKEY = 'beadloom.cloud.trash';
export const CPKEY = 'beadloom.cloud.palettes';
export const CPFKEY = 'beadloom.cloud.paletteFolders';
export const CPTKEY = 'beadloom.cloud.paletteTrash';
export const BKEY = 'beadloom.browser';
export const PBKEY = 'beadloom.paletteBrowser';

export type Bag = Record<string, string>;

// Cloud sync (lib/cloud/sync.ts) watches every write so it can queue the
// difference; with no hooks set (signed out) writes are plain localStorage.
type WriteHooks = {
  bag: (key: string, prev: Bag, next: Bag) => void;
  list: (key: string, prev: string[], next: string[]) => void;
};
let hooks: WriteHooks | null = null;
export function setWriteHooks(h: WriteHooks | null): void {
  hooks = h;
}

export function readBag(key: string): Bag {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return v && typeof v === 'object' ? (v as Bag) : {};
  } catch {
    return {};
  }
}
export function writeBag(key: string, bag: Bag): void {
  const prev = hooks ? readBag(key) : null;
  try {
    localStorage.setItem(key, JSON.stringify(bag));
  } catch {
    /* quota / private mode — ignore */
  }
  if (hooks && prev) hooks.bag(key, prev, bag);
}

// A saved design's slot key is its path: "Name" at the top level, or
// "Folder/Sub/Name". Folders nest to any depth; empty ones are remembered in
// a folder registry. File management (move, rename, trash…) lives in
// lib/library.ts, which serves both designs and palettes.

export const designPath = (folder: string, name: string): string =>
  folder ? `${folder}/${name}` : name;
export const splitDesignPath = (path: string): { folder: string; name: string } => {
  const i = path.lastIndexOf('/');
  return i < 0
    ? { folder: '', name: path }
    : { folder: path.slice(0, i), name: path.slice(i + 1) };
};
/** A single path segment: no separators, no leading dots (reserved). */
export const cleanSegment = (s: string): string =>
  s.replace(/\//g, '-').replace(/^\.+/, '').trim();


export const listDesigns = (): string[] => Object.keys(readBag(DKEY)).sort();
export const saveDesignSlot = (path: string, json: string): void => {
  const b = readBag(DKEY);
  b[path] = json;
  writeBag(DKEY, b);
};
export const loadDesignSlot = (path: string): string | null =>
  readBag(DKEY)[path] ?? null;
export const deleteDesignSlot = (path: string): void => {
  const b = readBag(DKEY);
  delete b[path];
  writeBag(DKEY, b);
};

/** A JSON string list under `key` (folder registries). */
export const readList = (key: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
export const writeList = (key: string, f: string[]): void => {
  const prev = hooks ? readList(key) : null;
  const next = [...new Set(f)].sort();
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  if (hooks && prev) hooks.list(key, prev, next);
};

export const readBrowserPrefs = (key = BKEY): Record<string, unknown> => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};
export const writeBrowserPrefs = (v: Record<string, unknown>, key = BKEY): void => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

export const listPalettes = (): string[] => Object.keys(readBag(PKEY)).sort();
export const savePaletteSlot = (name: string, json: string): void => {
  const b = readBag(PKEY);
  b[name] = json;
  writeBag(PKEY, b);
};
export const loadPaletteSlot = (name: string): string | null =>
  readBag(PKEY)[name] ?? null;
export const deletePaletteSlot = (name: string): void => {
  const b = readBag(PKEY);
  delete b[name];
  writeBag(PKEY, b);
};

export const readAutosave = (): string | null => {
  try {
    return localStorage.getItem(AUTO);
  } catch {
    return null;
  }
};
export const writeAutosave = (json: string): void => {
  try {
    localStorage.setItem(AUTO, json);
  } catch {
    /* ignore */
  }
};

export const readSettings = (): unknown => {
  try {
    return JSON.parse(localStorage.getItem(SET) || 'null');
  } catch {
    return null;
  }
};
export const writeSettings = (s: unknown): void => {
  try {
    localStorage.setItem(SET, JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

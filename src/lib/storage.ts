// Thin wrappers over localStorage. Named "slots" are stored as JSON-string bags.

const DKEY = 'beadloom.designs';
const PKEY = 'beadloom.palettes';
const AUTO = 'beadloom.autosave';
const SET = 'beadloom.settings';

type Bag = Record<string, string>;

function readBag(key: string): Bag {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return v && typeof v === 'object' ? (v as Bag) : {};
  } catch {
    return {};
  }
}
function writeBag(key: string, bag: Bag): void {
  try {
    localStorage.setItem(key, JSON.stringify(bag));
  } catch {
    /* quota / private mode — ignore */
  }
}

export const listDesigns = (): string[] => Object.keys(readBag(DKEY)).sort();
export const saveDesignSlot = (name: string, json: string): void => {
  const b = readBag(DKEY);
  b[name] = json;
  writeBag(DKEY, b);
};
export const loadDesignSlot = (name: string): string | null =>
  readBag(DKEY)[name] ?? null;
export const deleteDesignSlot = (name: string): void => {
  const b = readBag(DKEY);
  delete b[name];
  writeBag(DKEY, b);
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

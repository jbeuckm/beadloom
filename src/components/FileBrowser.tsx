// A Finder-style browser over a library collection (saved designs or saved
// palettes): a sidebar (Recents, an optional read-only location such as the
// built-in presets, the folder tree, Trash), a path bar with back/forward,
// list and icon views, sorting, search, inline rename, drag-and-drop moves,
// a context menu, and an action bar so everything also works by touch.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './icons';
import { useStore } from '../store/useStore';
import * as storage from '../lib/storage';
import * as lib from '../lib/library';
import type { Entry, FileEntry, ItemRef, Library, PathMap } from '../lib/library';

/** A read-only location in the sidebar, e.g. the built-in palette presets. */
export interface VirtualLocation {
  label: string;
  icon: IconName;
  /** Each flagged `readonly`; a non-empty `folder` groups it into a
   *  read-only subfolder (one level), e.g. one per maker. */
  entries: () => FileEntry[];
  load: (path: string) => string | null; // the entry's JSON, for copying out
}

export interface FileBrowserProps {
  col: Library;
  /** open: pick a file · save: name + folder · library: save and apply in one */
  mode: 'open' | 'save' | 'library';
  prefsKey: string;
  typeHeader: string; // list-view "Type" column heading
  openLabel?: string; // "Open" / "Apply"
  saveLabel?: string; // label before the name field
  currentPath: string | null; // the open document's file, if any
  initialName?: string; // save field default
  /** Open / apply a file. Return false to keep the browser open. */
  onOpen: (entry: FileEntry, json: string) => boolean | void;
  /** Save into `folder` as `name`; returns the saved path. */
  onSave?: (name: string, folder: string) => string;
  onRemap: (map: PathMap) => void;
  onClose: () => void;
  virtual?: VirtualLocation;
  footer?: ReactNode; // extra footer buttons, left-aligned
}

type Loc =
  | { kind: 'folder'; path: string }
  | { kind: 'recents' }
  | { kind: 'virtual'; path: string }; // path: '' or a group within it
type SortKey = 'name' | 'type' | 'size' | 'modified';
interface Sort {
  key: SortKey;
  dir: 1 | -1;
}

const DRAG_MIME = 'application/x-grid-designer-items';
const DOUBLE_TAP_MS = 400;
const NO_MOVE = '\u0000';

const sameLoc = (a: Loc, b: Loc) =>
  a.kind === b.kind && (a.kind === 'recents' || a.path === (b as typeof a).path);

function fmtDate(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today at ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

const sizeText = (e: Entry) =>
  e.kind === 'folder' ? `${e.count} item${e.count === 1 ? '' : 's'}` : e.meta.sizeLabel;
const modifiedOf = (e: Entry) => (e.kind === 'folder' ? e.modified : e.meta.modified);

function compare(a: Entry, b: Entry, sort: Sort): number {
  // folders stay on top, like Finder's "Keep folders on top"
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
  const byName = a.name.localeCompare(b.name, undefined, { numeric: true });
  let c = 0;
  if (sort.key === 'modified') c = modifiedOf(a) - modifiedOf(b);
  else if (a.kind === 'file' && b.kind === 'file') {
    if (sort.key === 'type') c = a.meta.typeValue.localeCompare(b.meta.typeValue);
    if (sort.key === 'size') c = a.meta.sizeValue - b.meta.sizeValue;
  } else if (a.kind === 'folder' && b.kind === 'folder' && sort.key === 'size')
    c = a.count - b.count;
  return (c || byName) * sort.dir;
}

/** One grid cell drawn at a design's aspect ratio. */
export function CellGlyph({ aspect, size = 16 }: { aspect: number; size?: number }) {
  const w = aspect > 1 ? size / aspect : size;
  return (
    <span className="cell-glyph" style={{ width: size + 2, height: size + 2 }} aria-hidden="true">
      <span style={{ width: w, height: w * aspect }} />
    </span>
  );
}

/** A palette's colours as a strip (list) or a block of swatches (icon). */
function ColorStrip({ colors, big = false }: { colors: string[]; big?: boolean }) {
  const shown = colors.slice(0, big ? 36 : 8);
  return (
    <span className={'fb-strip' + (big ? ' big' : '')} aria-hidden="true">
      {shown.map((hex, i) => (
        <i key={i} style={{ background: hex }} />
      ))}
    </span>
  );
}

function FileIcon({ e }: { e: FileEntry }) {
  if (e.meta.colors) return <ColorStrip colors={e.meta.colors} />;
  return <CellGlyph aspect={e.meta.aspect ?? 1} />;
}

export default function FileBrowser({
  col,
  mode,
  prefsKey,
  typeHeader,
  openLabel = 'Open',
  saveLabel = 'Save As:',
  currentPath,
  initialName = '',
  onOpen,
  onSave,
  onRemap,
  onClose,
  virtual,
  footer,
}: FileBrowserProps) {
  const prefs = useMemo(() => storage.readBrowserPrefs(prefsKey), [prefsKey]);
  const libraryNonce = useStore((s) => s.libraryNonce); // a sync changed saved files
  const [tick, setTick] = useState(0);
  const lastTap = useRef<{ key: string; t: number } | null>(null);
  const refresh = () => {
    lastTap.current = null; // an action in between breaks a double-click
    setTick((t) => t + 1);
  };

  const [loc, setLoc] = useState<Loc>(() => {
    if (prefs.lastLoc === 'virtual' && virtual && !currentPath)
      return { kind: 'virtual', path: String(prefs.lastGroup ?? '') };
    const start = currentPath
      ? lib.splitPath(currentPath).folder
      : String(prefs.lastFolder ?? '');
    return {
      kind: 'folder',
      path: start && col.allFolders().includes(start) && !lib.isInTrash(start) ? start : '',
    };
  });
  const [history, setHistory] = useState<{ back: Loc[]; fwd: Loc[] }>({ back: [], fwd: [] });
  const [view, setView] = useState<'list' | 'icons'>(prefs.view === 'icons' ? 'icons' : 'list');
  const [sort, setSort] = useState<Sort>(() => {
    const p = prefs.sort as Sort | undefined;
    return p && p.key ? p : { key: 'name', dir: 1 };
  });
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(Array.isArray(prefs.expanded) ? (prefs.expanded as string[]) : []),
  );
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<Set<string>>(() =>
    mode !== 'save' && currentPath
      ? new Set([lib.itemKey({ kind: 'file', path: currentPath })])
      : new Set(),
  );
  const anchor = useRef<string | null>(null);
  const [renaming, setRenamingState] = useState<string | null>(null);
  const renameOpen = useRef(false); // guards the blur that follows Enter / Escape
  const setRenaming = (k: string | null) => {
    renameOpen.current = k !== null;
    setRenamingState(k);
  };
  const [menu, setMenu] = useState<{ x: number; y: number; onItem: boolean } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [saveName, setSaveName] = useState(initialName);
  const rootRef = useRef<HTMLDivElement>(null);

  const inTrash = loc.kind === 'folder' && lib.isInTrash(loc.path);
  const inVirtual = loc.kind === 'virtual' && !query;
  const canSaveHere = loc.kind === 'folder' && !inTrash;

  useEffect(() => {
    storage.writeBrowserPrefs(
      {
        view,
        sort,
        expanded: [...expanded],
        lastFolder: loc.kind === 'folder' && !lib.isInTrash(loc.path) ? loc.path : '',
        lastLoc: loc.kind,
        lastGroup: loc.kind === 'virtual' ? loc.path : '',
      },
      prefsKey,
    );
  }, [view, sort, expanded, loc, prefsKey]);

  // keep the tree open down to wherever we are
  useEffect(() => {
    if (loc.kind !== 'folder' || !loc.path) return;
    const parts = loc.path.split('/');
    setExpanded((prev) => {
      const next = new Set(prev);
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'));
      return next.size === prev.size ? prev : next;
    });
  }, [loc]);

  useEffect(() => {
    if (mode === 'open') rootRef.current?.focus();
  }, [mode]);

  /** A read-only location's contents: its groups as folders, then loose files. */
  const virtualList = (group: string): Entry[] => {
    const all = virtual?.entries() ?? [];
    if (group) return all.filter((e) => e.folder === group);
    const groups = [...new Set(all.map((e) => e.folder).filter(Boolean))];
    return [
      ...groups.map(
        (g): Entry => ({
          kind: 'folder',
          path: g,
          folder: '',
          name: g,
          count: all.filter((e) => e.folder === g).length,
          modified: 0,
          readonly: true,
        }),
      ),
      ...all.filter((e) => !e.folder),
    ];
  };

  const entries = useMemo(() => {
    const list: Entry[] = query
      ? col.search(query)
      : loc.kind === 'recents'
        ? col.recent()
        : loc.kind === 'virtual'
          ? virtualList(loc.path)
          : col.listFolder(loc.path);
    // Recents stay newest-first, presets keep their order; the rest follows the sort
    return (loc.kind === 'recents' || loc.kind === 'virtual') && !query
      ? list
      : [...list].sort((a, b) => compare(a, b, sort));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, libraryNonce, loc, query, sort, col, virtual]);

  const keys = entries.map((e) => lib.itemKey(e));
  const selected = entries.filter((e) => sel.has(lib.itemKey(e)));
  const selRefs: ItemRef[] = selected.map((e) => ({ kind: e.kind, path: e.path }));
  const single = selected.length === 1 ? selected[0] : null;
  const readonlySel = selected.some((e) => e.readonly);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const folders = useMemo(() => col.allFolders().filter((f) => !lib.isInTrash(f)), [tick, libraryNonce, col]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trashCount = useMemo(() => col.trashCount(), [tick, libraryNonce, col]);

  // ---- navigation ------------------------------------------------------

  const go = (next: Loc) => {
    if (sameLoc(next, loc) && !query) return;
    setHistory((h) => ({ back: [...h.back, loc], fwd: [] }));
    setLoc(next);
    setQuery('');
    setSel(new Set());
    setRenaming(null);
    lastTap.current = null;
  };
  const goBack = () => {
    const prev = history.back[history.back.length - 1];
    if (!prev) return;
    setHistory((h) => ({ back: h.back.slice(0, -1), fwd: [loc, ...h.fwd] }));
    setLoc(prev);
    setSel(new Set());
  };
  const goForward = () => {
    const next = history.fwd[0];
    if (!next) return;
    setHistory((h) => ({ back: [...h.back, loc], fwd: h.fwd.slice(1) }));
    setLoc(next);
    setSel(new Set());
  };
  const goUp = () => {
    if (loc.kind === 'folder' && loc.path)
      go({ kind: 'folder', path: lib.splitPath(loc.path).folder });
    if (loc.kind === 'virtual' && loc.path) go({ kind: 'virtual', path: '' });
  };

  // ---- actions ---------------------------------------------------------

  const after = (map: PathMap) => {
    onRemap(map);
    refresh();
  };

  const jsonOf = (e: FileEntry) => (e.readonly ? virtual?.load(e.path) : col.load(e.path)) ?? null;

  const openEntry = (e: Entry) => {
    if (e.kind === 'folder') {
      go(e.readonly ? { kind: 'virtual', path: e.path } : { kind: 'folder', path: e.path });
      return;
    }
    if (mode === 'save') {
      setSaveName(e.name);
      return;
    }
    if (lib.isInTrash(e.path)) {
      alert(`“${e.name}” is in the Trash. Put it back before opening it.`);
      return;
    }
    const json = jsonOf(e);
    if (json === null) return;
    if (onOpen(e, json) !== false) onClose();
  };

  const newFolder = () => {
    if (!canSaveHere || loc.kind !== 'folder') return;
    const path = col.createFolder(loc.path);
    setQuery('');
    refresh();
    const k = lib.itemKey({ kind: 'folder', path });
    setSel(new Set([k]));
    setRenaming(k);
  };

  const startRename = () => {
    if (single && !(single.kind === 'file' && single.readonly) && !inTrash)
      setRenaming(lib.itemKey(single));
  };

  const commitRename = (e: Entry, value: string) => {
    if (!renameOpen.current) return;
    const r = col.rename({ kind: e.kind, path: e.path }, value);
    if (r.error) {
      alert(r.error);
      return;
    }
    setRenaming(null);
    after(r.map);
    setSel(new Set([lib.itemKey({ kind: e.kind, path: r.path })]));
  };

  /** Copy read-only items (presets, or a whole preset group) into `dest`. */
  const copyIn = (items: ItemRef[], dest: string): ItemRef[] =>
    items.flatMap((it) => {
      if (it.kind === 'folder') {
        const folder = col.createFolder(dest, it.path);
        const files = (virtual?.entries() ?? []).filter((e) => e.folder === it.path);
        copyIn(files, folder);
        return [{ kind: 'folder' as const, path: folder }];
      }
      const json = virtual?.load(it.path);
      if (!json) return [];
      const name =
        (virtual?.entries() ?? []).find((e) => e.path === it.path)?.name ?? it.path;
      return [col.importFile(dest, name, json)];
    });

  const duplicate = () => {
    if (!selRefs.length || inTrash) return;
    if (readonlySel) {
      // copying out of a read-only location lands at the top level
      copyIn(selRefs, '');
      go({ kind: 'folder', path: '' });
      refresh();
      return;
    }
    const made = col.duplicate(selRefs);
    refresh();
    setSel(new Set(made.map(lib.itemKey)));
  };

  const trash = () => {
    if (!selRefs.length || readonlySel) return;
    if (selRefs.every((r) => lib.isInTrash(r.path))) {
      const n = selRefs.length;
      if (
        !confirm(
          `Delete ${n === 1 ? `“${selected[0].name}”` : `${n} items`} immediately? You can’t undo this action.`,
        )
      )
        return;
      col.deleteForever(selRefs);
      refresh();
    } else after(col.trash(selRefs));
    setSel(new Set());
  };

  const putBack = () => {
    if (!selRefs.length) return;
    after(col.putBack(selRefs));
    setSel(new Set());
  };

  const emptyTrash = () => {
    if (!trashCount) return;
    if (!confirm('Permanently erase the items in the Trash? You can’t undo this action.'))
      return;
    col.emptyTrash();
    setSel(new Set());
    refresh();
  };

  const moveTo = (dest: string, items = selRefs) => {
    const fromVirtual = items.some((it) =>
      entries.some((e) => e.path === it.path && e.kind === it.kind && e.readonly),
    );
    if (fromVirtual) {
      if (dest === lib.TRASH) return;
      copyIn(items, dest);
      refresh();
      return;
    }
    if (!col.canMove(items, dest)) return;
    if (dest === lib.TRASH) after(col.trash(items));
    else after(col.move(items, dest));
    setSel(new Set());
  };

  const save = () => {
    const name = saveName.trim();
    if (!name || !onSave || loc.kind !== 'folder' || inTrash) return;
    const seg = storage.cleanSegment(name);
    const path = lib.joinPath(loc.path, seg);
    if (col.allFolders().includes(path)) {
      alert(`A folder named “${seg}” already exists here. Please choose a different name.`);
      return;
    }
    if (
      col.has(path) &&
      path !== currentPath &&
      !confirm(`“${seg}” already exists. Do you want to replace it?`)
    )
      return;
    const saved = onSave(name, loc.path);
    if (mode === 'save') onClose();
    else {
      refresh();
      setSel(new Set([lib.itemKey({ kind: 'file', path: saved })]));
    }
  };

  // ---- selection -------------------------------------------------------

  const clickItem = (e: MouseEvent, entry: Entry) => {
    const k = lib.itemKey(entry);
    const now = Date.now();
    const tap = lastTap.current;
    lastTap.current = { key: k, t: now };
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && tap && tap.key === k && now - tap.t < DOUBLE_TAP_MS) {
      lastTap.current = null;
      openEntry(entry);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(sel);
      next.has(k) ? next.delete(k) : next.add(k);
      setSel(next);
      anchor.current = k;
    } else if (e.shiftKey && anchor.current && keys.includes(anchor.current)) {
      const [a, b] = [keys.indexOf(anchor.current), keys.indexOf(k)].sort((x, y) => x - y);
      setSel(new Set(keys.slice(a, b + 1)));
    } else {
      setSel(new Set([k]));
      anchor.current = k;
    }
    if (mode === 'save' && entry.kind === 'file') setSaveName(entry.name);
  };

  const moveSelection = (delta: number, extend: boolean) => {
    if (!keys.length) return;
    const cur = anchor.current && keys.includes(anchor.current) ? keys.indexOf(anchor.current) : -1;
    const i =
      cur < 0 ? (delta > 0 ? 0 : keys.length - 1) : Math.max(0, Math.min(keys.length - 1, cur + delta));
    const k = keys[i];
    anchor.current = k;
    setSel(extend ? new Set([...sel, k]) : new Set([k]));
    rootRef.current
      ?.querySelector(`[data-key="${CSS.escape(k)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const typing = (e.target as HTMLElement).closest('input, select, textarea');
    if (e.key === 'Escape') {
      if (menu) {
        e.stopPropagation();
        setMenu(null);
      }
      return; // otherwise the modal closes
    }
    // keep the editor's own shortcuts (tools, undo, delete…) out of the browser
    e.stopPropagation();
    if (typing) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const cols =
      view === 'icons'
        ? Math.max(
            1,
            Math.floor((rootRef.current?.querySelector('.fb-icons')?.clientWidth ?? 1) / 132),
          )
        : 1;
    const handled = (() => {
      if (mod && (k === 'o' || k === 'arrowdown')) return single ? (openEntry(single), true) : false;
      if (mod && k === 'arrowup') return goUp(), true;
      if (mod && k === '[') return goBack(), true;
      if (mod && k === ']') return goForward(), true;
      if (mod && k === 'backspace') return trash(), true;
      if (mod && e.shiftKey && k === 'n') return newFolder(), true;
      if (mod && k === 'd') return duplicate(), true;
      if (mod && k === 'a') return setSel(new Set(keys)), true;
      if (mod && k === 'f') {
        rootRef.current?.querySelector<HTMLInputElement>('.fb-search input')?.focus();
        return true;
      }
      if (k === 'enter' && single) return startRename(), true;
      if (k === 'arrowdown') return moveSelection(cols, e.shiftKey), true;
      if (k === 'arrowup') return moveSelection(-cols, e.shiftKey), true;
      if (view === 'icons' && k === 'arrowright') return moveSelection(1, e.shiftKey), true;
      if (view === 'icons' && k === 'arrowleft') return moveSelection(-1, e.shiftKey), true;
      return false;
    })();
    if (handled) e.preventDefault();
  };

  // ---- drag and drop ---------------------------------------------------

  const dragStart = (e: DragEvent, entry: Entry) => {
    const k = lib.itemKey(entry);
    const ks = sel.has(k) ? [...sel] : [k];
    if (!sel.has(k)) setSel(new Set([k]));
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ks));
    e.dataTransfer.effectAllowed = entry.kind === 'file' && entry.readonly ? 'copy' : 'move';
  };
  const dropProps = (dest: string, id = `f:${dest}`) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      if (dropOn !== id) setDropOn(id);
    },
    onDragLeave: () => setDropOn((d) => (d === id ? null : d)),
    onDrop: (e: DragEvent) => {
      setDropOn(null);
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      moveTo(dest, (JSON.parse(raw) as string[]).map(lib.parseItemKey));
    },
  });

  // ---- context menu ----------------------------------------------------

  const openMenu = (e: MouseEvent, entry?: Entry) => {
    e.preventDefault();
    if (entry) {
      const k = lib.itemKey(entry);
      if (!sel.has(k)) setSel(new Set([k]));
    } else setSel(new Set());
    setMenu({ x: e.clientX, y: e.clientY, onItem: !!entry });
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  // ---- rendering -------------------------------------------------------

  const whereLabel = query
    ? `Searching “${query}”`
    : loc.kind === 'recents'
      ? 'Recents'
      : loc.kind === 'virtual'
        ? [virtual?.label, loc.path].filter(Boolean).join(' › ')
        : col.folderName(loc.path);

  // "a/b" -> ["", "a", "a/b"]; the Trash is its own root
  const crumbs: string[] = [];
  if (loc.kind === 'folder' && !query) {
    const parts = loc.path ? loc.path.split('/') : [];
    if (!inTrash) crumbs.push('');
    parts.forEach((_, i) => crumbs.push(parts.slice(0, i + 1).join('/')));
  }

  const nameCell = (e: Entry, big = false) => {
    const k = lib.itemKey(e);
    if (renaming === k)
      return (
        <input
          className="fb-rename"
          aria-label="Rename"
          defaultValue={e.name}
          autoFocus
          onFocus={(ev) => ev.currentTarget.select()}
          onClick={(ev) => ev.stopPropagation()}
          onBlur={(ev) => commitRename(e, ev.target.value)}
          onKeyDown={(ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') commitRename(e, ev.currentTarget.value);
            if (ev.key === 'Escape') setRenaming(null);
          }}
        />
      );
    return (
      <span className={'fb-name' + (big ? ' big' : '')} title={e.name}>
        {e.name}
        {(query || loc.kind === 'recents') && (
          <small className="fb-where">{col.folderName(e.folder)}</small>
        )}
      </span>
    );
  };

  const itemProps = (e: Entry) => {
    const k = lib.itemKey(e);
    return {
      key: k,
      'data-key': k,
      role: 'option',
      'aria-selected': sel.has(k),
      draggable: renaming !== k,
      onDragStart: (ev: DragEvent) => dragStart(ev, e),
      onClick: (ev: MouseEvent) => {
        ev.stopPropagation();
        clickItem(ev, e);
      },
      onContextMenu: (ev: MouseEvent) => {
        ev.stopPropagation();
        openMenu(ev, e);
      },
      ...(e.kind === 'folder' && !e.readonly ? dropProps(e.path) : {}),
    };
  };

  const itemClass = (e: Entry, base: string) =>
    base +
    (sel.has(lib.itemKey(e)) ? ' sel' : '') +
    (dropOn === `f:${e.path}` && e.kind === 'folder' ? ' drop' : '') +
    (e.kind === 'file' && e.path === currentPath && !e.readonly ? ' current' : '');

  const treeNode = (path: string, depth: number) => {
    const kids = col.childFolders(path);
    const open = expanded.has(path);
    const here = loc.kind === 'folder' && loc.path === path && !query;
    return (
      <div key={path}>
        <div
          className={
            'fb-side-item' + (here ? ' here' : '') + (dropOn === `f:${path}` ? ' drop' : '')
          }
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => go({ kind: 'folder', path })}
          {...dropProps(path)}
        >
          <button
            className={'fb-disclose' + (open ? ' open' : '')}
            style={{ visibility: kids.length ? 'visible' : 'hidden' }}
            aria-label={open ? `Collapse ${col.folderName(path)}` : `Expand ${col.folderName(path)}`}
            onClick={(e) => {
              e.stopPropagation();
              const next = new Set(expanded);
              open ? next.delete(path) : next.add(path);
              setExpanded(next);
            }}
          >
            <Icon name="chevron-right" size={12} />
          </button>
          <Icon name="folder" size={15} />
          <span className="fb-side-label">{col.folderName(path)}</span>
        </div>
        {open && kids.map((k) => treeNode(k, depth + 1))}
      </div>
    );
  };

  const moveTargets = readonlySel
    ? ['', ...folders]
    : ['', ...folders].filter((f) => col.canMove(selRefs, f));
  const openable =
    !!single &&
    (single.kind === 'folder' || (!lib.isInTrash(single.path) && mode !== 'save'));

  const menuItems: Array<[string, () => void, boolean?] | null> = menu
    ? menu.onItem
      ? inTrash
        ? [
            ['Put Back', putBack],
            ['Delete Immediately…', trash],
          ]
        : [
            [
              single?.kind === 'folder' ? 'Open' : openLabel,
              () => single && openEntry(single),
              !openable,
            ],
            null,
            ['Rename', startRename, !single || readonlySel],
            [readonlySel ? 'Copy to ' + col.rootName : 'Duplicate', duplicate],
            ['Move to Trash', trash, readonlySel],
            null,
            ['New Folder', newFolder, !canSaveHere],
          ]
      : [
          ['New Folder', newFolder, !canSaveHere],
          null,
          ['as Icons', () => setView('icons'), view === 'icons'],
          ['as List', () => setView('list'), view === 'list'],
          ...(inTrash
            ? [null, ['Empty Trash', emptyTrash, !trashCount] as [string, () => void, boolean]]
            : []),
        ]
    : [];

  const sideItem = (
    label: string,
    icon: IconName,
    here: boolean,
    onClick: () => void,
    drop?: string,
    extra?: ReactNode,
  ) => (
    <div
      className={
        'fb-side-item' +
        (here ? ' here' : '') +
        (drop !== undefined && dropOn === `f:${drop}` ? ' drop' : '')
      }
      onClick={onClick}
      {...(drop !== undefined ? dropProps(drop) : {})}
    >
      <span className="fb-disclose" style={{ visibility: 'hidden' }} />
      <Icon name={icon} size={15} />
      <span className="fb-side-label">{label}</span>
      {extra}
    </div>
  );

  return (
    <div className="fb" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
      {mode !== 'open' && onSave && (
        <div className="fb-savebar">
          <label htmlFor="fb-save-name">{saveLabel}</label>
          <input
            id="fb-save-name"
            type="text"
            value={saveName}
            autoFocus={mode === 'save'}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
          <span className="fb-save-where">
            in <Icon name="folder" size={14} /> {canSaveHere && loc.kind === 'folder' ? col.folderName(loc.path) : '—'}
          </span>
          {mode === 'library' && (
            <button
              className="btn mini"
              disabled={!saveName.trim() || !canSaveHere}
              onClick={save}
            >
              Save
            </button>
          )}
        </div>
      )}

      <div className="fb-toolbar">
        <div className="fb-nav">
          <button
            className="fb-tb"
            aria-label="Back"
            title="Back (⌘[)"
            disabled={!history.back.length}
            onClick={goBack}
          >
            <Icon name="chevron-left" size={18} />
          </button>
          <button
            className="fb-tb"
            aria-label="Forward"
            title="Forward (⌘])"
            disabled={!history.fwd.length}
            onClick={goForward}
          >
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
        <nav className="fb-path" aria-label="Path">
          {loc.kind === 'virtual' && !query ? (
            <>
              <span className="fb-crumb-wrap">
                <button className="fb-crumb" onClick={() => go({ kind: 'virtual', path: '' })}>
                  <Icon name={virtual?.icon ?? 'folder'} size={14} />
                  {virtual?.label}
                </button>
              </span>
              {loc.path && (
                <span className="fb-crumb-wrap">
                  <Icon name="chevron-right" size={12} />
                  <button className="fb-crumb">
                    <Icon name="folder" size={14} />
                    {loc.path}
                  </button>
                </span>
              )}
            </>
          ) : crumbs.length ? (
            crumbs.map((p, i) => (
              <span key={p || '(root)'} className="fb-crumb-wrap">
                {i > 0 && <Icon name="chevron-right" size={12} />}
                <button
                  className={'fb-crumb' + (dropOn === `c:${p}` ? ' drop' : '')}
                  onClick={() => go({ kind: 'folder', path: p })}
                  {...dropProps(p, `c:${p}`)}
                >
                  <Icon name={p === lib.TRASH ? 'trash' : 'folder'} size={14} />
                  {col.folderName(p)}
                </button>
              </span>
            ))
          ) : (
            <span className="fb-crumb static">{whereLabel}</span>
          )}
        </nav>
        <div className="fb-seg" role="group" aria-label="View">
          <button
            className={'fb-tb' + (view === 'icons' ? ' on' : '')}
            aria-label="Icon view"
            aria-pressed={view === 'icons'}
            onClick={() => setView('icons')}
          >
            <Icon name="grid" size={16} />
          </button>
          <button
            className={'fb-tb' + (view === 'list' ? ' on' : '')}
            aria-label="List view"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            <Icon name="list" size={16} />
          </button>
        </div>
        <button
          className="fb-tb"
          aria-label="New folder"
          title="New Folder (⇧⌘N)"
          disabled={!canSaveHere}
          onClick={newFolder}
        >
          <Icon name="folder-plus" size={18} />
        </button>
        <label className="fb-search">
          <Icon name="search" size={14} />
          <input
            type="search"
            placeholder="Search"
            aria-label="Search"
            value={query}
            onChange={(e) => {
              lastTap.current = null;
              setQuery(e.target.value);
              setSel(new Set());
            }}
          />
        </label>
      </div>

      <div className="fb-body">
        <aside className="fb-side" aria-label="Locations">
          <div className="fb-side-head">Favourites</div>
          {sideItem('Recents', 'clock', loc.kind === 'recents' && !query, () =>
            go({ kind: 'recents' }),
          )}
          {virtual &&
            sideItem(virtual.label, virtual.icon, inVirtual, () =>
              go({ kind: 'virtual', path: '' }),
            )}
          <div className="fb-side-head">Folders</div>
          {sideItem(
            col.rootName,
            'folder',
            loc.kind === 'folder' && loc.path === '' && !query,
            () => go({ kind: 'folder', path: '' }),
            '',
          )}
          {col.childFolders('').map((f) => treeNode(f, 1))}
          <div className="fb-side-sep" />
          {sideItem(
            'Trash',
            'trash',
            inTrash && !query,
            () => go({ kind: 'folder', path: lib.TRASH }),
            lib.TRASH,
            trashCount > 0 ? <span className="fb-badge">{trashCount}</span> : null,
          )}
        </aside>

        <div
          className={'fb-main' + (loc.kind === 'folder' && dropOn === `m:${loc.path}` ? ' drop' : '')}
          role="listbox"
          aria-label={whereLabel}
          aria-multiselectable="true"
          onClick={() => {
            setSel(new Set());
            setRenaming(null);
          }}
          onContextMenu={(e) => openMenu(e)}
          {...(loc.kind === 'folder' && !query ? dropProps(loc.path, `m:${loc.path}`) : {})}
        >
          {entries.length === 0 ? (
            <p className="fb-empty">
              {query
                ? 'No results.'
                : loc.kind === 'recents'
                  ? 'Nothing saved yet.'
                  : inTrash
                    ? 'The Trash is empty.'
                    : 'This folder is empty.'}
            </p>
          ) : view === 'list' ? (
            <div className="fb-list">
              <div className="fb-head" role="presentation">
                {(
                  [
                    ['name', 'Name'],
                    ['type', typeHeader],
                    ['size', 'Size'],
                    ['modified', 'Date Modified'],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    className={'fb-col ' + key + (sort.key === key ? ' on' : '')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSort((s) =>
                        s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 },
                      );
                    }}
                  >
                    {label}
                    {sort.key === key && (
                      <Icon
                        name="chevron-down"
                        size={12}
                        style={{ transform: sort.dir === 1 ? 'rotate(180deg)' : undefined }}
                      />
                    )}
                  </button>
                ))}
              </div>
              {entries.map((e) => (
                <div {...itemProps(e)} className={itemClass(e, 'fb-item fb-row')}>
                  <span className="fb-col name">
                    {e.kind === 'folder' ? (
                      <span className="fb-ico folder">
                        <Icon name="folder" size={16} />
                      </span>
                    ) : (
                      <FileIcon e={e} />
                    )}
                    {nameCell(e)}
                  </span>
                  <span className="fb-col type">
                    {e.kind === 'folder' ? 'Folder' : e.meta.typeLabel}
                  </span>
                  <span className="fb-col size">{sizeText(e)}</span>
                  <span className="fb-col modified">{fmtDate(modifiedOf(e))}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="fb-icons">
              {entries.map((e) => {
                const thumb = e.kind === 'file' && !e.readonly ? col.thumbnail(e.path) : null;
                return (
                  <div {...itemProps(e)} className={itemClass(e, 'fb-item fb-tile')}>
                    <div className="fb-thumb">
                      {e.kind === 'folder' ? (
                        <Icon name="folder" size={56} strokeWidth={1.2} />
                      ) : thumb ? (
                        <img src={thumb} alt="" draggable={false} />
                      ) : e.meta.colors ? (
                        <ColorStrip colors={e.meta.colors} big />
                      ) : (
                        <CellGlyph aspect={e.meta.aspect ?? 1} size={40} />
                      )}
                    </div>
                    {nameCell(e, true)}
                    <small className="fb-sub">
                      {e.kind === 'folder' ? sizeText(e) : `${e.meta.typeLabel} · ${sizeText(e)}`}
                    </small>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="fb-actionbar">
        <span className="fb-status" aria-live="polite">
          {entries.length} item{entries.length === 1 ? '' : 's'}
          {selected.length > 0 && `, ${selected.length} selected`}
        </span>
        {inTrash ? (
          <>
            <button className="btn mini" disabled={!selected.length} onClick={putBack}>
              <Icon name="undo-2" size={15} /> Put Back
            </button>
            <button className="btn mini" disabled={!selected.length} onClick={trash}>
              Delete Immediately…
            </button>
            <button className="btn mini" disabled={!trashCount} onClick={emptyTrash}>
              Empty Trash
            </button>
          </>
        ) : (
          <>
            <button
              className="btn mini"
              disabled={!single || readonlySel}
              onClick={startRename}
            >
              Rename
            </button>
            <button className="btn mini" disabled={!selected.length} onClick={duplicate}>
              <Icon name="copy" size={15} /> {readonlySel ? 'Copy to ' + col.rootName : 'Duplicate'}
            </button>
            <select
              className="fb-move"
              aria-label={readonlySel ? 'Copy to folder' : 'Move to folder'}
              value={NO_MOVE}
              disabled={!selected.length || !moveTargets.length}
              onChange={(e) => e.target.value !== NO_MOVE && moveTo(e.target.value)}
            >
              <option value={NO_MOVE}>{readonlySel ? 'Copy to…' : 'Move to…'}</option>
              {moveTargets.map((f) => (
                <option key={f || '(root)'} value={f}>
                  {' '.repeat(f ? f.split('/').length : 0)}
                  {col.folderName(f)}
                </option>
              ))}
            </select>
            <button
              className="fb-tb danger"
              aria-label="Move to Trash"
              title="Move to Trash (⌘⌫)"
              disabled={!selected.length || readonlySel}
              onClick={trash}
            >
              <Icon name="trash" size={17} />
            </button>
          </>
        )}
      </div>

      <div className="actions spread fb-footer">
        {footer}
        <span className="grow" />
        <button className="btn" onClick={onClose}>
          {mode === 'library' ? 'Done' : 'Cancel'}
        </button>
        {mode === 'save' ? (
          <button
            className="btn primary"
            disabled={!saveName.trim() || !canSaveHere}
            onClick={save}
          >
            Save
          </button>
        ) : (
          <button
            className="btn primary"
            disabled={!openable}
            onClick={() => single && openEntry(single)}
          >
            {single?.kind === 'folder' ? 'Open' : openLabel}
          </button>
        )}
      </div>

      {menu && (
        <div
          className="fb-menu"
          role="menu"
          style={{
            left: Math.min(menu.x, window.innerWidth - 200),
            top: Math.min(menu.y, window.innerHeight - 30 * menuItems.length - 12),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {menuItems.map((m, i) =>
            m === null ? (
              <div key={i} className="fb-menu-sep" />
            ) : (
              <button
                key={m[0]}
                role="menuitem"
                disabled={!!m[2]}
                onClick={() => {
                  setMenu(null);
                  m[1]();
                }}
              >
                {m[0]}
              </button>
            ),
          )}
          {menu.onItem && !inTrash && moveTargets.length > 0 && (
            <>
              <div className="fb-menu-sep" />
              <div className="fb-menu-label">{readonlySel ? 'Copy to' : 'Move to'}</div>
              {moveTargets.slice(0, 8).map((f) => (
                <button
                  key={f || '(root)'}
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    moveTo(f);
                  }}
                >
                  <Icon name="folder" size={13} /> {f || col.rootName}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

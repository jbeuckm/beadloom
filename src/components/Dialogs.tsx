import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import FileBrowser, { type FileAction, type VirtualLocation } from './FileBrowser';
import ShareDialog from './ShareDialog';
import { avatarFromDesign } from './Avatar';
import { cloud } from '../lib/cloud';
import type { Reactions, SharedItem } from '../lib/cloud/backend';
import { ReactionBar } from './Reactions';
import Comments, { ShareLinkButton } from './Comments';
import { PostEditor } from './Posts';
import AccountDialog from './AccountDialog';
import SettingsDialog from './SettingsDialog';
import { describeDesign } from '../lib/library';
import { cloudInnerPath, designLibrary, inCloudStorage } from '../lib/stores';
import { Icon } from './icons';
import type { DialogId } from './TopBar';
import * as storage from '../lib/storage';
import { pickTextFile } from '../lib/designFormat';
import { FILE_FORMAT_SPEC, SHORTCUTS } from '../help';
import { DEFAULT_GRID_TYPE, GRID_TYPES, gridTypeFor } from '../lib/gridTypes';

export default function Dialogs({
  which,
  onClose,
  resetToken,
  onSwitch,
}: {
  which: DialogId;
  onClose: () => void;
  resetToken?: string | null;
  /** Replace this dialog with another (Account → Settings). */
  onSwitch?: (d: DialogId) => void;
}) {
  if (which === 'account')
    return (
      <AccountDialog
        onClose={onClose}
        resetToken={resetToken ?? null}
        onSettings={onSwitch && (() => onSwitch('settings'))}
      />
    );
  if (which === 'settings') return <SettingsDialog onClose={onClose} />;
  if (which === 'new') return <NewDialog onClose={onClose} />;
  if (which === 'resize') return <ResizeDialog onClose={onClose} />;
  if (which === 'saveas') return <SaveAsDialog onClose={onClose} />;
  if (which === 'open') return <OpenDialog onClose={onClose} />;
  return <HelpDialog onClose={onClose} />;
}

const PRESETS: Array<[number, number]> = [
  [20, 40],
  [30, 60],
  [40, 80],
  [15, 15],
  [24, 32],
  [60, 120],
];

/** Pick the kind of grid: each type fixes the cell aspect (height ÷ width). */
function GridTypeField({
  aspect,
  onChange,
}: {
  aspect: number;
  onChange: (a: number) => void;
}) {
  const current = gridTypeFor(aspect);
  return (
    <div className="field">
      <label>Grid type</label>
      {GRID_TYPES.map((t) => (
        <label key={t.id} className="check">
          <input
            type="radio"
            name="grid-type"
            checked={current?.id === t.id}
            onChange={() => onChange(t.cellAspect)}
          />
          {t.label}
        </label>
      ))}
      {!current && (
        <p className="hint">Custom cell aspect {aspect.toFixed(2)} (from file)</p>
      )}
    </div>
  );
}

function NewDialog({ onClose }: { onClose: () => void }) {
  const newDesign = useStore((s) => s.newDesign);
  const [cols, setCols] = useState(100);
  const [rows, setRows] = useState(25);
  const [name, setName] = useState('Untitled Pattern');
  const [keepPalette, setKeepPalette] = useState(true);
  const [aspect, setAspect] = useState(DEFAULT_GRID_TYPE.cellAspect);

  // The unsaved-changes prompt already happened before this dialog opened.
  const create = () => {
    newDesign({ columns: cols, rows, name, cellAspect: aspect, keepPalette });
    onClose();
  };

  return (
    <Modal title="New Design" onClose={onClose}>
      <div className="field">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="row2">
        <div className="field">
          <label>Columns (left → right)</label>
          <input
            type="number"
            min={1}
            max={400}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Rows (bead rows)</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
        </div>
      </div>
      <GridTypeField aspect={aspect} onChange={setAspect} />
      <div className="preset-grid">
        {PRESETS.map(([c, r]) => (
          <button
            key={`${c}x${r}`}
            className="btn"
            onClick={() => {
              setCols(c);
              setRows(r);
            }}
          >
            {c}×{r}
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={keepPalette}
          onChange={(e) => setKeepPalette(e.target.checked)}
        />
        Keep current palette (otherwise reset to Rainbow 10)
      </label>
      <div className="actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={create}>
          Create
        </button>
      </div>
    </Modal>
  );
}

function ResizeDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [cols, setCols] = useState(s.design.loom.columns);
  const [rows, setRows] = useState(s.design.loom.rows);
  const [aspect, setAspect] = useState(s.design.loom.cellAspect);
  return (
    <Modal title="Grid" onClose={onClose}>
      <p className="hint">
        Existing beads stay anchored to the top-left. Growing adds empty cells;
        shrinking trims from the right / bottom.
      </p>
      <div className="row2">
        <div className="field">
          <label>Columns</label>
          <input
            type="number"
            min={1}
            max={400}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Rows</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
        </div>
      </div>
      <GridTypeField aspect={aspect} onChange={setAspect} />
      <div className="actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() => {
            s.pushHistory();
            s.setColumns(cols);
            s.setRows(rows);
            s.setCellAspect(aspect);
            onClose();
          }}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}

/** Designs friends shared with me, as a read-only location grouped by owner. */
function useSharedWithMe(enabled: boolean): VirtualLocation | undefined {
  const [items, setItems] = useState<SharedItem[] | null>(null);
  useEffect(() => {
    if (!enabled || !cloud.backend) return;
    let live = true;
    cloud.backend
      .sharedWithMe()
      .then((r) => live && setItems(r.filter((i) => i.collection === 'design')))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [enabled]);
  return useMemo(() => {
    if (!enabled || !items) return undefined;
    const json = new Map(items.map((i) => [i.id, JSON.stringify(i.doc, null, 2)]));
    return {
      label: 'Shared with me',
      icon: 'users',
      entries: () =>
        items.map((i) => ({
          kind: 'file' as const,
          path: i.id,
          folder: i.owner ? '@' + i.owner.username : 'Unknown',
          name: storage.splitDesignPath(i.path).name,
          meta: describeDesign(json.get(i.id)!),
          readonly: true,
        })),
      load: (id) => json.get(id) ?? null,
    };
  }, [enabled, items]);
}

/** Like, rate and comment on a design a friend shared. */
function RateDialog({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const [r, setR] = useState<Reactions | undefined | null>(null); // null: loading
  useEffect(() => {
    let live = true;
    cloud.backend
      ?.reactions([id])
      .then((m) => live && setR(m.get(id)))
      .catch(() => live && setR(undefined));
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <Modal title={`“${name}”`} onClose={onClose}>
      {r !== null && <ReactionBar itemId={id} initial={r} canReact />}
      <Comments itemId={id} />
      <div className="actions">
        <ShareLinkButton id={id} name={name} />
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

/** The Finder-style browser over saved designs, for Open and Save As. */
function DesignBrowser({ mode, onClose }: { mode: 'open' | 'save'; onClose: () => void }) {
  const s = useStore();
  const user = useStore((st) => st.cloudUser);
  const [sharing, setSharing] = useState<{ path: string; name: string } | null>(null);
  const [rating, setRating] = useState<{ id: string; name: string } | null>(null);
  const [writing, setWriting] = useState<string | null>(null); // a Cloud Storage path
  const shared = useSharedWithMe(!!user && mode === 'open');

  const useAsPicture = async (path: string, name: string) => {
    const json = designLibrary.load(path);
    const png = json && avatarFromDesign(json);
    if (!png || !cloud.backend) return s.notify('Could not make a picture from this design');
    try {
      const r = await cloud.backend.setAvatar(png);
      s.notify(r.ok ? `“${name}” is your profile picture` : (r.error ?? 'Could not save the picture'));
    } catch (err) {
      s.notify((err as Error).message);
    }
  };
  const fileActions: FileAction[] = user
    ? [
        {
          label: 'Share…',
          icon: 'share',
          // only what's in the account can be shared
          when: (e) => inCloudStorage(e.path),
          hint: 'Only files in Cloud Storage can be shared',
          run: (e) => setSharing({ path: cloudInnerPath(e.path), name: e.name }),
        },
        {
          label: 'Write about this…',
          icon: 'pencil',
          when: (e) => inCloudStorage(e.path),
          hint: 'Only designs in Cloud Storage can go in a post',
          run: (e) => setWriting(cloudInnerPath(e.path)),
        },
        { label: 'Use as profile picture', icon: 'user', run: (e) => void useAsPicture(e.path, e.name) },
        // shared-with-me entries are keyed by the item's cloud id
        { label: 'Like & comment…', icon: 'heart', readonly: true, run: (e) => setRating({ id: e.path, name: e.name }) },
      ]
    : [];

  return (
    <>
      {sharing && <ShareDialog path={sharing.path} name={sharing.name} onClose={() => setSharing(null)} />}
      {rating && <RateDialog id={rating.id} name={rating.name} onClose={() => setRating(null)} />}
      {writing && (
        <PostEditor post={null} initialPaths={[writing]} onClose={() => setWriting(null)} onSaved={() => setWriting(null)} />
      )}
      <DesignFiles mode={mode} onClose={onClose} virtual={shared} fileActions={fileActions} />
    </>
  );
}

function DesignFiles({
  mode,
  onClose,
  virtual,
  fileActions,
}: {
  mode: 'open' | 'save';
  onClose: () => void;
  virtual?: VirtualLocation;
  fileActions: FileAction[];
}) {
  const s = useStore();
  return (
    <FileBrowser
      col={designLibrary}
      mode={mode}
      prefsKey={storage.BKEY}
      typeHeader="Grid type"
      currentPath={s.slotPath}
      initialName={s.design.meta.name || 'Untitled Pattern'}
      // a shared design opens as an unsaved copy; Save As keeps it
      onOpen={(e, json) => (e.readonly ? s.loadDesignText(json) : s.loadFromSlot(e.path))}
      virtual={virtual}
      fileActions={fileActions}
      onSave={(name, folder) => {
        s.saveToSlot(name, folder);
        return useStore.getState().slotPath ?? '';
      }}
      onRemap={s.remapSlot}
      onClose={onClose}
      footer={
        mode === 'open' && (
          <>
            {storage.readAutosave() && (
              <button
                className="btn"
                onClick={() => {
                  const j = storage.readAutosave();
                  if (j) {
                    try {
                      s.loadDesignText(j);
                    } catch {
                      /* ignore */
                    }
                  }
                  onClose();
                }}
              >
                Restore last autosave
              </button>
            )}
            <button
              className="btn"
              onClick={async () => {
                const f = await pickTextFile();
                if (!f) return;
                try {
                  s.loadDesignText(f.text);
                  onClose();
                } catch (err) {
                  alert('Could not import:\n' + (err as Error).message);
                }
              }}
            >
              Import from file…
            </button>
          </>
        )
      }
    />
  );
}

function SaveAsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Save Design" onClose={onClose} wide>
      <DesignBrowser mode="save" onClose={onClose} />
    </Modal>
  );
}

function OpenDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Open Design" onClose={onClose} wide>
      <DesignBrowser mode="open" onClose={onClose} />
    </Modal>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="File Format & Shortcuts" onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>Keyboard shortcuts</h3>
      <div className="slot-list">
        {SHORTCUTS.map(([k, d]) => (
          <div key={k} style={{ display: 'flex', gap: 10 }}>
            <kbd>{k}</kbd>
            <span className="hint">{d}</span>
          </div>
        ))}
      </div>
      <h3>Custom design file — <code>.beadloom.json</code></h3>
      <div className="spec">{FILE_FORMAT_SPEC}</div>
      <div className="actions">
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

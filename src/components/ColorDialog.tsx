// The colour dialog behind "+ Color" and "Edit": a regular colour picker
// (Custom), or a maker's bead / yarn colour (From Library). Adding from the
// library can pick several at once; editing takes one and lets you review it.

import { useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import LibraryColorBrowser from './LibraryColorBrowser';
import { normalizeHex, randomPleasantHex } from '../util';

type Tab = 'custom' | 'library';
const TAB_KEY = 'beadloom.colorDialogTab';
const readTab = (): Tab => {
  try {
    return localStorage.getItem(TAB_KEY) === 'library' ? 'library' : 'custom';
  } catch {
    return 'custom';
  }
};
const writeTab = (t: Tab) => {
  try {
    localStorage.setItem(TAB_KEY, t);
  } catch {
    /* ignore */
  }
};

export default function ColorDialog({
  id,
  onClose,
}: {
  /** the colour to edit; omit to add a new one */
  id?: string;
  onClose: () => void;
}) {
  const color = useStore((s) => (id ? s.design.palette.colors.find((c) => c.id === id) : undefined));
  const count = useStore((s) => s.design.palette.colors.length);
  const updateColor = useStore((s) => s.updateColor);
  const removeColor = useStore((s) => s.removeColor);
  const addColors = useStore((s) => s.addColors);
  const editing = !!id;

  // adding remembers which tab you used last; editing starts on the colour itself
  const [tab, setTabState] = useState<Tab>(() => (editing ? 'custom' : readTab()));
  const setTab = (t: Tab) => {
    setTabState(t);
    if (!editing) writeTab(t);
  };
  const [name, setName] = useState(color?.name ?? `Color ${count + 1}`);
  const [hex, setHex] = useState(color?.hex ?? randomPleasantHex());
  const [code, setCode] = useState(color?.code ?? '');
  // a library wool's fibre mix; recolouring by hand drops it
  const [heather, setHeather] = useState<Array<[string, number]> | null>(color?.heather ?? null);
  const setHexByHand = (h: string) => {
    setHex(h);
    setHeather(null);
  };

  if (editing && !color) return null;

  const normalized = normalizeHex(hex) ?? color?.hex ?? '#888888';

  const save = () => {
    const patch = { name: name.trim() || color?.name || `Color ${count + 1}`, hex: normalized, code: code.trim() };
    if (id) updateColor(id, { ...patch, heather });
    else addColors([{ ...patch, ...(heather ? { heather } : {}) }]);
    onClose();
  };

  return (
    <Modal title={editing ? 'Edit Colour' : 'Add Colour'} onClose={onClose} wide={tab === 'library'}>
      <div className="cd-tabs" role="tablist" aria-label="Colour source">
        <button
          role="tab"
          aria-selected={tab === 'custom'}
          className={'cd-tab' + (tab === 'custom' ? ' on' : '')}
          onClick={() => setTab('custom')}
        >
          Custom
        </button>
        <button
          role="tab"
          aria-selected={tab === 'library'}
          className={'cd-tab' + (tab === 'library' ? ' on' : '')}
          onClick={() => setTab('library')}
        >
          From Library
        </button>
      </div>

      {tab === 'library' ? (
        <LibraryColorBrowser
          multi={!editing}
          onAdd={(cs) => {
            addColors(cs.map((c) => ({ name: c.name, hex: c.hex, code: c.code, heather: c.heather })));
            onClose();
          }}
          onPick={(c) => {
            // editing: take the library colour, then review it before saving
            setName(c.name);
            setHex(c.hex);
            setCode(c.code);
            setHeather(c.heather ?? null);
            setTabState('custom');
          }}
          onCancel={onClose}
        />
      ) : (
        <>
          <div className="row2" style={{ alignItems: 'center', marginBottom: 12 }}>
            <input
              type="color"
              value={normalized}
              onChange={(e) => setHexByHand(e.target.value)}
              style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: 0 }}
              aria-label="Colour picker"
            />
            <div
              style={{
                flex: 1,
                height: 44,
                borderRadius: 0,
                border: '1px solid var(--line)',
                background: normalized,
              }}
            />
          </div>

          <div className="field">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row2">
            <div className="field">
              <label>Hex</label>
              <input
                type="text"
                value={hex}
                onChange={(e) => setHexByHand(e.target.value)}
                onBlur={() => setHex(normalized)}
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label>Bead code (optional)</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. DB-0723"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="actions">
            {editing && count > 1 && (
              <button
                className="btn danger"
                onClick={() => {
                  removeColor(id!);
                  onClose();
                }}
              >
                Delete colour
              </button>
            )}
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" onClick={save}>
              {editing ? 'Save' : 'Add colour'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

import { useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import { normalizeHex } from '../util';

export default function PaletteEditor({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const color = useStore((s) => s.design.palette.colors.find((c) => c.id === id));
  const updateColor = useStore((s) => s.updateColor);
  const removeColor = useStore((s) => s.removeColor);
  const canDelete = useStore((s) => s.design.palette.colors.length > 1);

  const [name, setName] = useState(color?.name ?? '');
  const [hex, setHex] = useState(color?.hex ?? '#888888');
  const [code, setCode] = useState(color?.code ?? '');

  if (!color) return null;

  const normalized = normalizeHex(hex) ?? color.hex;

  const save = () => {
    updateColor(id, { name: name.trim() || color.name, hex: normalized, code: code.trim() });
    onClose();
  };

  return (
    <Modal title="Edit Colour" onClose={onClose}>
      <div className="row2" style={{ alignItems: 'center', marginBottom: 12 }}>
        <input
          type="color"
          value={normalized}
          onChange={(e) => setHex(e.target.value)}
          style={{ width: 64, height: 64, flex: '0 0 auto', borderRadius: 0 }}
          aria-label="Colour picker"
        />
        <div
          style={{
            flex: 1,
            height: 64,
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
            onChange={(e) => setHex(e.target.value)}
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
        {canDelete && (
          <button
            className="btn danger"
            onClick={() => {
              removeColor(id);
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
          Save
        </button>
      </div>
    </Modal>
  );
}

// Choose the design's background: a palette colour that fills every bead
// position no layer covers (a real bead — counted, printed, exported), or
// leave those positions empty.

import { useStore } from '../store/useStore';
import Modal from './Modal';
import { Icon } from './icons';
import { contrastText } from '../util';

export default function BackgroundDialog({ onClose }: { onClose: () => void }) {
  const colors = useStore((s) => s.design.palette.colors);
  const bg = useStore((s) => s.design.backgroundColor ?? null);
  const tint = useStore((s) => s.design.background);
  const setBackgroundColor = useStore((s) => s.setBackgroundColor);
  const setBackground = useStore((s) => s.setBackground);

  const pick = (i: number | null) => {
    if (i !== bg) setBackgroundColor(i);
    onClose();
  };

  return (
    <Modal title="Background" onClose={onClose}>
      <p className="hint" style={{ marginTop: 0 }}>
        Fill every bead position that nothing else covers with one colour. It counts as
        beads in totals, the print chart and the column counter.
      </p>
      <div className="bgd-grid" role="radiogroup" aria-label="Background colour">
        <button
          role="radio"
          aria-checked={bg === null}
          className={'bgd-tile none' + (bg === null ? ' on' : '')}
          onClick={() => pick(null)}
        >
          <span className="bgd-swatch" />
          <span className="bgd-name">None — leave empty</span>
        </button>
        {colors.map((c, i) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={bg === i}
            className={'bgd-tile' + (bg === i ? ' on' : '')}
            title={`${c.name}${c.code ? ` · ${c.code}` : ''}`}
            onClick={() => pick(i)}
          >
            <span className="bgd-swatch" style={{ background: c.hex, color: contrastText(c.hex) }}>
              {bg === i && <Icon name="check" size={18} strokeWidth={3} />}
            </span>
            <span className="bgd-name">{c.name}</span>
          </button>
        ))}
      </div>
      {bg === null && (
        <label className="bgd-tint">
          <input
            type="color"
            value={tint}
            onChange={(e) => setBackground(e.target.value)}
            aria-label="Empty-cell tint"
          />
          Empty positions are shown in this tint on screen (not a bead)
        </label>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

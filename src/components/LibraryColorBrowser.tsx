// Browse every maker colour (seed beads, yarn…): the "From Library" tab of the
// colour dialog. Adding picks any number; editing picks one.

import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import {
  COLOR_LIBRARIES,
  FAMILIES,
  allLibraryColors,
  type Family,
  type LibraryColor,
} from '../lib/colorLibraries';
import { contrastText } from '../util';
import { swatchStyle } from '../lib/woolTexture';

const PREFS = 'beadloom.colorPicker';
const readLine = (): string => {
  try {
    return localStorage.getItem(PREFS) || 'all';
  } catch {
    return 'all';
  }
};
const writeLine = (id: string) => {
  try {
    localStorage.setItem(PREFS, id);
  } catch {
    /* ignore */
  }
};

export default function LibraryColorBrowser({
  multi,
  onPick,
  onAdd,
  onCancel,
}: {
  /** multi: pick any number, then `onAdd` · otherwise one tap calls `onPick` */
  multi: boolean;
  onPick?: (c: LibraryColor) => void;
  onAdd?: (cs: LibraryColor[]) => void;
  onCancel: () => void;
}) {
  const paletteColors = useStore((s) => s.design.palette.colors);

  const [line, setLineState] = useState<string>(() => {
    const id = readLine();
    return id === 'all' || COLOR_LIBRARIES.some((l) => l.id === id) ? id : 'all';
  });
  const setLine = (id: string) => {
    setLineState(id);
    writeLine(id);
  };
  const [family, setFamily] = useState<Family | 'all'>('all');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<LibraryColor[]>([]);

  const all = allLibraryColors();
  // already in the palette: same maker code, or the same colour without one
  const inPalette = useMemo(() => {
    const codes = new Set(paletteColors.map((c) => c.code).filter(Boolean));
    const hexes = new Set(paletteColors.filter((c) => !c.code).map((c) => c.hex.toUpperCase()));
    return (c: LibraryColor) => (c.code ? codes.has(c.code) : hexes.has(c.hex.toUpperCase()));
  }, [paletteColors]);

  const needle = query.trim().toLowerCase();
  const inLine = all.filter((c) => line === 'all' || c.library.id === line);
  const matching = inLine.filter(
    (c) =>
      !needle ||
      c.name.toLowerCase().includes(needle) ||
      c.code.toLowerCase().includes(needle) ||
      c.library.fullName.toLowerCase().includes(needle),
  );
  const shown = matching.filter((c) => family === 'all' || c.family === family);
  const familyCount = (f: Family) => matching.filter((c) => c.family === f).length;

  const makers = [...new Set(COLOR_LIBRARIES.map((l) => l.maker))];
  const pickedKeys = new Set(picked.map((c) => c.key));

  const tap = (c: LibraryColor) => {
    if (!multi) {
      onPick?.(c);
      return;
    }
    setPicked((p) => (pickedKeys.has(c.key) ? p.filter((x) => x.key !== c.key) : [...p, c]));
  };

  return (
      <div className="clp">
        <div className="clp-top">
          <label className="fb-search clp-search">
            <Icon name="search" size={14} />
            <input
              type="search"
              placeholder="Search name or code"
              aria-label="Search colours"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="clp-families" role="group" aria-label="Colour family">
            <button
              className={'clp-chip' + (family === 'all' ? ' on' : '')}
              aria-pressed={family === 'all'}
              onClick={() => setFamily('all')}
            >
              All
            </button>
            {FAMILIES.map((f) => {
              const n = familyCount(f);
              return (
                <button
                  key={f}
                  className={'clp-chip fam-' + f.toLowerCase() + (family === f ? ' on' : '')}
                  aria-pressed={family === f}
                  disabled={!n}
                  onClick={() => setFamily(family === f ? 'all' : f)}
                >
                  <i aria-hidden="true" />
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        <div className="clp-body">
          <aside className="fb-side" aria-label="Colour lines">
            <div
              className={'fb-side-item' + (line === 'all' ? ' here' : '')}
              onClick={() => setLine('all')}
            >
              <Icon name="swatches" size={15} />
              <span className="fb-side-label">All lines</span>
              <span className="fb-badge">{all.length}</span>
            </div>
            {makers.map((maker) => (
              <div key={maker}>
                <div className="fb-side-head">{maker}</div>
                {COLOR_LIBRARIES.filter((l) => l.maker === maker).map((l) => (
                  <div
                    key={l.id}
                    className={'fb-side-item' + (line === l.id ? ' here' : '')}
                    onClick={() => setLine(l.id)}
                  >
                    <span className="fb-side-label">{l.line}</span>
                    <span className="fb-badge">{l.colors.length}</span>
                  </div>
                ))}
              </div>
            ))}
          </aside>

          <div className="clp-grid" role="listbox" aria-label="Library colours" aria-multiselectable={multi}>
            {shown.length === 0 && <p className="fb-empty">No colours match.</p>}
            {shown.map((c) => {
              const on = pickedKeys.has(c.key);
              const have = inPalette(c);
              return (
                <button
                  key={c.key}
                  role="option"
                  aria-selected={on}
                  className={'clp-tile' + (on ? ' on' : '') + (have ? ' have' : '')}
                  title={`${c.name} · ${c.code || c.library.fullName}${have ? ' · already in palette' : ''}`}
                  onClick={() => tap(c)}
                >
                  <span className="clp-swatch" style={{ ...swatchStyle(c), color: contrastText(c.hex) }}>
                    {on && <Icon name="check" size={20} strokeWidth={3} />}
                    {have && !on && <span className="clp-have">in palette</span>}
                  </span>
                  <span className="clp-name">{c.name}</span>
                  <span className="clp-code">
                    {c.code}
                    {line === 'all' && <em> · {c.library.fullName}</em>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="clp-tray">
          {multi ? (
            <>
              <div className="clp-picked" aria-label="Picked colours">
                {picked.length === 0 ? (
                  <span className="hint">Tap colours to pick them — pick as many as you like.</span>
                ) : (
                  picked.map((c) => (
                    <button
                      key={c.key}
                      className="clp-picked-chip"
                      title={`Remove ${c.name}`}
                      aria-label={`Remove ${c.name}`}
                      onClick={() => tap(c)}
                    >
                      <i style={swatchStyle(c, 18)} />
                      {c.code || c.name}
                      <Icon name="x" size={12} />
                    </button>
                  ))
                )}
              </div>
              <button className="btn" onClick={onCancel}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!picked.length}
                onClick={() => onAdd?.(picked)}
              >
                Add {picked.length || ''} colour{picked.length === 1 ? '' : 's'}
              </button>
            </>
          ) : (
            <>
              <span className="hint grow">Tap a colour to use it.</span>
              <button className="btn" onClick={onCancel}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
  );
}

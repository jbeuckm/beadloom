import { useStore } from '../store/useStore';
import type { ToolId } from '../types';
import { Icon, type IconName } from './icons';

const TOOLS: Array<{ id: ToolId; icon: IconName; label: string }> = [
  { id: 'pen', icon: 'pencil', label: 'Pen' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser' },
  { id: 'fill', icon: 'fill', label: 'Fill' },
  { id: 'eyedropper', icon: 'pipette', label: 'Pick' },
  { id: 'line', icon: 'line', label: 'Line' },
  { id: 'rect', icon: 'square', label: 'Box' },
  { id: 'rectFill', icon: 'square-fill', label: 'Box+' },
  { id: 'select', icon: 'marquee', label: 'Select' },
  { id: 'pan', icon: 'move', label: 'Pan' },
];

export default function Toolbar() {
  const s = useStore();
  const hasSel = !!s.selection;
  const hasClip = !!s.clipboard;

  return (
    <div className="toolrail" role="toolbar" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={'tool' + (s.tool === t.id ? ' active' : '')}
          onClick={() => s.setTool(t.id)}
          title={t.label}
          aria-label={t.label}
          aria-pressed={s.tool === t.id}
        >
          <Icon name={t.icon} />
          <span className="lb">{t.label}</span>
        </button>
      ))}

      <div className="sep" aria-hidden="true" />

      <button
        className="tool"
        onClick={s.undo}
        disabled={s.undoStack.length === 0}
        title="Undo"
        aria-label="Undo"
      >
        <Icon name="undo" />
        <span className="lb">Undo</span>
      </button>
      <button
        className="tool"
        onClick={s.redo}
        disabled={s.redoStack.length === 0}
        title="Redo"
        aria-label="Redo"
      >
        <Icon name="redo" />
        <span className="lb">Redo</span>
      </button>

      <div className="sep" aria-hidden="true" />

      <button
        className="tool"
        onClick={s.copySelection}
        disabled={!hasSel}
        title="Copy selection"
        aria-label="Copy selection"
      >
        <Icon name="copy" />
        <span className="lb">Copy</span>
      </button>
      <button
        className="tool"
        onClick={s.cutSelection}
        disabled={!hasSel}
        title="Cut selection"
        aria-label="Cut selection"
      >
        <Icon name="scissors" />
        <span className="lb">Cut</span>
      </button>
      <button
        className={'tool' + (s.pasteMode ? ' active' : '')}
        onClick={() => s.setPasteMode(!s.pasteMode)}
        disabled={!hasClip}
        title="Paste — then tap the grid to drop"
        aria-label="Paste"
        aria-pressed={s.pasteMode}
      >
        <Icon name="clipboard" />
        <span className="lb">Paste</span>
      </button>
      <button
        className="tool"
        onClick={s.deleteSelection}
        disabled={!hasSel}
        title="Clear selected cells"
        aria-label="Clear selected cells"
      >
        <Icon name="trash" />
        <span className="lb">Delete</span>
      </button>

      <div className="sep" aria-hidden="true" />

      <button
        className="tool"
        onClick={() => s.flip('h', hasSel ? 'selection' : 'all')}
        title="Mirror left/right"
        aria-label="Mirror left/right"
      >
        <Icon name="flip-h" />
        <span className="lb">Flip H</span>
      </button>
      <button
        className="tool"
        onClick={() => s.flip('v', hasSel ? 'selection' : 'all')}
        title="Mirror up/down"
        aria-label="Mirror up/down"
      >
        <Icon name="flip-v" />
        <span className="lb">Flip V</span>
      </button>
      <button
        className="tool"
        onClick={() => s.rotate180(hasSel ? 'selection' : 'all')}
        title="Rotate 180°"
        aria-label="Rotate 180 degrees"
      >
        <Icon name="rotate" />
        <span className="lb">Rot 180</span>
      </button>

      <div className="sep" aria-hidden="true" />

      <button
        className="tool"
        onClick={() => s.zoomBy(1.25)}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <Icon name="zoom-in" />
        <span className="lb">Zoom +</span>
      </button>
      <button
        className="tool"
        onClick={() => s.zoomBy(1 / 1.25)}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <Icon name="zoom-out" />
        <span className="lb">Zoom −</span>
      </button>
      <button
        className="tool"
        onClick={s.requestFit}
        title="Fit pattern to screen"
        aria-label="Fit pattern to screen"
      >
        <Icon name="fit" />
        <span className="lb">Fit</span>
      </button>

      <div className="sep" aria-hidden="true" />

      <button
        className={'tool' + (s.settings.pencilOnly ? ' active' : '')}
        onClick={() => s.setSetting('pencilOnly', !s.settings.pencilOnly)}
        title="Apple Pencil only (reject finger painting)"
        aria-label="Apple Pencil only (reject finger painting)"
        aria-pressed={s.settings.pencilOnly}
      >
        <Icon name="stylus" />
        <span className="lb">Pencil</span>
      </button>
      <button
        className={'tool' + (s.settings.showGrid ? ' active' : '')}
        onClick={() => s.setSetting('showGrid', !s.settings.showGrid)}
        title="Toggle grid lines"
        aria-label="Toggle grid lines"
        aria-pressed={s.settings.showGrid}
      >
        <Icon name="grid" />
        <span className="lb">Grid</span>
      </button>
      <button
        className={'tool' + (s.settings.showRowNumbers ? ' active' : '')}
        onClick={() => s.setSetting('showRowNumbers', !s.settings.showRowNumbers)}
        title="Toggle row / column numbers"
        aria-label="Toggle row and column numbers"
        aria-pressed={s.settings.showRowNumbers}
      >
        <Icon name="numbers" />
        <span className="lb">Numbers</span>
      </button>
    </div>
  );
}

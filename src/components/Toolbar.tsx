import { useStore } from '../store/useStore';
import type { ShapeLayer, ToolId } from '../types';
import { Icon, type IconName } from './icons';

const TOOLS: Array<{ id: ToolId; icon: IconName; label: string }> = [
  { id: 'pen', icon: 'pencil', label: 'Pen' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser' },
  { id: 'fill', icon: 'fill', label: 'Fill' },
  { id: 'eyedropper', icon: 'pipette', label: 'Pick' },
  { id: 'line', icon: 'line', label: 'Line' },
  { id: 'rect', icon: 'square', label: 'Box' },
  { id: 'rectFill', icon: 'square-fill', label: 'Box+' },
  { id: 'poly', icon: 'poly', label: 'Poly' },
  { id: 'select', icon: 'marquee', label: 'Select' },
  { id: 'wand', icon: 'wand', label: 'Wand' },
  { id: 'pan', icon: 'move', label: 'Pan' },
];

export default function Toolbar() {
  const s = useStore();
  const hasSel = !!s.selection;
  const hasClip = !!s.clipboard;
  const hasStarClip = !!s.starClipboard;
  const selId = s.selectedSelburoseId;
  const shapeId = s.selectedShapeId;
  const rightPanel = s.rightPanel;

  const selShape = shapeId
    ? (
        s.design.layers.find(
          (l) => l.kind === 'shape' && l.id === shapeId,
        ) as ShapeLayer | undefined
      )?.shape
    : undefined;
  const showThickness =
    s.tool === 'line' ||
    s.tool === 'poly' ||
    (!!selShape && (selShape.kind !== 'box' || !selShape.fill));
  const thickness = selShape ? selShape.thickness : s.lineThickness;

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
        className={'tool' + (rightPanel === 'selburose' ? ' active' : '')}
        onClick={() =>
          rightPanel === 'selburose'
            ? s.closeSelburoseEditor()
            : s.addSelburose()
        }
        title="Selburose — drop a parametric eight-point star"
        aria-label="Selburose"
        aria-pressed={rightPanel === 'selburose'}
      >
        <Icon name="selburose" />
        <span className="lb">Selburose</span>
      </button>
      <button
        className={'tool' + (rightPanel === 'life' ? ' active' : '')}
        onClick={() => s.setRightPanel(rightPanel === 'life' ? null : 'life')}
        title="Cellular Automata"
        aria-label="Cellular Automata"
        aria-pressed={rightPanel === 'life'}
      >
        <Icon name="dice" />
        <span className="lb">Cells</span>
      </button>
      <button
        className={'tool' + (rightPanel === 'reference' ? ' active' : '')}
        onClick={() => {
          s.setTool('reference');
          s.setRightPanel(rightPanel === 'reference' ? null : 'reference');
        }}
        title="Reference image — trace from a photo"
        aria-label="Reference image"
        aria-pressed={rightPanel === 'reference'}
      >
        <Icon name="image" />
        <span className="lb">Image</span>
      </button>
      <button
        className={'tool' + (rightPanel === 'layers' ? ' active' : '')}
        onClick={() => s.setRightPanel(rightPanel === 'layers' ? null : 'layers')}
        title="Layers"
        aria-label="Layers"
        aria-pressed={rightPanel === 'layers'}
      >
        <Icon name="layers" />
        <span className="lb">Layers</span>
      </button>

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
        disabled={!hasSel && !selId && !shapeId}
        title="Copy selection"
        aria-label="Copy selection"
      >
        <Icon name="copy" />
        <span className="lb">Copy</span>
      </button>
      <button
        className="tool"
        onClick={s.cutSelection}
        disabled={!hasSel && !selId && !shapeId}
        title="Cut selection"
        aria-label="Cut selection"
      >
        <Icon name="scissors" />
        <span className="lb">Cut</span>
      </button>
      <button
        className={'tool' + (s.pasteMode ? ' active' : '')}
        onClick={() => (s.pasteMode ? s.setPasteMode(false) : s.paste())}
        disabled={!hasClip && !hasStarClip && !s.shapeClipboard}
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

      {(s.tool === 'pen' || s.tool === 'eraser') && (
        <SliderTool
          label="Size"
          aria="Brush size"
          value={s.brushSize}
          min={1}
          max={20}
          onChange={s.setBrushSize}
        />
      )}

      {s.tool === 'wand' && (
        <div className="seg-tool" role="radiogroup" aria-label="Wand selection mode">
          <span className="lb">Select</span>
          {(
            [
              ['new', 'New', 'Replace the selection'],
              ['add', 'Add', 'Add to the selection (or hold Shift)'],
              ['subtract', 'Subtract', 'Take away from the selection (or hold Option / Alt)'],
            ] as const
          ).map(([m, label, title]) => (
            <button
              key={m}
              role="radio"
              aria-checked={s.wandMode === m}
              className={s.wandMode === m ? 'on' : ''}
              title={title}
              onClick={() => s.setWandMode(m)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {showThickness && (
        <SliderTool
          label="Weight"
          aria="Line thickness"
          value={thickness}
          min={1}
          max={20}
          onChange={s.setLineThickness}
        />
      )}

      <button
        className="tool"
        onClick={() =>
          selId
            ? s.transformSelburose(selId, 'flipH')
            : shapeId
              ? s.transformShape(shapeId, 'flipH')
              : s.flip('h', hasSel ? 'selection' : 'all')
        }
        title={
          selId || shapeId ? 'Mirror the selected object' : 'Mirror left/right'
        }
        aria-label="Mirror left/right"
      >
        <Icon name="flip-h" />
        <span className="lb">Flip H</span>
      </button>
      <button
        className="tool"
        onClick={() =>
          selId
            ? s.transformSelburose(selId, 'flipV')
            : shapeId
              ? s.transformShape(shapeId, 'flipV')
              : s.flip('v', hasSel ? 'selection' : 'all')
        }
        title={
          selId || shapeId ? 'Mirror the selected object' : 'Mirror up/down'
        }
        aria-label="Mirror up/down"
      >
        <Icon name="flip-v" />
        <span className="lb">Flip V</span>
      </button>
      <button
        className="tool"
        onClick={() =>
          selId
            ? s.transformSelburose(selId, 'rot180')
            : shapeId
              ? s.transformShape(shapeId, 'rot180')
              : s.rotate180(hasSel ? 'selection' : 'all')
        }
        title={
          selId || shapeId
            ? 'Rotate the selected object 180°'
            : 'Rotate 180°'
        }
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

/** A compact slider in the tool rail: "Size ——o 7". */
function SliderTool({
  label,
  aria,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  aria: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const t = (value - min) / (max - min || 1);
  return (
    <label className="slider-tool">
      <span className="lb">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={aria}
        onChange={(e) => onChange(Number(e.target.value))}
        // a drag hands the keyboard back (arrows nudge, keys pick tools);
        // tabbing in keeps arrow-key control of the slider
        onPointerUp={(e) => e.currentTarget.blur()}
        style={{ ['--fill' as string]: `${t * 100}%` }}
      />
      <output className="slider-value">{value}</output>
    </label>
  );
}

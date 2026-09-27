import { useEffect, useState } from 'react';
import TopBar, { type DialogId } from './TopBar';
import Toolbar from './Toolbar';
import LoomCanvas from './LoomCanvas';
import PalettePanel from './PalettePanel';
import StatusBar from './StatusBar';
import Dialogs from './Dialogs';
import RightDock from './RightDock';
import PrintView from './PrintView';
import { useStore } from '../store/useStore';
import * as storage from '../lib/storage';

export default function App() {
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const rightPanel = useStore((s) => s.rightPanel);
  const showPrint = useStore((s) => s.showPrint);

  useEffect(() => {
    // text entry owns the keyboard; sliders, checkboxes and colour wells
    // don't (except a slider keeps its arrow keys)
    const NON_TEXT = new Set(['range', 'checkbox', 'radio', 'color', 'button', 'file']);
    const isTyping = (t: EventTarget | null, key = '') => {
      const el = t as HTMLElement | null;
      if (el?.tagName === 'INPUT') {
        const type = (el as HTMLInputElement).type;
        if (type === 'range' && key.startsWith('Arrow')) return true;
        if (NON_TEXT.has(type)) return false;
      }
      return (
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target, e.key)) return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();

      if (mod && k === 'z') {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && k === 'c') {
        s.copySelection();
        return;
      }
      if (mod && k === 'x') {
        s.cutSelection();
        return;
      }
      if (mod && k === 'v') {
        if (s.starClipboard) s.pasteStar();
        else if (s.clipboard) s.setPasteMode(true);
        return;
      }
      if (mod && k === 'a') {
        e.preventDefault();
        s.selectAll();
        return;
      }
      if (mod && k === 's') {
        e.preventDefault();
        if (!s.quickSave()) setDialog('saveas');
        return;
      }
      if (mod) return;

      if (k === 'delete' || k === 'backspace') {
        if (s.selection) {
          e.preventDefault();
          s.deleteSelection();
        } else if (s.selectedSelburoseId) {
          e.preventDefault();
          s.removeSelburose(s.selectedSelburoseId);
        } else if (s.selectedShapeId) {
          e.preventDefault();
          s.removeShape(s.selectedShapeId);
        }
        return;
      }
      if (e.key === 'Escape') {
        // finishing a polygon: drop the point-adding tool, keep the shape
        if (s.tool === 'poly' && s.selectedShapeId) {
          s.setTool('select');
          return;
        }
        s.setPasteMode(false);
        s.setSelection(null);
        s.selectSelburose(null);
        s.selectShape(null);
        return;
      }

      // stepping the working column when nothing is selected to nudge
      if (
        (k === 'arrowleft' || k === 'arrowright') &&
        s.workColumn != null &&
        !s.selectedSelburoseId &&
        !s.selectedImageId &&
        !s.selectedShapeId &&
        !s.selection
      ) {
        e.preventDefault();
        s.stepWorkColumn(k === 'arrowleft' ? -1 : 1);
        return;
      }

      if (
        k.startsWith('arrow') &&
        (s.selectedSelburoseId ||
          s.selectedImageId ||
          s.selectedShapeId ||
          s.selection)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
        if (dx || dy) {
          if (s.selectedSelburoseId || s.selectedImageId || s.selectedShapeId)
            s.nudgeSelected(dx, dy, e.repeat);
          else s.moveSelection(dx, dy, e.repeat);
        }
        return;
      }

      const map: Record<string, () => void> = {
        b: () => s.setTool('pen'),
        p: () => s.setTool('pen'),
        e: () => s.setTool('eraser'),
        g: () => s.setTool('fill'),
        i: () => s.setTool('eyedropper'),
        l: () => s.setTool('line'),
        r: () => s.setTool('rect'),
        f: () => s.setTool('rectFill'),
        m: () => s.setTool('select'),
        w: () => s.setTool('wand'),
        h: () => s.setTool('pan'),
        k: () => s.setTool('reference'),
        '[': () => s.zoomBy(1 / 1.25),
        ']': () => s.zoomBy(1.25),
        '0': () => s.requestFit(),
      };
      (map[k] ?? map[e.key])?.();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar onDialog={setDialog} />
      <div className="body">
        <LoomCanvas />
        {rightPanel && <RightDock />}
      </div>
      <Toolbar />
      <PalettePanel />
      <StatusBar />
      {dialog && <Dialogs which={dialog} onClose={() => setDialog(null)} />}
      {showPrint && <PrintView />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import TopBar, { type DialogId } from './TopBar';
import Toolbar from './Toolbar';
import LoomCanvas from './LoomCanvas';
import PalettePanel from './PalettePanel';
import StatusBar from './StatusBar';
import Dialogs from './Dialogs';
import { useStore } from '../store/useStore';
import * as storage from '../lib/storage';

export default function App() {
  const [dialog, setDialog] = useState<DialogId | null>(null);

  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
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
        if (s.clipboard) s.setPasteMode(true);
        return;
      }
      if (mod && k === 'a') {
        e.preventDefault();
        s.selectAll();
        return;
      }
      if (mod && k === 's') {
        e.preventDefault();
        const name = s.design.meta.name.trim();
        if (name && storage.listDesigns().includes(name)) s.saveToSlot(name);
        else setDialog('saveas');
        return;
      }
      if (mod) return;

      if (k === 'delete' || k === 'backspace') {
        if (s.selection) {
          e.preventDefault();
          s.deleteSelection();
        }
        return;
      }
      if (e.key === 'Escape') {
        s.setPasteMode(false);
        s.setSelection(null);
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
        h: () => s.setTool('pan'),
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
      </div>
      <Toolbar />
      <PalettePanel />
      <StatusBar />
      {dialog && <Dialogs which={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

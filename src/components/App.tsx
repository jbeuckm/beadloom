import { useEffect, useMemo, useState } from 'react';
import TopBar, { type DialogId } from './TopBar';
import Toolbar from './Toolbar';
import LoomCanvas from './LoomCanvas';
import PalettePanel from './PalettePanel';
import StatusBar from './StatusBar';
import Dialogs from './Dialogs';
import RightDock from './RightDock';
import PrintView from './PrintView';
import { AdminPage, GalleryPage, HomePage, JournalPage, PagesContext, SignInPage, WelcomePage, startPath } from './Home';
import { useLocation, useNavigate } from 'react-router';
import { linkTarget } from './Comments';
import { cloud } from '../lib/cloud';
import { useStore } from '../store/useStore';
import * as storage from '../lib/storage';
import { resetTokenFromUrl } from '../lib/cloud';

/** A brief status message ("Copied 12 beads", "Nothing to paste…"). */
function Notice() {
  const notice = useStore((s) => s.notice);
  const [shown, setShown] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    if (!notice) return;
    setShown(notice);
    const t = window.setTimeout(() => setShown(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);
  return shown ? (
    <div className="notice" role="status" key={shown.id}>
      {shown.text}
    </div>
  ) : null;
}

export default function App() {
  const [dialog, setDialog] = useState<DialogId | null>(null);
  // Pages are routes (main.tsx has the router; Home.tsx the site map). They
  // sit over the designer, which is always there. Without accounts there
  // are no pages; everything is the designer.
  const location = useLocation();
  const navigate = useNavigate();
  const user = useStore((s) => s.cloudUser);
  const ready = useStore((s) => s.cloudReady);
  const [, section, itemId] = location.pathname.split('/');
  const page = cloud.available && ['welcome', 'home', 'signin', 'gallery', 'journal', 'admin'].includes(section) ? section : null;

  // a password-reset link: to the sign-in page, which asks for the new password
  useEffect(() => {
    if (resetTokenFromUrl() && section !== 'signin') navigate({ pathname: '/signin', search: location.search }, { replace: true });
    // only at launch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // #/ is the start page: once we know whether they're signed in
  useEffect(() => {
    if (location.pathname === '/' && ready) navigate(startPath(!!user), { replace: true });
  }, [location.pathname, ready, user, navigate]);
  // links in the form shared before routing (#design=<id>, #post=<id>) can
  // still be clicked inside the app, which changes only the hash
  useEffect(() => {
    const fix = () => {
      if (window.location.hash.startsWith('#/')) return;
      const t = linkTarget(window.location.hash);
      if (t.design) navigate(`/gallery/${t.design}`, { replace: true });
      else if (t.post) navigate(`/journal/${t.post}`, { replace: true });
    };
    window.addEventListener('hashchange', fix);
    return () => window.removeEventListener('hashchange', fix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the designer's Home mark goes to the start page; its Account button,
  // signed out, to the sign-in page (and back here after)
  const openDialog = (d: DialogId) => {
    if (d === 'home') navigate('/');
    else if ((d === 'account' || d === 'share') && !useStore.getState().cloudUser)
      navigate(`/signin?next=${encodeURIComponent(location.pathname)}`);
    else setDialog(d);
  };
  const pagesContext = useMemo(() => ({ openDialog }), [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
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
      if (document.querySelector('.home')) return; // the editor is behind the home page
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
        s.paste();
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
      <TopBar onDialog={openDialog} />
      <div className="body">
        <LoomCanvas />
        {rightPanel && <RightDock />}
      </div>
      <Toolbar />
      <PalettePanel />
      <StatusBar />
      {dialog && (
        <Dialogs which={dialog} onSwitch={setDialog} onClose={() => setDialog(null)} />
      )}
      <PagesContext.Provider value={pagesContext}>
        {page === 'welcome' && <WelcomePage />}
        {page === 'signin' && <SignInPage />}
        {page === 'home' && <HomePage />}
        {page === 'gallery' && <GalleryPage openId={itemId ?? null} />}
        {page === 'journal' && <JournalPage openId={itemId ?? null} />}
        {page === 'admin' && <AdminPage />}
      </PagesContext.Provider>
      <Notice />
      {showPrint && <PrintView />}
    </div>
  );
}

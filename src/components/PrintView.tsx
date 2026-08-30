import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import PrintSheet from './PrintSheet';

export default function PrintView() {
  const close = () => useStore.getState().setShowPrint(false);

  useEffect(() => {
    document.body.classList.add('printing');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('printing');
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return createPortal(
    <div className="print-view">
      <div className="print-bar">
        <button className="btn primary" onClick={() => window.print()}>
          Print
        </button>
        <button className="btn" onClick={close}>
          Close
        </button>
        <span className="hint">
          US&nbsp;Letter · columns run top→bottom, stretched to fill the page ·
          the inch scale is page-fitted, not a physical ruler
        </span>
      </div>
      <div className="print-scroll">
        <PrintSheet />
      </div>
    </div>,
    document.body,
  );
}

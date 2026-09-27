import { useEffect, useRef, type ReactNode } from 'react';

export default function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // with dialogs stacked (a picker over an editor) only the top one closes
      const all = document.querySelectorAll('.modal-backdrop');
      if (all[all.length - 1] === backdrop.current) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      ref={backdrop}
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={'modal' + (wide ? ' wide' : '')}
        role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

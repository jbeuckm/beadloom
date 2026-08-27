import { useEffect, useRef, useState, type ReactNode } from 'react';

/** A lightweight dropdown. `children` is a render-prop given a `close` fn. */
export default function Menu({
  label,
  align = 'left',
  title,
  children,
}: {
  label: ReactNode;
  align?: 'left' | 'right';
  title?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        className="btn"
        onClick={() => setOpen((o) => !o)}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className={'menu-pop' + (align === 'right' ? ' right' : '')}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  close,
  danger,
  children,
}: {
  onClick: () => void;
  close: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={'menu-item' + (danger ? ' danger' : '')}
      onClick={() => {
        onClick();
        close();
      }}
    >
      {children}
    </button>
  );
}

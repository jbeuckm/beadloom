import type { ReactNode, SVGProps } from 'react';

/**
 * A small, self-contained monochrome line-art icon set (24×24, 2px stroke,
 * round caps/joins) in the spirit of Lucide / Feather. Inlined as SVG so there
 * is no runtime dependency and every glyph inherits `currentColor` — which is
 * what lets a `.tool.active` button flip the icon to white with no extra CSS.
 */
export type IconName =
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'pipette'
  | 'line'
  | 'poly'
  | 'square'
  | 'square-fill'
  | 'marquee'
  | 'wand'
  | 'move'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'scissors'
  | 'clipboard'
  | 'trash'
  | 'flip-h'
  | 'flip-v'
  | 'rotate'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'stylus'
  | 'grid'
  | 'numbers'
  | 'save'
  | 'dots'
  | 'x'
  | 'chevron-down'
  | 'hash'
  | 'download'
  | 'plus'
  | 'swatches'
  | 'image'
  | 'star'
  | 'selburose'
  | 'layers'
  | 'eye'
  | 'eye-off'
  | 'dice'
  | 'play'
  | 'stop';

const DOT = { fill: 'currentColor', stroke: 'none' } as const;

const PATHS: Record<IconName, ReactNode> = {
  pencil: (
    <>
      <path d="M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  eraser: (
    <>
      <path d="M20 20H7l-4-4a2 2 0 0 1 0-2.83l9-9a2 2 0 0 1 2.83 0l5 5a2 2 0 0 1 0 2.83L13 20" />
      <path d="m6 12 6 6" />
    </>
  ),
  fill: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />,
  pipette: (
    <>
      <path d="m2 22 1-4 9-9 3 3-9 9-4 1Z" />
      <path d="m12.5 7.5 4 4" />
      <path d="M13.5 6.5 17 3a2.1 2.1 0 0 1 3 3l-3.5 3.5Z" />
    </>
  ),
  line: (
    <>
      <path d="M6 18 18 6" />
      <circle cx="6" cy="18" r="2" {...DOT} />
      <circle cx="18" cy="6" r="2" {...DOT} />
    </>
  ),
  poly: (
    <>
      <path d="M5 8 12 3l7 5-2.5 11h-9L5 8Z" />
      <circle cx="5" cy="8" r="1.6" {...DOT} />
      <circle cx="12" cy="3" r="1.6" {...DOT} />
      <circle cx="19" cy="8" r="1.6" {...DOT} />
      <circle cx="16.5" cy="19" r="1.6" {...DOT} />
      <circle cx="7.5" cy="19" r="1.6" {...DOT} />
    </>
  ),
  square: <rect x="4" y="4" width="16" height="16" rx="1" />,
  'square-fill': <rect x="4" y="4" width="16" height="16" rx="1" fill="currentColor" />,
  marquee: <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3.5 3" />,
  wand: (
    <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h0M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5" />
  ),
  move: (
    <>
      <path d="M12 2v20M2 12h20" />
      <path d="m9 5 3-3 3 3" />
      <path d="m9 19 3 3 3-3" />
      <path d="m5 9-3 3 3 3" />
      <path d="m19 9 3 3-3 3" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a6 6 0 0 1 0 12h-4" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a6 6 0 0 0 0 12h4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88" />
      <path d="M14.47 14.48 20 20" />
      <path d="M8.12 8.12 12 12" />
    </>
  ),
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  'flip-h': (
    <>
      <path d="m3 7 5 5-5 5Z" />
      <path d="m21 7-5 5 5 5Z" />
      <path d="M12 4v3M12 11v2M12 17v3" />
    </>
  ),
  'flip-v': (
    <>
      <path d="m7 3 5 5 5-5Z" />
      <path d="m7 21 5-5 5 5Z" />
      <path d="M4 12h3M11 12h2M17 12h3" />
    </>
  ),
  rotate: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </>
  ),
  'zoom-in': (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
      <path d="M11 8v6M8 11h6" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
      <path d="M8 11h6" />
    </>
  ),
  fit: (
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </>
  ),
  stylus: (
    <>
      <path d="M12 2a2 2 0 0 1 2 2v11l-2 5-2-5V4a2 2 0 0 1 2-2Z" />
      <path d="M10 6h4" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  numbers: (
    <>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="M4 6h1v4M3.5 10h2" />
      <path d="M3.8 15c.2-.5.6-.9 1.3-.9.8 0 1.4.5 1.4 1.2 0 1.4-2.7 1.7-2.7 3.7H6.5" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h7" />
    </>
  ),
  dots: (
    <>
      <circle cx="12" cy="5" r="1.6" {...DOT} />
      <circle cx="12" cy="12" r="1.6" {...DOT} />
      <circle cx="12" cy="19" r="1.6" {...DOT} />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  swatches: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-4.5-4.5L5 22" />
    </>
  ),
  star: (
    <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.9 6.1 21l1.2-6.5L2.5 9.9l6.6-.9z" />
  ),
  selburose: (
    <path d="M12 2.6 13.9 7.4 18.7 5.3 16.6 10.1 21.4 12 16.6 13.9 18.7 18.7 13.9 16.6 12 21.4 10.1 16.6 5.3 18.7 7.4 13.9 2.6 12 7.4 10.1 5.3 5.3 10.1 7.4Z" />
  ),
  layers: (
    <>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 12 10 5 10-5" />
      <path d="m2 17 10 5 10-5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M9.9 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 4-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </>
  ),
  dice: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.1" {...DOT} />
      <circle cx="15.5" cy="8.5" r="1.1" {...DOT} />
      <circle cx="12" cy="12" r="1.1" {...DOT} />
      <circle cx="8.5" cy="15.5" r="1.1" {...DOT} />
      <circle cx="15.5" cy="15.5" r="1.1" {...DOT} />
    </>
  ),
  play: <path d="M7 4.5v15l13-7.5z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
};

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

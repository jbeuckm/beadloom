import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import App from './components/App';
import { linkTarget } from './components/Comments';
import './styles.css';

import { useStore } from './store/useStore';
import { serializeDesign } from './lib/designFormat';
import { compositeLayers } from './lib/layers';
import * as storage from './lib/storage';
import './lib/cloud';
import { debounce } from './util';

// Autosave the working design + persist settings, both outside React.
const saveAuto = debounce(
  (design: Parameters<typeof serializeDesign>[0]) =>
    storage.writeAutosave(serializeDesign(design)),
  600,
);
useStore.subscribe((s) => s.design, saveAuto);
useStore.subscribe((s) => s.settings, (settings) => storage.writeSettings(settings));

// Test hook: expose the store to Playwright for deterministic coordinate math
// and assertions. Dev-only — never present in a production build.
if (import.meta.env.DEV) {
  (window as unknown as { __beadloom: typeof useStore }).__beadloom = useStore;
  (
    window as unknown as { __beadloomComposite: () => number[][] }
  ).__beadloomComposite = () => compositeLayers(useStore.getState().design);
}

// Pages are hash routes (#/, #/design, #/gallery/<id>, #/journal/<id>): the
// app is served from any sub-path with relative assets (vite base './'), and
// hash routes need nothing from the server to survive a reload. Links shared
// before routing (#design=<id>, #post=<id>) are turned into their routes.
{
  const old = linkTarget(location.hash);
  if (!location.hash.startsWith('#/') && (old.design || old.post))
    history.replaceState(null, '', `${location.pathname}#/${old.design ? 'gallery/' + old.design : 'journal/' + old.post}`);
  // a password-reset email sent before routing: #auth=reset?token=…
  else if (location.hash.startsWith('#auth='))
    history.replaceState(null, '', `${location.pathname}#/design?${location.hash.slice(1).replace('?', '&')}`);
  // a bare address is the home route
  else if (!location.hash) history.replaceState(null, '', `${location.pathname}${location.search}#/`);
}

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>,
);

// PWA: register the runtime-cache service worker in production builds. Its
// URL is resolved against the page, so the scope follows the deploy sub-path.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

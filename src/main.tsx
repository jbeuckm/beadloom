import { createRoot } from 'react-dom/client';
import App from './components/App';
import './styles.css';

import { useStore } from './store/useStore';
import { serializeDesign } from './lib/designFormat';
import * as storage from './lib/storage';
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
}

createRoot(document.getElementById('root')!).render(<App />);

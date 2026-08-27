import { useStore } from '../store/useStore';
import { Icon } from './icons';
import ReferencePanel from './ReferencePanel';
import LayerPanel from './LayerPanel';
import SelburoseDialog from './SelburoseDialog';
import LifeDialog from './LifeDialog';

const TITLES = {
  reference: 'Reference Image',
  selburose: 'Selburose',
  layers: 'Layers',
  life: 'Game of Life',
} as const;

export default function RightDock() {
  const rightPanel = useStore((s) => s.rightPanel);
  const setRightPanel = useStore((s) => s.setRightPanel);
  const closeSelburoseEditor = useStore((s) => s.closeSelburoseEditor);

  if (!rightPanel) return null;

  const close = () => {
    if (rightPanel === 'selburose') closeSelburoseEditor();
    else setRightPanel(null);
  };

  return (
    <aside className="right-dock" role="region" aria-label={TITLES[rightPanel]}>
      <header className="right-dock-head">
        <h3>{TITLES[rightPanel]}</h3>
        <button
          className="btn mini ghost"
          onClick={close}
          aria-label="Close panel"
          title="Close panel"
        >
          <Icon name="x" size={16} />
        </button>
      </header>
      <div className="right-dock-body">
        {rightPanel === 'reference' && <ReferencePanel onClose={close} />}
        {rightPanel === 'selburose' && <SelburoseDialog />}
        {rightPanel === 'layers' && <LayerPanel onClose={close} />}
        {rightPanel === 'life' && <LifeDialog onClose={close} />}
      </div>
    </aside>
  );
}

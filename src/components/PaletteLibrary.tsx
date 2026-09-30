import { useEffect, useMemo } from 'react';
import { syncOnLook } from '../lib/cloud';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import FileBrowser, { type VirtualLocation } from './FileBrowser';
import { PRESET_PALETTES } from '../lib/palettes';
import {
  downloadText,
  parsePalette,
  pickTextFile,
  serializePalette,
} from '../lib/designFormat';
import * as storage from '../lib/storage';
import { describePalette, stampPaletteJson } from '../lib/library';
import { paletteLibrary } from '../lib/stores';

/**
 * Saved palettes in the same Finder-style browser as designs: folders, Trash,
 * rename / move / duplicate, plus the built-in presets as a read-only
 * location you can apply from or copy out of.
 */
export default function PaletteLibrary({ onClose }: { onClose: () => void }) {
  useEffect(syncOnLook, []);
  const palette = useStore((s) => s.design.palette);
  const paletteSlotPath = useStore((s) => s.paletteSlotPath);
  const applyPalette = useStore((s) => s.applyPalette);
  const setPaletteSlotPath = useStore((s) => s.setPaletteSlotPath);
  const setPaletteName = useStore((s) => s.setPaletteName);
  const remapPaletteSlot = useStore((s) => s.remapPaletteSlot);

  const presets = useMemo<VirtualLocation>(() => {
    const built = PRESET_PALETTES.map((p) => ({
      key: p.key,
      label: p.label,
      group: p.group ?? '',
      json: serializePalette({ ...p.build(), name: p.label }),
    }));
    return {
      label: 'Presets',
      icon: 'swatches',
      entries: () =>
        built.map((p) => ({
          kind: 'file' as const,
          path: p.key,
          folder: p.group,
          name: p.label,
          meta: describePalette(p.json),
          readonly: true,
        })),
      load: (path) => built.find((p) => p.key === path)?.json ?? null,
    };
  }, []);

  const importFile = async () => {
    const f = await pickTextFile();
    if (!f) return;
    try {
      applyPalette(parsePalette(f.text));
      onClose();
    } catch (err) {
      alert('Could not import palette:\n' + (err as Error).message);
    }
  };

  return (
    <Modal title="Palette Library" onClose={onClose} wide>
      <FileBrowser
        col={paletteLibrary}
        mode="library"
        prefsKey={storage.PBKEY}
        typeHeader="Kind"
        openLabel="Apply"
        saveLabel="Save current palette as:"
        currentPath={paletteSlotPath}
        initialName={palette.name.trim() || 'My Palette'}
        virtual={presets}
        onOpen={(entry, json) => {
          try {
            applyPalette(parsePalette(json));
          } catch (err) {
            alert('Could not load palette:\n' + (err as Error).message);
            return false;
          }
          setPaletteSlotPath(entry.readonly ? null : entry.path);
        }}
        onSave={(name, folder) => {
          const path = paletteLibrary.save(
            folder,
            name,
            stampPaletteJson(serializePalette({ ...palette, name })),
          );
          setPaletteName(name.trim());
          setPaletteSlotPath(path);
          return path;
        }}
        onRemap={remapPaletteSlot}
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={importFile}>
              Import file…
            </button>
            <button
              className="btn"
              onClick={() =>
                downloadText(
                  `${palette.name || 'palette'}.beadloom-palette.json`,
                  serializePalette(palette),
                )
              }
            >
              Export file…
            </button>
          </>
        }
      />
    </Modal>
  );
}

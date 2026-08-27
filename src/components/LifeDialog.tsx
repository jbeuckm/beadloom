import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import {
  CONWAY,
  countLive,
  lifeStep,
  parseRule,
  randomSeed,
  type StepOptions,
} from '../lib/life';
import { activeRasterGrid } from '../lib/layers';

const activeGrid = () => {
  const s = useStore.getState();
  return activeRasterGrid(s.design, s.activeLayer);
};

export default function LifeDialog({ onClose }: { onClose: () => void }) {
  const replaceGrid = useStore((s) => s.replaceGrid);
  const pushHistory = useStore((s) => s.pushHistory);

  const [ruleText, setRuleText] = useState('B3/S23');
  const [colorMode, setColorMode] = useState<StepOptions['colorMode']>('vote');
  const [wrap, setWrap] = useState(false);
  const [speed, setSpeed] = useState(6); // generations / second
  const [density, setDensity] = useState(0.3);
  const [running, setRunning] = useState(false);
  const [gen, setGen] = useState(0);
  const [live, setLive] = useState(() => countLive(activeGrid()));

  const rule = useMemo(() => parseRule(ruleText), [ruleText]);
  const timer = useRef<number | null>(null);
  const startedRun = useRef(false);

  const options = (): StepOptions => ({
    wrap,
    colorMode,
    fixedColor: useStore.getState().activeColor,
  });

  const advance = (withHistory: boolean) => {
    const r = rule ?? CONWAY;
    const cur = activeGrid();
    const next = lifeStep(cur, r, options());
    if (withHistory) pushHistory();
    replaceGrid(next);
    const n = countLive(next);
    setLive(n);
    setGen((g) => g + 1);
    return n;
  };

  const stop = () => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setRunning(false);
    startedRun.current = false;
  };

  const run = () => {
    if (running) {
      stop();
      return;
    }
    setRunning(true);
    startedRun.current = false;
    timer.current = window.setInterval(() => {
      const n = advance(!startedRun.current);
      startedRun.current = true;
      if (n === 0) stop();
    }, Math.max(40, 1000 / speed));
  };

  // restart the interval if the speed changes mid-run
  useEffect(() => {
    if (!running) return;
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      const n = advance(false);
      if (n === 0) stop();
    }, Math.max(40, 1000 / speed));
    return () => {
      if (timer.current !== null) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearInterval(timer.current);
    },
    [],
  );

  const seed = () => {
    const { columns, rows } = useStore.getState().design.loom;
    pushHistory();
    replaceGrid(randomSeed(columns, rows, density, useStore.getState().activeColor));
    setGen(0);
    setLive(countLive(activeGrid()));
  };

  return (
    <div className="dock-panel life-panel">
      <p className="hint">
        Evolves the active layer with cellular-automaton rules. A cell with any
        bead is “alive”. Runs mutate the layer — undo to step back.
      </p>

      <div className="row2">
        <div className="field">
          <label>Rule (birth / survive)</label>
          <input
            type="text"
            value={ruleText}
            spellCheck={false}
            aria-invalid={!rule}
            onChange={(e) => setRuleText(e.target.value)}
          />
          {!rule && <span className="hint">Use e.g. B3/S23</span>}
        </div>
        <div className="field">
          <label>New cell colour</label>
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as StepOptions['colorMode'])}
          >
            <option value="vote">Most common neighbour</option>
            <option value="active">Active colour</option>
          </select>
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
        Wrap around the edges
      </label>

      <div className="field">
        <label>Speed — {speed}/s</label>
        <input
          type="range"
          min={1}
          max={20}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        />
      </div>

      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" onClick={run}>
          <Icon name={running ? 'stop' : 'play'} size={16} /> {running ? 'Stop' : 'Run'}
        </button>
        <button className="btn" onClick={() => advance(true)} disabled={running}>
          Step
        </button>
        <span className="hint" style={{ alignSelf: 'center' }}>
          gen <b>{gen}</b> · <b>{live}</b> live
        </span>
      </div>

      <h3>Random seed</h3>
      <div className="field">
        <label>Density — {Math.round(density * 100)}%</label>
        <input
          type="range"
          min={5}
          max={80}
          value={Math.round(density * 100)}
          onChange={(e) => setDensity(Number(e.target.value) / 100)}
        />
      </div>

      <div className="actions">
        <button className="btn" onClick={seed} disabled={running}>
          <Icon name="dice" size={16} /> Seed grid
        </button>
        <button className="btn primary" onClick={() => { stop(); onClose(); }}>
          Done
        </button>
      </div>
    </div>
  );
}

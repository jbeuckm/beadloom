import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import {
  CLASS_NOTE,
  CONWAY,
  countLive,
  elementaryRow,
  lifeStep,
  parseRule,
  parseWolframCode,
  RULE_CATALOG,
  type StepOptions,
} from '../lib/life';
import { EMPTY } from '../types';

const lifeGrid = () => useStore.getState().lifeInput();
const CUSTOM = 'custom';

export default function LifeDialog({ onClose }: { onClose: () => void }) {
  const lifeOutput = useStore((s) => s.lifeOutput);
  const lifeEnd = useStore((s) => s.lifeEnd);
  const hasSelection = useStore((s) => !!s.selection);

  const [ruleId, setRuleId] = useState('w30'); // Wolfram's Rule 30 by default
  const [customBS, setCustomBS] = useState('B3/S23');
  const [colorMode, setColorMode] = useState<StepOptions['colorMode']>('vote');
  const [wrap, setWrap] = useState(false);
  const [speed, setSpeed] = useState(6); // generations / second
  const [density, setDensity] = useState(0.3);
  const [running, setRunning] = useState(false);
  const [gen, setGen] = useState(0);
  const [live, setLive] = useState(() => countLive(lifeGrid()));

  const def = useMemo(
    () => RULE_CATALOG.find((r) => r.id === ruleId) ?? null,
    [ruleId],
  );
  const is1D = def?.kind === '1d';
  const code1d = useMemo(
    () => (def?.kind === '1d' ? parseWolframCode(def.code) : null),
    [def],
  );
  const rule2d = useMemo(
    () => parseRule(def && def.kind === '2d' ? def.code : customBS),
    [def, customBS],
  );

  const timer = useRef<number | null>(null);
  const startedRun = useRef(false);
  // genRef mirrors `gen` so the interval callback (which closes over a stale
  // render) always reads the current generation.
  const genRef = useRef(0);
  const setGeneration = (v: number) => {
    genRef.current = v;
    setGen(v);
  };

  const options = (): StepOptions => ({
    wrap,
    colorMode,
    fixedColor: useStore.getState().activeColor,
  });

  // A single generation. Returns the live count, or 0 to signal "stop the run"
  // (a 2-D pattern that died out, or a 1-D tapestry that reached the bottom).
  const advance = (withHistory: boolean): number => {
    const data = lifeGrid();

    if (is1D && code1d != null) {
      const rows = data.length;
      if (rows < 2) return 0;
      const g = genRef.current;
      const color = useStore.getState().activeColor;
      // establish a one-bead seed on the top row if the user hasn't
      if (g <= 0 && !data[0].some((v) => v >= 0)) {
        const seeded = data.map((row) => row.slice());
        seeded[0][seeded[0].length >> 1] = color;
        lifeOutput(seeded, withHistory);
        setGeneration(0);
        setLive(1);
        return 1;
      }
      if (g >= rows - 1) return 0; // tapestry complete
      const next = elementaryRow(data, code1d, g + 1, {
        wrap,
        colorMode,
        fixedColor: color,
      });
      lifeOutput(next, withHistory);
      setGeneration(g + 1);
      const n = countLive(next);
      setLive(n);
      return n;
    }

    const next = lifeStep(data, rule2d ?? CONWAY, options());
    lifeOutput(next, withHistory);
    const n = countLive(next);
    setLive(n);
    setGeneration(genRef.current + 1);
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
      if (n <= 0) stop();
    }, Math.max(40, 1000 / speed));
  };

  // restart the interval if the speed changes mid-run
  useEffect(() => {
    if (!running) return;
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      const n = advance(false);
      if (n <= 0) stop();
    }, Math.max(40, 1000 / speed));
    return () => {
      if (timer.current !== null) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearInterval(timer.current);
      useStore.getState().lifeEnd();
    },
    [],
  );

  // switching rules starts the generation count over
  useEffect(() => {
    stop();
    setGeneration(0);
    setLive(countLive(lifeGrid()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId]);

  const seed = () => {
    const color = useStore.getState().activeColor;
    const cur = lifeGrid();
    let seeded: number[][];
    if (is1D) {
      seeded = cur.map((row) => row.map(() => EMPTY));
      if (seeded[0]) seeded[0][seeded[0].length >> 1] = color;
    } else {
      seeded = cur.map((row) =>
        row.map(() => (Math.random() < density ? color : EMPTY)),
      );
    }
    lifeOutput(seeded, true);
    setGeneration(0);
    setLive(countLive(seeded));
  };

  const featured = RULE_CATALOG.filter((r) => r.featured);
  const others1d = RULE_CATALOG.filter((r) => r.kind === '1d' && !r.featured);
  const others2d = RULE_CATALOG.filter((r) => r.kind === '2d' && !r.featured);
  const opt = (r: (typeof RULE_CATALOG)[number]) => (
    <option key={r.id} value={r.id}>
      {r.name}
      {r.kind === '1d' ? ' · 1-D' : ''}
    </option>
  );

  const seedLabel = is1D
    ? 'Seed top row'
    : hasSelection
      ? 'Seed selection'
      : 'Seed grid';

  return (
    <div className="dock-panel life-panel">
      <p className="hint">
        {is1D
          ? 'A 1-D Wolfram automaton, drawn as a tapestry: the top row is the seed and every row below is the next generation.'
          : hasSelection
            ? 'Evolves the selected cells. A cell with any bead is “alive”; runs mutate the selection — undo to step back.'
            : 'Evolves a new layer over the whole grid. Select a region first to keep it contained. Undo to step back.'}
      </p>

      <div className="field">
        <label>Rule</label>
        <select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
          <optgroup label="Featured — surprising &amp; complex">
            {featured.map(opt)}
          </optgroup>
          <optgroup label="1-D · Wolfram elementary">{others1d.map(opt)}</optgroup>
          <optgroup label="2-D · life-like">{others2d.map(opt)}</optgroup>
          <optgroup label="Custom">
            <option value={CUSTOM}>Custom B/S rule…</option>
          </optgroup>
        </select>
      </div>

      {ruleId === CUSTOM ? (
        <div className="field">
          <label>Birth / survive</label>
          <input
            type="text"
            value={customBS}
            spellCheck={false}
            aria-invalid={!rule2d}
            onChange={(e) => setCustomBS(e.target.value)}
          />
          {!rule2d && <span className="hint">Use e.g. B3/S23</span>}
        </div>
      ) : (
        def && (
          <p className="rule-blurb">
            {def.blurb}
            <span className="rule-tags">
              <span className="rule-class" title={CLASS_NOTE[def.klass]}>
                Class {def.klass}
              </span>
              <code>
                {def.kind === '1d' ? `Wolfram ${def.code}` : def.code}
              </code>
            </span>
          </p>
        )
      )}

      <div className="field">
        <label>New cell colour</label>
        <select
          value={colorMode}
          onChange={(e) =>
            setColorMode(e.target.value as StepOptions['colorMode'])
          }
        >
          <option value="vote">Most common neighbour</option>
          <option value="active">Active colour</option>
        </select>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={wrap}
          onChange={(e) => setWrap(e.target.checked)}
        />
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
          <Icon name={running ? 'stop' : 'play'} size={16} />{' '}
          {running ? 'Stop' : 'Run'}
        </button>
        <button className="btn" onClick={() => advance(true)} disabled={running}>
          Step
        </button>
        <span className="hint" style={{ alignSelf: 'center' }}>
          gen <b>{gen}</b> · <b>{live}</b> live
        </span>
      </div>

      <h3>{is1D ? 'Seed' : 'Random seed'}</h3>
      {!is1D && (
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
      )}

      <div className="actions">
        <button className="btn" onClick={seed} disabled={running}>
          <Icon name="dice" size={16} /> {seedLabel}
        </button>
        <button
          className="btn primary"
          onClick={() => {
            stop();
            lifeEnd();
            onClose();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { SceneEngine } from '@/src/engine/SceneEngine';
import type { WeatherKind } from '@/src/engine/types';
import { TIME_ORDER } from '@/src/engine/palette';

const WEATHER: WeatherKind[] = [
  'clear',
  'rain',
  'storm',
  'snow',
  'fog',
  'ash',
  'petals',
  'fireflies',
  'sandstorm',
];

interface Props {
  engine: SceneEngine | null;
  cycle: number;
  onCycle: (v: number) => void;
  initialWeather: WeatherKind;
}

/**
 * Live scene controls.
 *
 * This is what replaced the old "ask the model for the next beat" loop. Both
 * controls mutate the running scene directly — no network call, no credit, no
 * multi-second wait, and no risk of the world drifting into a different place
 * because an image model reinterpreted it. It is cheaper *and* a better demo:
 * dragging time of day and watching the sun physically cross the sky is the
 * clearest possible proof that the scene is composed rather than painted.
 */
export default function SceneControls({ engine, cycle, onCycle, initialWeather }: Props) {
  const [weather, setWeather] = useState<WeatherKind>(initialWeather);
  const [open, setOpen] = useState(false);

  useEffect(() => setWeather(initialWeather), [initialWeather]);

  const label = TIME_ORDER[Math.floor(((cycle % 1) + 1) % 1 * TIME_ORDER.length)];

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full bg-ink-800/80 px-4 py-2 text-sm text-paper-300 backdrop-blur transition-colors hover:bg-ink-700 hover:text-paper-100"
      >
        {open ? 'hide controls' : 'adjust world'}
      </button>

      {open && (
        <div className="w-72 rounded-2xl border border-ink-600 bg-ink-800/85 p-4 backdrop-blur">
          <label className="block">
            <div className="mb-2 flex items-baseline justify-between text-xs uppercase tracking-wider text-paper-400">
              <span>time</span>
              <span className="text-paper-200">{label}</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.999}
              step={0.004}
              value={cycle}
              onChange={(e) => onCycle(Number(e.target.value))}
              className="w-full accent-ember-500"
              aria-label="time of day"
            />
          </label>

          <div className="mt-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-paper-400">
              weather
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WEATHER.map((w) => (
                <button
                  key={w}
                  onClick={() => {
                    setWeather(w);
                    engine?.setWeather(w);
                  }}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    w === weather
                      ? 'bg-paper-100 text-ink-900'
                      : 'bg-ink-700 text-paper-300 hover:bg-ink-600 hover:text-paper-100'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { FIXTURES, FIXTURE_KEYS } from '@/src/engine/fixtures';
import { cycleForTimeOfDay } from '@/src/engine/SceneEngine';

const WorldCanvas = dynamic(() => import('@/components/WorldCanvas'), { ssr: false });

/**
 * Engine lab — the development harness.
 *
 * Every fixture, side by side with a live day-cycle scrubber, with zero AI in
 * the loop. This is the gate for Phase 1: if a scene is not compelling here, no
 * amount of generation quality will save it downstream.
 */
export default function LabPage() {
  const [key, setKey] = useState(FIXTURE_KEYS[0]);
  const spec = FIXTURES[key];
  const [cycle, setCycle] = useState(cycleForTimeOfDay(spec.timeOfDay));

  return (
    <main className="flex h-screen flex-col bg-ink-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-600 px-4 py-3 text-sm">
        {FIXTURE_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => {
              setKey(k);
              setCycle(cycleForTimeOfDay(FIXTURES[k].timeOfDay));
            }}
            className={`rounded-full px-3 py-1 transition-colors ${
              k === key
                ? 'bg-paper-100 text-ink-900'
                : 'bg-ink-700 text-paper-300 hover:bg-ink-600'
            }`}
          >
            {FIXTURES[k].name}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-3 text-paper-300">
          <span className="tabular-nums">cycle {cycle.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={cycle}
            onChange={(e) => setCycle(Number(e.target.value))}
            className="w-64 accent-ember-500"
          />
        </label>
      </div>

      <div className="relative min-h-0 flex-1">
        <WorldCanvas key={key} spec={spec} cycle={cycle} className="h-full w-full" />
        <div className="pointer-events-none absolute bottom-5 left-5">
          <div className="font-display text-2xl text-paper-100">{spec.name}</div>
          <div className="text-sm text-paper-300">{spec.tagline}</div>
        </div>
      </div>
    </main>
  );
}

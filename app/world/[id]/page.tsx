'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import SceneControls from '@/components/SceneControls';
import { getPrompt, getWorld } from '@/lib/worlds';
import { cycleForTimeOfDay } from '@/src/engine/SceneEngine';
import type { SceneEngine } from '@/src/engine/SceneEngine';

const WorldCanvas = dynamic(() => import('@/components/WorldCanvas'), { ssr: false });

/**
 * A world permalink.
 *
 * The whole world is reconstructed from its spec and seed — nothing is fetched
 * from an image store and no model is called. That is what makes revisiting a
 * world free, instant, and byte-identical to the first time it was seen, and
 * it is why the gallery can exist at all without a per-view cost.
 */
export default function WorldPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const spec = getWorld(id);

  const [engine, setEngine] = useState<SceneEngine | null>(null);
  const [cycle, setCycle] = useState(() =>
    spec ? cycleForTimeOfDay(spec.timeOfDay) : 0.25,
  );

  const handleEngine = useCallback((e: SceneEngine | null) => setEngine(e), []);

  if (!spec) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-3xl text-paper-100">no such world</h1>
        <p className="text-paper-300">
          This world does not exist, or it is no longer public.
        </p>
        <Link
          href="/gallery"
          className="rounded-full bg-paper-100 px-5 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-white"
        >
          browse the gallery
        </Link>
      </main>
    );
  }

  return (
    <main className="relative h-screen overflow-hidden">
      <WorldCanvas
        spec={spec}
        cycle={cycle}
        onEngine={handleEngine}
        className="absolute inset-0 h-full w-full"
      />

      <TopBar overlay backHref="/gallery" backLabel="gallery" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-6 bg-gradient-to-t from-ink-900/85 to-transparent p-6">
        <div className="max-w-md">
          <h1 className="font-display text-3xl leading-tight text-paper-100">
            {spec.name}
          </h1>
          <p className="mt-1 text-sm text-paper-300">{spec.tagline}</p>
          {getPrompt(id) && (
            <p className="mt-3 text-xs text-paper-400">
              from “{getPrompt(id)}”
            </p>
          )}
        </div>

        <SceneControls
          engine={engine}
          cycle={cycle}
          onCycle={setCycle}
          initialWeather={spec.weather.kind}
        />
      </div>
    </main>
  );
}

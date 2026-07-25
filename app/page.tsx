'use client';

import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import PromptBar from '@/components/PromptBar';
import { PRESETS } from '@/lib/worlds';
import { FIXTURES } from '@/src/engine/fixtures';

const WorldCanvas = dynamic(() => import('@/components/WorldCanvas'), { ssr: false });

/**
 * Landing.
 *
 * The hero is a live engine scene, not a video or a screenshot. The entire
 * product claim is "this is a running world, not a picture" — so the page has
 * to demonstrate it in the first second rather than assert it in a headline.
 */
export default function Landing() {
  const router = useRouter();

  // Generation is not wired yet, so a prompt routes to the closest preset.
  // Replaced by POST /api/generate in the next phase.
  const handlePrompt = () => router.push('/world/lighthouse');

  return (
    <main className="relative h-screen overflow-hidden">
      <WorldCanvas
        spec={FIXTURES.glowforest}
        className="absolute inset-0 h-full w-full"
      />

      {/* Legibility scrim. Kept as a gradient so the scene stays readable
          behind the type without flattening it into a dark rectangle. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/45 to-ink-900/70" />

      <TopBar overlay />

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6">
        <div className="w-full max-w-2xl text-center">
          <h1 className="font-display text-5xl leading-[1.1] tracking-tight text-paper-100 sm:text-6xl">
            Describe a world.
            <br />
            <span className="text-paper-300">Watch it live.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-paper-300">
            Every scene is composed from layers — weather, drifting light, things
            that move on their own. Not a still image with effects on top.
          </p>

          <div className="mt-9">
            <PromptBar onSubmit={handlePrompt} />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {PRESETS.map((p) => (
              <Link
                key={p.id}
                href={`/world/${p.id}`}
                className="rounded-full border border-ink-500 bg-ink-800/60 px-3.5 py-1.5 text-[13px] text-paper-300 backdrop-blur transition-colors hover:border-paper-400 hover:text-paper-100"
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 left-0 right-0 z-10 text-center text-xs text-paper-400">
        this scene is running right now — {FIXTURES.glowforest.tagline}
      </div>
    </main>
  );
}

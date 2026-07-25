import Link from 'next/link';
import TopBar from '@/components/TopBar';
import { listWorlds } from '@/lib/worlds';

export const metadata = { title: 'Gallery — AETHER' };

/**
 * Gallery.
 *
 * Cards are palette gradients rather than live engines or rendered thumbnails.
 * Mounting five WebGL contexts on one page to show five postage stamps is a
 * bad trade, and a screenshot pipeline is work we do not need: the palette
 * already *is* the mood of the world, so a strip of its own colours previews it
 * honestly at zero cost. The living version is one click away, which is the
 * point of the page.
 */
export default function GalleryPage() {
  const worlds = listWorlds();

  return (
    <main className="min-h-screen">
      <TopBar backHref="/" backLabel="home" />

      <div className="mx-auto max-w-5xl px-6 pb-20 pt-24">
        <h1 className="font-display text-4xl text-paper-100">Your worlds</h1>
        <p className="mt-2 text-sm text-paper-300">
          Every world is stored as a spec and a seed, so revisiting one costs
          nothing and looks exactly as it did.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {worlds.map((w) => (
            <Link
              key={w.id}
              href={`/world/${w.id}`}
              className="group overflow-hidden rounded-2xl border border-ink-600 bg-ink-800 transition-all hover:border-paper-400"
            >
              <div
                className="h-32 w-full transition-transform duration-500 group-hover:scale-[1.03]"
                style={{
                  backgroundImage: `linear-gradient(to bottom, ${w.swatch.join(', ')})`,
                }}
              />
              <div className="p-4">
                <div className="font-display text-lg text-paper-100">{w.name}</div>
                <div className="mt-0.5 line-clamp-1 text-sm text-paper-300">
                  {w.tagline}
                </div>
                <div className="mt-3 flex gap-2 text-[11px] uppercase tracking-wider text-paper-400">
                  <span>{w.biome}</span>
                  <span aria-hidden="true">·</span>
                  <span>{w.timeOfDay}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

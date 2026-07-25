'use client';

import Link from 'next/link';

interface Props {
  /** Where the back affordance goes. Omit for the landing page. */
  backHref?: string;
  backLabel?: string;
  /** Rendered over a live scene — needs its own contrast. */
  overlay?: boolean;
  credits?: number;
}

/**
 * Persistent navigation.
 *
 * Requirement #7 — "return to a previous page easily" — is why the back
 * affordance is a real `<Link>` to a known route rather than `history.back()`.
 * A world permalink is frequently the first page someone lands on (shared
 * link, gallery deep link), and `history.back()` from there goes nowhere.
 */
export default function TopBar({ backHref, backLabel = 'back', overlay, credits }: Props) {
  return (
    <header
      className={[
        'pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-4 px-5 py-4',
        overlay
          ? 'bg-gradient-to-b from-ink-900/80 to-transparent'
          : 'border-b border-ink-600 bg-ink-900',
      ].join(' ')}
    >
      {backHref ? (
        <Link
          href={backHref}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-ink-800/70 px-3 py-1.5 text-sm text-paper-300 backdrop-blur transition-colors hover:bg-ink-700 hover:text-paper-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z"
            />
          </svg>
          {backLabel}
        </Link>
      ) : (
        <Link
          href="/"
          className="pointer-events-auto font-display text-lg tracking-wide text-paper-100"
        >
          aether
        </Link>
      )}

      <nav className="pointer-events-auto ml-auto flex items-center gap-4 text-sm text-paper-300">
        <Link href="/gallery" className="transition-colors hover:text-paper-100">
          gallery
        </Link>
        {credits !== undefined && (
          <span
            className="rounded-full bg-ink-800/70 px-3 py-1.5 tabular-nums backdrop-blur"
            title="generation credits"
          >
            {credits} credits
          </span>
        )}
      </nav>
    </header>
  );
}

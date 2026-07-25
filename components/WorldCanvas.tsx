'use client';

import { useEffect, useRef, useState } from 'react';
import type { SceneSpec } from '@/src/engine/types';
import type { SceneEngine } from '@/src/engine/SceneEngine';

interface Props {
  spec: SceneSpec;
  /** 0..1 day cycle. Omit to use the spec's own time of day. */
  cycle?: number;
  className?: string;
  onEngine?: (engine: SceneEngine | null) => void;
}

/**
 * Mounts the Pixi engine. Client-only and imported dynamically by callers —
 * Pixi touches `document` at module scope, so it must never reach the server
 * bundle.
 *
 * The engine is rebuilt when the spec identity changes, and only relit when the
 * cycle changes. Rebuilding on a cycle change would throw away every baked
 * texture to change a colour.
 */
export default function WorldCanvas({ spec, cycle, className, onEngine }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let engine: SceneEngine | null = null;
    setReady(false);

    (async () => {
      const [{ SceneEngine }, { createSystems }] = await Promise.all([
        import('@/src/engine/SceneEngine'),
        import('@/src/engine/createScene'),
      ]);
      if (cancelled || !hostRef.current) return;

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      engine = new SceneEngine({ spec, reducedMotion });
      await engine.mount(hostRef.current, createSystems());
      if (cancelled) {
        engine.destroy();
        return;
      }
      engineRef.current = engine;
      onEngine?.(engine);

      await engine.ready;
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      onEngine?.(null);
      engineRef.current = null;
      engine?.destroy();
    };
    // `onEngine` is intentionally excluded: callers pass inline closures, and
    // including it would tear down and rebuild the whole scene every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  useEffect(() => {
    if (cycle !== undefined) engineRef.current?.setCycle(cycle);
  }, [cycle]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        opacity: ready ? 1 : 0,
        transition: 'opacity 900ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    />
  );
}

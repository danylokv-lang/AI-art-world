/**
 * AmbientDirector — world behaviour.
 *
 * The old design asked a language model for "the next beat" every 13 seconds,
 * paid a multi-second round trip for it, and got back a repainted image that
 * had quietly drifted to a different place. This does the same job locally, in
 * microseconds, with perfect continuity: it schedules events, and the systems
 * that care react to them.
 *
 * The scheduling is deliberately irregular. Anything on a fixed interval is
 * read as a loop within about thirty seconds, which is roughly how long a demo
 * gets looked at.
 */

import type { SceneContext, System } from '../System';
import type { AmbientEventKind } from '../types';
import { randRange, type Rng } from '../rng';

interface Scheduled {
  kind: AmbientEventKind;
  min: number;
  max: number;
  nextAt: number;
}

export class AmbientDirector implements System {
  readonly id = 'ambient';

  private queue: Scheduled[] = [];
  private rng: Rng = Math.random;

  build(ctx: SceneContext): void {
    this.rng = ctx.rng('ambient');
    for (const e of ctx.spec.ambientEvents) {
      const min = Math.max(400, e.everyMs[0]) / 1000;
      const max = Math.max(min + 0.5, e.everyMs[1] / 1000);
      this.queue.push({
        kind: e.kind,
        min,
        max,
        // Stagger the first firing so the scene does not open with every event
        // going off at once.
        nextAt: randRange(this.rng, min * 0.3, max),
      });
    }
  }

  update(ctx: SceneContext): void {
    for (const s of this.queue) {
      if (ctx.time < s.nextAt) continue;
      s.nextAt = ctx.time + randRange(this.rng, s.min, s.max);

      ctx.bus.emit({
        kind: s.kind,
        strength: this.strengthFor(s.kind),
        x: this.rng(),
      });
    }
  }

  /**
   * Most events are usually mild and occasionally dramatic. A flat random
   * strength makes every gust feel the same; a skewed one gives the scene the
   * occasional moment worth waiting for.
   */
  private strengthFor(kind: AmbientEventKind): number {
    const roll = this.rng();
    switch (kind) {
      case 'lightning':
        return roll < 0.75 ? randRange(this.rng, 0.3, 0.6) : randRange(this.rng, 0.8, 1);
      case 'gust':
        return Math.pow(roll, 1.8) * 0.9 + 0.1;
      case 'flock_takeoff':
        return randRange(this.rng, 0.7, 1);
      default:
        return randRange(this.rng, 0.35, 1);
    }
  }

  destroy(): void {
    this.queue = [];
  }
}

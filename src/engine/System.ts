/**
 * The system contract.
 *
 * A scene is not one animated thing — it is ten independent systems that each
 * own a narrow slice of the world and update themselves every frame. That is
 * the whole architectural difference from the old approach: motion is a
 * property of objects that exist, not an effect applied to a picture.
 *
 * Systems never talk to each other directly. They read the spec, write to their
 * own layer, and communicate only by publishing/subscribing to ambient events,
 * which keeps them independently testable and independently deletable.
 */

import type { Container } from 'pixi.js';
import type { AmbientEventKind, SceneSpec } from './types';
import type { Rng } from './rng';
import type { LayerStack } from './LayerStack';

export interface AmbientEvent {
  kind: AmbientEventKind;
  /** 0..1 — how forceful this instance is. Systems scale their response. */
  strength: number;
  /** Normalised x where the event originates, when it is positional. */
  x?: number;
}

export type AmbientListener = (event: AmbientEvent) => void;

export class EventBus {
  private listeners = new Map<AmbientEventKind | '*', Set<AmbientListener>>();

  on(kind: AmbientEventKind | '*', fn: AmbientListener): () => void {
    let set = this.listeners.get(kind);
    if (!set) {
      set = new Set();
      this.listeners.set(kind, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(event: AmbientEvent): void {
    this.listeners.get(event.kind)?.forEach((fn) => fn(event));
    this.listeners.get('*')?.forEach((fn) => fn(event));
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** Everything a system needs. Passed to build() and available on the engine. */
export interface SceneContext {
  spec: SceneSpec;
  layers: LayerStack;
  bus: EventBus;
  /** Virtual render dimensions. Height is fixed; width follows the viewport. */
  width: number;
  height: number;
  /** Per-system deterministic stream. Call `rng(id)` to get yours. */
  rng: (label: string) => Rng;
  /** Seconds since the scene started. */
  time: number;
  /** Seconds since the previous frame, clamped. */
  dt: number;
  /** Pointer position in 0..1, already smoothed. Centre is (0.5, 0.5). */
  pointer: { x: number; y: number };
  /** Continuous day cycle 0..1, driven by the spec or the UI scrubber. */
  cycle: number;
  /**
   * The cycle the palette was authored for.
   *
   * Lighting is applied *relative* to this, never absolutely. A palette written
   * for dusk already contains dusk — grading it by an absolute "dusk is dim"
   * factor darkens it twice and the scene turns to mud. At `cycle === baseCycle`
   * the palette must render exactly as written.
   */
  baseCycle: number;
  /** Global wind, spec wind plus any active gust. Systems read this, not spec. */
  wind: number;
  /** Set by LightingSystem when a flash is active; 0 normally. */
  flash: number;
  reducedMotion: boolean;
  /**
   * Light sources worth reflecting in water, registered at build time.
   *
   * The one sanctioned exception to systems not knowing about each other: a
   * reflection is inherently a fact about two layers at once, and a wet street
   * with no neon in it is the difference between the city scene landing and
   * not. Producers push; WaterSystem consumes. Nobody reads anyone else's
   * objects.
   */
  reflections: ReflectionSource[];
}

export interface ReflectionSource {
  /** Virtual x, in scene space. */
  x: number;
  color: number;
  /** 0..1 — how bright the streak is. */
  strength: number;
  width: number;
}

export interface System {
  readonly id: string;
  /** Which layer this system draws into. */
  build(ctx: SceneContext): void;
  update(ctx: SceneContext): void;
  /** Called when the virtual width changes (viewport aspect change). */
  resize?(ctx: SceneContext): void;
  destroy(): void;
}

/** Small helper for systems that just need a container parked in a layer. */
export function attach(layer: Container, child: Container): Container {
  layer.addChild(child);
  return child;
}

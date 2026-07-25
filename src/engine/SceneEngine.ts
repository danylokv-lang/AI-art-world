/**
 * SceneEngine — owns the Pixi application, the frame loop, and the systems.
 *
 * The one non-negotiable decision here is the virtual resolution. The canvas
 * backing store is genuinely ~480x270; the browser stretches it with
 * nearest-neighbour sampling (`image-rendering: pixelated`). So the scene is
 * not "styled to look like pixel art" — there physically are only ~130k pixels,
 * and every system is forced to compose within them. It also means the whole
 * scene costs less to shade than a single 1080p background image, which is what
 * buys us the headroom to run ten animated systems at 60fps.
 */

import { Application, Container, TextureStyle } from 'pixi.js';
import { LayerStack } from './LayerStack';
import { EventBus, type SceneContext, type System } from './System';
import { deriveRng, clamp01, lerp } from './rng';
import { TIME_ORDER } from './palette';
import { VIRTUAL_H, type SceneSpec, type WeatherKind } from './types';

export interface EngineOptions {
  spec: SceneSpec;
  /** Skip pointer follow and heavy particle work. */
  reducedMotion?: boolean;
}

/** Virtual width is clamped so ultrawide windows do not reveal empty space. */
const MIN_VW = 320;
const MAX_VW = 900;

export class SceneEngine {
  readonly app = new Application();
  readonly layers = new LayerStack();
  readonly bus = new EventBus();

  private host: HTMLElement | null = null;
  private systems: System[] = [];
  private ctx: SceneContext;
  private resizeObserver: ResizeObserver | null = null;
  private pointerTarget = { x: 0.5, y: 0.5 };
  private pointerIdleFor = 0;
  private started = false;
  private disposed = false;

  /**
   * Resolves once a frame has actually been drawn.
   *
   * Exposed as a promise rather than an `onReady` callback so the caller can
   * await it in the same async flow as `mount()`, where its own cancellation
   * check already lives. Signalling readiness through a captured callback
   * across an await plus a microtask gave React StrictMode's double-mount a
   * window to drop it, which left the scene rendering correctly behind
   * `opacity: 0` — invisible and with nothing in the console to explain it.
   */
  readonly ready: Promise<void>;
  private markReady!: () => void;

  constructor(opts: EngineOptions) {
    this.ready = new Promise<void>((resolve) => {
      this.markReady = resolve;
    });
    this.ctx = {
      spec: opts.spec,
      layers: this.layers,
      bus: this.bus,
      width: 480,
      height: VIRTUAL_H,
      rng: (label: string) => deriveRng(opts.spec.seed, label),
      time: 0,
      dt: 0,
      pointer: { x: 0.5, y: 0.5 },
      cycle: cycleForTimeOfDay(opts.spec.timeOfDay),
      baseCycle: cycleForTimeOfDay(opts.spec.timeOfDay),
      wind: opts.spec.weather.wind,
      flash: 0,
      reducedMotion: opts.reducedMotion ?? false,
      reflections: [],
    };
  }

  get context(): SceneContext {
    return this.ctx;
  }

  /** Mount into a host element and start rendering. */
  async mount(host: HTMLElement, systems: System[]): Promise<void> {
    if (this.disposed) return;
    this.host = host;

    // Global default: every texture samples with nearest-neighbour. Setting it
    // per-texture is the single easiest way to end up with one blurry sprite.
    TextureStyle.defaultOptions.scaleMode = 'nearest';

    const { width, height } = this.computeVirtualSize();
    this.ctx.width = width;
    this.ctx.height = height;

    await this.app.init({
      width,
      height,
      antialias: false,
      autoDensity: false,
      resolution: 1,
      backgroundAlpha: 1,
      background: 0x08090c,
      roundPixels: true,
      preference: 'webgl',
    });
    if (this.disposed) {
      this.app.destroy(true);
      return;
    }

    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.classList.add('pixel-canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    host.appendChild(canvas);

    this.app.stage.addChild(this.layers.root as Container);

    this.systems = systems;
    for (const sys of this.systems) sys.build(this.ctx);

    this.bindPointer(host);
    this.bindResize(host);

    this.app.ticker.add(this.tick);
    this.started = true;
    this.app.ticker.addOnce(() => this.markReady());
  }

  private computeVirtualSize(): { width: number; height: number } {
    const rect = this.host?.getBoundingClientRect();
    const aspect = rect && rect.height > 0 ? rect.width / rect.height : 16 / 9;
    const width = Math.round(
      Math.max(MIN_VW, Math.min(MAX_VW, VIRTUAL_H * aspect)),
    );
    // Even widths keep centred elements on whole pixels.
    return { width: width % 2 === 0 ? width : width + 1, height: VIRTUAL_H };
  }

  private bindResize(host: HTMLElement): void {
    this.resizeObserver = new ResizeObserver(() => {
      const { width, height } = this.computeVirtualSize();
      if (width === this.ctx.width && height === this.ctx.height) return;
      this.ctx.width = width;
      this.ctx.height = height;
      this.app.renderer.resize(width, height);
      for (const sys of this.systems) sys.resize?.(this.ctx);
    });
    this.resizeObserver.observe(host);
  }

  private bindPointer(host: HTMLElement): void {
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      this.pointerTarget.x = clamp01((e.clientX - r.left) / r.width);
      this.pointerTarget.y = clamp01((e.clientY - r.top) / r.height);
      this.pointerIdleFor = 0;
    };
    host.addEventListener('pointermove', onMove);
    this.cleanupFns.push(() => host.removeEventListener('pointermove', onMove));
  }

  private cleanupFns: Array<() => void> = [];

  private tick = (): void => {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.app.ticker.deltaMS / 1000);
    this.ctx.dt = dt;
    this.ctx.time += dt;
    this.pointerIdleFor += dt;

    // When the pointer goes idle the camera must not freeze — a still frame is
    // exactly the failure we are designing against. ParallaxCamera picks up its
    // own drift, so here we simply ease the pointer influence back to centre.
    if (this.pointerIdleFor > 2.5 && !this.ctx.reducedMotion) {
      this.pointerTarget.x = lerp(this.pointerTarget.x, 0.5, 0.02);
      this.pointerTarget.y = lerp(this.pointerTarget.y, 0.5, 0.02);
    }
    const ease = 1 - Math.pow(0.001, dt);
    this.ctx.pointer.x = lerp(this.ctx.pointer.x, this.pointerTarget.x, ease);
    this.ctx.pointer.y = lerp(this.ctx.pointer.y, this.pointerTarget.y, ease);

    for (const sys of this.systems) sys.update(this.ctx);
  };

  /* ------------------------------------------------------ live scene edits */

  /**
   * Relight the scene along the day cycle. Instant, client-side, free — which
   * is why the product exposes this instead of asking a model to repaint.
   */
  setCycle(cycle: number): void {
    this.ctx.cycle = ((cycle % 1) + 1) % 1;
  }

  setWeather(kind: WeatherKind, intensity?: number): void {
    this.ctx.spec.weather.kind = kind;
    if (intensity !== undefined) this.ctx.spec.weather.intensity = clamp01(intensity);
    this.bus.emit({ kind: 'gust', strength: 0.4 });
  }

  setReducedMotion(on: boolean): void {
    this.ctx.reducedMotion = on;
  }

  get isRunning(): boolean {
    return this.started && !this.disposed;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Unblock anyone awaiting readiness on an engine that will never render.
    this.markReady();
    this.app.ticker?.remove(this.tick);
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    for (const sys of this.systems) sys.destroy();
    this.systems = [];
    this.bus.clear();
    if (this.started) this.app.destroy(true, { children: true });
  }
}

export function cycleForTimeOfDay(t: SceneSpec['timeOfDay']): number {
  const i = TIME_ORDER.indexOf(t);
  return (i < 0 ? 1 : i) / TIME_ORDER.length;
}

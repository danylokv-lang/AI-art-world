/**
 * LayerStack — the depth spine of the scene.
 *
 * Real parallax needs real layers, and layers only mean something if their
 * order and depth are decided once, centrally, rather than negotiated by
 * whichever system happens to add a sprite first. Every plane is declared here
 * with an explicit parallax factor, and ParallaxCamera is the only thing
 * allowed to move them.
 *
 * Parallax factor is how far a plane shifts relative to camera motion:
 * 0 = infinitely distant (locked to the sky), 1 = at the picture plane.
 */

import { Container } from 'pixi.js';

export const LAYER_ORDER = [
  'sky',
  'stars',
  'celestial',
  'cloudsFar',
  'terrainFar',
  'cloudsNear',
  'terrainMid',
  'entitiesFar',
  'water',
  'terrainNear',
  'foliage',
  'structures',
  'entitiesNear',
  'props',
  'weather',
  'lighting',
] as const;

export type LayerName = (typeof LAYER_ORDER)[number];

/**
 * Parallax factors.
 *
 * These numbers are the scene's sense of depth, so they are tuned rather than
 * evenly spaced: the gaps are wider up close, because near-field motion is what
 * the eye actually reads as depth. `weather` and `lighting` sit in screen space
 * (0) because they are atmosphere between the viewer and the world, not part of
 * it — parallaxing rain with the terrain is a classic tell of a fake scene.
 */
const PARALLAX: Record<LayerName, number> = {
  sky: 0,
  stars: 0.01,
  celestial: 0.02,
  cloudsFar: 0.05,
  terrainFar: 0.12,
  cloudsNear: 0.18,
  terrainMid: 0.38,
  entitiesFar: 0.45,
  water: 0.5,
  terrainNear: 0.78,
  foliage: 0.82,
  structures: 0.7,
  entitiesNear: 0.9,
  props: 0.95,
  weather: 0,
  lighting: 0,
};

export class LayerStack {
  readonly root = new Container();
  private layers = new Map<LayerName, Container>();

  constructor() {
    for (const name of LAYER_ORDER) {
      const c = new Container();
      c.label = name;
      this.layers.set(name, c);
      this.root.addChild(c);
    }
  }

  get(name: LayerName): Container {
    // Non-null: every LayerName is populated in the constructor.
    return this.layers.get(name)!;
  }

  parallax(name: LayerName): number {
    return PARALLAX[name];
  }

  /** Depth in 0..1 for a parallax factor — used for atmospheric perspective. */
  static depthFor(parallax: number): number {
    return Math.min(1, parallax);
  }

  /** Apply a camera offset to every plane by its own factor. */
  applyCamera(x: number, y: number): void {
    for (const name of LAYER_ORDER) {
      const p = PARALLAX[name];
      const layer = this.layers.get(name)!;
      // Round to whole virtual pixels. Sub-pixel layer offsets are what make
      // "pixel art" shimmer and look like a scaled bitmap instead of art.
      layer.x = Math.round(-x * p);
      layer.y = Math.round(-y * p);
    }
  }

  clearAll(): void {
    for (const name of LAYER_ORDER) {
      const layer = this.layers.get(name)!;
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    }
  }

  destroy(): void {
    this.clearAll();
    this.root.destroy({ children: true });
    this.layers.clear();
  }
}

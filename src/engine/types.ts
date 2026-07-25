/**
 * SceneSpec — the world, as data.
 *
 * This is the single source of truth for the whole product. Gemini authors it,
 * Zod validates it, Postgres stores it, and the renderer builds a living scene
 * from it. Nothing downstream may invent state that is not derivable from a
 * SceneSpec plus its `seed`, because that guarantee is what lets the gallery
 * replay a world byte-identically without ever calling a model again.
 *
 * Design note: the layer set is a FIXED, ordered vocabulary rather than a free
 * -form array. A generic `layers: []` reads well in a design doc but pushes the
 * "what is this layer, and how do I draw it?" question into the renderer at
 * runtime, where a hallucinated layer kind becomes a blank screen. Here every
 * field maps to a system that already knows how to draw it, so the worst a bad
 * generation can do is look boring.
 */

export const SPEC_VERSION = 1 as const;

/** Virtual render resolution. Everything is composed here, then upscaled with
 *  nearest-neighbour sampling. This is what makes it pixel art rather than a
 *  smooth illustration that happens to use few colours. */
export const VIRTUAL_W = 480;
export const VIRTUAL_H = 270;

export type Hex = string;

export type Biome =
  | 'coastal'
  | 'desert'
  | 'forest'
  | 'urban'
  | 'mountain'
  | 'plains'
  | 'arctic'
  | 'wetland'
  | 'volcanic'
  | 'alien';

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export type WeatherKind =
  | 'clear'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'fog'
  | 'ash'
  | 'petals'
  | 'fireflies'
  | 'sandstorm';

export type FoliageKind =
  | 'none'
  | 'pine'
  | 'broadleaf'
  | 'palm'
  | 'cactus'
  | 'dead'
  | 'reeds'
  | 'alien';

export type StructureKind =
  | 'none'
  | 'huts'
  | 'towers'
  | 'city'
  | 'ruins'
  | 'lighthouse'
  | 'windmills'
  | 'shrine';

export type EntityKind =
  | 'bird'
  | 'flock'
  | 'boat'
  | 'walker'
  | 'vehicle'
  | 'fish'
  | 'lantern'
  | 'balloon'
  | 'critter';

export type AmbientEventKind =
  | 'lightning'
  | 'shooting_star'
  | 'gust'
  | 'wave_crash'
  | 'flock_takeoff'
  | 'window_flicker'
  | 'cloud_shadow';

/**
 * Named colour roles rather than a flat swatch array.
 *
 * A bare `string[]` forces every system to guess which index is "the sky", and
 * a model that returns them in a different order silently produces a scene with
 * a brown sky. Roles make the contract explicit and let each ramp be validated
 * independently. Ramps run dark → light.
 */
export interface Palette {
  skyTop: Hex;
  skyMid: Hex;
  skyHorizon: Hex;
  /** Sun/moon disc and the warm bloom around it. */
  light: Hex;
  /** 3-step ramps, back-to-front depth planes. */
  far: [Hex, Hex, Hex];
  mid: [Hex, Hex, Hex];
  near: [Hex, Hex, Hex];
  water: [Hex, Hex, Hex];
  foliage: [Hex, Hex, Hex];
  /** Emissive accents: lit windows, lanterns, fireflies, magma. */
  accent: Hex;
}

export interface SkySpec {
  /** 0..1 — how many stars at night. Ignored during day. */
  stars: number;
  celestial: 'sun' | 'moon' | 'none';
  /** 0..1 along the horizon; 0 = left, 1 = right. */
  celestialX: number;
  /** 0..1 — 0 sits on the horizon, 1 is zenith. */
  celestialY: number;
  cloudDensity: number;
  cloudSpeed: number;
}

export interface TerrainLayerSpec {
  /** 0 = furthest, 1 = closest. Drives parallax factor and palette ramp. */
  depth: number;
  /** Fraction of screen height the silhouette's baseline sits at. */
  baseline: number;
  /** Peak height as a fraction of screen height. */
  amplitude: number;
  /** Noise frequency — low is rolling hills, high is jagged peaks. */
  roughness: number;
  /** Sharp ridged peaks vs soft dunes. */
  profile: 'ridge' | 'dune' | 'plateau' | 'cliff' | 'skyline';
  ramp: 'far' | 'mid' | 'near';
}

export interface WaterSpec {
  enabled: boolean;
  /** Fraction of screen height where the waterline sits. */
  level: number;
  /** 0..1 — wave amplitude and scanline displacement strength. */
  choppiness: number;
  /** 0..1 — how strongly the sky and terrain reflect. */
  reflect: number;
}

export interface FoliageSpec {
  kind: FoliageKind;
  /** 0..1 — how densely populated the mid/near planes are. */
  density: number;
  /** 0..1 — sway amplitude. Wind from WeatherSpec modulates this. */
  sway: number;
}

export interface StructureSpec {
  kind: StructureKind;
  density: number;
  /** 0..1 — how many windows are lit. Night scenes want this high. */
  litWindows: number;
}

export interface PropsSpec {
  grass: number;
  rocks: number;
  lanterns: number;
}

export interface WeatherSpec {
  kind: WeatherKind;
  intensity: number;
  /** -1 = hard left, 1 = hard right. */
  wind: number;
}

export interface EntitySpec {
  kind: EntityKind;
  count: number;
  depth: number;
  /** Virtual pixels per second. */
  speed: number;
  path: 'linear' | 'arc' | 'wander' | 'bob';
}

export interface LightingSpec {
  /** -1 cold/blue .. 1 warm/amber. */
  warmth: number;
  contrast: number;
  vignette: number;
  godRays: boolean;
  /** 0..1 — glow strength on accent-coloured pixels. */
  bloom: number;
}

export interface CameraSpec {
  drift: 'still' | 'slow_pan' | 'breathe';
  /** 0..1 — how far the camera wanders, in virtual pixels * 16. */
  amplitude: number;
  /** How strongly the pointer nudges the camera. 0 disables pointer follow. */
  pointerInfluence: number;
}

export interface AmbientEventSpec {
  kind: AmbientEventKind;
  /** Inclusive ms range between firings; the director picks uniformly. */
  everyMs: [number, number];
}

export interface SceneSpec {
  version: typeof SPEC_VERSION;
  seed: number;
  name: string;
  tagline: string;
  biome: Biome;
  timeOfDay: TimeOfDay;
  palette: Palette;
  sky: SkySpec;
  terrain: TerrainLayerSpec[];
  water: WaterSpec;
  foliage: FoliageSpec;
  structures: StructureSpec;
  props: PropsSpec;
  weather: WeatherSpec;
  entities: EntitySpec[];
  lighting: LightingSpec;
  camera: CameraSpec;
  ambientEvents: AmbientEventSpec[];
}

/** A stored world: the spec plus its provenance. */
export interface WorldRecord {
  id: string;
  userId: string | null;
  prompt: string;
  spec: SceneSpec;
  isPublic: boolean;
  createdAt: string;
}

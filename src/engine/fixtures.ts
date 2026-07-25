/**
 * Hand-authored SceneSpecs.
 *
 * These exist so the renderer can be built and judged with zero AI in the loop.
 * If a scene is not beautiful from a fixture, no amount of prompt engineering
 * will rescue it — the model only ever picks numbers, and these are the numbers
 * a careful human picked. They double as the landing-page hero, the offline
 * fallback targets, and the pre-seeded gallery so the demo can never hard-fail.
 */

import type { SceneSpec } from './types';
import { SPEC_VERSION } from './types';

export const FIXTURES: Record<string, SceneSpec> = {
  lighthouse: {
    version: SPEC_VERSION,
    seed: 20260725,
    name: 'the last watch',
    tagline: 'a lamp keeps turning for no one',
    biome: 'coastal',
    timeOfDay: 'dusk',
    palette: {
      skyTop: '#1b2a4a',
      skyMid: '#4a4270',
      skyHorizon: '#e0765a',
      light: '#ffd9a0',
      far: ['#3d3a5c', '#55506f', '#6e6788'],
      mid: ['#2c2b45', '#3e3b57', '#524d6b'],
      near: ['#14131f', '#22202f', '#322f42'],
      water: ['#1d2a44', '#2f4468', '#5b7ba6'],
      foliage: ['#1e3326', '#2f4a35', '#46644a'],
      accent: '#ffc36b',
    },
    sky: { stars: 0.25, celestial: 'sun', celestialX: 0.78, celestialY: 0.1, cloudDensity: 0.65, cloudSpeed: 0.5 },
    terrain: [
      { depth: 0.1, baseline: 0.56, amplitude: 0.1, roughness: 0.7, profile: 'ridge', ramp: 'far' },
      { depth: 0.35, baseline: 0.62, amplitude: 0.07, roughness: 1.1, profile: 'cliff', ramp: 'mid' },
      { depth: 0.8, baseline: 0.9, amplitude: 0.16, roughness: 1.6, profile: 'cliff', ramp: 'near' },
    ],
    water: { enabled: true, level: 0.66, choppiness: 0.7, reflect: 0.55 },
    foliage: { kind: 'pine', density: 0.25, sway: 0.7 },
    structures: { kind: 'lighthouse', density: 0.2, litWindows: 0.8 },
    props: { grass: 0.5, rocks: 0.6, lanterns: 0.1 },
    weather: { kind: 'rain', intensity: 0.35, wind: -0.5 },
    entities: [
      { kind: 'bird', count: 5, depth: 0.4, speed: 14, path: 'arc' },
      { kind: 'boat', count: 1, depth: 0.5, speed: 5, path: 'bob' },
    ],
    lighting: { warmth: 0.5, contrast: 0.55, vignette: 0.5, godRays: true, bloom: 0.6 },
    camera: { drift: 'breathe', amplitude: 0.35, pointerInfluence: 0.4 },
    ambientEvents: [
      { kind: 'wave_crash', everyMs: [2600, 5200] },
      { kind: 'gust', everyMs: [7000, 14000] },
      { kind: 'flock_takeoff', everyMs: [18000, 34000] },
    ],
  },

  neon: {
    version: SPEC_VERSION,
    seed: 771402,
    name: 'kowloon rain',
    tagline: 'every window is someone else awake',
    biome: 'urban',
    timeOfDay: 'night',
    palette: {
      skyTop: '#0a0a18',
      skyMid: '#161428',
      skyHorizon: '#2e2140',
      light: '#c8b8ff',
      far: ['#1c1a30', '#282540', '#363150'],
      mid: ['#121022', '#1c1832', '#282242'],
      near: ['#08070f', '#100e1a', '#1a1726'],
      water: ['#12122a', '#1e2044', '#33396b'],
      foliage: ['#182a20', '#213a2a', '#2d4d36'],
      accent: '#ff5f9e',
    },
    sky: { stars: 0.1, celestial: 'moon', celestialX: 0.22, celestialY: 0.62, cloudDensity: 0.8, cloudSpeed: 0.35 },
    terrain: [
      { depth: 0.12, baseline: 0.7, amplitude: 0.22, roughness: 2.4, profile: 'skyline', ramp: 'far' },
      { depth: 0.42, baseline: 0.82, amplitude: 0.3, roughness: 3.1, profile: 'skyline', ramp: 'mid' },
      { depth: 0.85, baseline: 1.02, amplitude: 0.26, roughness: 3.6, profile: 'skyline', ramp: 'near' },
    ],
    water: { enabled: true, level: 0.88, choppiness: 0.22, reflect: 0.85 },
    foliage: { kind: 'none', density: 0, sway: 0 },
    structures: { kind: 'city', density: 0.85, litWindows: 0.55 },
    props: { grass: 0, rocks: 0.1, lanterns: 0.8 },
    weather: { kind: 'rain', intensity: 0.7, wind: 0.25 },
    entities: [
      { kind: 'lantern', count: 7, depth: 0.7, speed: 3, path: 'bob' },
      { kind: 'walker', count: 4, depth: 0.9, speed: 11, path: 'linear' },
      { kind: 'balloon', count: 1, depth: 0.3, speed: 4, path: 'wander' },
    ],
    lighting: { warmth: -0.2, contrast: 0.7, vignette: 0.65, godRays: false, bloom: 0.85 },
    camera: { drift: 'slow_pan', amplitude: 0.28, pointerInfluence: 0.5 },
    ambientEvents: [
      { kind: 'window_flicker', everyMs: [1200, 3400] },
      { kind: 'lightning', everyMs: [14000, 30000] },
    ],
  },

  dunes: {
    version: SPEC_VERSION,
    seed: 30918,
    name: 'the sunken kings',
    tagline: 'the sand keeps what the maps forgot',
    biome: 'desert',
    timeOfDay: 'day',
    palette: {
      skyTop: '#4a9fd4',
      skyMid: '#8fc9e8',
      skyHorizon: '#f0dcae',
      light: '#fff4d0',
      far: ['#a2907a', '#bdaa90', '#d6c4a8'],
      mid: ['#b4894f', '#cba066', '#e0b87f'],
      near: ['#7d5530', '#9c7043', '#bb8c5a'],
      water: ['#3a6b7a', '#529099', '#7bb5b5'],
      foliage: ['#5c6b3a', '#77894c', '#96a865'],
      accent: '#ffdc7a',
    },
    sky: { stars: 0, celestial: 'sun', celestialX: 0.35, celestialY: 0.74, cloudDensity: 0.18, cloudSpeed: 0.25 },
    terrain: [
      { depth: 0.08, baseline: 0.58, amplitude: 0.09, roughness: 0.5, profile: 'plateau', ramp: 'far' },
      { depth: 0.38, baseline: 0.72, amplitude: 0.11, roughness: 0.8, profile: 'dune', ramp: 'mid' },
      { depth: 0.75, baseline: 0.92, amplitude: 0.14, roughness: 1.0, profile: 'dune', ramp: 'near' },
    ],
    water: { enabled: false, level: 0.9, choppiness: 0, reflect: 0 },
    foliage: { kind: 'cactus', density: 0.18, sway: 0.15 },
    structures: { kind: 'ruins', density: 0.4, litWindows: 0 },
    props: { grass: 0.15, rocks: 0.7, lanterns: 0 },
    weather: { kind: 'sandstorm', intensity: 0.3, wind: 0.65 },
    entities: [
      { kind: 'bird', count: 3, depth: 0.35, speed: 10, path: 'arc' },
      { kind: 'critter', count: 4, depth: 0.92, speed: 16, path: 'wander' },
    ],
    lighting: { warmth: 0.7, contrast: 0.45, vignette: 0.35, godRays: true, bloom: 0.3 },
    camera: { drift: 'slow_pan', amplitude: 0.45, pointerInfluence: 0.35 },
    ambientEvents: [
      { kind: 'gust', everyMs: [3500, 8000] },
      { kind: 'cloud_shadow', everyMs: [11000, 22000] },
    ],
  },

  glowforest: {
    version: SPEC_VERSION,
    seed: 5512077,
    name: 'the breathing understory',
    tagline: 'the dark is only pretending to be empty',
    biome: 'forest',
    timeOfDay: 'night',
    palette: {
      skyTop: '#050a14',
      skyMid: '#0d1a2b',
      skyHorizon: '#1c3040',
      light: '#cfe4ff',
      far: ['#12202b', '#1b2f3d', '#264150'],
      mid: ['#0d1a1f', '#152a2e', '#20403f'],
      near: ['#060d10', '#0c171a', '#142529'],
      water: ['#0a1c22', '#123037', '#1f5257'],
      foliage: ['#12331f', '#1c4d2c', '#2a6b3c'],
      accent: '#7dffb0',
    },
    sky: { stars: 0.85, celestial: 'moon', celestialX: 0.6, celestialY: 0.78, cloudDensity: 0.3, cloudSpeed: 0.2 },
    terrain: [
      { depth: 0.1, baseline: 0.6, amplitude: 0.14, roughness: 0.9, profile: 'ridge', ramp: 'far' },
      { depth: 0.45, baseline: 0.78, amplitude: 0.08, roughness: 1.3, profile: 'ridge', ramp: 'mid' },
      { depth: 0.88, baseline: 1.0, amplitude: 0.1, roughness: 1.8, profile: 'ridge', ramp: 'near' },
    ],
    water: { enabled: true, level: 0.84, choppiness: 0.12, reflect: 0.7 },
    foliage: { kind: 'broadleaf', density: 0.9, sway: 0.5 },
    structures: { kind: 'shrine', density: 0.15, litWindows: 0.9 },
    props: { grass: 0.8, rocks: 0.4, lanterns: 0.5 },
    weather: { kind: 'fireflies', intensity: 0.75, wind: 0.15 },
    entities: [
      { kind: 'critter', count: 3, depth: 0.85, speed: 9, path: 'wander' },
      { kind: 'fish', count: 4, depth: 0.9, speed: 7, path: 'wander' },
      { kind: 'lantern', count: 4, depth: 0.6, speed: 2, path: 'bob' },
    ],
    lighting: { warmth: -0.3, contrast: 0.75, vignette: 0.7, godRays: true, bloom: 0.9 },
    camera: { drift: 'breathe', amplitude: 0.3, pointerInfluence: 0.45 },
    ambientEvents: [
      { kind: 'shooting_star', everyMs: [9000, 20000] },
      { kind: 'gust', everyMs: [6000, 13000] },
    ],
  },

  icebay: {
    version: SPEC_VERSION,
    seed: 990211,
    name: 'the quiet shelf',
    tagline: 'nothing here has hurried in a thousand years',
    biome: 'arctic',
    timeOfDay: 'dawn',
    palette: {
      skyTop: '#6a9fc4',
      skyMid: '#a3c8dd',
      skyHorizon: '#e2eef2',
      light: '#fff8f0',
      far: ['#b9cdd8', '#cfdee6', '#e6eef2'],
      mid: ['#8fadbd', '#a9c3cf', '#c4d7df'],
      near: ['#5f7d8f', '#7897a8', '#96b2c0'],
      water: ['#2e5670', '#457a92', '#6ba3b5'],
      foliage: ['#2c4438', '#3d5c48', '#527659'],
      accent: '#a8e8ff',
    },
    sky: { stars: 0.05, celestial: 'sun', celestialX: 0.15, celestialY: 0.16, cloudDensity: 0.45, cloudSpeed: 0.3 },
    terrain: [
      { depth: 0.09, baseline: 0.54, amplitude: 0.16, roughness: 1.2, profile: 'ridge', ramp: 'far' },
      { depth: 0.4, baseline: 0.66, amplitude: 0.09, roughness: 1.7, profile: 'cliff', ramp: 'mid' },
      { depth: 0.82, baseline: 0.95, amplitude: 0.11, roughness: 2.0, profile: 'cliff', ramp: 'near' },
    ],
    water: { enabled: true, level: 0.7, choppiness: 0.3, reflect: 0.6 },
    foliage: { kind: 'none', density: 0, sway: 0 },
    structures: { kind: 'none', density: 0, litWindows: 0 },
    props: { grass: 0, rocks: 0.5, lanterns: 0 },
    weather: { kind: 'snow', intensity: 0.5, wind: -0.3 },
    entities: [
      { kind: 'bird', count: 4, depth: 0.45, speed: 12, path: 'arc' },
      { kind: 'boat', count: 1, depth: 0.6, speed: 4, path: 'bob' },
    ],
    lighting: { warmth: 0.25, contrast: 0.4, vignette: 0.4, godRays: true, bloom: 0.45 },
    camera: { drift: 'breathe', amplitude: 0.25, pointerInfluence: 0.4 },
    ambientEvents: [
      { kind: 'wave_crash', everyMs: [4000, 9000] },
      { kind: 'cloud_shadow', everyMs: [13000, 26000] },
    ],
  },
};

export const FIXTURE_KEYS = Object.keys(FIXTURES);

export const DEFAULT_FIXTURE = FIXTURES.lighthouse;

/**
 * Scene assembly — the one place that decides which systems exist and in what
 * order they update.
 *
 * Order matters in exactly one way: ParallaxCamera runs last, after every
 * system has placed its objects for the frame, so the camera offset applies to
 * a settled scene rather than to a half-updated one.
 */

import type { System } from './System';
import { SkySystem } from './systems/SkySystem';
import { CloudSystem } from './systems/CloudSystem';
import { TerrainSystem } from './systems/TerrainSystem';
import { StructureSystem } from './systems/StructureSystem';
import { WaterSystem } from './systems/WaterSystem';
import { WeatherSystem } from './systems/WeatherSystem';
import { FoliageSystem } from './systems/FoliageSystem';
import { EntitySystem } from './systems/EntitySystem';
import { LightingSystem } from './systems/LightingSystem';
import { AmbientDirector } from './systems/AmbientDirector';
import { ParallaxCamera } from './systems/ParallaxCamera';

/**
 * One array drives both build order and update order, and each imposes a
 * constraint:
 *
 *  - BUILD: Terrain and Structure register their light sources, so Water must
 *    be built after them or the reflections list is empty.
 *  - UPDATE: Weather owns `ctx.wind` for the frame, so Foliage must update
 *    after it or foliage leans by one frame's stale wind.
 *
 * The order below is the one that satisfies both. Clouds read wind a frame late
 * as a result, which at cloud speeds is invisible.
 */
export function createSystems(): System[] {
  return [
    // First, so events it fires are handled the same frame, not the next one.
    new AmbientDirector(),
    new SkySystem(),
    new CloudSystem(),
    new TerrainSystem(),
    new StructureSystem(),
    new WaterSystem(),
    new WeatherSystem(),
    new FoliageSystem(),
    new EntitySystem(),
    new LightingSystem(),
    // Last: applies the camera offset to a fully settled scene.
    new ParallaxCamera(),
  ];
}

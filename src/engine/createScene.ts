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
import { ParallaxCamera } from './systems/ParallaxCamera';

export function createSystems(): System[] {
  return [
    new SkySystem(),
    new CloudSystem(),
    new TerrainSystem(),
    new ParallaxCamera(),
  ];
}

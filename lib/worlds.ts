/**
 * World resolution — the seam between "where a world comes from" and the UI.
 *
 * Today every world is a hand-authored fixture. Once Supabase lands, only this
 * module changes: `getWorld` starts hitting Postgres, and every page that
 * renders a world keeps working untouched. Building this seam now is what makes
 * the gallery and permalink routes real rather than throwaway.
 */

import { FIXTURES, FIXTURE_KEYS } from '@/src/engine/fixtures';
import type { SceneSpec } from '@/src/engine/types';

export interface WorldSummary {
  id: string;
  name: string;
  tagline: string;
  prompt: string;
  biome: string;
  timeOfDay: string;
  /** Palette colours used for the gallery card, cheapest possible preview. */
  swatch: string[];
  createdAt: string;
}

/** The prompts these fixtures stand in for — shown as the world's origin. */
const FIXTURE_PROMPTS: Record<string, string> = {
  lighthouse: 'a lonely lighthouse on a storm-battered cliff',
  neon: 'a neon city street glistening in the rain',
  dunes: 'a vast desert with ancient ruins at dusk',
  glowforest: 'a bioluminescent forest at night',
  icebay: 'a frozen bay under a pale winter sun',
};

export function getWorld(id: string): SceneSpec | null {
  return FIXTURES[id] ?? null;
}

export function getPrompt(id: string): string {
  return FIXTURE_PROMPTS[id] ?? '';
}

function summarise(id: string, spec: SceneSpec): WorldSummary {
  const p = spec.palette;
  return {
    id,
    name: spec.name,
    tagline: spec.tagline,
    prompt: FIXTURE_PROMPTS[id] ?? '',
    biome: spec.biome,
    timeOfDay: spec.timeOfDay,
    // Sky → horizon → terrain → accent reads as a legible "mood strip" of the
    // world without rendering anything.
    swatch: [p.skyTop, p.skyMid, p.skyHorizon, p.mid[1], p.near[0], p.accent],
    createdAt: new Date().toISOString(),
  };
}

export function listWorlds(): WorldSummary[] {
  return FIXTURE_KEYS.map((k) => summarise(k, FIXTURES[k]));
}

export const PRESETS: Array<{ id: string; label: string }> = FIXTURE_KEYS.map(
  (k) => ({ id: k, label: FIXTURE_PROMPTS[k] ?? FIXTURES[k].name }),
);

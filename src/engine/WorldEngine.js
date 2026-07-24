// WorldEngine — the "living" layer. Runs continuously, independent of the
// Director. Time passes, weather breathes, mood/health drift, and the world
// ages even when the user is silent. The Director only sets *targets*; this
// engine eases the live values toward them so every change feels organic.

import { makeDefaultWorld, applyPatch, PHASES, SEASONS } from './WorldState.js';

const lerp = (a, b, t) => a + (b - a) * t;

export class WorldEngine {
  constructor() {
    this.world = makeDefaultWorld();
    this.target = makeDefaultWorld();
    this.live = {
      mood: 0.5,
      health: 0.5,
      fog: 0.045,
      wind: 0.2,
      intensity: 0.3,
      water: 0,
      relief: 0.4,
      dayT: 0.0, // continuous 0..1 clock (0=midnight)
    };
    this.age = 0; // seconds the world has existed
    this.lastInteraction = 0;
    this.listeners = [];
    this._born = false;
  }

  onEvent(fn) { this.listeners.push(fn); }
  emit(evts) { for (const e of evts) for (const fn of this.listeners) fn(e); }

  isBorn() { return this._born; }

  // The Director hands us a full or partial world; treat it as the new target.
  ingest(patch) {
    const events = applyPatch(this.target, patch);
    // First real utterance: snap identity + seed the day clock from the phase.
    if (!this._born) {
      this._born = true;
      this.world.name = this.target.name;
      this.live.dayT = phaseToClock(this.target.time.phase);
    } else if (patch.time && patch.time.phase) {
      // An EVOLVE command that names a phase must actually move the sky clock,
      // otherwise the auto-advancing day would immediately override it.
      this.live.dayT = phaseToClock(patch.time.phase);
    }
    // Attention nourishes the world.
    this.target.health = Math.min(1, this.target.health + 0.08);
    this.lastInteraction = this.age;
    this.emit(events.concat([{ type: 'pulse', label: patch.__label || this.target.name }]));
    return events;
  }

  update(dt) {
    this.age += dt;
    const w = this.world, t = this.target, L = this.live;

    // --- Time of day advances on its own ---
    const daySpeed = 0.008 * (t.time.speed || 1); // full day ~= 125s at speed 1
    L.dayT = (L.dayT + daySpeed * dt) % 1;
    w.time.phase = clockToPhase(L.dayT);

    // Seasons turn slowly; one season ~= 4 day-cycles.
    if (this._born) {
      const seasonProg = (this.age * daySpeed) / 4;
      // only auto-advance if the Director hasn't pinned a different season recently
      if (this.age - this.lastInteraction > 6) {
        const idx = Math.floor(seasonProg) % SEASONS.length;
        t.time.season = SEASONS[(SEASONS.indexOf(baseSeason(this)) + idx) % SEASONS.length];
      }
      w.time.season = t.time.season;
    }

    // --- Mood drifts toward target, with a gentle circadian sway ---
    const circadian = 0.06 * Math.sin(L.dayT * Math.PI * 2 - Math.PI / 2);
    L.mood = lerp(L.mood, t.mood + circadian, 1 - Math.pow(0.2, dt));

    // --- Neglect causes decay; the world literally fades if ignored ---
    const idle = this.age - this.lastInteraction;
    if (this._born && idle > 12) t.health = Math.max(0.12, t.health - 0.01 * dt);
    L.health = lerp(L.health, t.health, 1 - Math.pow(0.4, dt));

    // --- Atmosphere eases toward the Director's target ---
    const k = 1 - Math.pow(0.15, dt);
    L.fog = lerp(L.fog, t.fog, k);
    L.wind = lerp(L.wind, t.weather.wind, k);
    L.intensity = lerp(L.intensity, t.weather.intensity, k);
    L.water = lerp(L.water, t.terrain.water, k * 0.6);
    L.relief = lerp(L.relief, t.terrain.relief, k * 0.6);

    // Mirror the live scalars back onto the readable world object.
    w.name = t.name; w.tagline = t.tagline; w.biome = t.biome;
    w.palette = t.palette; w.weather.type = t.weather.type; w.entities = t.entities;
    w.mood = L.mood; w.health = L.health; w.fog = L.fog;
    w.weather.wind = L.wind; w.weather.intensity = L.intensity;
    w.terrain.water = L.water; w.terrain.relief = L.relief;
    w.time.t = L.dayT;

    return w;
  }
}

function phaseToClock(phase) {
  return { dawn: 0.24, day: 0.5, dusk: 0.78, night: 0.0 }[phase] ?? 0.5;
}
function clockToPhase(t) {
  if (t < 0.18 || t >= 0.86) return 'night';
  if (t < 0.32) return 'dawn';
  if (t < 0.72) return 'day';
  return 'dusk';
}
function baseSeason(engine) {
  return engine.target.time.season || 'spring';
}

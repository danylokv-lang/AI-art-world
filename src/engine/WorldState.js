// WorldState — the single source of truth the Director writes and the
// simulation + renderer read. Kept deliberately small and declarative so an
// LLM can produce/patch it reliably, and so the real-time layer can interpolate
// smoothly toward any target the Director sets.

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const PHASES = ['dawn', 'day', 'dusk', 'night'];
export const WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'aurora'];
export const ENTITY_KINDS = ['firefly', 'bird', 'spore', 'leaf', 'ember', 'fish', 'star', 'petal'];

export function makeDefaultWorld() {
  return {
    name: 'the void',
    tagline: 'nothing has been spoken yet',
    biome: 'void',
    palette: ['#0a0c12', '#141824', '#2a3350'], // [deep, mid, light]
    fog: 0.045,
    mood: 0.5, // 0 = melancholic, 1 = radiant  (drifts over time)
    health: 0.5, // 0 = decaying, 1 = flourishing (attention raises it)
    time: { season: 'spring', phase: 'night', speed: 1.0, t: 0 },
    weather: { type: 'clear', wind: 0.2, intensity: 0.3 },
    terrain: { relief: 0.4, water: 0.0 }, // relief = hilliness, water = sea level
    entities: [], // { kind, count, behavior, hue }
  };
}

// Suggestion seeds for the empty state.
export const SEED_PHRASES = [
  'a misty forest at dawn',
  'bioluminescent ocean under a storm',
  'golden autumn meadow with fireflies',
  'a frozen tundra beneath the aurora',
  'cherry blossoms drifting at dusk',
  'a volcanic wasteland glowing with embers',
];

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Apply a Director patch (partial world) onto the live state. We deep-merge the
// known sections and validate enums so a hallucinated value can never crash the
// simulation. Returns a flat list of "events" the renderer can react to (bursts,
// flashes, etc).
export function applyPatch(world, patch = {}) {
  const events = Array.isArray(patch.events) ? patch.events : [];

  if (typeof patch.name === 'string') world.name = patch.name.slice(0, 42);
  if (typeof patch.tagline === 'string') world.tagline = patch.tagline.slice(0, 90);
  if (typeof patch.biome === 'string') world.biome = patch.biome;

  if (Array.isArray(patch.palette) && patch.palette.length) {
    // LLMs sometimes emit stray text inside hex strings ("#0b04 blue #4a196b")
    // or drop the '#'. Extract the first valid 6-hex run per entry.
    const clean = (c) => { const m = String(c).match(/([0-9a-fA-F]{6})/); return m ? '#' + m[1] : '#5566aa'; };
    world.palette = patch.palette.slice(0, 3).map(clean);
    while (world.palette.length < 3) world.palette.push(world.palette[world.palette.length - 1]);
  }

  if (Number.isFinite(patch.fog)) world.fog = clamp01(patch.fog);
  if (Number.isFinite(patch.mood)) world.mood = clamp01(patch.mood);
  if (Number.isFinite(patch.health)) world.health = clamp01(patch.health);

  if (patch.time) {
    const T = patch.time;
    if (SEASONS.includes(T.season)) world.time.season = T.season;
    if (PHASES.includes(T.phase)) world.time.phase = T.phase;
    if (Number.isFinite(T.speed)) world.time.speed = Math.max(0, Math.min(6, T.speed));
  }

  if (patch.weather) {
    const W = patch.weather;
    if (WEATHERS.includes(W.type)) world.weather.type = W.type;
    if (Number.isFinite(W.wind)) world.weather.wind = clamp01(W.wind);
    if (Number.isFinite(W.intensity)) world.weather.intensity = clamp01(W.intensity);
  }

  if (patch.terrain) {
    const R = patch.terrain;
    if (Number.isFinite(R.relief)) world.terrain.relief = clamp01(R.relief);
    if (Number.isFinite(R.water)) world.terrain.water = clamp01(R.water);
  }

  if (Array.isArray(patch.entities)) {
    world.entities = patch.entities
      .filter((e) => e && ENTITY_KINDS.includes(e.kind))
      .slice(0, 6)
      .map((e) => ({
        kind: e.kind,
        count: Math.max(0, Math.min(600, Math.round(e.count ?? 60))),
        behavior: e.behavior || 'drift',
        hue: typeof e.hue === 'string' ? e.hue : world.palette[2],
      }));
  }

  return events;
}

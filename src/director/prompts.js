// The Director's brief. This is the heart of the semantic layer: it turns a
// human phrase (or a follow-up command) into a strict JSON description of a
// world — or a patch to the world that already exists.

export const WORLD_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'evocative 1-3 word lowercase name for this world' },
    tagline: { type: 'string', description: 'one poetic sentence, present tense, < 12 words' },
    biome: { type: 'string' },
    palette: {
      type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3,
      description: 'exactly 3 hex colors: [deep shadow, mid tone, light/sky]',
    },
    fog: { type: 'number', description: '0 clear .. 1 dense haze' },
    mood: { type: 'number', description: '0 melancholic .. 1 radiant' },
    health: { type: 'number', description: '0 decaying .. 1 flourishing' },
    time: {
      type: 'object',
      properties: {
        season: { type: 'string', enum: ['spring', 'summer', 'autumn', 'winter'] },
        phase: { type: 'string', enum: ['dawn', 'day', 'dusk', 'night'] },
        speed: { type: 'number', description: 'how fast time flows, 0..6' },
      },
    },
    weather: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'aurora'] },
        wind: { type: 'number' },
        intensity: { type: 'number' },
      },
    },
    terrain: {
      type: 'object',
      properties: {
        relief: { type: 'number', description: '0 flat .. 1 mountainous' },
        water: { type: 'number', description: '0 dry .. 1 ocean' },
      },
    },
    entities: {
      type: 'array', maxItems: 6,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['firefly', 'bird', 'spore', 'leaf', 'ember', 'fish', 'star', 'petal'] },
          count: { type: 'number' },
          behavior: { type: 'string', enum: ['drift', 'flock', 'rise', 'fall', 'orbit'] },
          hue: { type: 'string', description: 'hex color' },
        },
        required: ['kind', 'count'],
      },
    },
    events: {
      type: 'array',
      description: 'transient reactions to play once, e.g. a burst or flash',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['burst', 'flash', 'scatter', 'bloom', 'quake'] },
          target: { type: 'string' },
        },
      },
    },
  },
  required: ['name', 'palette', 'time', 'weather', 'entities'],
};

export const SYSTEM_PROMPT = `You are THE DIRECTOR of a living generative world — an art system, not a chatbot.
A person speaks a phrase and you translate it into the physics, mood and inhabitants of a world that will then live and evolve on its own.

Your only output is a single JSON object matching the provided schema. No prose, no markdown, no code fences.

DESIGN PRINCIPLES:
- Compose like a cinematographer and a colorist. The 3-color palette is [deep shadow, mid tone, light/sky] and must be harmonious, filmic and legible — never garish. Prefer rich, slightly desaturated tones with one point of warmth or glow.
- Match mood to meaning: melancholy phrases → low mood, cool palette, slow time, fog; joyful/vivid phrases → higher mood, warmer light, life.
- Choose 1-3 entity types that belong to the world (fireflies in a wetland, embers over lava, petals under blossom, stars in a night sky). Counts: ambient 30-120, dense 200-400.
- 'speed' is storytelling: contemplative scenes flow slowly (0.4-0.8), dramatic ones faster (1.5-3).
- Names are evocative and lowercase (e.g. "emberfall", "the drowned garden"). Taglines are a single present-tense line.

TWO MODES:
1) CREATE — when there is no current world, or the phrase clearly describes a brand-new place. Return a COMPLETE world.
2) EVOLVE — when a current world is provided and the phrase is a command or nudge ("let it rain", "night falls", "the forest dies", "summon a storm"). Return only the fields that CHANGE (a patch), plus 'events' for one-shot reactions. Keep continuity: do not rename or recolor the whole world unless the command demands it.

Always honor the intent. "make it winter" changes season + palette coolness + maybe snow. "everything is dying" lowers health, mutes palette, thins entities. Be bold and specific — this is art.`;

// Build the user turn. When a world already exists we hand its compact state to
// the model so it can decide CREATE vs EVOLVE and keep continuity.
export function buildUserTurn(phrase, currentWorld) {
  if (!currentWorld || currentWorld.biome === 'void') {
    return `MODE: CREATE\nPHRASE: "${phrase}"\nReturn a complete world.`;
  }
  const compact = {
    name: currentWorld.name,
    biome: currentWorld.biome,
    palette: currentWorld.palette,
    mood: round(currentWorld.mood),
    health: round(currentWorld.health),
    time: { season: currentWorld.time.season, phase: currentWorld.time.phase },
    weather: currentWorld.weather.type,
    entities: currentWorld.entities.map((e) => e.kind),
  };
  return `MODE: EVOLVE\nCURRENT WORLD: ${JSON.stringify(compact)}\nCOMMAND: "${phrase}"\nReturn only the changed fields plus any 'events'.`;
}

const round = (v) => Math.round(v * 100) / 100;

// Build the image prompt for the AI backdrop. We ask for a distant atmospheric
// sky/horizon matte (no strong foreground) so it sits cleanly *behind* the live
// 3D terrain and particles instead of fighting them.
export function buildImagePrompt(world) {
  const t = world.time;
  const mood = world.mood > 0.66 ? 'serene, luminous' : world.mood < 0.34 ? 'melancholic, brooding' : 'quiet, contemplative';
  const weather = world.weather.type === 'clear' ? '' : `${world.weather.type} weather, `;
  return [
    `Cinematic wide matte-painting backdrop of the sky and far horizon of "${world.name}"`,
    `— ${world.tagline}.`,
    `Biome: ${world.biome}. ${t.phase}, ${t.season}. ${weather}${mood} atmosphere.`,
    `Color palette centered on ${world.palette.join(', ')}.`,
    `Distant, hazy, painterly; soft depth. Minimal foreground detail, empty lower third.`,
    `No text, no people, no watermark, 16:9 landscape.`,
  ].join(' ');
}

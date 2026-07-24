// The Director's briefs for the LIVING CANVAS: a world that is a real AI image,
// which then evolves over time and reacts to the viewer — always the SAME place.

export const PHASES = ['dawn', 'day', 'dusk', 'night'];
export const WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'aurora', 'ember', 'petals'];

export const SEED_PHRASES = [
  'a lonely lighthouse on a storm-battered cliff',
  'an overgrown temple swallowed by jungle',
  'a neon city street in the rain',
  'a vast desert with ancient ruins at dusk',
  'a quiet fishing village under snow',
  'a floating island above a sea of clouds',
];

const STYLE = 'cinematic wide establishing shot, dramatic natural lighting, deep atmospheric perspective, painterly concept-art, highly detailed, rich color, 16:9, no text, no watermark, no words, no letters';

// Prompt for the very first frame of a world.
export function createScenePrompt(phrase) {
  return `${phrase.trim()}. ${STYLE}.`;
}

// Wrap an evolution instruction with hard continuity guardrails so Nano Banana
// EDITS the current frame instead of inventing a new place.
export function evolveScenePrompt(instruction) {
  return `Take THIS EXACT image and evolve it: ${instruction}. ` +
    `Critically: keep the identical location, camera angle, composition, horizon line, ` +
    `major landforms and structures, and the same painterly art style. Only change what the ` +
    `evolution requires (light, weather, time of day, added or aged elements). ` +
    `Cinematic and cohesive. No text, no words, no watermark.`;
}

// --- Structured "opening" of a world (identity + starting conditions) ---
export const OPEN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'evocative 1-3 word lowercase name' },
    tagline: { type: 'string', description: 'one poetic present-tense line, < 12 words' },
    phase: { type: 'string', enum: PHASES },
    weather: { type: 'string', enum: WEATHERS },
    intensity: { type: 'number', description: 'weather/atmosphere strength 0..1' },
    mood: { type: 'number', description: '0 melancholic .. 1 radiant' },
  },
  required: ['name', 'tagline', 'phase', 'weather'],
};

export const OPEN_SYSTEM = `You name and read the atmosphere of a world a person just spoke into being.
Return only JSON. The name is evocative and lowercase (e.g. "the drowned garden", "emberfall").
The tagline is a single present-tense poetic line. Infer the starting phase, weather, intensity and mood from the phrase.`;

export function buildOpenTurn(phrase) {
  return `PHRASE: "${phrase}"\nReturn the world's identity and starting atmosphere.`;
}

// --- Beat generation: what should the world do next? ---
export const BEAT_SCHEMA = {
  type: 'object',
  properties: {
    instruction: { type: 'string', description: 'ONE concrete visual change to apply to the current frame' },
    caption: { type: 'string', description: 'short poetic label for this moment, < 6 words, lowercase' },
    phase: { type: 'string', enum: PHASES },
    weather: { type: 'string', enum: WEATHERS },
    intensity: { type: 'number' },
    mood: { type: 'number' },
  },
  required: ['instruction', 'caption', 'phase', 'weather'],
};

export const BEAT_SYSTEM = `You are the living pulse of an evolving world rendered as one continuous painting.
Each turn you decide the SINGLE next change to the current frame — like one shot in a slow film.
Return only JSON.

RULES:
- Continuity is sacred. It is always the SAME place. Never relocate, never restart, never change the art style.
- Autonomous beats advance time and atmosphere gently and cinematically: light shifts, the sun or moon moves,
  clouds gather or clear, seasons creep, tides rise, small life appears (birds, boats, lanterns lit, figures passing),
  things slowly grow, weather, or age. One change at a time. Make it feel alive, not random.
- Follow the natural day cycle (dawn->day->dusk->night->dawn) unless a command overrides it.
- If a USER COMMAND is given, honor it boldly and immediately as this beat's instruction, then set phase/weather/mood to match.
- 'instruction' is a vivid but concrete visual directive for an image editor. 'caption' is a short poetic label.
- Keep intensity/mood consistent with the scene; drift them, don't jump.`;

export function buildBeatTurn(state, userCommand) {
  const recent = (state.history || []).slice(-4).map((h) => h.caption).filter(Boolean);
  const ctx = {
    world: state.name,
    premise: state.premise,
    phase: state.phase,
    weather: state.weather,
    mood: round(state.mood),
    beatsElapsed: state.beat,
    recentMoments: recent,
  };
  const lead = userCommand
    ? `USER COMMAND (honor this now): "${userCommand}"`
    : `No command — choose the next natural, cinematic beat that keeps the world alive.`;
  return `CURRENT STATE: ${JSON.stringify(ctx)}\n${lead}\nReturn the next beat.`;
}

const round = (v) => Math.round((v ?? 0.5) * 100) / 100;

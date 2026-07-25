// Director briefs for the LIVING IMAGE: a high-quality AI picture of an imagined
// world, that the viewer can move (parallax) and that gently wiggles (warp), and
// which can be transformed on command (Nano Banana edits the same frame).

export const SEED_PHRASES = [
  'a lonely lighthouse on a storm-battered cliff',
  'an overgrown temple swallowed by jungle',
  'a neon city street glistening in the rain',
  'a vast desert with ancient ruins at dusk',
  'a floating island above a sea of clouds',
  'a bioluminescent forest at night',
];

const STYLE = 'cinematic wide establishing shot, dramatic lighting, deep atmospheric perspective, painterly concept-art, highly detailed, rich color, strong sense of depth with clear foreground midground and background, 16:9, no text, no watermark, no words';

export function createScenePrompt(phrase) {
  return `${phrase.trim()}. ${STYLE}.`;
}

export function evolveScenePrompt(instruction) {
  return `Take THIS EXACT image and evolve it: ${instruction}. ` +
    `Keep the identical location, camera angle, composition, horizon and major structures and the same painterly art style. ` +
    `Only change what the evolution requires. Cinematic and cohesive. No text, no words, no watermark.`;
}

// --- world identity (name/tagline/mood) via the text model ---
export const OPEN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'evocative 1-3 word lowercase name' },
    tagline: { type: 'string', description: 'one poetic present-tense line, < 12 words' },
    phase: { type: 'string', enum: ['dawn', 'day', 'dusk', 'night'] },
    mood: { type: 'number', description: '0 melancholic .. 1 radiant' },
  },
  required: ['name', 'tagline'],
};
export const OPEN_SYSTEM = `You name a world a person just imagined into being. Return only JSON. The name is evocative and lowercase (e.g. "the drowned garden"). The tagline is a single poetic present-tense line. Infer phase and mood from the phrase.`;
export function buildOpenTurn(phrase) { return `PHRASE: "${phrase}"\nReturn the world's identity.`; }

// --- evolution beats (autonomous + on command) ---
export const BEAT_SCHEMA = {
  type: 'object',
  properties: {
    instruction: { type: 'string', description: 'ONE concrete visual change to apply to the current frame' },
    caption: { type: 'string', description: 'short poetic label, < 6 words, lowercase' },
    phase: { type: 'string', enum: ['dawn', 'day', 'dusk', 'night'] },
    mood: { type: 'number' },
  },
  required: ['instruction', 'caption'],
};
export const BEAT_SYSTEM = `You are the living pulse of an evolving world rendered as one continuous painting. Each turn you decide the SINGLE next change to the current frame, like one slow shot in a film. Return only JSON.
- Continuity is sacred: always the SAME place, same style. Never relocate or restart.
- Autonomous beats advance time and atmosphere gently and cinematically (light shifts, clouds gather, small life appears, weather turns, seasons creep). One change at a time.
- If a USER COMMAND is given, honor it boldly and immediately as this beat's instruction, and set phase/mood to match.`;
export function buildBeatTurn(state, userCommand) {
  const recent = (state.recent || []).slice(-4);
  const ctx = { world: state.name, premise: state.premise, phase: state.phase, mood: round(state.mood), beat: state.beat, recent };
  const lead = userCommand ? `USER COMMAND (honor now): "${userCommand}"` : 'No command — choose the next natural, cinematic beat that keeps the world alive.';
  return `CURRENT: ${JSON.stringify(ctx)}\n${lead}\nReturn the next beat.`;
}

const round = (v) => Math.round((v ?? 0.5) * 100) / 100;

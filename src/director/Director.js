// Director — bridges natural language to a WorldState patch.
//
// If a Gemini API key is provided (VITE_GEMINI_API_KEY) it uses the real model
// with structured JSON output. Otherwise it falls back to a local heuristic
// "director" so the whole experience still runs offline for demos and dev.
//
// SECURITY NOTE: calling Gemini directly from the browser exposes the key. Fine
// for a hackathon demo; for production put a 20-line proxy in front (see README).

import { SYSTEM_PROMPT, WORLD_SCHEMA, buildUserTurn, buildImagePrompt } from './prompts.js';

const KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-flash-latest';
const IMAGE_MODEL = import.meta.env.VITE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

export class Director {
  get usingAI() { return Boolean(KEY); }
  get canPaint() { return Boolean(KEY); }

  // Generate an atmospheric backdrop for the world via Nano Banana (Gemini
  // Flash Image). Returns a data: URL, or null on failure (scene still runs on
  // its procedural shader sky). No-op without a key.
  async paintBackground(world) {
    if (!KEY) return null;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${KEY}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: buildImagePrompt(world) }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    };
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Image ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const img = parts.find((p) => p.inlineData?.data);
      if (!img) return null;
      return `data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}`;
    } catch (err) {
      console.warn('[Director] background paint failed:', err);
      return null;
    }
  }

  async direct(phrase, currentWorld) {
    if (KEY) {
      try {
        return await this._gemini(phrase, currentWorld);
      } catch (err) {
        console.warn('[Director] Gemini failed, using local fallback:', err);
        return mockDirector(phrase, currentWorld);
      }
    }
    // Small delay so the offline path still feels like "thinking".
    await new Promise((r) => setTimeout(r, 420));
    return mockDirector(phrase, currentWorld);
  }

  async _gemini(phrase, currentWorld) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserTurn(phrase, currentWorld) }] }],
      generationConfig: {
        temperature: 1.0,
        responseMimeType: 'application/json',
        responseSchema: WORLD_SCHEMA,
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    return JSON.parse(text);
  }
}

/* ------------------------------------------------------------------ */
/* Local heuristic Director — a tiny "poet" that keeps the demo alive. */
/* ------------------------------------------------------------------ */

const PALETTES = {
  forest: ['#0b160f', '#254032', '#8fb98a'],
  ocean: ['#03121f', '#0d3b52', '#4fd2c2'],
  desert: ['#1c130a', '#8a5a2b', '#f0c27b'],
  lava: ['#160604', '#7a1e0a', '#ff8a3d'],
  blossom: ['#180d14', '#5a2b46', '#f7c6d9'],
  tundra: ['#0a1018', '#31506b', '#dbeeff'],
  aurora: ['#040814', '#123a4a', '#5affc0'],
  meadow: ['#12180a', '#4a5f22', '#e8d987'],
  void: ['#0a0c12', '#141824', '#2a3350'],
};

function pick(phrase, map, fallback) {
  const p = phrase.toLowerCase();
  for (const [k, v] of Object.entries(map)) if (p.includes(k)) return v;
  return fallback;
}

function mockDirector(phrase, currentWorld) {
  const p = phrase.toLowerCase();
  const evolving = currentWorld && currentWorld.biome !== 'void';

  // ---------- EVOLVE: interpret commands as patches ----------
  if (evolving) {
    const patch = { events: [] };
    if (/(rain|drizzle|downpour)/.test(p)) { patch.weather = { type: 'rain', wind: 0.4, intensity: 0.6 }; patch.fog = 0.2; }
    if (/(storm|thunder|lightning)/.test(p)) { patch.weather = { type: 'storm', wind: 0.85, intensity: 0.9 }; patch.mood = 0.35; patch.events.push({ type: 'flash' }); patch.time = { speed: 2.2 }; }
    if (/(snow|freeze|frost|winter)/.test(p)) { patch.weather = { type: 'snow', wind: 0.3, intensity: 0.5 }; patch.time = { season: 'winter' }; patch.palette = PALETTES.tundra; }
    if (/(night|dark|midnight)/.test(p)) { patch.time = { phase: 'night' }; patch.mood = 0.4; }
    if (/(dawn|sunrise|morning)/.test(p)) { patch.time = { phase: 'dawn' }; patch.mood = 0.62; }
    if (/(dusk|sunset|evening)/.test(p)) { patch.time = { phase: 'dusk' }; patch.mood = 0.6; }
    if (/(die|dying|death|wither|decay|rot)/.test(p)) { patch.health = 0.15; patch.mood = 0.2; patch.fog = 0.35; patch.entities = (currentWorld.entities || []).map((e) => ({ ...e, count: Math.round(e.count * 0.35) })); patch.events.push({ type: 'scatter' }); }
    if (/(bloom|flourish|revive|grow|alive|spring)/.test(p)) { patch.health = 0.95; patch.mood = 0.8; patch.time = { season: 'spring' }; patch.events.push({ type: 'bloom' }); }
    if (/(fire|burn|ember|lava|volcano)/.test(p)) { patch.palette = PALETTES.lava; patch.entities = [{ kind: 'ember', count: 260, behavior: 'rise', hue: '#ff8a3d' }]; patch.events.push({ type: 'burst', target: 'ember' }); }
    if (/(aurora|northern lights)/.test(p)) { patch.weather = { type: 'aurora', wind: 0.15, intensity: 0.7 }; patch.time = { phase: 'night' }; patch.entities = [{ kind: 'star', count: 220, behavior: 'drift', hue: '#5affc0' }]; }
    if (/(calm|peace|still|quiet)/.test(p)) { patch.weather = { type: 'clear', wind: 0.12, intensity: 0.2 }; patch.time = { speed: 0.5 }; patch.mood = 0.7; }
    if (/(faster|hurry|speed)/.test(p)) patch.time = { ...(patch.time || {}), speed: 3 };
    if (/(slow|slower)/.test(p)) patch.time = { ...(patch.time || {}), speed: 0.4 };
    // Nothing matched → gentle mood lift so the world still acknowledges you.
    if (Object.keys(patch).length === 1) { patch.mood = Math.min(1, (currentWorld.mood || 0.5) + 0.12); patch.events.push({ type: 'bloom' }); }
    return patch;
  }

  // ---------- CREATE: build a whole world from the phrase ----------
  // NOTE: order matters — more specific keys first. "firefly"/"meadow" must win
  // before the generic "fire"/"lava" family (else "fireflies" → volcano).
  const biomeKey = pick(p, {
    firefly: 'meadow', meadow: 'meadow', field: 'meadow', grass: 'meadow', prairie: 'meadow',
    blossom: 'blossom', cherry: 'blossom', flower: 'blossom', petal: 'blossom',
    forest: 'forest', wood: 'forest', jungle: 'forest',
    ocean: 'ocean', sea: 'ocean', reef: 'ocean',
    desert: 'desert', dune: 'desert', sand: 'desert',
    volcano: 'lava', lava: 'lava', magma: 'lava', ember: 'lava',
    tundra: 'tundra', snow: 'tundra', ice: 'tundra', frozen: 'tundra', arctic: 'tundra',
    aurora: 'aurora', 'northern lights': 'aurora',
    water: 'ocean',
  }, 'forest');

  const palette = PALETTES[biomeKey] || PALETTES.forest;
  const phase = /(dawn|sunrise|morning)/.test(p) ? 'dawn'
    : /(dusk|sunset|evening)/.test(p) ? 'dusk'
    : /(night|dark|star|moon)/.test(p) ? 'night' : 'day';
  const season = /(winter|snow|frozen)/.test(p) ? 'winter'
    : /(autumn|fall|amber)/.test(p) ? 'autumn'
    : /(summer)/.test(p) ? 'summer' : 'spring';

  const entityByBiome = {
    forest: { kind: 'firefly', count: 90, behavior: 'drift', hue: '#c8ffcf' },
    ocean: { kind: 'fish', count: 120, behavior: 'flock', hue: '#4fd2c2' },
    desert: { kind: 'spore', count: 60, behavior: 'drift', hue: '#f0c27b' },
    lava: { kind: 'ember', count: 240, behavior: 'rise', hue: '#ff8a3d' },
    blossom: { kind: 'petal', count: 160, behavior: 'fall', hue: '#f7c6d9' },
    tundra: { kind: 'star', count: 200, behavior: 'drift', hue: '#dbeeff' },
    aurora: { kind: 'star', count: 220, behavior: 'drift', hue: '#5affc0' },
    meadow: { kind: 'firefly', count: 110, behavior: 'drift', hue: '#ffe9a8' },
  };

  const weather = /(storm)/.test(p) ? { type: 'storm', wind: 0.8, intensity: 0.9 }
    : /(rain)/.test(p) ? { type: 'rain', wind: 0.4, intensity: 0.6 }
    : /(fog|mist|misty)/.test(p) ? { type: 'fog', wind: 0.15, intensity: 0.5 }
    : /(snow)/.test(p) ? { type: 'snow', wind: 0.3, intensity: 0.5 }
    : biomeKey === 'aurora' ? { type: 'aurora', wind: 0.15, intensity: 0.7 }
    : { type: 'clear', wind: 0.25, intensity: 0.3 };

  const names = {
    forest: 'the hushwood', ocean: 'the deepsong', desert: 'sunmarch', lava: 'emberfall',
    blossom: 'the drifting garden', tundra: 'palewaste', aurora: 'the veil', meadow: 'goldenreach',
  };

  return {
    name: names[biomeKey] || 'a new world',
    tagline: phrase.length < 60 ? phrase : phrase.slice(0, 57) + '…',
    biome: biomeKey,
    palette,
    fog: weather.type === 'fog' ? 0.4 : /(misty|mist)/.test(p) ? 0.3 : 0.08,
    mood: phase === 'night' ? 0.45 : 0.66,
    health: 0.85,
    time: { season, phase, speed: 1.0 },
    weather,
    terrain: { relief: biomeKey === 'ocean' ? 0.1 : 0.5, water: biomeKey === 'ocean' ? 0.9 : 0.0 },
    entities: [entityByBiome[biomeKey] || entityByBiome.forest],
  };
}

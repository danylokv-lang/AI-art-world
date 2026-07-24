# AETHER — a living world from a phrase

**Speak a phrase and a world is born.** It doesn't just render an image — it becomes a
living system that keeps evolving on its own (day turns to night, seasons pass, the world
flourishes or decays) and **reacts to everything you say next** ("let it rain", "night falls",
"everything is dying"). Built for the *Hack The Arts* theme: **art that couldn't exist without technology.**

## Why it's more than image generation
The magic is a **two-layer architecture**:

1. **The Director (semantic layer)** — an LLM (Gemini) that turns a natural-language phrase into a
   strict JSON *world state*, and turns every follow-up into a *patch* to that state. Called rarely.
2. **The living world (real-time layer)** — a continuous simulation + WebGL renderer (three.js) that
   runs at 60fps, easing toward the Director's targets while time, weather and mood evolve on their own.

The LLM never draws pixels; the renderer never invents meaning. That split is what makes the world feel *alive*
instead of *generated*.

```
phrase / voice ─▶ Director (Gemini) ─▶ WorldState patch ─▶ WorldEngine (time, decay, weather)
                                                              │
                                        Renderer (sky, terrain, particles, light) ◀┘  ← 60fps
```

## Run
```bash
npm install
npm run dev      # http://localhost:5173
```
Runs **fully offline** out of the box (a local heuristic Director). For the real AI Director:
```bash
cp .env.example .env      # then paste your Gemini key
```
Get a free key at <https://aistudio.google.com/apikey>.

## Use
- Type or 🎙️ speak a phrase: *"a misty forest at dawn"*.
- Then keep talking to it: *"let it rain"*, *"night falls"*, *"everything is dying"*, *"bring it back to life"*.
- Walk away — the world ages, cycles day/night, and slowly decays if ignored.

## Cost (Gemini)
The Director uses **Gemini Flash** for text (fractions of a cent per phrase). Optional image
backgrounds via **Imagen 4 Fast (~$0.02)** or **Nano Banana (~$0.039)**. A full demo session
costs cents. See `src/director/prompts.js` for the Director brief.

## Tech
- [three.js](https://threejs.org) — WebGL rendering (custom sky shader, particle systems)
- [Vite](https://vitejs.dev) — dev/build
- [Gemini API](https://ai.google.dev) — the Director (structured JSON output)
- Web Speech API — voice input

## Project structure
```
src/
  director/   Director.js (Gemini + offline fallback), prompts.js (the brief + schema)
  engine/     WorldState.js (schema + patch validation), WorldEngine.js (the living loop)
  render/     Renderer.js (three.js scene)
  ui/         ui.js, styles.css (cinematic UI, voice, HUD, timeline)
  main.js     wires it all together
```

## Security note
The demo calls Gemini directly from the browser (key via Vite env). Fine for a hackathon; for
production, proxy the call through a tiny server so the key stays secret.

## Attribution
three.js (MIT), Vite (MIT), Google Gemini API, Google Fonts (Fraunces, Inter). All world logic,
shaders and the Director brief are original to this project.
# AI-art-world

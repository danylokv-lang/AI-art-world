# AETHER — a living world from a phrase

**Speak a place into being — then watch it live.**

AETHER paints your words as a real, cinematic world, and then that world *keeps living*:
time passes, weather turns, small events unfold — the painting **re-paints itself, frame by
frame, with continuity** — and it **reacts to whatever you say next**. Say *"a lonely lighthouse
on a stormy cliff"* and it appears; wait, and night falls, the beam sweeps the sea, stars emerge;
say *"a ship appears on the horizon"* and one does — in the same place, same style.

Built for **Hack The Arts** — *"art that couldn't exist without technology."* The medium here
*is* generative continuity: an AI image that authors its own evolution over time and in dialogue
with you. No pre-recorded frames, no fixed outcomes — every world is unrepeatable.

## Why it couldn't exist without technology
The heart is **iterative image editing with continuity**. Each new frame is produced by feeding
the *current frame* back to the image model with a single evolution instruction, so it's always
the **same location** changing — not a new random picture. A language model plays **director**,
choosing the next cinematic "beat" on its own (advance time, gather clouds, light the lanterns,
let ivy grow) or honoring your command. Between frames a real-time layer keeps the canvas
breathing (slow Ken Burns drift, weather particles, grain), so it feels continuous, not a slideshow.

```
phrase ─▶ Director (Gemini Flash) ─▶ beat: "night falls" ─┐
                                                          ▼
       current frame ─▶ Nano Banana (edit, keep continuity) ─▶ next frame
                                                          │
              LivingCanvas: cross-fade + Ken Burns + particles ◀┘   ← 60fps
```

- **The world evolves autonomously** every few seconds (pause anytime by clicking *living*).
- **You steer it** by voice or text — commands become the next beat, boldly and immediately.
- **A memory filmstrip** records every frame; click one to look back through the world's life.

## Run
```bash
npm install
npm run dev            # http://localhost:5173
cp .env.example .env   # paste a Gemini API key
```
Get a free key at <https://aistudio.google.com/apikey>. (The living canvas needs it — image
generation is the medium.)

## Use
- Speak or type a place: *"an overgrown temple swallowed by jungle."*
- Let it live — it evolves on its own; watch the age and beat captions.
- Tell it what happens next: *"a storm rolls in"*, *"decades pass"*, *"dawn breaks"*, *"a figure appears"*.
- Click a filmstrip frame to revisit a past moment; click **living** to pause/resume evolution.

## Tech
- **Gemini Flash** — the Director (structured JSON: world identity + evolution beats)
- **Nano Banana** (Gemini 2.5 Flash Image) — paints and *edits* each frame with continuity
- **Web Speech API** — voice input
- **Vite** + vanilla JS + Canvas2D — the real-time living layer (no heavy framework)

## Structure
```
src/
  director/   Director.js (Gemini calls), prompts.js (scene/evolve/beat briefs + schemas)
  canvas/     LivingCanvas.js (cross-fade, Ken Burns, particle weather)
  ui/         ui.js, styles.css (HUD, voice, memory filmstrip)
  main.js     orchestration: birth → autonomous heartbeat → reactions
```

## Cost & security
Each frame is one **Nano Banana** image (~$0.04); a full demo session is cents, and evolution
pauses when the tab is hidden or when you pause it. The demo calls Gemini directly from the
browser with a Vite env key — fine for a hackathon; proxy it in production so the key stays secret.

## Attribution
Google Gemini API (Flash + Nano Banana / Gemini 2.5 Flash Image), Vite (MIT), Google Fonts
(Fraunces, Inter). All world logic, the Director briefs, and the living-canvas renderer are
original to this project.

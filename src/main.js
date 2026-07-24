// main — wires the four layers together:
//   phrase → Director (semantic) → WorldEngine (living target) → Renderer (art)
// and keeps the render loop breathing every frame, regardless of input.

import { WorldEngine } from './engine/WorldEngine.js';
import { Renderer } from './render/Renderer.js';
import { Director } from './director/Director.js';
import { UI } from './ui/ui.js';

const engine = new WorldEngine();
const renderer = new Renderer(document.getElementById('world'));
const director = new Director();
const ui = new UI();

// Renderer reacts to one-shot events (bursts, flashes, scatter…).
engine.onEvent((e) => renderer.play(e));

ui.onPhrase = async (phrase) => {
  ui.setBusy(true, director.usingAI ? 'the director is imagining…' : 'shaping the world…');
  try {
    const wasBorn = engine.isBorn();
    const patch = await director.direct(phrase, wasBorn ? engine.world : null);
    patch.__label = phrase.length > 22 ? phrase.slice(0, 20) + '…' : phrase;
    if (!wasBorn) ui.reveal();
    engine.ingest(patch);
    ui.addTimelineDot(patch.__label);

    // Repaint the AI backdrop on birth or on a visually significant shift.
    const significant = !wasBorn || patch.palette || patch.biome || patch.weather ||
      (patch.time && patch.time.phase) || (patch.events && patch.events.length);
    if (director.canPaint && significant) paintBackdrop();
  } catch (err) {
    console.error(err);
    ui.showStatus('the world resisted — try again');
  } finally {
    ui.setBusy(false);
  }
};

// Non-blocking backdrop paint: the scene keeps living while Nano Banana renders.
let painting = false;
async function paintBackdrop() {
  if (painting) return;
  painting = true;
  ui.showStatus('painting the world…');
  try {
    const url = await director.paintBackground(engine.target);
    if (url) renderer.setBackdrop(url);
  } finally {
    painting = false;
    ui.hideStatus();
  }
}

// The heartbeat. Time passes and the world lives here — never blocked on input.
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const world = engine.update(dt);
  renderer.sync(world, dt);
  if (engine.isBorn()) ui.update(world);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Expose for debugging in the console.
window.__aether = { engine, renderer, director };

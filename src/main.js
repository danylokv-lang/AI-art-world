// main — orchestrates the living canvas:
//   phrase → paint a world → it EVOLVES on its own every beat, and REACTS to
//   whatever the viewer says next. A serialized queue keeps one AI call at a
//   time; the canvas keeps breathing (Ken Burns + particles) between frames.

import { Director } from './director/Director.js';
import { LivingCanvas } from './canvas/LivingCanvas.js';
import { UI } from './ui/ui.js';

const AUTO_INTERVAL = 13000; // ms between autonomous beats (after the last settles)
const clamp = (v) => Math.max(0, Math.min(1, v));

const director = new Director();
const canvas = new LivingCanvas(document.getElementById('layerA'), document.getElementById('layerB'), document.getElementById('fx'));
const ui = new UI();

const state = {
  born: false, premise: '', name: 'the void', tagline: '',
  phase: 'day', weather: 'clear', intensity: 0.3, mood: 0.6,
  beat: 0, currentImage: null, history: [], viewing: -1,
  paused: false,
};

// ---- serialized AI runner (only one image call in flight) ----
let running = false;
const queue = [];
function enqueue(task) { queue.push(task); drain(); }
async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const t = queue.shift();
    try { await t(); } catch (e) { console.error(e); ui.showStatus('the world resisted — try again'); setTimeout(() => ui.hideStatus(), 2500); }
  }
  running = false;
  scheduleAuto();
}

// ---- autonomous evolution heartbeat ----
let autoTimer = null;
function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!state.born || state.paused) return;
  autoTimer = setTimeout(() => { if (!document.hidden) enqueue(() => evolve(null)); else scheduleAuto(); }, AUTO_INTERVAL);
}

// ---- the pieces ----
async function birth(phrase) {
  ui.setBusy(true, 'painting your world…');
  try {
    const [meta, image] = await Promise.all([
      director.openWorld(phrase).catch(() => ({})),
      director.paintScene(phrase),
    ]);
    if (!image) throw new Error('no image');
    Object.assign(state, {
      born: true, premise: phrase,
      name: meta.name || 'a new world', tagline: meta.tagline || phrase,
      phase: meta.phase || 'day', weather: meta.weather || 'clear',
      intensity: clamp(meta.intensity ?? 0.4), mood: clamp(meta.mood ?? 0.6),
      currentImage: image, beat: 0,
    });
    ui.reveal();
    canvas.showImage(image);
    canvas.setWeather(state.weather, state.intensity, state.mood);
    ui.updateHUD(state);
    ui.setBeat(state.tagline);
    pushFrame(image, state.name);
  } finally {
    ui.setBusy(false);
    scheduleAuto();
  }
}

async function evolve(userCommand) {
  if (!state.born) return;
  ui.setPainting(true, userCommand ? 'the world responds…' : '');
  try {
    const beat = await director.narrateBeat(state, userCommand);
    const image = await director.evolveScene(state.currentImage, beat.instruction);
    if (!image) throw new Error('no image');
    Object.assign(state, {
      currentImage: image, beat: state.beat + 1,
      phase: beat.phase || state.phase, weather: beat.weather || state.weather,
      intensity: clamp(beat.intensity ?? state.intensity), mood: clamp(beat.mood ?? state.mood),
    });
    canvas.showImage(image);
    canvas.setWeather(state.weather, state.intensity, state.mood);
    if (state.weather === 'storm') canvas.strike();
    ui.updateHUD(state);
    ui.setBeat(beat.caption);
    pushFrame(image, beat.caption);
  } finally {
    ui.setPainting(false);
  }
}

function pushFrame(image, caption) {
  state.history.push({ image, caption });
  state.viewing = state.history.length - 1;
  ui.addFrame(image, state.viewing);
}

// ---- input ----
ui.onPhrase = (text) => {
  if (!director.ready) { ui.showStatus('add a Gemini API key in .env to paint worlds'); return; }
  if (!state.born) enqueue(() => birth(text));
  else { clearTimeout(autoTimer); enqueue(() => evolve(text)); }
};

// Click a memory frame to look back; the world keeps living on the latest frame.
ui.onSelectFrame = (i) => {
  const h = state.history[i];
  if (!h) return;
  canvas.showImage(h.image);
  canvas.setWeather(state.weather, state.intensity, state.mood);
  ui.setBeat(h.caption);
  ui.markCurrent(i);
};

// Pause the heartbeat when the tab is hidden (saves API cost); resume on return.
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleAuto(); });

// Click the "living" indicator to pause/resume autonomous evolution (controls spend).
ui.onTogglePause = () => {
  if (!state.born) return;
  state.paused = !state.paused;
  ui.setPaused(state.paused);
  if (state.paused) clearTimeout(autoTimer); else scheduleAuto();
};

window.__aether = { state, director, canvas, ui };

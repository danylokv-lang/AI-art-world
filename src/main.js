// main — orchestrates the living image:
//   phrase → paint a world → it wiggles + parallaxes (LivingImage), evolves on
//   its own each beat, and reacts to commands (Nano Banana edits the same frame).

import { LivingImage } from './render/LivingImage.js';
import { Director } from './director/Director.js';
import { UI } from './ui/ui.js';

const AUTO_INTERVAL = 13000;
const clamp = (v) => Math.max(0, Math.min(1, v));

const img = new LivingImage(document.getElementById('scene'));
const director = new Director();
const ui = new UI();

const state = { born: false, premise: '', name: 'the void', tagline: '', phase: 'day', mood: 0.6, beat: 0, currentImage: null, recent: [], paused: false };

/* serialized AI runner */
let running = false; const queue = [];
function enqueue(t) { queue.push(t); drain(); }
async function drain() {
  if (running) return; running = true;
  while (queue.length) { try { await queue.shift()(); } catch (e) { console.error(e); ui.showStatus('the world resisted — try again'); setTimeout(() => ui.hideStatus(), 2500); } }
  running = false; scheduleAuto();
}

/* autonomous heartbeat */
let autoTimer = null;
function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!state.born || state.paused) return;
  autoTimer = setTimeout(() => { if (!document.hidden) enqueue(() => evolve(null)); else scheduleAuto(); }, AUTO_INTERVAL);
}

async function birth(phrase) {
  ui.setBusy(true, 'painting your world…');
  try {
    const [meta, image] = await Promise.all([director.openWorld(phrase).catch(() => ({})), director.paintScene(phrase)]);
    if (!image) throw new Error('no image');
    Object.assign(state, { born: true, premise: phrase, name: meta.name || 'a new world', tagline: meta.tagline || phrase, phase: meta.phase || 'day', mood: clamp(meta.mood ?? 0.6), currentImage: image, beat: 0, recent: [] });
    img.setImage(image);
    ui.reveal();
    ui.updateHUD({ name: state.name, tagline: state.tagline, phase: state.phase, beat: 0 });
    ui.setBeat(state.tagline);
  } finally { ui.setBusy(false); scheduleAuto(); }
}

async function evolve(userCommand) {
  if (!state.born) return;
  ui.setPainting(true, userCommand ? 'the world responds…' : '');
  try {
    const beat = await director.narrateBeat(state, userCommand);
    const image = await director.evolveScene(state.currentImage, beat.instruction);
    if (!image) throw new Error('no image');
    Object.assign(state, { currentImage: image, beat: state.beat + 1, phase: beat.phase || state.phase, mood: clamp(beat.mood ?? state.mood) });
    state.recent.push(beat.caption);
    img.setImage(image);
    ui.updateHUD({ phase: state.phase, beat: state.beat });
    ui.setBeat(beat.caption);
  } finally { ui.setPainting(false); }
}

/* input */
ui.onPhrase = (text) => {
  if (!director.ready) { ui.showStatus('add a Gemini API key in .env'); return; }
  if (!state.born) enqueue(() => birth(text));
  else { clearTimeout(autoTimer); enqueue(() => evolve(text)); }
};
ui.onTogglePause = () => {
  if (!state.born) return;
  state.paused = !state.paused; ui.setPaused(state.paused);
  if (state.paused) clearTimeout(autoTimer); else scheduleAuto();
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleAuto(); });

window.__aether = { state, director, img, ui };

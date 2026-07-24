// UI — all DOM: the command bar, voice input, the living HUD, timeline and
// onboarding. It emits phrases via onPhrase() and renders world state via
// update(). It knows nothing about three.js or the Director.

import { SEED_PHRASES } from '../engine/WorldState.js';

export class UI {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.onPhrase = () => {};
    this.busy = false;

    this.input = this.$('phrase');
    this.send = this.$('send');
    this.mic = this.$('mic');
    this.onboarding = this.$('onboarding');
    this.hud = this.$('hud');
    this.timeline = this.$('timeline');
    this.status = this.$('status');
    this.commandbar = this.$('commandbar');

    this._wire();
    this._buildChips();
    this._setupSpeech();
  }

  _wire() {
    const submit = () => {
      const v = this.input.value.trim();
      if (!v || this.busy) return;
      this.input.value = '';
      this.onPhrase(v);
    };
    this.send.addEventListener('click', submit);
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  _buildChips() {
    const wrap = this.$('chips');
    SEED_PHRASES.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'chip'; b.textContent = p;
      b.addEventListener('click', () => { if (!this.busy) this.onPhrase(p); });
      wrap.appendChild(b);
    });
  }

  _setupSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this.mic.style.display = 'none'; return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US';
    let finalText = '';
    this.mic.addEventListener('click', () => {
      if (this.mic.classList.contains('is-listening')) { rec.stop(); return; }
      finalText = ''; this.mic.classList.add('is-listening'); rec.start();
    });
    rec.addEventListener('result', (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      this.input.value = finalText || interim;
    });
    rec.addEventListener('end', () => {
      this.mic.classList.remove('is-listening');
      const v = this.input.value.trim();
      if (v) { this.input.value = ''; this.onPhrase(v); }
    });
    rec.addEventListener('error', () => this.mic.classList.remove('is-listening'));
  }

  setBusy(on, msg) {
    this.busy = on;
    this.commandbar.classList.toggle('is-busy', on);
    if (msg) this.showStatus(msg); else this.hideStatus();
  }

  showStatus(msg) { this.status.textContent = msg; this.status.classList.add('is-show'); }
  hideStatus() { this.status.classList.remove('is-show'); }

  reveal() {
    this.onboarding.classList.add('is-hidden');
    this.hud.classList.add('is-live');
    this.timeline.classList.add('is-live');
  }

  addTimelineDot(label) {
    const dot = document.createElement('div');
    dot.className = 'tl-dot';
    dot.dataset.label = label;
    // newest on the right; nudge previous dots left
    const dots = this.timeline.querySelectorAll('.tl-dot');
    dots.forEach((d) => { const l = parseFloat(d.style.left) || 100; d.style.left = Math.max(3, l - 12) + '%'; });
    dot.style.left = '96%';
    this.timeline.appendChild(dot);
    if (dots.length > 9) dots[0].remove();
  }

  // Reflect the living world onto the HUD each frame.
  update(world) {
    this.$('worldName').textContent = world.name;
    this.$('worldTagline').textContent = world.tagline;
    this.$('vSeason').textContent = world.time.season;
    this.$('vPhase').textContent = world.time.phase;
    this.$('vMood').style.width = Math.round(world.mood * 100) + '%';
    this.$('vHealth').style.width = Math.round(world.health * 100) + '%';
    // Vitality tints from gold (healthy) toward grey (fading).
    this.$('vHealth').style.background = world.health > 0.4 ? 'var(--accent)' : 'rgba(180,180,190,0.6)';
  }
}

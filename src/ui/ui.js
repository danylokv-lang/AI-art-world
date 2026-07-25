// UI — DOM glue: command bar, voice, HUD, beat caption, pause toggle.
// Emits phrases via onPhrase(); knows nothing about the renderer or the AI.

import { SEED_PHRASES } from '../director/prompts.js';

export class UI {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.onPhrase = () => {};
    this.onTogglePause = () => {};
    this.busy = false;

    this.input = this.$('phrase');
    this._wire();
    this._buildChips();
    this._setupSpeech();
    this.$('live').addEventListener('click', () => this.onTogglePause());
  }

  _wire() {
    const submit = () => {
      const v = this.input.value.trim();
      if (!v || this.busy) return;
      this.input.value = '';
      this.onPhrase(v);
    };
    this.$('send').addEventListener('click', submit);
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
    const mic = this.$('mic');
    if (!SR) { mic.style.display = 'none'; return; }
    const rec = new SR(); rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US';
    let finalText = '';
    mic.addEventListener('click', () => {
      if (mic.classList.contains('is-listening')) { rec.stop(); return; }
      finalText = ''; mic.classList.add('is-listening'); rec.start();
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
      mic.classList.remove('is-listening');
      const v = this.input.value.trim();
      if (v && !this.busy) { this.input.value = ''; this.onPhrase(v); }
    });
    rec.addEventListener('error', () => mic.classList.remove('is-listening'));
  }

  reveal() {
    this.$('onboarding').classList.add('is-hidden');
    this.$('hud').classList.add('is-live');
  }

  setBusy(on, msg) {
    this.busy = on;
    this.$('commandbar').classList.toggle('is-busy', on);
    this.$('live').classList.toggle('is-painting', on);
    if (msg) this.showStatus(msg); else this.hideStatus();
  }
  setPainting(on, msg) {
    this.$('live').classList.toggle('is-painting', on);
    if (on && msg) this.showStatus(msg); else if (!on) this.hideStatus();
  }
  showStatus(msg) { const s = this.$('status'); s.textContent = msg; s.classList.add('is-show'); }
  hideStatus() { this.$('status').classList.remove('is-show'); }

  setPaused(paused) {
    const el = this.$('live');
    el.innerHTML = `<i></i> ${paused ? 'paused' : 'living'}`;
    el.classList.toggle('is-paused', paused);
    el.title = paused ? 'resume the world' : 'pause the world';
  }

  updateHUD({ name, tagline, phase, beat }) {
    if (name) this.$('worldName').textContent = name;
    if (tagline) this.$('worldTagline').textContent = tagline;
    if (phase) this.$('metaPhase').textContent = phase;
    if (beat != null) this.$('metaBeat').textContent = `age ${beat}`;
  }

  setBeat(caption) {
    const el = this.$('beat');
    el.classList.remove('show');
    if (!caption) return;
    void el.offsetWidth;
    el.textContent = `“${caption}”`;
    el.classList.add('show');
  }
}

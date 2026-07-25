// LivingCanvas — presents the world as a living painting:
//   • two backdrop layers that cross-fade when a new AI frame arrives,
//   • a slow Ken Burns drift on each frame so the image is never truly still,
//   • a Canvas2D particle/atmosphere overlay (rain, snow, embers, petals, fog,
//     aurora, drifting motes) + lightning, so motion continues between frames.

export class LivingCanvas {
  constructor(layerA, layerB, canvas) {
    this.layers = [layerA, layerB];
    this.active = -1; // index currently shown
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprite = makeGlowSprite();

    this.particles = [];
    this.target = 0;
    this.kind = 'clear';
    this.intensity = 0.3;
    this.mood = 0.6;
    this.wind = 0.2;
    this.flash = 0;
    this.t = 0;
    this.fogPuffs = Array.from({ length: 5 }, () => ({ x: Math.random(), y: 0.2 + Math.random() * 0.6, r: 0.3 + Math.random() * 0.4, s: (Math.random() - 0.5) * 0.02 }));

    this._resize();
    addEventListener('resize', () => this._resize());
    this._last = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = innerWidth; this.h = innerHeight;
  }

  /* -------- swap to a new AI frame with cross-fade + fresh Ken Burns -------- */
  showImage(dataUrl) {
    const next = (this.active + 1) % 2;
    const el = this.layers[next];
    el.style.backgroundImage = `url("${dataUrl}")`;
    // Ken Burns: a slow drift that never reveals the image edges.
    const zoomA = 1.08 + Math.random() * 0.04, zoomB = zoomA + 0.10;
    const tx = (Math.random() - 0.5) * 4, ty = (Math.random() - 0.5) * 4;
    el.animate(
      [
        { transform: `scale(${zoomA}) translate(0%, 0%)` },
        { transform: `scale(${zoomB}) translate(${tx}%, ${ty}%)` },
      ],
      { duration: 26000, easing: 'linear', fill: 'forwards' },
    );
    // cross-fade
    el.style.opacity = '1';
    if (this.active >= 0) this.layers[this.active].style.opacity = '0';
    this.active = next;
  }

  /* -------- configure the atmosphere overlay -------- */
  setWeather(kind, intensity = 0.4, mood = 0.6) {
    this.kind = kind || 'clear';
    this.intensity = intensity;
    this.mood = mood;
    const base = {
      rain: 260, storm: 380, snow: 220, ember: 200, petals: 120,
      fog: 40, aurora: 60, cloudy: 50, clear: 60,
    }[this.kind] ?? 60;
    this.target = Math.round(base * (0.5 + intensity));
    this.wind = this.kind === 'storm' ? 0.7 : this.kind === 'rain' ? 0.35 : 0.15;
  }

  strike() { this.flash = 1; }

  /* -------- main loop -------- */
  _loop(now) {
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now; this.t += dt;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    if (this.kind === 'fog') this._drawFog(dt);
    if (this.kind === 'aurora') this._drawAurora();

    this._spawn();
    this._updateDraw(dt);

    // storm lightning
    if (this.kind === 'storm' && Math.random() < 0.02 * (0.4 + this.intensity)) this.flash = 1;
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(210,225,255,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
      this.flash = Math.max(0, this.flash - dt * 2.2);
    }
    requestAnimationFrame((t) => this._loop(t));
  }

  _spawn() {
    while (this.particles.length < this.target) this.particles.push(this._make());
    // let excess fade by attrition (mark for removal past edges)
  }

  _make() {
    const k = this.kind;
    const x = Math.random() * this.w, y = Math.random() * this.h;
    if (k === 'rain' || k === 'storm') return { k, x, y: -Math.random() * this.h, len: 8 + Math.random() * 14, sp: 700 + Math.random() * 500, size: 1 };
    if (k === 'snow') return { k, x, y: -Math.random() * this.h, sp: 40 + Math.random() * 60, size: 1.5 + Math.random() * 3, drift: Math.random() * Math.PI * 2, col: '255,255,255' };
    if (k === 'ember') return { k, x, y: this.h + Math.random() * this.h, sp: 40 + Math.random() * 70, size: 1.5 + Math.random() * 3, col: '255,150,60', ph: Math.random() * 6.28 };
    if (k === 'petals') return { k, x, y: -Math.random() * this.h, sp: 45 + Math.random() * 45, size: 3 + Math.random() * 4, drift: Math.random() * 6.28, col: '247,198,217' };
    // ambient motes (clear / cloudy / fog / aurora)
    const warm = this.mood > 0.55;
    return { k: 'mote', x, y, sp: 6 + Math.random() * 14, size: 1 + Math.random() * 2.4, drift: Math.random() * 6.28, col: warm ? '255,224,160' : '180,205,255', ph: Math.random() * 6.28 };
  }

  _updateDraw(dt) {
    const ctx = this.ctx, W = this.w, H = this.h;
    const wind = this.wind * 120;
    ctx.save();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      let dead = false;
      if (p.k === 'rain' || p.k === 'storm') {
        p.y += p.sp * dt; p.x += wind * dt;
        ctx.strokeStyle = `rgba(170,195,230,0.35)`;
        ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - wind * 0.02, p.y + p.len); ctx.stroke();
        if (p.y > H + 20) dead = true;
      } else if (p.k === 'snow') {
        p.drift += dt; p.y += p.sp * dt; p.x += Math.sin(p.drift) * 18 * dt + wind * 0.3 * dt;
        this._blob(p.x, p.y, p.size, p.col, 0.9);
        if (p.y > H + 10) dead = true;
      } else if (p.k === 'ember') {
        p.ph += dt; p.y -= p.sp * dt; p.x += Math.sin(p.ph) * 22 * dt + wind * 0.2 * dt;
        const tw = 0.6 + 0.4 * Math.sin(p.ph * 3);
        this._blob(p.x, p.y, p.size * tw, p.col, 0.95);
        if (p.y < -10) dead = true;
      } else if (p.k === 'petals') {
        p.drift += dt * 1.5; p.y += p.sp * dt; p.x += Math.sin(p.drift) * 26 * dt + wind * 0.5 * dt;
        this._blob(p.x, p.y, p.size, p.col, 0.8);
        if (p.y > H + 10) dead = true;
      } else { // mote
        p.ph += dt; p.x += Math.cos(p.drift) * p.sp * dt + Math.sin(this.t * 0.2 + p.ph) * 6 * dt;
        p.y += Math.sin(p.drift) * p.sp * dt;
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 0.8 + p.ph));
        this._blob(p.x, p.y, p.size, p.col, tw * 0.8);
        if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) { p.x = Math.random() * W; p.y = Math.random() * H; }
      }
      if (dead) {
        if (this.particles.length > this.target) this.particles.splice(i, 1);
        else Object.assign(p, this._make()); // recycle
      }
    }
    ctx.restore();
  }

  _blob(x, y, r, col, a) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.drawImage(this.sprite, x - r * 4, y - r * 4, r * 8, r * 8);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // tint via a second pass would be costly; the sprite is white, tint by shadow
    if (col && col !== '255,255,255') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${col},${a * 0.5})`;
      ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  _drawFog(dt) {
    const ctx = this.ctx;
    ctx.save();
    for (const f of this.fogPuffs) {
      f.x += f.s * dt; if (f.x > 1.3) f.x = -0.3; if (f.x < -0.3) f.x = 1.3;
      const cx = f.x * this.w, cy = f.y * this.h, rr = f.r * this.w;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, `rgba(200,210,225,${0.05 + this.intensity * 0.12})`);
      g.addColorStop(1, 'rgba(200,210,225,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  _drawAurora() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 3; b++) {
      const yBase = this.h * (0.14 + b * 0.09);
      const hue = ['120,255,180', '120,200,255', '200,150,255'][b];
      ctx.beginPath();
      for (let x = 0; x <= this.w; x += 16) {
        const y = yBase + Math.sin(x * 0.008 + this.t * (0.4 + b * 0.2) + b) * 30;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineWidth = 40 + b * 10;
      ctx.strokeStyle = `rgba(${hue},${0.05 + this.intensity * 0.06})`;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function makeGlowSprite() {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return c;
}

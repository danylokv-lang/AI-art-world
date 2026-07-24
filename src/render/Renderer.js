// Renderer — the real-time art layer, rebuilt to read as ALIVE and cinematic:
//   • a glowing, swirling particle "organism" (the world's life) animated on the
//     GPU with per-particle orbital drift + a slow global swirl + breathing;
//   • an animated procedural nebula sky tinted by the palette;
//   • an optional AI backdrop that slowly churns behind everything (not static);
//   • a slowly orbiting camera for real depth;
//   • UnrealBloom post-processing so every particle and highlight glows.
// It never talks to the Director; it only reflects the living world state.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const C = new THREE.Color();
// Sanitize hex — LLMs occasionally return stray characters ("#0b0416批判#4a196b")
// or drop the leading '#'. Pull the first valid 6-hex run, else fall back.
const hexToVec = (hex) => {
  const m = String(hex).match(/([0-9a-fA-F]{6})/);
  try { C.set(m ? '#' + m[1] : '#5566aa'); } catch { C.set('#5566aa'); }
  return new THREE.Vector3(C.r, C.g, C.b);
};
const lerp = (a, b, t) => a + (b - a) * t;

const ORGANISM_COUNT = 9000;

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x03040a, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 2000);
    this.camera.position.set(0, 10, 46);

    this.time = 0;
    this.flash = 0;
    this.burst = 0;
    this.live = { mood: 0.5, health: 0.5, turb: 0.2, accent: hexToVec('#88aaff'), spread: 1, bloom: 1.2, exposure: 1 };

    this._buildNebula();
    this._buildOrganism();
    this._buildComposer();

    this.backdrop = null;
    this.backdropTarget = 0;
    this.backdropOpacity = 0;
    this.weather = null;
    this.weatherType = '';

    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.setSize(innerWidth, innerHeight);
  }

  /* ---------------- Post-processing ---------------- */
  _buildComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.6, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(VignetteGrainShader));
    this.grain = this.composer.passes[2];
  }

  /* ---------------- Nebula sky ---------------- */
  _buildNebula() {
    this.nebU = {
      uDeep: { value: hexToVec('#05060f') }, uMid: { value: hexToVec('#141a33') },
      uLight: { value: hexToVec('#38507a') }, uTime: { value: 0 }, uMood: { value: 0.5 },
      uTex: { value: null }, uHasTex: { value: 0 }, uTexMix: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.nebU,
      vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: /* glsl */`
        varying vec3 vDir; uniform vec3 uDeep,uMid,uLight; uniform float uTime,uMood,uHasTex,uTexMix; uniform sampler2D uTex;
        float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float noise(vec3 x){ vec3 p=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(p+vec3(0,0,0)),hash(p+vec3(1,0,0)),f.x),mix(hash(p+vec3(0,1,0)),hash(p+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(p+vec3(0,0,1)),hash(p+vec3(1,0,1)),f.x),mix(hash(p+vec3(0,1,1)),hash(p+vec3(1,1,1)),f.x),f.y),f.z);}
        float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5;} return s; }
        void main(){
          vec3 d=normalize(vDir); float h=clamp(d.y*0.5+0.5,0.0,1.0);
          float flow=fbm(d*2.6 + vec3(uTime*0.02, uTime*0.015, uTime*0.025));
          float wisps=pow(fbm(d*5.0 + vec3(-uTime*0.03, uTime*0.02, 0.0)), 2.2);
          vec3 base=mix(uDeep, uMid, smoothstep(0.0,0.9,h));
          vec3 col=mix(base, uLight, flow*0.4*(0.3+0.7*h));
          col += uLight*wisps*0.14;
          if(uHasTex>0.5){
            // AI art as a slowly churning far layer — never a static frame.
            vec2 uv=vec2(atan(d.z,d.x)/6.2831+0.5, h);
            uv += (fbm(d*3.0+uTime*0.05)-0.5)*0.06;
            vec3 t=texture2D(uTex, uv).rgb;
            col=mix(col, mix(col,t,0.6), uTexMix);
          }
          // keep the sky a DARK backdrop so the glowing organism reads against it
          col*=mix(0.28,0.55,uMood);
          gl_FragColor=vec4(col,1.0);
        }`,
    });
    this.nebula = new THREE.Mesh(new THREE.SphereGeometry(600, 40, 24), mat);
    this.scene.add(this.nebula);
  }

  /* ---------------- Organism ---------------- */
  _buildOrganism() {
    const N = ORGANISM_COUNT;
    const position = new Float32Array(N * 3);
    const phase = new Float32Array(N * 3);
    const data = new Float32Array(N * 2); // [sizeRand, colorT]
    for (let i = 0; i < N; i++) {
      // 65% flattened galaxy disc, 35% spherical halo — an organic body.
      let x, y, z;
      if (Math.random() < 0.6) {
        // bias outward (exponent < 1) so the centre isn't a packed white core
        const r = (0.28 + 0.72 * Math.pow(Math.random(), 0.6)) * 24;
        const a = Math.random() * Math.PI * 2 + r * 0.14; // gentle spiral arms
        const thick = 7.0 * Math.exp(-r / 22);
        x = Math.cos(a) * r; z = Math.sin(a) * r; y = (Math.random() - 0.5) * thick;
      } else {
        const r = 8 + Math.pow(Math.random(), 0.7) * 16;
        const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        x = r * s * Math.cos(t); y = r * u * 0.7; z = r * s * Math.sin(t);
      }
      position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z;
      phase[i * 3] = Math.random(); phase[i * 3 + 1] = Math.random(); phase[i * 3 + 2] = Math.random();
      data[i * 2] = 0.4 + Math.random() * 1.7;   // size
      data[i * 2 + 1] = Math.random();           // color t
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 3));
    geo.setAttribute('aData', new THREE.BufferAttribute(data, 2));

    this.orgU = {
      uTime: { value: 0 }, uSpeed: { value: 1 }, uTurb: { value: 0.2 }, uSpread: { value: 1 },
      uMood: { value: 0.5 }, uHealth: { value: 0.6 }, uSize: { value: 1 }, uBurst: { value: 0 },
      uColA: { value: hexToVec('#2b3f7a') }, uColB: { value: hexToVec('#6fc6ff') }, uColC: { value: hexToVec('#ffd9a0') },
      uAccent: { value: hexToVec('#88aaff') },
      uPix: { value: Math.min(devicePixelRatio, 2) },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: this.orgU,
      vertexShader: /* glsl */`
        attribute vec3 aPhase; attribute vec2 aData;
        uniform float uTime,uSpeed,uTurb,uSpread,uMood,uHealth,uSize,uBurst,uPix;
        varying vec3 vColor; varying float vGlow;
        uniform vec3 uColA,uColB,uColC,uAccent;
        void main(){
          float t=uTime*uSpeed;
          vec3 base=position*mix(1.9,1.0,uHealth);      // low vitality disperses the body
          base*=1.0+uBurst*1.4;                          // one-shot bursts expand it
          // slow differential swirl around Y (inner spins faster)
          float ang=t*0.06 + 2.2/ (2.0+length(base.xz));
          float ca=cos(ang), sa=sin(ang);
          vec3 p=base; p.xz=mat2(ca,-sa,sa,ca)*base.xz;
          // per-particle orbital shimmer + weather turbulence
          float amp=1.0+uTurb*6.0;
          p+= vec3(sin(t*0.7+aPhase.x*6.28), sin(t*0.6+aPhase.y*6.28), cos(t*0.65+aPhase.z*6.28))*amp;
          p.y += sin(t*0.5)*0.6;                          // gentle breathing
          vec4 mv=modelViewMatrix*vec4(p,1.0);
          float twinkle=0.55+0.65*sin(t*1.3+aPhase.x*12.0);
          gl_PointSize=aData.x*uSize*twinkle*(260.0*uPix/max(1.0,-mv.z));
          gl_Position=projectionMatrix*mv;
          vec3 col=mix(uColA,uColB,aData.y);
          col=mix(col,uColC, smoothstep(0.72,1.0,aData.y)); // reserve gold for the brightest few
          col=mix(col,uAccent, step(0.86,aPhase.y)*0.8);
          vColor=col*(0.28+uMood*0.44);   // gentler per-particle so overlaps don't blow out
          vGlow=twinkle;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vGlow;
        void main(){
          float d=length(gl_PointCoord-0.5);
          float a=smoothstep(0.5,0.0,d);
          gl_FragColor=vec4(vColor*(0.8+vGlow*0.5), a*a);
        }`,
    });
    this.organism = new THREE.Points(geo, mat);
    this.organism.frustumCulled = false;
    this.scene.add(this.organism);
  }

  /* ---------------- Per-frame sync ---------------- */
  sync(world, dt) {
    this.time += dt;
    const L = this.live;
    const [deep, mid, light] = world.palette;

    // --- ease reactive values toward the world state ---
    const k = 1 - Math.pow(0.1, dt);
    L.mood = lerp(L.mood, world.mood, k);
    L.health = lerp(L.health, world.health, k);
    L.turb = lerp(L.turb, world.weather.wind * 0.5 + world.weather.intensity * 0.5, k);
    L.spread = lerp(L.spread, world.health, k);
    const accentHex = world.entities[0]?.hue || light;
    L.accent.lerp(hexToVec(accentHex), k);

    // --- nebula ---
    this.nebU.uTime.value = this.time;
    this.nebU.uDeep.value.copy(hexToVec(deep));
    this.nebU.uMid.value.copy(hexToVec(mid));
    this.nebU.uLight.value.copy(hexToVec(light));
    this.nebU.uMood.value = L.mood;
    this.nebU.uTexMix.value = lerp(this.nebU.uTexMix.value, this.backdropTarget > 0 ? 0.35 : 0, k * 0.5);

    // --- organism ---
    const O = this.orgU;
    O.uTime.value = this.time;
    O.uSpeed.value = world.time.speed || 1;
    O.uTurb.value = L.turb;
    O.uMood.value = L.mood;
    O.uHealth.value = L.health;
    // Keep the body in the deep/mid range and reserve the light color for
    // highlights only — gives complementary contrast instead of a monochrome blob.
    O.uColA.value.copy(hexToVec(deep)).lerp(hexToVec(mid), 0.5);
    O.uColB.value.copy(hexToVec(mid)).lerp(hexToVec(light), 0.28);
    O.uColC.value.copy(hexToVec(light));
    O.uAccent.value.copy(L.accent);
    // density/size scale from how much life the Director summoned
    const totalLife = world.entities.reduce((s, e) => s + e.count, 0);
    O.uSize.value = lerp(O.uSize.value, 0.8 + Math.min(1.4, totalLife / 220) + L.mood * 0.4, k);
    if (this.burst > 0) { this.burst = Math.max(0, this.burst - dt * 1.6); }
    O.uBurst.value = this.burst;

    // --- cinematic orbit ---
    const orbit = this.time * 0.06;
    const rad = 46 - L.mood * 6;
    this.camera.position.set(Math.sin(orbit) * rad, 8 + Math.sin(this.time * 0.05) * 6, Math.cos(orbit) * rad);
    this.camera.lookAt(0, 0, 0);

    // --- weather overlay ---
    this._syncWeather(world, dt);

    // --- AI backdrop churns inside the nebula shader (see uTexMix) ---
    this.backdropTarget = this.nebU.uTex.value ? 1 : 0;

    // --- bloom + exposure react to mood/health/flash ---
    const targetBloom = 0.55 + L.mood * 0.5 + this.flash * 1.2;
    L.bloom = lerp(L.bloom, targetBloom, k);
    this.bloom.strength = L.bloom;
    this.bloom.radius = 0.55 + L.mood * 0.2;
    if (this.grain) { this.grain.uniforms.uTime.value = this.time; this.grain.uniforms.uVignette.value = 1.15 - L.health * 0.25; }
    if (this.flash > 0) this.flash -= dt * 2.0;

    this.composer.render();
  }

  /* ---------------- Weather (glowing streaks) ---------------- */
  _syncWeather(world, dt) {
    const type = world.weather.type;
    if (type !== this.weatherType) { this._rebuildWeather(type, world); this.weatherType = type; }
    if (!this.weather) return;
    const pos = this.weather.geo.attributes.position;
    const fall = this.weather.fall, inten = 0.4 + world.weather.intensity;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - fall * dt * 34 * inten;
      let x = pos.getX(i) + world.weather.wind * dt * 24;
      if (y < -40) y = 60; if (x > 70) x = -70;
      pos.setY(i, y); pos.setX(i, x);
    }
    pos.needsUpdate = true;
    if (type === 'storm' && Math.random() < 0.03 * (0.4 + world.weather.intensity)) this.flash = 1;
  }

  _rebuildWeather(type, world) {
    if (this.weather) { this.scene.remove(this.weather.points); this.weather.geo.dispose(); this.weather.mat.dispose(); this.weather = null; }
    const config = {
      rain: { n: 1600, fall: 1.0, size: 0.5, color: '#9fc4ff' },
      storm: { n: 2400, fall: 1.4, size: 0.6, color: '#c8d6ff' },
      snow: { n: 1200, fall: 0.28, size: 1.0, color: '#ffffff' },
    }[type];
    if (!config) return;
    const positions = new Float32Array(config.n * 3);
    const colors = new Float32Array(config.n * 3);
    const col = hexToVec(config.color);
    for (let i = 0; i < config.n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 140;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 110;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
      colors[i * 3] = col.x; colors[i * 3 + 1] = col.y; colors[i * 3 + 2] = col.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = glowMaterial(config.size, 0.7);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.weather = { points, geo, mat, fall: config.fall };
  }

  /* ---------------- AI backdrop (feeds the nebula) ---------------- */
  setBackdrop(dataUrl) {
    if (!dataUrl) return;
    new THREE.TextureLoader().load(dataUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.nebU.uTex.value?.dispose?.();
      this.nebU.uTex.value = tex;
      this.nebU.uHasTex.value = 1;
      this.backdropTarget = 1;
    });
  }

  /* ---------------- Events ---------------- */
  play(event) {
    if (!event) return;
    switch (event.type) {
      case 'flash': this.flash = 1; break;
      case 'burst': case 'bloom': this.burst = Math.min(1.2, this.burst + 0.7); break;
      case 'scatter': this.burst = 1.2; break;
      case 'quake': this.flash = 0.6; this.burst = Math.min(1.2, this.burst + 0.5); break;
    }
  }
}

/* ---------------- helpers ---------------- */
function glowMaterial(size, opacity) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: size }, uOpacity: { value: opacity }, uPix: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: /* glsl */`
      attribute vec3 color; varying vec3 vColor; uniform float uSize,uPix;
      void main(){ vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=uSize*(300.0*uPix/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; uniform float uOpacity;
      void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d);
        gl_FragColor=vec4(vColor, a*a*uOpacity); }`,
  });
}

// Subtle vignette + animated film grain for a cinematic finish.
const VignetteGrainShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 1.1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime,uVignette; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec3 col=texture2D(tDiffuse,vUv).rgb;
      vec2 q=vUv-0.5; float vig=smoothstep(0.9,0.35,length(q)*uVignette);
      col*=mix(0.55,1.0,vig);
      col+=(rand(vUv+uTime)-0.5)*0.03;
      gl_FragColor=vec4(col,1.0);
    }`,
};

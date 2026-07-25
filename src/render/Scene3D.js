// Scene3D — a real-time, fully-rendered 3D world: low-poly terrain, animated
// water, an atmospheric sky with sun/clouds, instanced vegetation, weather, and
// bloom. The LLM director sets world parameters; this paints them in 3D and the
// camera flies through so it reads as a place you are inside — not a picture.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const C = new THREE.Color();
const hex = (h) => { const m = String(h).match(/([0-9a-fA-F]{6})/); C.set(m ? '#' + m[1] : '#888'); return C.clone(); };
const lerp = (a, b, t) => a + (b - a) * t;

const SIZE = 520;      // terrain extent
const SEG = 200;       // terrain resolution

export class Scene3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x0a1018, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, 4000);
    this.camera.position.set(0, 60, 180);

    this.time = 0;
    this.live = { dayT: 0.4, fog: 0.5, water: 0.28, sunI: 1, mood: 0.7 };
    this.sig = '';

    this._buildSky();
    this._buildLights();
    this._buildTerrain(defaultWorld());
    this._buildWater();
    this._buildWeatherFX();
    this._buildComposer();

    addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.setSize(innerWidth, innerHeight);
  }

  _buildComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.7, 0.85);
    this.composer.addPass(this.bloom);
  }

  /* ---------------- sky ---------------- */
  _buildSky() {
    this.skyU = {
      uHorizon: { value: hex('#e7c9a0').toArray().slice(0, 3) && new THREE.Vector3().fromArray(hex('#e7c9a0').toArray()) },
      uZenith: { value: new THREE.Vector3().fromArray(hex('#1c3a66').toArray()) },
      uMid: { value: new THREE.Vector3().fromArray(hex('#6d92c0').toArray()) },
      uSun: { value: new THREE.Vector3(0, 0.3, -1) },
      uSunCol: { value: new THREE.Vector3().fromArray(hex('#fff2d6').toArray()) },
      uTime: { value: 0 }, uNight: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.skyU,
      vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: /* glsl */`
        varying vec3 vDir; uniform vec3 uHorizon,uZenith,uMid,uSun,uSunCol; uniform float uTime,uNight;
        float hash(vec3 p){p=fract(p*0.3183+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
        float noise(vec3 x){vec3 p=floor(x),f=fract(x);f=f*f*(3.-2.*f);
          return mix(mix(mix(hash(p+vec3(0,0,0)),hash(p+vec3(1,0,0)),f.x),mix(hash(p+vec3(0,1,0)),hash(p+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(p+vec3(0,0,1)),hash(p+vec3(1,0,1)),f.x),mix(hash(p+vec3(0,1,1)),hash(p+vec3(1,1,1)),f.x),f.y),f.z);}
        float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*noise(p);p*=2.02;a*=.5;}return s;}
        void main(){
          vec3 d=normalize(vDir); float h=clamp(d.y,0.0,1.0);
          vec3 col=mix(uHorizon,uMid,smoothstep(0.0,0.35,h));
          col=mix(col,uZenith,smoothstep(0.3,0.9,h));
          // sun/moon
          float s=max(dot(d,normalize(uSun)),0.0);
          col+=uSunCol*pow(s,600.0)*2.0;
          col+=uSunCol*pow(s,6.0)*0.25;
          // drifting clouds (sample the full 3D direction to avoid an axis seam)
          float cl=fbm(d*2.4 + vec3(uTime*0.012, 0.0, uTime*0.008));
          cl=smoothstep(0.5,0.85,cl)*smoothstep(0.05,0.4,h);
          col=mix(col, mix(col, vec3(1.0), 0.6), cl*(0.5+0.5*(1.0-uNight)));
          // stars at night
          if(uNight>0.3){ float st=step(0.85, hash(floor(d*220.0))); col+=vec3(st)*uNight*h*0.8; }
          gl_FragColor=vec4(col,1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 20), mat);
    this.scene.add(this.sky);
  }

  _buildLights() {
    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.4);
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x35281c, 0.55);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0x2a3550, 0.4);
    this.scene.add(this.amb);
  }

  /* ---------------- terrain ---------------- */
  heightAt(x, z) {
    const amp = this.amp;
    let h = ridged(x * 0.004, z * 0.004) * 0.6 + fbm2(x * 0.011, z * 0.011) * 0.4;
    h = Math.pow(Math.max(0, h), 1.25) * amp;
    // plunge the rim steeply so the terrain's square edge falls away out of view
    const d = Math.sqrt(x * x + z * z) / (SIZE * 0.5);
    return h - Math.pow(d, 2.6) * amp * 1.25;
  }

  _buildTerrain(w) {
    this.amp = 40 + w.relief * 120;
    const amp = this.amp;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const low = hex(w.palette[0]), mid = hex(w.palette[1]), high = hex(w.palette[2]);
    const snowC = hex('#eef3fb'), sand = hex(w.sand || '#cbb98a');
    const waterY = (w.water - 0.5) * amp * 0.9;
    this.waterY = waterY;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      // color by elevation relative to water
      const e = (h - waterY) / (amp * 0.9);
      let c;
      if (e < 0.02) c = sand.clone().lerp(mid, 0.2);
      else if (e < 0.28) c = mid.clone().lerp(sand, Math.max(0, 0.25 - e));
      else if (e < 0.6) c = mid.clone().lerp(low, (e - 0.28) / 0.32);
      else if (e < 0.82) c = low.clone().lerp(high, (e - 0.6) / 0.22 * 0.4);
      else c = high.clone().lerp(snowC, w.snow > 0 ? Math.min(1, (e - 0.82) / 0.18) * w.snow : 0);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96, metalness: 0.0 });
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); this.terrain.material.dispose(); }
    this.terrain = new THREE.Mesh(geo, mat);
    this.scene.add(this.terrain);
  }

  _buildWater() {
    this.waterU = { uTime: { value: 0 }, uColor: { value: new THREE.Vector3().fromArray(hex('#1d4e6b').toArray()) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Vector3(1, 0.95, 0.85) } };
    const mat = new THREE.ShaderMaterial({
      transparent: true, uniforms: this.waterU,
      vertexShader: `varying vec3 vW; uniform float uTime; void main(){ vec3 p=position; p.z += sin(p.x*0.05+uTime)*0.6 + cos(p.y*0.04+uTime*1.3)*0.6; vec4 wp=modelMatrix*vec4(p,1.0); vW=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `varying vec3 vW; uniform vec3 uColor,uSun,uSunCol; uniform float uTime;
        void main(){ vec3 n=normalize(vec3(sin(vW.x*0.06+uTime)*0.1, 1.0, cos(vW.z*0.05+uTime)*0.1));
          float g=pow(max(dot(n,normalize(uSun)),0.0),8.0);
          vec3 col=uColor + uSunCol*g*0.6; gl_FragColor=vec4(col,0.86); }`,
    });
    const geo = new THREE.PlaneGeometry(SIZE * 1.4, SIZE * 1.4, 60, 60);
    geo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(geo, mat);
    this.scene.add(this.water);
  }

  /* ---------------- vegetation & rocks (instanced) ---------------- */
  _buildScatter(w) {
    if (this.scatter) { this.scene.remove(this.scatter); this.scatter.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
    const group = new THREE.Group();
    const veg = w.vegetation || { type: 'pine', density: 0.5 };
    const foliageCol = hex(veg.color || w.palette[1]).multiplyScalar(0.8);
    const trunkCol = hex('#4a3524');
    const rockCol = hex(w.palette[0]).lerp(hex('#7a7a82'), 0.4);

    // --- collect placements on land, below the snow line, not too high ---
    const amp = this.amp, snowY = this.waterY + amp * 0.72;
    const spots = [];
    const count = Math.round(1600 * (veg.density ?? 0.5));
    let tries = 0;
    while (spots.length < count && tries < count * 4) {
      tries++;
      const x = (Math.random() - 0.5) * SIZE * 0.86, z = (Math.random() - 0.5) * SIZE * 0.86;
      const h = this.heightAt(x, z);
      if (h < this.waterY + 3 || h > snowY) continue;
      // forest cover: low-freq mask carves natural groves and clearings
      if (fbm2(x * 0.006 + 20, z * 0.006 - 40) < 0.42) continue;
      // avoid steep cliffs
      const slope = Math.abs(this.heightAt(x + 3, z) - h) + Math.abs(this.heightAt(x, z + 3) - h);
      if (slope > 9) continue;
      spots.push([x, h, z]);
    }

    if (veg.type && veg.type !== 'none' && spots.length) {
      const foliage = treeFoliage(veg.type);
      const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 5, 6);
      const fMat = new THREE.MeshStandardMaterial({ color: foliageCol, flatShading: true, roughness: 1 });
      const tMat = new THREE.MeshStandardMaterial({ color: trunkCol, flatShading: true, roughness: 1 });
      const fMesh = new THREE.InstancedMesh(foliage.geo, fMat, spots.length);
      const tMesh = new THREE.InstancedMesh(trunkGeo, tMat, spots.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      spots.forEach(([x, h, z], i) => {
        const sc = 0.85 + Math.random() * 1.3;
        q.setFromAxisAngle(up, Math.random() * 6.28);
        s.set(sc, sc * (0.9 + Math.random() * 0.4), sc);
        p.set(x, h + 2.5 * sc, z); m.compose(p, q, s); tMesh.setMatrixAt(i, m);   // trunk on the ground
        p.set(x, h + (5 + foliage.lift) * sc, z); m.compose(p, q, s); fMesh.setMatrixAt(i, m); // foliage above
      });
      group.add(fMesh, tMesh);
    }

    // --- rocks ---
    const rockCount = Math.round(240 * (0.3 + (w.relief || 0.5)));
    const rockGeo = new THREE.IcosahedronGeometry(2.2, 0);
    const rMesh = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: rockCol, flatShading: true, roughness: 1 }), rockCount);
    const m2 = new THREE.Matrix4(), q2 = new THREE.Quaternion(), s2 = new THREE.Vector3(), p2 = new THREE.Vector3();
    for (let i = 0; i < rockCount; i++) {
      const x = (Math.random() - 0.5) * SIZE * 0.9, z = (Math.random() - 0.5) * SIZE * 0.9;
      const h = this.heightAt(x, z);
      const sc = 0.8 + Math.random() * 3.5;
      q2.setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
      s2.set(sc, sc * 0.7, sc); p2.set(x, Math.max(this.waterY - 1, h) + sc * 0.3, z);
      m2.compose(p2, q2, s2); rMesh.setMatrixAt(i, m2);
    }
    group.add(rMesh);

    this.scatter = group;
    this.scene.add(group);
  }

  setWorld(w) {
    const sig = `${w.biome}|${(w.relief ?? 0.5).toFixed(2)}|${(w.water ?? 0.3).toFixed(2)}|${(w.palette || []).join(',')}|${w.snow}|${w.vegetation?.type}|${w.vegetation?.density}`;
    if (sig !== this.sig) { this._buildTerrain(w); this._buildScatter(w); this.sig = sig; }
  }

  /* ---------------- weather particles ---------------- */
  _buildWeatherFX() {
    const N = 2000;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 700;
      pos[i * 3 + 1] = Math.random() * 320;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 700;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.wxU = { uSize: { value: 3 }, uColor: { value: new THREE.Vector3(1, 1, 1) }, uOpacity: { value: 0 }, uPix: { value: Math.min(devicePixelRatio, 2) } };
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.wxU,
      vertexShader: `uniform float uSize,uPix; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(16.0, uSize*uPix*(300.0/max(1.0,-mv.z))); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); gl_FragColor=vec4(uColor, a*uOpacity); }`,
    });
    this.wx = new THREE.Points(geo, mat);
    this.wx.frustumCulled = false;
    this.wxCount = N;
    this.scene.add(this.wx);
  }

  _syncWeather(world, dt) {
    const w = world.weather;
    const cfg = {
      snow: { fall: 24, size: 2.2, color: [1, 1, 1], op: 0.9, wind: 8 },
      rain: { fall: 240, size: 1.6, color: [0.7, 0.8, 0.95], op: 0.5, wind: 18 },
      storm: { fall: 320, size: 1.8, color: [0.8, 0.85, 1], op: 0.6, wind: 40 },
    }[w];
    const target = cfg ? cfg.op : 0;
    this.wxU.uOpacity.value = lerp(this.wxU.uOpacity.value, target, 1 - Math.pow(0.2, dt));
    if (!cfg) return;
    this.wxU.uSize.value = cfg.size;
    this.wxU.uColor.value.set(cfg.color[0], cfg.color[1], cfg.color[2]);
    const p = this.wx.geometry.attributes.position;
    for (let i = 0; i < this.wxCount; i++) {
      let y = p.getY(i) - cfg.fall * dt;
      let x = p.getX(i) + cfg.wind * dt;
      if (y < -20) { y = 320; }
      if (x > 350) x = -350;
      p.setY(i, y); p.setX(i, x);
    }
    p.needsUpdate = true;
    // storm lightning: briefly flash ambient/sun
    if (w === 'storm' && Math.random() < 0.02) this._flash = 1;
  }

  setPhase(phase) {
    const map = { dawn: 0.23, day: 0.5, dusk: 0.77, night: 0.0 };
    if (phase in map) this.live.dayT = map[phase];
  }
  get phase() {
    const t = this.live.dayT;
    if (t < 0.16 || t >= 0.88) return 'night';
    if (t < 0.34) return 'dawn';
    if (t < 0.72) return 'day';
    return 'dusk';
  }

  /* ---------------- per-frame ---------------- */
  sync(world, dt) {
    this.time += dt;
    const L = this.live;
    const k = 1 - Math.pow(0.1, dt);

    // day clock advances on its own
    L.dayT = (L.dayT + dt * 0.01 * (world.time.speed || 1)) % 1;
    const ang = L.dayT * Math.PI * 2 - Math.PI / 2;
    const sx = Math.cos(ang), sy = Math.sin(ang);
    const daylight = Math.max(0, sy), night = Math.max(0, -sy);

    // sky colors from palette-ish + time
    const [zen, mid, hor] = (world.sky || ['#12294a', '#5b86b8', '#efd9b0']);
    this.skyU.uZenith.value.copy(new THREE.Vector3().fromArray(hex(zen).toArray())).multiplyScalar(0.4 + daylight * 0.8);
    this.skyU.uMid.value.copy(new THREE.Vector3().fromArray(hex(mid).toArray())).multiplyScalar(0.4 + daylight * 0.8);
    const sunHue = night > 0.3 ? '#9fb4e0' : sy < 0.25 ? '#ffb27a' : '#fff2d6';
    this.skyU.uHorizon.value.copy(new THREE.Vector3().fromArray(hex(hor).toArray())).multiplyScalar(0.45 + daylight * 0.7);
    this.skyU.uSun.value.set(sx * 0.9, sy, -0.5).normalize();
    this.skyU.uSunCol.value.copy(new THREE.Vector3().fromArray(hex(sunHue).toArray()));
    this.skyU.uTime.value = this.time;
    this.skyU.uNight.value = night;

    // lights
    this.sun.position.set(sx * 400, Math.max(20, sy * 400), -200);
    this.sun.color.copy(hex(sunHue));
    this.sun.intensity = 0.45 + daylight * 1.4;
    this.hemi.intensity = 0.5 + daylight * 0.55;
    this.amb.intensity = 0.5 + world.mood * 0.2;

    // fog
    L.fog = lerp(L.fog, world.fog, k);
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(0x000000, 0.001);
    this.scene.fog.density = 0.001 + L.fog * 0.0019;
    // match fog to the horizon sky so the terrain's far edge dissolves seamlessly
    this.scene.fog.color.copy(hex(hor)).multiplyScalar(0.7 + daylight * 0.3);

    // water
    this.waterU.uTime.value = this.time;
    this.waterU.uColor.value.copy(new THREE.Vector3().fromArray(hex(world.palette[0]).toArray())).multiplyScalar(0.6 + daylight * 0.5);
    this.waterU.uSun.value.copy(this.skyU.uSun.value);
    this.waterU.uSunCol.value.copy(this.skyU.uSunCol.value);
    this.water.position.y = this.waterY;

    // weather particles + storm lightning
    this._syncWeather(world, dt);
    if (this._flash > 0) {
      this.amb.intensity += this._flash * 1.2;
      this.hemi.intensity += this._flash * 1.0;
      this.scene.fog.color.addScalar(this._flash * 0.3);
      this._flash = Math.max(0, this._flash - dt * 3);
    }

    // bloom
    this.bloom.strength = 0.35 + world.mood * 0.4 + night * 0.3;

    // low cinematic orbit that looks across the world toward a foggy horizon,
    // so the terrain's edges stay out of frame / lost in haze.
    const orbit = this.time * 0.028;
    const rad = 205;
    this.camera.position.set(Math.sin(orbit) * rad, 62 + Math.sin(this.time * 0.05) * 8, Math.cos(orbit) * rad);
    this.camera.lookAt(Math.sin(orbit) * 40, 42, Math.cos(orbit) * 40);

    this.composer.render();
  }
}

/* ---------------- world defaults + noise ---------------- */
export function defaultWorld() {
  return {
    biome: 'meadow', palette: ['#243a22', '#4f7a3a', '#cfe6a8'], sky: ['#123a6b', '#5f8fc4', '#f0d6a8'],
    sand: '#cbb98a', relief: 0.6, water: 0.26, snow: 0.7,
    weather: 'clear', time: { phase: 'day', speed: 1 }, fog: 0.5, mood: 0.7,
  };
}

function treeFoliage(type) {
  switch (type) {
    case 'broadleaf': return { geo: new THREE.IcosahedronGeometry(4.6, 0), lift: 3.5 };
    case 'palm': case 'tropical': return { geo: new THREE.ConeGeometry(4.5, 6, 7), lift: 3 };
    case 'cactus': return { geo: new THREE.CylinderGeometry(1.3, 1.6, 9, 6), lift: 2 };
    case 'dead': return { geo: new THREE.ConeGeometry(1.2, 5, 5), lift: 2 };
    case 'pine': default: return { geo: new THREE.ConeGeometry(3.6, 12, 6), lift: 4 };
  }
}

function hash2(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm2(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
function ridged(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * (1 - Math.abs(2 * vnoise(x * f, y * f) - 1)); f *= 2.05; a *= 0.5; } return s - 0.4; }

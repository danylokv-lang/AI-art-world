// LivingImage — makes a high-quality AI picture feel ALIVE and interactive:
//   • a gentle domain-warp "wiggle" so the whole painting breathes and undulates;
//   • depth-ish parallax that follows the mouse (and drifts on its own), so you
//     can "move" and peer into the scene;
//   • a soft cross-fade when a new frame arrives (evolution).
// A single full-screen quad with a fragment shader — robust and smooth.

import * as THREE from 'three';

export class LivingImage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.uniforms = {
      uTex: { value: null }, uPrev: { value: null }, uMix: { value: 1 },
      uTime: { value: 0 }, uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uCover: { value: new THREE.Vector2(1, 1) }, uCoverPrev: { value: new THREE.Vector2(1, 1) },
      uWiggle: { value: 0.016 }, uParallax: { value: 0.075 }, uHasImg: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex,uPrev; uniform float uTime,uMix,uWiggle,uParallax,uHasImg;
        uniform vec2 uMouse,uCover,uCoverPrev;
        float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=0.5;} return s; }
        vec2 cover(vec2 uv, vec2 c){ return (uv-0.5)*c+0.5; }
        vec3 pick(sampler2D tex, vec2 uv, vec2 c, vec2 mouse){
          vec2 p = cover(uv, c);
          // breathing zoom
          p = (p-0.5)*(1.0 - 0.02*sin(uTime*0.18)) + 0.5;
          // wiggle — flowing domain warp
          vec2 w = vec2(fbm(p*3.2 + uTime*0.06), fbm(p*3.2 + 11.0 - uTime*0.052));
          p += (w-0.5)*uWiggle;
          // depth-ish parallax: nearer at the bottom + in darker regions
          float lum = dot(texture2D(tex,p).rgb, vec3(0.299,0.587,0.114));
          float depth = clamp(mix(1.0-p.y, 1.0-lum, 0.3), 0.0, 1.0);
          p += (mouse-0.5) * uParallax * (0.25 + depth);
          return texture2D(tex, p).rgb;
        }
        void main(){
          if(uHasImg < 0.5){ gl_FragColor=vec4(0.02,0.03,0.05,1.0); return; }
          vec3 cur = pick(uTex, vUv, uCover, uMouse);
          vec3 col = cur;
          if(uMix < 0.999){ vec3 prev = pick(uPrev, vUv, uCoverPrev, uMouse); col = mix(prev, cur, uMix); }
          // subtle vignette
          float vig = smoothstep(1.15, 0.35, length(vUv-0.5));
          col *= mix(0.7, 1.0, vig);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.scene.add(this.quad);

    this.imgAspect = 1; this.prevAspect = 1;
    this.mouseTarget = new THREE.Vector2(0.5, 0.5);
    this.lastMouseMove = 0;
    this.time = 0; this._last = performance.now();

    addEventListener('resize', () => this._resize());
    addEventListener('pointermove', (e) => {
      this.mouseTarget.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight);
      this.lastMouseMove = this.time;
    });
    this._resize();
    requestAnimationFrame((t) => this._loop(t));
  }

  _resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this._recomputeCover();
  }
  _recomputeCover() {
    const As = innerWidth / innerHeight;
    const set = (aspect, u) => {
      let sx = 1, sy = 1;
      if (As > aspect) sy = aspect / As; else sx = As / aspect;
      u.value.set(sx, sy);
    };
    set(this.imgAspect, this.uniforms.uCover);
    set(this.prevAspect, this.uniforms.uCoverPrev);
  }

  setImage(dataUrl) {
    new THREE.TextureLoader().load(dataUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
      // shift current -> prev for a cross-fade
      if (this.uniforms.uTex.value) {
        this.uniforms.uPrev.value = this.uniforms.uTex.value;
        this.prevAspect = this.imgAspect;
        this.uniforms.uMix.value = 0;
      } else {
        this.uniforms.uMix.value = 1;
      }
      this.uniforms.uTex.value = tex;
      this.imgAspect = (tex.image?.width || 1) / (tex.image?.height || 1);
      this.uniforms.uHasImg.value = 1;
      this._recomputeCover();
    });
  }

  _loop(now) {
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now; this.time += dt;
    this.uniforms.uTime.value = this.time;

    // ease the crossfade in
    if (this.uniforms.uMix.value < 1) this.uniforms.uMix.value = Math.min(1, this.uniforms.uMix.value + dt / 1.6);

    // if the mouse is idle, drift the parallax on its own so it always lives
    if (this.time - this.lastMouseMove > 2.5) {
      this.mouseTarget.set(0.5 + Math.sin(this.time * 0.25) * 0.35, 0.5 + Math.cos(this.time * 0.19) * 0.3);
    }
    this.uniforms.uMouse.value.lerp(this.mouseTarget, 1 - Math.pow(0.08, dt));

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this._loop(t));
  }
}

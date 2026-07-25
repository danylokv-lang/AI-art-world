/**
 * Procedural pixel sprites.
 *
 * Every sprite in the product is drawn here in code, from rectangles, tinted
 * from the scene palette. No downloaded art. Three reasons that matters:
 *
 *  1. Coherence. A tree generated from the scene's own foliage ramp can never
 *     clash with the terrain behind it, which is exactly how asset packs betray
 *     a generated world.
 *  2. Variety. ~15 shape generators x seeded proportions x any palette covers
 *     "describe any world" far better than a fixed atlas of finished art.
 *  3. Licensing and weight. Nothing to attribute, nothing to ship.
 *
 * Everything is drawn with `fillRect` on integer coordinates only — a single
 * anti-aliased curve anywhere would break the pixel grid for the whole scene.
 */

import { Texture } from 'pixi.js';
import { createCanvas, ctx2d, textureFrom } from '../draw';
import type { Hex, Palette } from '../types';
import { mixHex, sampleRamp, shade } from '../palette';
import { randInt, randRange, type Rng } from '../rng';

type G = CanvasRenderingContext2D;

const px = (g: G, x: number, y: number, w: number, h: number, c: Hex): void => {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};

/** Build a texture from a draw callback sized w x h. */
function bake(w: number, h: number, draw: (g: G) => void): Texture {
  const canvas = createCanvas(w, h);
  const g = ctx2d(canvas);
  draw(g);
  return textureFrom(canvas);
}

export interface FoliageTones {
  dark: Hex;
  mid: Hex;
  light: Hex;
  trunk: Hex;
}

export function foliageTones(p: Palette): FoliageTones {
  return {
    dark: sampleRamp(p.foliage, 0),
    mid: sampleRamp(p.foliage, 0.5),
    light: sampleRamp(p.foliage, 1),
    trunk: mixHex(sampleRamp(p.near, 0.3), '#4a3222', 0.45),
  };
}

/* ------------------------------------------------------------------ trees */

export function pineTexture(rng: Rng, t: FoliageTones): Texture {
  const h = randInt(rng, 18, 30);
  const w = randInt(rng, 9, 15) | 1; // odd width keeps the trunk centred
  const tiers = randInt(rng, 3, 5);
  return bake(w, h, (g) => {
    const cx = (w - 1) / 2;
    const trunkH = Math.round(h * 0.22);
    px(g, cx - 0.5, h - trunkH, 2, trunkH, t.trunk);

    const canopyH = h - trunkH + 1;
    for (let i = 0; i < tiers; i++) {
      const top = Math.round((i / tiers) * canopyH * 0.9);
      const bottom = Math.round(((i + 1) / tiers) * canopyH);
      for (let y = top; y < bottom; y++) {
        const spread = ((y - top) / Math.max(1, bottom - top)) * 0.5 + 0.18;
        const half = Math.round(spread * w * (0.5 + i * 0.14));
        // Left face catches light, right face falls into shadow.
        px(g, cx - half, y, half + 1, 1, t.mid);
        px(g, cx, y, half + 1, 1, t.dark);
        if (y === top) px(g, cx - Math.max(1, half - 1), y, 1, 1, t.light);
      }
    }
  });
}

export function broadleafTexture(rng: Rng, t: FoliageTones): Texture {
  const h = randInt(rng, 16, 26);
  const w = randInt(rng, 14, 22) | 1;
  return bake(w, h, (g) => {
    const cx = (w - 1) / 2;
    const trunkH = Math.round(h * 0.35);
    px(g, cx - 0.5, h - trunkH, 2, trunkH, t.trunk);

    // Canopy as three overlapping blobs, so it never reads as a circle.
    const blobs = [
      { x: cx, y: h * 0.3, r: w * 0.34 },
      { x: cx - w * 0.22, y: h * 0.4, r: w * 0.26 },
      { x: cx + w * 0.2, y: h * 0.38, r: w * 0.28 },
    ];
    for (let y = 0; y < h - trunkH + 2; y++) {
      for (let x = 0; x < w; x++) {
        let inside = false;
        for (const b of blobs) {
          const dx = x - b.x;
          const dy = (y - b.y) * 1.25;
          if (dx * dx + dy * dy <= b.r * b.r) inside = true;
        }
        if (!inside) continue;
        const lit = y < h * 0.3 && x < cx;
        px(g, x, y, 1, 1, lit ? t.light : x > cx + 1 ? t.dark : t.mid);
      }
    }
  });
}

export function palmTexture(rng: Rng, t: FoliageTones): Texture {
  const h = randInt(rng, 22, 34);
  const w = randInt(rng, 17, 25) | 1;
  const lean = randRange(rng, -0.18, 0.18);
  return bake(w, h, (g) => {
    const cx = (w - 1) / 2;
    for (let y = 0; y < h; y++) {
      const x = cx + lean * (h - y);
      px(g, x, h - 1 - y, 2, 1, y > h * 0.7 ? shade(t.trunk, 0.15) : t.trunk);
    }
    const topX = cx + lean * h;
    const topY = 1;
    // Fronds: straight strokes that droop as they extend.
    for (let f = 0; f < 6; f++) {
      const dir = f < 3 ? -1 : 1;
      const len = randInt(rng, 5, Math.floor(w * 0.45));
      const droop = randRange(rng, 0.25, 0.75);
      for (let i = 0; i < len; i++) {
        px(g, topX + dir * i, topY + i * i * droop * 0.06 + (f % 3), 1, 1, i < len * 0.6 ? t.mid : t.dark);
      }
    }
    px(g, topX - 1, topY, 3, 2, t.light);
  });
}

export function cactusTexture(rng: Rng, t: FoliageTones): Texture {
  const h = randInt(rng, 12, 22);
  const w = randInt(rng, 7, 13) | 1;
  return bake(w, h, (g) => {
    const cx = (w - 1) / 2;
    px(g, cx - 1, 2, 3, h - 2, t.mid);
    px(g, cx - 1, 2, 1, h - 2, t.light);
    px(g, cx + 1, 2, 1, h - 2, t.dark);
    if (rng() < 0.75) {
      const ay = randInt(rng, 5, Math.max(6, h - 6));
      px(g, cx - 4, ay, 3, 2, t.mid);
      px(g, cx - 4, ay - 4, 2, 5, t.mid);
      px(g, cx - 4, ay - 4, 1, 5, t.light);
    }
    if (rng() < 0.6) {
      const ay = randInt(rng, 5, Math.max(6, h - 6));
      px(g, cx + 2, ay, 3, 2, t.dark);
      px(g, cx + 3, ay - 5, 2, 6, t.mid);
    }
  });
}

export function deadTreeTexture(rng: Rng, t: FoliageTones): Texture {
  const h = randInt(rng, 16, 26);
  const w = randInt(rng, 11, 17) | 1;
  const bark = shade(t.trunk, -0.15);
  return bake(w, h, (g) => {
    const cx = (w - 1) / 2;
    px(g, cx, h * 0.25, 2, h * 0.75, bark);
    for (let b = 0; b < 4; b++) {
      const y = h * (0.25 + b * 0.16);
      const dir = b % 2 === 0 ? -1 : 1;
      const len = randInt(rng, 3, Math.floor(w * 0.45));
      for (let i = 0; i < len; i++) px(g, cx + dir * i, y - i * 0.7, 1, 1, bark);
    }
  });
}

export function reedsTexture(rng: Rng, t: FoliageTones): Texture {
  const h = randInt(rng, 8, 15);
  const w = randInt(rng, 7, 12);
  return bake(w, h, (g) => {
    for (let i = 0; i < w; i += 2) {
      const bh = randInt(rng, Math.floor(h * 0.5), h);
      const lean = randInt(rng, -1, 1);
      for (let y = 0; y < bh; y++) {
        px(g, i + (y > bh * 0.6 ? lean : 0), h - 1 - y, 1, 1, y > bh * 0.75 ? t.light : t.mid);
      }
    }
  });
}

/* ------------------------------------------------------------------ props */

export function rockTexture(rng: Rng, p: Palette, ramp: 'mid' | 'near'): Texture {
  const w = randInt(rng, 5, 14);
  const h = randInt(rng, 3, Math.max(4, Math.floor(w * 0.7)));
  const body = sampleRamp(p[ramp], 0.35);
  const lit = sampleRamp(p[ramp], 0.85);
  const dark = shade(sampleRamp(p[ramp], 0.15), -0.25);
  return bake(w, h, (g) => {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const inset = Math.round((1 - Math.sin((1 - t) * Math.PI * 0.5)) * w * 0.35);
      px(g, inset, y, w - inset * 2, 1, y < 1 ? lit : y > h - 2 ? dark : body);
    }
  });
}

export function grassTexture(rng: Rng, t: FoliageTones): Texture {
  const w = randInt(rng, 4, 9);
  const h = randInt(rng, 3, 6);
  return bake(w, h, (g) => {
    for (let i = 0; i < w; i += 1) {
      if (rng() < 0.4) continue;
      const bh = randInt(rng, 1, h);
      px(g, i, h - bh, 1, bh, rng() < 0.4 ? t.light : t.mid);
    }
  });
}

/* --------------------------------------------------------------- entities */

/** Birds are three frames of a two-pixel-thick "m" — the classic. */
export function birdFrames(color: Hex): Texture[] {
  const shapes = [
    [[0, 1], [1, 0], [2, 0], [3, 1], [4, 2], [5, 1], [6, 0], [7, 0], [8, 1]],
    [[0, 2], [1, 1], [2, 1], [3, 2], [4, 2], [5, 2], [6, 1], [7, 1], [8, 2]],
    [[0, 0], [1, 1], [2, 2], [3, 2], [4, 3], [5, 2], [6, 2], [7, 1], [8, 0]],
  ];
  return shapes.map((pts) =>
    bake(9, 4, (g) => {
      for (const [x, y] of pts) px(g, x, y, 1, 1, color);
    }),
  );
}

export function boatTexture(rng: Rng, p: Palette): Texture {
  const w = randInt(rng, 14, 22);
  const h = 12;
  const hull = shade(sampleRamp(p.near, 0.3), -0.1);
  const sail = mixHex(p.light, '#ffffff', 0.35);
  const mast = shade(hull, -0.3);
  return bake(w, h, (g) => {
    // Hull: a trapezoid, narrower at the waterline.
    px(g, 1, h - 3, w - 2, 2, hull);
    px(g, 2, h - 4, w - 4, 1, hull);
    px(g, 1, h - 3, w - 2, 1, mixHex(hull, sail, 0.25));
    const mx = Math.floor(w * 0.42);
    px(g, mx, 1, 1, h - 5, mast);
    for (let y = 2; y < h - 5; y++) {
      const sw = Math.round(((y - 1) / (h - 6)) * (w * 0.34));
      px(g, mx + 1, y, Math.max(1, sw), 1, y % 4 === 0 ? shade(sail, -0.12) : sail);
    }
  });
}

export function walkerFrames(p: Palette): Texture[] {
  const body = shade(sampleRamp(p.near, 0.2), -0.35);
  const head = mixHex(body, p.light, 0.2);
  const legs: Array<[number, number][]> = [
    [[1, 5], [1, 6], [3, 5], [3, 6]],
    [[2, 5], [2, 6], [2, 5], [2, 6]],
  ];
  return legs.map((pair) =>
    bake(5, 7, (g) => {
      px(g, 1, 0, 3, 2, head);
      px(g, 1, 2, 3, 3, body);
      for (const [x, y] of pair) px(g, x, y, 1, 1, body);
    }),
  );
}

export function fishTexture(p: Palette): Texture {
  const body = mixHex(sampleRamp(p.water, 1), p.accent, 0.35);
  return bake(7, 4, (g) => {
    px(g, 2, 1, 4, 2, body);
    px(g, 1, 1, 1, 2, body);
    px(g, 0, 0, 1, 4, shade(body, -0.2));
    px(g, 3, 1, 1, 1, mixHex(body, '#ffffff', 0.4));
  });
}

export function critterFrames(p: Palette): Texture[] {
  const body = shade(sampleRamp(p.near, 0.25), -0.2);
  return [0, 1].map((f) =>
    bake(6, 4, (g) => {
      px(g, 1, 1, 4, 2, body);
      px(g, 4, 0, 2, 2, body);
      px(g, 0, 1 + f, 1, 1, body);
      px(g, 1, 3, 1, 1, body);
      px(g, 4, 3 - f, 1, 1, body);
    }),
  );
}

export function balloonTexture(rng: Rng, p: Palette): Texture {
  const w = 11;
  const h = 17;
  const shell = mixHex(p.accent, p.light, randRange(rng, 0.1, 0.5));
  return bake(w, h, (g) => {
    for (let y = 0; y < 11; y++) {
      const t = y / 10;
      const half = Math.round(Math.sin((1 - Math.abs(t - 0.35) * 1.4) * Math.PI * 0.5) * 5);
      if (half <= 0) continue;
      px(g, 5 - half, y, half * 2 + 1, 1, y < 3 ? mixHex(shell, '#ffffff', 0.3) : shell);
      px(g, 5 + half - 1, y, 1, 1, shade(shell, -0.25));
    }
    px(g, 4, 12, 1, 2, shade(shell, -0.4));
    px(g, 6, 12, 1, 2, shade(shell, -0.4));
    px(g, 3, 14, 5, 3, shade(sampleRamp(p.near, 0.2), -0.2));
  });
}

export function lanternTexture(p: Palette): Texture {
  const glowC = mixHex(p.accent, p.light, 0.35);
  return bake(5, 8, (g) => {
    px(g, 2, 0, 1, 2, shade(glowC, -0.5));
    px(g, 1, 2, 3, 4, glowC);
    px(g, 1, 2, 1, 4, mixHex(glowC, '#ffffff', 0.4));
    px(g, 1, 6, 3, 1, shade(glowC, -0.4));
  });
}

/* ------------------------------------------------------------- structures */

export function hutTexture(rng: Rng, p: Palette, lit: boolean): Texture {
  const w = randInt(rng, 11, 18);
  const h = randInt(rng, 10, 15);
  const wall = sampleRamp(p.near, 0.4);
  const roof = shade(sampleRamp(p.mid, 0.3), -0.2);
  const glowC = mixHex(p.light, '#ffcf8a', 0.5);
  return bake(w, h, (g) => {
    px(g, 1, h * 0.45, w - 2, h * 0.55, wall);
    for (let y = 0; y < h * 0.5; y++) {
      const half = Math.round((y / (h * 0.5)) * (w / 2));
      px(g, w / 2 - half, y, half * 2, 1, roof);
    }
    if (lit) px(g, w / 2 - 1, h * 0.62, 2, 2, glowC);
  });
}

export function towerTexture(rng: Rng, p: Palette, lit: boolean): Texture {
  const w = randInt(rng, 9, 14) | 1;
  const h = randInt(rng, 26, 46);
  const wall = sampleRamp(p.near, 0.45);
  const dark = shade(wall, -0.3);
  const glowC = mixHex(p.light, '#ffcf8a', 0.45);
  return bake(w, h, (g) => {
    px(g, 1, 3, w - 2, h - 3, wall);
    px(g, w - 3, 3, 2, h - 3, dark);
    px(g, 0, 2, w, 3, dark);
    for (let y = 8; y < h - 3; y += 7) {
      px(g, Math.floor(w / 2) - 1, y, 2, 3, lit ? glowC : shade(wall, -0.45));
    }
  });
}

/**
 * The lighthouse gets its own generator rather than a tower variant: the
 * rotating lamp is the whole reason the coastal scene works, and it needs a
 * known lamp position for the beam to originate from.
 */
export function lighthouseTexture(p: Palette): { texture: Texture; lampX: number; lampY: number } {
  const w = 15;
  const h = 52;
  const wall = mixHex(sampleRamp(p.near, 0.75), '#f2ece0', 0.35);
  const band = mixHex(p.accent, '#c4402f', 0.55);
  const dark = shade(wall, -0.35);
  const lamp = mixHex(p.accent, '#ffffff', 0.5);
  const texture = bake(w, h, (g) => {
    for (let y = 12; y < h; y++) {
      const t = (y - 12) / (h - 12);
      const half = Math.round(3 + t * 3.5);
      px(g, 7 - half, y, half * 2 + 1, 1, Math.floor((y - 12) / 9) % 2 === 0 ? wall : band);
      px(g, 7 + half - 1, y, 2, 1, dark);
    }
    px(g, 3, 9, 9, 3, dark); // gallery
    px(g, 5, 3, 5, 6, lamp); // lamp room
    px(g, 4, 1, 7, 2, dark); // cap
  });
  return { texture, lampX: 7, lampY: 6 };
}

export function ruinTexture(rng: Rng, p: Palette): Texture {
  const w = randInt(rng, 10, 20);
  const h = randInt(rng, 8, 20);
  const stone = sampleRamp(p.near, 0.5);
  const lit = sampleRamp(p.near, 0.9);
  const dark = shade(stone, -0.3);
  return bake(w, h, (g) => {
    // Broken columns of varying height — a ruin is defined by what is missing.
    let x = 0;
    while (x < w) {
      const cw = randInt(rng, 2, 4);
      const ch = randInt(rng, Math.floor(h * 0.3), h);
      if (rng() > 0.25) {
        px(g, x, h - ch, cw, ch, stone);
        px(g, x, h - ch, 1, ch, lit);
        px(g, x + cw - 1, h - ch, 1, ch, dark);
      }
      x += cw + randInt(rng, 1, 3);
    }
    px(g, 0, h - 2, w, 2, dark);
  });
}

export function shrineTexture(rng: Rng, p: Palette): Texture {
  const w = 19;
  const h = 20;
  const post = mixHex(p.accent, '#8a2f2f', 0.5);
  const glowC = mixHex(p.accent, p.light, 0.4);
  return bake(w, h, (g) => {
    px(g, 0, 3, w, 2, post);
    px(g, 2, 6, w - 4, 1, post);
    px(g, 3, 4, 3, h - 4, post);
    px(g, w - 6, 4, 3, h - 4, post);
    px(g, 1, 2, w - 2, 1, shade(post, -0.3));
    if (rng() < 0.9) px(g, w / 2 - 1, 9, 2, 2, glowC);
  });
}

export function windmillTexture(rng: Rng, p: Palette): { body: Texture; blades: Texture } {
  const wall = sampleRamp(p.near, 0.6);
  const dark = shade(wall, -0.3);
  const body = bake(13, 26, (g) => {
    for (let y = 4; y < 26; y++) {
      const half = Math.round(2.5 + ((y - 4) / 22) * 3);
      px(g, 6 - half, y, half * 2 + 1, 1, wall);
      px(g, 6 + half - 1, y, 2, 1, dark);
    }
    px(g, 3, 1, 7, 4, dark);
  });
  const blades = bake(25, 25, (g) => {
    px(g, 12, 1, 1, 23, wall);
    px(g, 1, 12, 23, 1, wall);
    px(g, 11, 2, 3, 8, dark);
    px(g, 11, 15, 3, 8, dark);
    px(g, 2, 11, 8, 3, dark);
    px(g, 15, 11, 8, 3, dark);
  });
  void rng;
  return { body, blades };
}

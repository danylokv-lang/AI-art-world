/**
 * Shared engine constants.
 *
 * CAMERA_MARGIN is load-bearing: every baked texture that must survive camera
 * motion is built this much wider than the viewport on each side, and the
 * camera is clamped inside it. Get this wrong and the parallax reveals the edge
 * of the world, which is the least forgiving bug in a 2D scene.
 */
export const CAMERA_MARGIN = 40;

/** Particle budget per weather layer, before intensity scaling. */
export const MAX_PARTICLES = 420;

/** Cap for reduced-motion / low-power mode. */
export const MAX_PARTICLES_REDUCED = 90;

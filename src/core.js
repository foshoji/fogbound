'use strict';
/* Core: constants, small maths, and the noise that JS (collisions) and the shader (drawing) share.
   Everything that decides where the coast is must give the same answer on both sides. */

const W = 16384, WC = W / 2, TAU = Math.PI * 2;
const MS_TO_KN = 1.94384, M_TO_NM = 1 / 1852;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const nextTick = () => new Promise(r => setTimeout(r, 0));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const bearingDeg = (dx, dy) => (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
const fmtBearing = deg => String(Math.round(deg) % 360).padStart(3, '0') + '°';
const fmtNm = m => { const nm = m * M_TO_NM; return nm < 0.95 ? `${Math.round(m / 10) * 10} m` : `${nm.toFixed(nm < 10 ? 1 : 0)} nm`; };

function h01(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 0xffffff) / 16777215;
}
function rng32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* A 256² tile of random bytes, four channels. The shader samples it with linear filtering at
   smoothstepped coordinates, which is value noise in one fetch; vn() below is the same sum. */
const NZ = 256, NOISE = new Uint8Array(NZ * NZ * 4);
for (let y = 0; y < NZ; y++) for (let x = 0; x < NZ; x++) for (let c = 0; c < 4; c++) NOISE[(y * NZ + x) * 4 + c] = Math.floor(h01(x + c * 1013, y + c * 7919) * 255.999);
function vn(x, y, c) {
  c = c | 0;
  const fx0 = Math.floor(x), fy0 = Math.floor(y);
  let fx = x - fx0, fy = y - fy0;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = fx0 & 255, y0 = fy0 & 255, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
  const a = NOISE[(y0 * NZ + x0) * 4 + c], b = NOISE[(y0 * NZ + x1) * 4 + c], d = NOISE[(y1 * NZ + x0) * 4 + c], e = NOISE[(y1 * NZ + x1) * 4 + c];
  return ((a + (b - a) * fx) * (1 - fy) + (d + (e - d) * fx) * fy) / 127.5 - 1;
}
const cellRand = (cx, cy, c) => NOISE[((cy & 255) * NZ + (cx & 255)) * 4 + (c | 0)] / 255;

/* The coast, in two parts. The terrain texture stores a smooth signed distance to the coast
   (sd, metres, positive at sea). coastDisp() pushes that distance around with fractal noise:
   gently in sheltered bays (e ≈ 0), hard and ragged on exposed shores (e ≈ 1), with gullies
   and offshore skerries. profileH() turns the displaced distance into a height: beaches or cliffs
   near the waterline, blending into the far-field height F (hills inland, seabed offshore). */
// Octaves alternate between the grid and a rotated grid so value noise's lattice doesn't show.
function coastDisp(x, y, e, sd) {
  const wx = x + 22 * vn(x / 85, y / 85, 1), wy = y + 22 * vn(x / 85 + 31.3, y / 85 + 17.7, 1);
  const rx = 0.8 * wx - 0.6 * wy, ry = 0.6 * wx + 0.8 * wy, px = 0.8 * x - 0.6 * y, py = 0.6 * x + 0.8 * y;
  const n = 0.55 * vn(wx / 70, wy / 70, 0) + 0.27 * vn(rx / 34 + 5.1, ry / 34, 0) + 0.14 * vn(wx / 16, wy / 16 + 9.3, 0)
    + 0.07 * vn(rx / 7.5 + 3.7, ry / 7.5, 0) + 0.035 * vn(wx / 3.5, wy / 3.5 + 1.9, 0);
  let d = n * (2.5 + 13 * e);
  const cr = 1 - Math.abs(vn(rx / 26 + 7.7, ry / 26, 2));
  d += e * cr * cr * cr * cr * cr * cr * 14 * (1 - sstep(25, 70, -sd));
  d -= e * sstep(0.35, 0.6, e) * sstep(0.55, 0.8, vn(px / 13 + 50.5, py / 13, 3)) * 70 * (1 - sstep(10, 90, sd)) * sstep(-5, 10, sd);
  return d;
}
function profileH(d, F, e) {
  let P;
  if (d < 0) { const u = -d; P = lerp(0.055 * u, 5.5 * (1 - Math.exp(-u / 3.5)) + 0.12 * u, e); }
  else P = -lerp(0.022 * d + 0.03, 9 * (1 - Math.exp(-d / 5)) + 0.07 * d, e);
  return lerp(P, F, sstep(18, 140, Math.abs(d)));
}

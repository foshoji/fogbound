'use strict';
/* Terrain: coastline polygons → the fields everything else reads.

   TT (R² × 4 floats, 8 m texels), mirrored to the GPU as one RGBA16F texture:
     sd  signed distance to the coast (m, positive at sea), before fractal detail
     F   far-field height (m): hills inland, seabed offshore
     e   exposure 0..1: sheltered bays (sand, calm water) → exposed shores (rock, surf)
     rem remoteness 0..1: distance from Olvenholt's coast; drives depth, fog and visibility
   Near the waterline the shader and hDatum() add the same fractal detail (core.js). */

const R = 2048, TEX = W / R;
const LR = 512, LTEX = W / LR;
let TT = null, EXPO = null, REMO = null, SHELTER = null;
let rings = [];
const ts = { sd: 0, F: 0, e: 0, r: 0 };

function tsample(x, y) {
  const gx = clamp(x / TEX - 0.5, 0, R - 1.001), gy = clamp(y / TEX - 0.5, 0, R - 1.001);
  const ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, i = (iy * R + ix) * 4, j = i + R * 4;
  const a = (1 - fx) * (1 - fy), b = fx * (1 - fy), c = (1 - fx) * fy, d = fx * fy;
  ts.sd = TT[i] * a + TT[i + 4] * b + TT[j] * c + TT[j + 4] * d;
  ts.F = TT[i + 1] * a + TT[i + 5] * b + TT[j + 1] * c + TT[j + 5] * d;
  ts.e = TT[i + 2] * a + TT[i + 6] * b + TT[j + 2] * c + TT[j + 6] * d;
  ts.r = TT[i + 3] * a + TT[i + 7] * b + TT[j + 3] * c + TT[j + 7] * d;
  return ts;
}
function coastD(x, y) { tsample(x, y); let d = ts.sd; if (Math.abs(d) < 260) d += coastDisp(x, y, ts.e, ts.sd); return d; }
function hDatum(x, y) { tsample(x, y); let d = ts.sd; if (Math.abs(d) < 260) d += coastDisp(x, y, ts.e, ts.sd); return profileH(d, ts.F, ts.e); }
const heightAt = (x, y) => hDatum(x, y) - tide.level;
const remAt = (x, y) => tsample(x, y).r;
const expoAt = (x, y) => tsample(x, y).e;
function lsamp(a, x, y) {
  const gx = clamp(x / LTEX - 0.5, 0, LR - 1.001), gy = clamp(y / LTEX - 0.5, 0, LR - 1.001);
  const ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, i = iy * LR + ix;
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + LR] * (1 - fx) + a[i + LR + 1] * fx) * fy;
}

/* ---------- distance transforms, blurs ---------- */
function edt1d(f, d, v, z, n) {
  let k = 0; v[0] = 0; z[0] = -1e30; z[1] = 1e30;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e30;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const dq = q - v[k]; d[q] = dq * dq + f[v[k]]; }
}
async function edt(grid, n, prog) {
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = grid[y * n + x];
    edt1d(f, d, v, z, n);
    for (let y = 0; y < n; y++) grid[y * n + x] = d[y];
    if (prog && (x & 255) === 255) { prog(x / n * 0.5); await nextTick(); }
  }
  for (let y = 0; y < n; y++) {
    const o = y * n;
    for (let x = 0; x < n; x++) f[x] = grid[o + x];
    edt1d(f, d, v, z, n);
    for (let x = 0; x < n; x++) grid[o + x] = d[x];
    if (prog && (y & 255) === 255) { prog(0.5 + y / n * 0.5); await nextTick(); }
  }
}
function boxBlur(a, n, r, passes, stride, off) {
  stride = stride || 1; off = off || 0;
  const t = new Float32Array(n * n), inv = 1 / (2 * r + 1);
  const get = (k) => a[k * stride + off];
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < n; j++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += get(j * n + clamp(k, 0, n - 1));
      for (let i = 0; i < n; i++) { t[j * n + i] = acc * inv; acc += get(j * n + Math.min(n - 1, i + r + 1)) - get(j * n + Math.max(0, i - r)); }
    }
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += t[clamp(k, 0, n - 1) * n + i];
      for (let j = 0; j < n; j++) { a[(j * n + i) * stride + off] = acc * inv; acc += t[Math.min(n - 1, j + r + 1) * n + i] - t[Math.max(0, j - r) * n + i]; }
    }
  }
}

/* ---------- polygons ---------- */
function parseCoast() {
  return [...COAST, ...extraRings()].map(c => {
    const pts = c.pts.split(' ').map(p => p.split(',').map(Number));
    return { ...c, pts };
  });
}
function ringPath(pts) { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); return p; }
function rasterRings(list, n, style) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.setTransform(n / W, 0, 0, n / W, 0, 0);
  for (const r of list) { g.fillStyle = style(r); g.fill(ringPath(r.pts)); }
  const d = g.getImageData(0, 0, n, n).data; c.width = 1;
  return d;
}
/* Midpoint displacement: split every edge longer than 22 m, nudging the new point sideways by a
   random share of the edge length, more on exposed shores. Six passes turn the survey's
   100 m chords into a coast that has coves and knuckles before the shader adds its own. */
function refine(pts, rnd) {
  let out = pts;
  for (let pass = 0; pass < 6; pass++) {
    const nx = []; let any = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length]; nx.push(a);
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L > 22) {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, e = lsamp(EXPO, mx, my);
        const k = L * (0.07 + 0.15 * e) * (rnd() * 2 - 1);
        nx.push([mx - dy / L * k, my + dx / L * k]); any = true;
      }
    }
    out = nx; if (!any) break;
  }
  return out;
}

/* ---------- the build ---------- */
async function buildTerrain(prog) {
  rings = parseCoast();
  // broad fields at 32 m: land cover, shelter, remoteness, exposure
  const NL = LR * LR;
  const landLo = rasterRings(rings, LR, () => '#fff'), mainLo = rasterRings(rings.filter(r => r.main), LR, () => '#fff');
  const cover = new Float32Array(NL), dMain = new Float32Array(NL);
  for (let i = 0; i < NL; i++) { cover[i] = landLo[i * 4 + 3] / 255; dMain[i] = mainLo[i * 4 + 3] >= 128 ? 0 : 1e20; }
  await edt(dMain, LR);
  const S1 = cover.slice(), S2 = cover.slice();
  boxBlur(S1, LR, 8, 2); boxBlur(S2, LR, 26, 2);
  EXPO = new Float32Array(NL); REMO = new Float32Array(NL); SHELTER = new Float32Array(NL);
  for (let y = 0; y < LR; y++) for (let x = 0; x < LR; x++) {
    const i = y * LR + x, wx = (x + 0.5) * LTEX, wy = (y + 0.5) * LTEX;
    const S = 0.5 * S1[i] + 0.5 * S2[i];
    // bays and lagoons are homely wherever they are: shallower, calmer, clearer
    const rem = Math.max(sstep(900, 5200, Math.sqrt(dMain[i]) * LTEX) * (1 - 0.75 * sstep(0.5, 0.75, S)), sstep(6200, 7700, Math.hypot(wx - WC, wy - WC)));
    REMO[i] = rem; SHELTER[i] = S;
    EXPO[i] = clamp(1 - sstep(0.4, 0.64, S) + 0.3 * vn(wx / 800, wy / 800, 3) + 0.2 * rem, 0, 1);
  }
  prog(0.03); await nextTick();

  // fractal coast, then the fine raster
  const rnd = rng32(1789);
  for (const r of rings) r.pts = refine(r.pts, rnd);
  for (const r of rings) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } r.box = [x0, y0, x1, y1]; }
  const img = rasterRings(rings, R, r => `rgb(${Math.min(255, Math.round(r.peak / 2))},0,0)`);
  prog(0.06); await nextTick();
  const N = R * R, INF = 1e20, dOut = new Float32Array(N), dIn = new Float32Array(N);
  for (let i = 0; i < N; i++) { const land = img[i * 4 + 3] >= 128; dOut[i] = land ? 0 : INF; dIn[i] = land ? INF : 0; }
  await edt(dOut, R, p => prog(0.06 + p * 0.22));
  await edt(dIn, R, p => prog(0.28 + p * 0.22));

  TT = new Float32Array(N * 4);
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const i = y * R + x, a = img[i * 4 + 3] / 255;
      let sdt = a >= 0.5 ? -(Math.sqrt(dIn[i]) - 0.5) : Math.sqrt(dOut[i]) - 0.5;
      if (a > 0.02 && a < 0.98) sdt = 0.5 - a;
      const sd = sdt * TEX, wx = (x + 0.5) * TEX, wy = (y + 0.5) * TEX;
      const e = lsamp(EXPO, wx, wy), rem = lsamp(REMO, wx, wy);
      let F;
      if (sd < 0) {
        const u = -sd, pk = img[i * 4] * 2;
        const ridge = 1 - Math.abs(vn(wx / 900, wy / 900, 2)), roll = vn(wx / 380 + 3.3, wy / 380, 0) * 0.5 + 0.5;
        const gorge = sstep(0.82, 0.97, 1 - Math.abs(vn(wx / 520 + 11.1, wy / 520, 1))) * sstep(150, 500, u);
        F = 2 + Math.min(u, 60) * 0.05 + pk * (1 - Math.exp(-Math.pow(u / 380, 1.5))) * (0.5 + 0.45 * ridge * ridge + 0.3 * roll) * (1 - 0.35 * gorge);
      } else {
        const b = sstep(0.5, 0.72, lsamp(SHELTER, wx, wy));
        const shelf = 3 + lerp(30, 8, b) * (1 - Math.exp(-sd / lerp(420, 240, b)));
        const deep = 205 * rem * (1 - Math.exp(-sd / 700));
        F = -(shelf + deep) * (1 + 0.14 * vn(wx / 480, wy / 480, 1));
        const bank = Math.max(0, vn(wx / 650 + 9.1, wy / 650, 2) - 0.38) * 70 * (1 - rem) * sstep(120, 400, sd);
        F = Math.min(F + bank, -0.5);
      }
      const o = i * 4; TT[o] = sd; TT[o + 1] = F; TT[o + 2] = e; TT[o + 3] = rem;
    }
    if ((y & 127) === 127) { prog(0.5 + y / R * 0.14); await nextTick(); }
  }
  boxBlur(TT, R, 2, 2, 4, 1);
  // round off the ridges a distance field leaves along the middle of the land
  const Fb = new Float32Array(N); for (let i = 0; i < N; i++) Fb[i] = TT[i * 4 + 1];
  boxBlur(Fb, R, 7, 2);
  for (let i = 0; i < N; i++) { const u = -TT[i * 4]; if (u > 60) TT[i * 4 + 1] = lerp(TT[i * 4 + 1], Math.max(Fb[i], 3), sstep(60, 320, u)); }
  prog(0.66); await nextTick();
  applySeabed();
  prog(0.7); await nextTick();
}

/* Seabed features and reefs, straight into F. */
function stampF(x, y, rad, fn) {
  const x0 = Math.max(0, Math.floor((x - rad) / TEX)), x1 = Math.min(R - 1, Math.ceil((x + rad) / TEX));
  const y0 = Math.max(0, Math.floor((y - rad) / TEX)), y1 = Math.min(R - 1, Math.ceil((y + rad) / TEX));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const o = (j * R + i) * 4; if (TT[o] < 0) continue;
    TT[o + 1] = fn((i + 0.5) * TEX, (j + 0.5) * TEX, TT[o + 1]);
  }
}
function applySeabed() {
  for (const s of SEABED) {
    if (s.kind === 'ring') stampF(s.x, s.y, s.r + s.w * 3, (x, y, F) => F + s.amp * Math.exp(-(((Math.hypot(x - s.x, y - s.y) - s.r) / s.w) ** 2)));
    else if (s.kind === 'stones') { for (let k = 0; k < s.n; k++) { const a = k / s.n * TAU, px = s.x + Math.cos(a) * s.r, py = s.y + Math.sin(a) * s.r; stampF(px, py, s.size * 3, (x, y, F) => F + s.amp * Math.exp(-((Math.hypot(x - px, y - py) / s.size) ** 2))); } }
    else if (s.kind === 'spiral') {
      for (let k = 1; k <= s.n; k++) { const a = k * 2.39996, rr = s.c * Math.sqrt(k), px = s.x + Math.cos(a) * rr, py = s.y + Math.sin(a) * rr; stampF(px, py, s.size * 3, (x, y, F) => F + s.amp * Math.exp(-((Math.hypot(x - px, y - py) / s.size) ** 2))); }
    } else if (s.kind === 'wreck') {
      const c = Math.cos(s.h), sn = Math.sin(s.h);
      stampF(s.x, s.y, s.len, (x, y, F) => { const dx = x - s.x, dy = y - s.y, u = (dx * c + dy * sn) / (s.len / 2), v = (-dx * sn + dy * c) / (s.len * 0.16); const q = u * u * (u > 0 ? 1.6 : 1) + v * v; return F + s.amp * Math.max(0, 1 - q); });
    } else if (s.kind === 'road') {
      for (let k = 1; k < s.pts.length; k++) {
        const [ax, ay] = s.pts[k - 1], [bx, by] = s.pts[k], L = Math.hypot(bx - ax, by - ay);
        for (let t = 0; t <= L; t += s.w) { const px = ax + (bx - ax) * t / L, py = ay + (by - ay) * t / L; stampF(px, py, s.w * 1.6, (x, y, F) => { const m = Math.exp(-((Math.hypot(x - px, y - py) / s.w) ** 4)); return lerp(F, Math.max(F, s.top), m); }); }
      }
    } else if (s.kind === 'reef') {
      stampF(s.x, s.y, s.r * 2.2, (x, y, F) => { const d = Math.hypot(x - s.x, y - s.y) / s.r + 0.35 * vn(x / 14, y / 14, 2); return Math.max(F, s.top - Math.max(0, d) ** 2 * 7); });
    }
  }
}

/* ---------- tidal streams: potential flow around the land (256², 64 m cells) ---------- */
const CG = 256, CS = W / CG;
let CU = null, CV = null;
async function buildCurrents(prog) {
  const n = CG * CG, T = new Float32Array(n), phi = new Float32Array(n), fixed = new Uint8Array(n);
  const dir = [0.8, -0.6];
  for (let j = 0; j < CG; j++) for (let i = 0; i < CG; i++) {
    const k = j * CG + i; tsample((i + 0.5) * CS, (j + 0.5) * CS);
    T[k] = ts.sd > 6 ? clamp(-ts.F, 0.5, 30) : 0;
    phi[k] = -(i * dir[0] + j * dir[1]);
    if ((i === 0 || j === 0 || i === CG - 1 || j === CG - 1) && T[k] > 0) fixed[k] = 1;
  }
  for (let it = 0; it < 900; it++) {
    for (let j = 1; j < CG - 1; j++) for (let i = 1; i < CG - 1; i++) {
      const k = j * CG + i, t = T[k]; if (!t || fixed[k]) continue;
      let num = 0, den = 0, tn;
      tn = T[k - 1]; if (tn) { const w = t + tn; num += w * phi[k - 1]; den += w; }
      tn = T[k + 1]; if (tn) { const w = t + tn; num += w * phi[k + 1]; den += w; }
      tn = T[k - CG]; if (tn) { const w = t + tn; num += w * phi[k - CG]; den += w; }
      tn = T[k + CG]; if (tn) { const w = t + tn; num += w * phi[k + CG]; den += w; }
      if (den > 0) phi[k] += 1.92 * (num / den - phi[k]);
    }
    if (it % 90 === 89) { prog(it / 900); await nextTick(); }
  }
  CU = new Float32Array(n); CV = new Float32Array(n);
  const mags = [];
  for (let j = 1; j < CG - 1; j++) for (let i = 1; i < CG - 1; i++) {
    const k = j * CG + i; if (!T[k]) continue;
    const L = T[k - 1] > 0, Rr = T[k + 1] > 0, U = T[k - CG] > 0, D = T[k + CG] > 0;
    const gx = L && Rr ? (phi[k + 1] - phi[k - 1]) / 2 : Rr ? phi[k + 1] - phi[k] : L ? phi[k] - phi[k - 1] : 0;
    const gy = U && D ? (phi[k + CG] - phi[k - CG]) / 2 : D ? phi[k + CG] - phi[k] : U ? phi[k] - phi[k - CG] : 0;
    const shallow = sstep(0.4, 3, T[k]);
    CU[k] = -gx * shallow; CV[k] = -gy * shallow; mags.push(Math.hypot(CU[k], CV[k]));
  }
  mags.sort((a, b) => a - b);
  const p98 = mags[Math.floor(mags.length * 0.98)] || 1, k = 1.7 / p98;
  for (let i = 0; i < n; i++) { let u = CU[i] * k, v = CV[i] * k; const m = Math.hypot(u, v); if (m > 4.2) { u *= 4.2 / m; v *= 4.2 / m; } CU[i] = u; CV[i] = v; }
  boxBlur(CU, CG, 1, 1); boxBlur(CV, CG, 1, 1);
}
function currentBase(x, y) {
  const gx = clamp(x / CS - 0.5, 0, CG - 1.001), gy = clamp(y / CS - 0.5, 0, CG - 1.001), ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, i = iy * CG + ix;
  const s = a => (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + CG] * (1 - fx) + a[i + CG + 1] * fx) * fy;
  return [s(CU), s(CV)];
}
const currentAt = (x, y) => { const c = currentBase(x, y); return [c[0] * tide.stream, c[1] * tide.stream]; };

/* ---------- the land's broad height for the overview and the settlement mask ---------- */
function peakOf(ringId) {
  let best = null, bh = -1;
  for (const r of rings) if (r.id === ringId) {
    const [x0, y0, x1, y1] = r.box;
    for (let y = y0; y < y1; y += 24) for (let x = x0; x < x1; x += 24) { const h = hDatum(x, y); if (h > bh) { bh = h; best = [x, y]; } }
  }
  return best ? { x: best[0], y: best[1], h: bh } : null;
}

/* ---------- placement helpers ---------- */
function gradD(x, y, e) { e = e || 6; return [(coastD(x + e, y) - coastD(x - e, y)) / (2 * e), (coastD(x, y + e) - coastD(x, y - e)) / (2 * e)]; }
// Walk downhill until the water is at least minD deep (at mid tide).
function settle(p, minD) {
  for (let k = 0; k < 200; k++) {
    const h = hDatum(p.x, p.y); if (h < -minD) return true;
    const e = 5, gx = hDatum(p.x + e, p.y) - hDatum(p.x - e, p.y), gy = hDatum(p.x, p.y + e) - hDatum(p.x, p.y - e);
    const g = Math.hypot(gx, gy); if (g < 1e-5) { p.x += Math.cos(k) * 8; p.y += Math.sin(k) * 8; continue; }
    p.x -= gx / g * 5; p.y -= gy / g * 5;
  }
  return false;
}
// Nearest point on the waterline to (x, y), searching outward in rings.
function nearestCoast(x, y, maxR) {
  let best = null, bd = 1e9;
  for (let r = 0; r <= (maxR || 600); r += 6) {
    const n = Math.max(8, Math.round(r / 5));
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, d = Math.abs(coastD(px, py));
      if (d < 3 && r < bd) { bd = r; best = [px, py]; }
    }
    if (best) break;
  }
  if (!best) return null;
  // polish onto d = 0 along the gradient
  let [px, py] = best;
  for (let i = 0; i < 6; i++) { const d = coastD(px, py), [gx, gy] = gradD(px, py, 4), g = Math.hypot(gx, gy) || 1; px -= gx / g / g * d; py -= gy / g / g * d; }
  return [px, py];
}

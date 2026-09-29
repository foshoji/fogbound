'use strict';
/* From world.js definitions to things with real positions: docks find their stretch of coast
   and build a pier out to working depth, towns fill with houses, the coast road follows the
   shore a hundred metres inland. */

let SEABED = [], REEF_MARKS = [];
const DOCK_R = 70;
const km = v => v * 1000;
function prepareDefs() {
  SEABED = SEABED_DEF.map(s => ({ ...s, x: km(s.x || 0), y: km(s.y || 0), r: km(s.r || 0), w: km(s.w || 0), c: km(s.c || 0), size: km(s.size || 0), len: km(s.len || 0), pts: s.pts ? s.pts.map(p => [km(p[0]), km(p[1])]) : null }));
  for (const r of REEFS) SEABED.push({ kind: 'reef', x: km(r.x), y: km(r.y), r: km(r.r), top: -0.7 });
  REEF_MARKS = REEFS.map(r => ({ ...r, x: km(r.x), y: km(r.y), r: km(r.r) }));
}
// extra rocks join the survey rings as rough circles
function extraRings() {
  return EXTRA_ISLETS.map(e => {
    const n = 18, pts = [];
    for (let k = 0; k < n; k++) { const a = k / n * TAU, rr = km(e.r) * (0.75 + 0.5 * h01(k, e.id.length)); pts.push([km(e.x) + Math.cos(a) * rr, km(e.y) + Math.sin(a) * rr]); }
    return { id: e.id, name: e.name, peak: e.peak, main: false, pts: pts.map(p => p.join(',')).join(' ') };
  });
}

function placeDock(def) {
  const px = km(def.at[0]), py = km(def.at[1]);
  const d = { ...def, x: px, y: py, solid: [] };
  if (def.type === 'barge') {
    const p = { x: px, y: py }; settle(p, 8);
    const h = def.h || 0, c = Math.cos(h), s = Math.sin(h), L = 34, B = 9;
    d.barge = { x: p.x, y: p.y, h, len: L, beam: B };
    d.solid.push([p.x - c * (L / 2 - 3), p.y - s * (L / 2 - 3), p.x + c * (L / 2 - 3), p.y + s * (L / 2 - 3), B / 2 + 0.2]);
    d.berth = { x: p.x - s * (B / 2 + 2.4), y: p.y + c * (B / 2 + 2.4), h };
    d.approach = [d.berth.x - c * 50 - s * 18, d.berth.y - s * 50 + c * 18];
    d.coast = [p.x, p.y]; d.nx = -s; d.ny = c;
    return d;
  }
  const C = nearestCoast(px, py, 900);
  if (!C) { console.warn('no coast near', def.name); const p = { x: px, y: py }; settle(p, 2); d.berth = { x: p.x, y: p.y, h: 0 }; d.approach = [p.x, p.y]; d.coast = [p.x, p.y]; d.nx = 1; d.ny = 0; return d; }
  const [gx, gy] = gradD(C[0], C[1], 14), g = Math.hypot(gx, gy) || 1, nx = gx / g, ny = gy / g;
  d.coast = C; d.nx = nx; d.ny = ny;
  const out = L => [C[0] + nx * L, C[1] + ny * L];
  if (def.type === 'landing') {
    let L = 2; while (L < 80 && hDatum(...out(L)) > -1.1) L += 1;
    const [bx, by] = out(L + 5.8);
    d.berth = { x: bx, y: by, h: Math.atan2(-ny, -nx) };
    d.approach = out(L + 70);
    return d;
  }
  let L = 16; while (L < 160 && hDatum(...out(L)) > -3.4) L += 2;
  L += 6;
  const root = out(-8), end = out(L), qx = -ny, qy = nx;
  d.pier = [root[0], root[1], end[0], end[1], 2.2];
  d.solid.push(d.pier);
  const along = out(L - 8);
  d.berth = { x: along[0] + qx * 4.7, y: along[1] + qy * 4.7, h: Math.atan2(-ny, -nx) };
  d.approach = [C[0] + nx * (L + 60) + qx * 22, C[1] + ny * (L + 60) + qy * 22];
  return d;
}

function makeTown(def, rnd) {
  const t = { ...def, x: km(def.x), y: km(def.y), r: km(def.r), bl: [], lamps: [] };
  const roofs = [['#5a646d', '#434b52'], ['#ae5a3c', '#874430'], ['#7b876a', '#5f6a51'], ['#b58b52', '#8f6b3c'], ['#6c5d57', '#524640']];
  const walls = ['#e6e0d2', '#cfc4ae', '#b8ad96', '#ddd6c6'];
  const want = Math.round(t.r * 0.22);
  for (let k = 0; k < 2000 && t.bl.length < want; k++) {
    const a = rnd() * TAU, rr = Math.pow(rnd(), 0.7) * t.r, x = t.x + Math.cos(a) * rr, y = t.y + Math.sin(a) * rr;
    const h = hDatum(x, y); if (h < 1.8 || h > 80) continue;
    const sx = hDatum(x + 5, y) - hDatum(x - 5, y), sy = hDatum(x, y + 5) - hDatum(x, y - 5); if (Math.hypot(sx, sy) / 10 > 0.4) continue;
    const w = 5 + rnd() * 3, l = 7 + rnd() * 7;
    if (t.bl.some(b => Math.hypot(b.x - x, b.y - y) < (b.l + l) * 0.42 + 2)) continue;
    if (docks.some(d => d.pier && (segDist(x, y, d.pier[0], d.pier[1], d.pier[2], d.pier[3])[0] < 22 || Math.hypot(x - (d.coast[0] - d.nx * 14), y - (d.coast[1] - d.ny * 14)) < 30))) continue;
    const [cx, cy] = gradD(x, y, 16), ang = Math.atan2(cy, cx) + (rnd() < 0.6 ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.25;
    const rf = roofs[Math.floor(rnd() * roofs.length)];
    t.bl.push({ x, y, w, l, a: ang, ht: 5 + rnd() * 4, roof: rf[0], roofD: rf[1], wall: walls[Math.floor(rnd() * walls.length)] });
  }
  if (t.bl.length) { const c = t.bl.reduce((m, b) => Math.hypot(b.x - t.x, b.y - t.y) < Math.hypot(m.x - t.x, m.y - t.y) ? b : m); c.w = 8; c.l = 16; c.ht = 9; c.tower = true; c.roof = '#4c555d'; c.roofD = '#3a4148'; }
  // lamps along the waterfront
  const step = 22;
  for (let y = t.y - t.r; y <= t.y + t.r; y += 8) for (let x = t.x - t.r; x <= t.x + t.r; x += 8) {
    if (Math.hypot(x - t.x, y - t.y) > t.r * 1.05) continue;
    const d = coastD(x, y); if (d > -7 || d < -3.5 - 6) continue;
    if (t.lamps.some(l => Math.hypot(l[0] - x, l[1] - y) < step)) continue;
    t.lamps.push([x, y]);
  }
  return t;
}

/* coast road: the sd = −100 m line (the smooth distance, not the fractal one), traced with
   marching squares and chained into polylines */
function contourLines(x0, y0, x1, y1, step, level, fn) {
  const nx = Math.ceil((x1 - x0) / step), ny = Math.ceil((y1 - y0) / step), v = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = fn(x0 + i * step, y0 + j * step) - level;
  const V = (i, j) => v[j * (nx + 1) + i];
  const pt = (id) => { const [t, i, j] = id; if (t === 'h') { const a = V(i, j), b = V(i + 1, j), f = a / (a - b); return [x0 + (i + f) * step, y0 + j * step]; } const a = V(i, j), b = V(i, j + 1), f = a / (a - b); return [x0 + i * step, y0 + (j + f) * step]; };
  const T = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[0, 3]], []];
  const adj = new Map(), segs = [];
  const eid = (e, i, j) => e === 0 ? ['h', i, j] : e === 1 ? ['v', i + 1, j] : e === 2 ? ['h', i, j + 1] : ['v', i, j];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = (V(i, j) > 0 ? 1 : 0) | (V(i + 1, j) > 0 ? 2 : 0) | (V(i + 1, j + 1) > 0 ? 4 : 0) | (V(i, j + 1) > 0 ? 8 : 0);
    for (const [ea, eb] of T[c]) {
      const A_ = eid(ea, i, j), B_ = eid(eb, i, j), ka = A_.join(','), kb = B_.join(','), si = segs.length;
      segs.push([ka, kb, A_, B_]);
      for (const k of [ka, kb]) { if (!adj.has(k)) adj.set(k, []); adj.get(k).push(si); }
    }
  }
  const used = new Uint8Array(segs.length), lines = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1; const chain = [segs[s0][2], segs[s0][3]]; let endK = segs[s0][1], startK = segs[s0][0];
    for (let dir = 0; dir < 2; dir++) {
      for (;;) {
        const k = dir === 0 ? endK : startK, nb = (adj.get(k) || []).find(q => !used[q]); if (nb === undefined) break;
        used[nb] = 1; const sg = segs[nb], nextK = sg[0] === k ? sg[1] : sg[0], nextId = sg[0] === k ? sg[3] : sg[2];
        if (dir === 0) { chain.push(nextId); endK = nextK; } else { chain.unshift(nextId); startK = nextK; }
      }
    }
    lines.push(chain.map(pt));
  }
  return lines;
}
function chaikin(pts, n) { for (let k = 0; k < n; k++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; o.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); } o.push(pts[pts.length - 1]); pts = o; } return pts; }
function buildRoads() {
  roads = [];
  for (const id of ['olvenholt', 'brinehold']) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const r of rings) if (r.id === id) { x0 = Math.min(x0, r.box[0]); y0 = Math.min(y0, r.box[1]); x1 = Math.max(x1, r.box[2]); y1 = Math.max(y1, r.box[3]); }
    const lines = contourLines(x0 - 100, y0 - 100, x1 + 100, y1 + 100, 36, id === 'olvenholt' ? -105 : -70, (x, y) => tsample(x, y).sd);
    for (const l of lines) {
      let len = 0; for (let i = 1; i < l.length; i++) len += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
      if (len < 700) continue;
      // break the road where the ground is too steep or too high to be worth it
      let run = [];
      for (const p of chaikin(l, 2)) { const h = hDatum(p[0], p[1]); if (h > 1.5 && h < 110) run.push(p); else { if (run.length > 6) roads.push({ kind: 'road', pts: run }); run = []; } }
      if (run.length > 6) roads.push({ kind: 'road', pts: run });
    }
  }
  // a track up the mountain from Lanternmouth
  const lm = towns.find(t => t.id === 'lanternmouth'), pk = labels.find(l => l.text === 'Mount Vigil');
  if (lm && pk) {
    const pts = []; let x = lm.x, y = lm.y - 60;
    for (let k = 0; k < 200; k++) {
      pts.push([x, y]); const dx = pk.x - x, dy = pk.y - y, d = Math.hypot(dx, dy); if (d < 40) break;
      const a = Math.atan2(dy, dx) + vn(k * 0.18, 3.3, 1) * 1.1; x += Math.cos(a) * 28; y += Math.sin(a) * 28;
    }
    roads.push({ kind: 'track', pts: chaikin(pts, 2) });
  }
}

function ringCentroid(pts) { let a = 0, cx = 0, cy = 0; for (let k = 0; k < pts.length; k++) { const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length], c = x1 * y2 - x2 * y1; a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c; } return [cx / (3 * a), cy / (3 * a), Math.abs(a / 2)]; }

function placeWorld() {
  const rnd = rng32(90210);
  docks = DOCKS_DEF.map(placeDock);
  towns = TOWNS_DEF.map(t => makeTown(t, rnd));
  // labels: islands, the sea, the land
  labels = [];
  const seen = new Set();
  for (const r of rings) {
    if (seen.has(r.id)) continue; seen.add(r.id);
    const mine = rings.filter(q => q.id === r.id).map(q => ringCentroid(q.pts)).sort((a, b) => b[2] - a[2]);
    const [x, y] = mine[0];
    labels.push({ text: r.name, x: r.id === 'olvenholt' ? x - 300 : x, y: r.id === 'olvenholt' ? y - 350 : y - (r.id === 'hollow' ? 900 : 0), rank: r.id === 'olvenholt' ? 1 : 2, kind: 'land', tag: ISLANDS[r.id] || '', id: r.id });
  }
  for (const l of SEA_LABELS) labels.push({ ...l, x: km(l.x), y: km(l.y), kind: 'water' });
  for (const l of LAND_LABELS) {
    if (l.peak) { const p = peakOf(l.peak); if (p) labels.push({ ...l, x: p.x, y: p.y + 40, kind: 'land' }); }
    else labels.push({ ...l, x: km(l.x), y: km(l.y), kind: 'land' });
  }
  for (const t of towns) labels.push({ text: t.name, x: t.x, y: t.y - t.r * 0.2, rank: 2, kind: 'land', tag: t.tag });
  for (const l of labels) l.found = false;
  finds = FINDS_DEF.map(f => ({ ...f, x: km(f.x), y: km(f.y), found: false }));
  lights = LIGHTS_DEF.map(l => ({ ...l, x: km(l.x), y: km(l.y) }));
  buildRoads();
  // buoys: lateral marks into each harbour, cardinals off the reefs, a bell off Stillwater Bay
  buoys = [];
  for (const d of docks) if (d.type === 'fuel' || d.type === 'yard') {
    const ex = d.berth.x - d.approach[0], ey = d.berth.y - d.approach[1], L = Math.hypot(ex, ey) || 1, ux = ex / L, uy = ey / L, lx = uy, ly = -ux;
    const mx = d.approach[0] + ux * L * 0.35, my = d.approach[1] + uy * L * 0.35;
    for (const [kind, sd] of [['port', 1], ['stbd', -1]]) { const p = { x: mx + lx * sd * 24, y: my + ly * sd * 24 }; if (hDatum(p.x, p.y) < -1.5) buoys.push({ kind, x: p.x, y: p.y, period: kind === 'port' ? 4 : 5 }); }
  }
  for (const r of REEF_MARKS) { buoys.push({ kind: 'cardinal', top: true, x: r.x, y: r.y - r.r * 2.2 - 25, bell: r.name === 'Widow’s Comb' }); buoys.push({ kind: 'cardinal', top: false, x: r.x, y: r.y + r.r * 2.2 + 25 }); }
  buoys.push({ kind: 'safe', x: km(8.6), y: km(10.25), period: 6, bell: true });
  for (const b of buoys) { const p = { x: b.x, y: b.y }; settle(p, 2.5); b.x = p.x; b.y = p.y; }
  // floats: a scatter, thinner further out, and a few trails leading away from home
  items = [];
  for (let k = 0; k < 2600 && items.length < 190; k++) {
    const x = 800 + rnd() * (W - 1600), y = 800 + rnd() * (W - 1600);
    if (Math.hypot(x - WC, y - WC) > 6900) continue;
    const rem = remAt(x, y); if (rnd() > 1 - rem * 0.6) continue;
    if (hDatum(x, y) > -2.2) continue;
    items.push({ kind: 'float', x, y });
  }
  const home = docks.find(d => d.id === 'lm-yard');
  for (const id of ['bs-jetty', 'pl-landing', 'fr-station', 'hs-quay', 'barge-constance', 'hollow']) {
    const d = docks.find(q => q.id === id); if (!d) continue;
    const path = navPath(home.approach[0], home.approach[1], d.approach[0], d.approach[1]);
    let acc = 0, next = 500;
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i], L = Math.hypot(bx - ax, by - ay);
      for (let t = 0; t < L; t += 10) { acc += 10; if (acc >= next) { next += 130; const x = ax + (bx - ax) * t / L, y = ay + (by - ay) * t / L; if (hDatum(x, y) < -2 && !items.some(q => Math.hypot(q.x - x, q.y - y) < 60)) items.push({ kind: 'float', x, y }); } }
    }
  }
  items.forEach((it, i) => { it.id = 'f' + i; it.hue = FLOAT_HUES[i % FLOAT_HUES.length]; });
  for (const p of PAGES_DEF) {
    const it = { kind: 'page', id: 'p' + p.n, n: p.n, text: p.text };
    if (p.beach) { it.beach = p.beach; const d = docks.find(q => q.id === p.beach); it.x = d.berth.x; it.y = d.berth.y; }
    else { const q = { x: km(p.at[0]), y: km(p.at[1]) }; settle(q, 2); it.x = q.x; it.y = q.y; }
    items.push(it);
  }
  for (const it of items) { it.alive = true; it.phase = h01(it.x | 0, it.y | 0) * TAU; }
  // gulls
  gulls = [];
  const flock = (x, y, n, r, alt) => { const birds = []; for (let k = 0; k < n; k++) birds.push({ w: (rnd() < 0.5 ? -1 : 1) * (0.15 + rnd() * 0.25), p: rnd() * TAU, r: r * (0.4 + rnd() * 0.8), alt: alt * (0.6 + rnd() * 0.8) }); return { x, y, birds }; };
  for (const t of towns) gulls.push(flock(t.x, t.y + t.r * 0.6, 5, 90, 25));
  gulls.push(flock(km(5.25), km(7.15), 14, 120, 35), flock(km(1.55), km(5.4), 22, 140, 40));
}

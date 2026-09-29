'use strict';
/* Other boats, and the water they disturb.

   Every moving hull drops wake crests from its stern. Each crest is a short line that travels
   outward along the Kelvin angle at the group velocity, so together they draw the familiar V
   behind the boat. When a crest passes under your hull you feel it (boat.js hitWave). */

const waves = [], foam = [], spray = [];
const KELVIN = 0.6155; // 35.26°: the direction wave energy leaves a moving hull

function emitWake(src, x, y, h, U, amp, beam) {
  if (U < 1.2) return;
  const ga = 0.408 * U;
  for (const side of [-1, 1]) {
    const a = h + side * KELVIN, nx = Math.cos(a), ny = Math.sin(a);
    waves.push({ src, x: x - Math.sin(h) * side * beam * 0.5, y: y + Math.cos(h) * side * beam * 0.5, nx, ny, c: ga, amp, len: beam * 1.2 + 2, age: 0, life: 7 + amp * 14, side: 0 });
  }
}
function simWaves(dt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i]; w.age += dt;
    if (w.age > w.life) { waves.splice(i, 1); continue; }
    w.x += w.nx * w.c * dt; w.y += w.ny * w.c * dt;
    w.len += dt * (1.2 + w.c * 0.55);
    w.amp *= Math.exp(-dt * 0.12);
    if (w.src === 'you' || boat.auto || boat.tied) continue;
    const dx = boat.x - w.x, dy = boat.y - w.y;
    if (Math.abs(dx) > 90 || Math.abs(dy) > 90) { w.side = 0; continue; }
    const sd = dx * w.nx + dy * w.ny, lat = -dx * w.ny + dy * w.nx;
    const s = Math.sign(sd) || 1;
    if (Math.abs(lat) < w.len / 2 && w.side && s !== w.side && Math.abs(sd) < 12) {
      const rel = boat.gx * w.nx + boat.gy * w.ny - w.c;
      hitWave(w, rel * (1 - w.age / w.life * 0.6));
    }
    w.side = Math.abs(lat) < w.len / 2 + 6 ? s : 0;
  }
  for (const arr of [foam, spray]) for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i]; p.t += dt; p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
    if (p.vx !== undefined) { const k = Math.exp(-dt * (arr === spray ? 2.2 : 0.9)); p.vx *= k; p.vy *= k; }
    if (p.t > p.life) arr.splice(i, 1);
  }
  if (waves.length > 900) waves.splice(0, waves.length - 900);
  if (foam.length > 1400) foam.splice(0, foam.length - 1400);
}
// your own wake, prop wash and spray
function boatTrail(dt) {
  const U = Math.hypot(boat.gx, boat.gy), c = Math.cos(boat.h), s = Math.sin(boat.h), p = boat.plane;
  boat.wakeT += dt; boat.sprayT += dt;
  if (boat.wakeT > 0.2) {
    boat.wakeT = 0;
    emitWake('you', boat.x - c * 5.6, boat.y - s * 5.6, boat.h, U, 0.18 + 0.5 * Math.exp(-(((U - 7) / 3.5) ** 2)) + 0.12 * p, HULL.beam);
  }
  if (boat.running && (Math.abs(boat.thr) > 0.05 || U > 1)) {
    const n = 1 + Math.floor(Math.abs(boat.thr) * 3);
    for (let k = 0; k < n; k++) for (const side of [-0.9, 0.9]) {
      if (Math.random() > 0.5 + 0.5 * Math.abs(boat.thr)) continue;
      foam.push({ x: boat.x - c * 6.6 - s * side, y: boat.y - s * 6.6 + c * side, vx: -c * (2 + 6 * Math.abs(boat.thr)) * Math.sign(boat.thr || 1) + (Math.random() - 0.5) * 1.5, vy: -s * (2 + 6 * Math.abs(boat.thr)) * Math.sign(boat.thr || 1) + (Math.random() - 0.5) * 1.5, t: 0, life: 2.5 + 3 * p + Math.random(), r0: 0.5, r1: 1.8 + 2 * p });
    }
  }
  if (p > 0.3 && boat.sprayT > 0.03) {
    boat.sprayT = 0;
    for (const side of [-1, 1]) { const k = 4 + Math.random() * 4; spray.push({ x: boat.x + c * 1.5 - s * side * 1.9, y: boat.y + s * 1.5 + c * side * 1.9, vx: -s * side * k - c * 2 + boat.gx * 0.6, vy: c * side * k - s * 2 + boat.gy * 0.6, t: 0, life: 0.45 + Math.random() * 0.2 }); }
  }
}

/* ---------- routing: A* over a 64 m grid of navigable water ---------- */
const NG = 256, NCS = W / NG;
let NAV = null;
function navOK(x, y) { tsample(x, y); return ts.sd > 34 && hDatum(x, y) < -3.2 && Math.hypot(x - WC, y - WC) < 7400; }
function buildNav() {
  NAV = new Uint8Array(NG * NG);
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) NAV[j * NG + i] = navOK((i + 0.5) * NCS, (j + 0.5) * NCS) ? 1 : 0;
}
function clearLine(ax, ay, bx, by) {
  const L = Math.hypot(bx - ax, by - ay);
  for (let t = 0; t <= L; t += 20) { const x = ax + (bx - ax) * t / L, y = ay + (by - ay) * t / L; if (coastD(x, y) < 28 || hDatum(x, y) > -2.8) return false; }
  return true;
}
function navPath(ax, ay, bx, by) {
  const cell = (x, y) => { let i = clamp(Math.floor(x / NCS), 0, NG - 1), j = clamp(Math.floor(y / NCS), 0, NG - 1); if (NAV[j * NG + i]) return j * NG + i; let best = -1, bd = 1e9; for (let r = 1; r < 8 && best < 0; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NG || jj >= NG || !NAV[jj * NG + ii]) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; best = jj * NG + ii; } } return best; };
  const s = cell(ax, ay), g = cell(bx, by); if (s < 0 || g < 0) return [[ax, ay], [bx, by]];
  const gc = new Float32Array(NG * NG).fill(1e9), from = new Int32Array(NG * NG).fill(-1), done = new Uint8Array(NG * NG);
  const heap = []; const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const gi = g % NG, gj = (g / NG) | 0, hx = k => Math.hypot(k % NG - gi, ((k / NG) | 0) - gj);
  gc[s] = 0; push(s, hx(s));
  while (heap.length) {
    const [, k] = pop(); if (done[k]) continue; done[k] = 1; if (k === g) break;
    const i = k % NG, j = (k / NG) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NG || jj >= NG) continue;
      const kk = jj * NG + ii; if (!NAV[kk] || done[kk]) continue;
      const ng = gc[k] + (di && dj ? 1.414 : 1);
      if (ng < gc[kk]) { gc[kk] = ng; from[kk] = k; push(kk, ng + hx(kk)); }
    }
  }
  if (from[g] < 0 && g !== s) return [[ax, ay], [bx, by]];
  const cells = []; for (let k = g; k >= 0; k = from[k]) { cells.push([(k % NG + 0.5) * NCS, (((k / NG) | 0) + 0.5) * NCS]); if (k === s) break; }
  cells.reverse(); cells[0] = [ax, ay]; cells.push([bx, by]);
  // string-pull
  const out = [cells[0]]; let a = 0;
  while (a < cells.length - 1) { let b = cells.length - 1; while (b > a + 1 && !clearLine(cells[a][0], cells[a][1], cells[b][0], cells[b][1])) b--; out.push(cells[b]); a = b; }
  return out;
}

/* ---------- the boats ---------- */
const NPC_LEN = { ferry: 44, coaster: 72, launch: 9, fishing: 13, yacht: 13, moored: 10, dinghy: 5 };
function setupTraffic() {
  const dockById = id => docks.find(d => d.id === id);
  npcs = [];
  for (const t of TRAFFIC) {
    const b = { ...t, len: t.len || NPC_LEN[t.kind], x: 0, y: 0, h: 0, v: 0, bob: Math.random() * 10, ph: Math.random() * TAU, wakeT: 0, talkT: -1e9, tagT: 0, wait: 0, path: [], pi: 0, si: 0 };
    if (t.stops) {
      b.stopPts = t.stops.map(s => typeof s === 'string' ? dockById(s).approach : [s[0] * 1000, s[1] * 1000]);
      b.x = b.stopPts[0][0]; b.y = b.stopPts[0][1]; b.si = 0; b.wait = 5 + Math.random() * 15;
      b.legs = b.stopPts.map((p, i) => { const q = b.stopPts[(i + 1) % b.stopPts.length]; return navPath(p[0], p[1], q[0], q[1]); });
      b.path = b.legs[0]; b.pi = 1;
      // start somewhere along the first leg so the sea isn't empty at launch
      if (t.kind !== 'ferry') { const k = Math.floor(b.path.length / 2); b.x = b.path[k][0]; b.y = b.path[k][1]; b.pi = Math.min(k + 1, b.path.length - 1); b.wait = 0; }
      const nx = b.path[b.pi]; b.h = Math.atan2(nx[1] - b.y, nx[0] - b.x);
    } else {
      const p = { x: t.at[0] * 1000, y: t.at[1] * 1000 }; settle(p, t.kind === 'moored' ? 1.5 : 4);
      b.x = b.hx = p.x; b.y = b.hy = p.y; b.h = b.h0 = t.h || 0; b.a = Math.random() * TAU;
    }
    npcs.push(b);
  }
  // boats on moorings off each harbour
  for (const d of docks) if (d.type === 'yard' || d.type === 'fuel') {
    const n = d.type === 'yard' ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const a = d.berth.h + Math.PI + (k - (n - 1) / 2) * 0.55, r = 55 + k * 12;
      const p = { x: d.berth.x + Math.cos(a) * r - Math.sin(a) * 18, y: d.berth.y + Math.sin(a) * r + Math.cos(a) * 18 };
      if (!settle(p, 1.4)) continue;
      const kind = h01(k, d.x | 0) < 0.35 ? 'yacht' : h01(k + 3, d.y | 0) < 0.5 ? 'fishing' : 'dinghy';
      npcs.push({ name: '', kind: 'moored', look: kind, len: NPC_LEN[kind], x: p.x, y: p.y, hx: p.x, hy: p.y, h0: d.berth.h + (h01(k, 7) - 0.5), h: 0, v: 0, bob: Math.random() * 10, ph: Math.random() * TAU, talkT: 1e9, tagT: 0 });
    }
  }
}
function simNPCs(dt) {
  for (const b of npcs) {
    b.bob += dt;
    if (b.stopPts) {
      if (b.wait > 0) { b.wait -= dt; b.v *= Math.exp(-dt * 1.5); }
      else {
        const tgt = b.path[b.pi], dx = tgt[0] - b.x, dy = tgt[1] - b.y, d = Math.hypot(dx, dy);
        const lastWp = b.pi === b.path.length - 1;
        const vT = lastWp ? Math.min(b.speed, Math.max(1.2, d / 14)) : b.speed;
        b.v += (vT - b.v) * (1 - Math.exp(-dt * 0.35));
        b.h += clamp(angDiff(b.h, Math.atan2(dy, dx)), -0.16 * dt * (1 + 6 / b.len), 0.16 * dt * (1 + 6 / b.len));
        if (d < (lastWp ? 14 : 45)) {
          if (lastWp) { b.si = (b.si + 1) % b.legs.length; b.path = b.legs[b.si]; b.pi = 1; b.wait = b.dwell || 0; if (b.kind === 'ferry' && Math.hypot(b.x - boat.x, b.y - boat.y) < 900) SFX.shiphorn(clamp((b.x - boat.x) / 600, -1, 1)); }
          else b.pi++;
        }
      }
    } else if (b.kind === 'fishing') {
      const R_ = b.r || 110, px = b.x, py = b.y;
      b.a += dt * 0.022 * (b.dir || 1); b.x = b.hx + Math.cos(b.a) * R_; b.y = b.hy + Math.sin(b.a) * R_ * 0.7;
      if (dt > 0) b.h = Math.atan2(b.y - py, b.x - px);
      b.v = 0; b.work = 0.022 * R_;
    } else if (b.kind === 'yacht') {
      const ax = b.x + Math.cos(b.h) * 60, ay = b.y + Math.sin(b.h) * 60;
      if (hDatum(ax, ay) > -3 || Math.hypot(b.x - b.hx, b.y - b.hy) > 700) b.h += angDiff(b.h, Math.atan2(b.hy - b.y, b.hx - b.x)) * dt * 0.6;
      else b.h += vn(time * 0.03, b.hx * 0.01) * dt * 0.2;
      b.v = 3.4;
    } else { b.h = b.h0 + Math.sin(b.bob * 0.25 + b.ph) * 0.1; b.v = 0; }
    if (b.v > 0.1) { b.x += Math.cos(b.h) * b.v * dt; b.y += Math.sin(b.h) * b.v * dt; }
    b.wakeT = (b.wakeT || 0) + dt;
    const U = b.work || b.v;
    if (U > 1.2 && b.wakeT > 0.22) {
      b.wakeT = 0;
      const amp = { ferry: 0.85, coaster: 1.1, launch: 0.45, fishing: 0.3, yacht: 0.2 }[b.kind] || 0.2;
      emitWake(b.name || 'npc', b.x - Math.cos(b.h) * b.len * 0.48, b.y - Math.sin(b.h) * b.len * 0.48, b.h, U, amp * sstep(1, 6, U), b.len * 0.2);
      if (b.len > 20 || Math.random() < 0.5) foam.push({ x: b.x - Math.cos(b.h) * b.len * 0.5, y: b.y - Math.sin(b.h) * b.len * 0.5, vx: -Math.cos(b.h) * 1.5, vy: -Math.sin(b.h) * 1.5, t: 0, life: 4 + b.len * 0.08, r0: b.len * 0.05, r1: b.len * 0.12 });
    }
    // radio: a word as you pass
    if (b.name && b.lines && time - b.talkT > 150) {
      const d = Math.hypot(b.x - boat.x, b.y - boat.y);
      if (d < 260 && started && !paused) { b.talkT = time; b.tagT = 7; b.line = b.lines[Math.floor(Math.random() * b.lines.length)]; SFX.radio(); }
    }
    if (b.tagT > 0) b.tagT -= dt;
  }
}

/* ---------- the radio, in the background ---------- */
let radioT = 40;
function simRadio(dt) {
  if (!started || paused) return;
  radioT -= dt;
  if (radioT > 0) return;
  radioT = 70 + Math.random() * 60;
  const rem = remAt(boat.x, boat.y);
  const pool = RADIO.filter(r => (!r.far || rem > 0.35) && (!r.near || rem < 0.35));
  const r = pool[Math.floor(Math.random() * pool.length)];
  if (r) { radioLine(r.who, r.text); SFX.radio(); }
}
let foghornT = 20;
function simAmbience(dt) {
  if (!started || paused || !A.ctx) return;
  const rem = remAt(boat.x, boat.y);
  foghornT -= dt * (0.3 + rem);
  if (foghornT <= 0) {
    foghornT = 25 + Math.random() * 30;
    let best = null, bd = 1e9; for (const l of lights) { const d = Math.hypot(l.x - boat.x, l.y - boat.y); if (d < bd) { bd = d; best = l; } }
    if (best && rem > 0.15) SFX.foghorn(clamp(screenPan(best.x, best.y), -1, 1), bd);
  }
  for (const b of buoys) if (b.bell) { b.bellT = (b.bellT || Math.random() * 8) - dt; if (b.bellT <= 0) { b.bellT = 5 + Math.random() * 7; const d = Math.hypot(b.x - boat.x, b.y - boat.y); if (d < 1200) SFX.buoyBell(clamp(screenPan(b.x, b.y), -1, 1), d); } }
}
function screenPan(x, y) { const [sx] = w2s(x, y); return (sx / cssW) * 2 - 1; }

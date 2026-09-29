'use strict';
/* The boat: a 12 m offshore sport boat on twin outboards.

   Planing is one continuous number (boat.plane, 0..1) that chases a target set by speed, so
   she wallows in displacement, climbs the hump with her bow up, then levels out and runs.
   No hard state changes. Hull damage caps how far she can get onto the plane: from about 30%
   damage she ploughs, bow high, and the extra drag holds her in the high twenties. */

const hullPlaneMax = () => clamp((st.hull - 55) / 30, 0.3, 1);
const HULL_PTS = [[6.1, 0], [4.2, -1.45], [4.2, 1.45], [0.6, -1.85], [0.6, 1.85], [-3.2, -1.85], [-3.2, 1.85], [-6, -1.6], [-6, 1.6]];
let lastImpactKind = '';

function planeLabel() {
  if (boat.plane > 0.82) return 'Planing';
  if (boat.u > 4.2 && boat.plane < 0.82) return boat.deficit > 0.25 && boat.u > 9 ? 'Ploughing' : 'Semi-planing';
  return 'Displacement';
}

function simBoat(dt) {
  let thrT = 0, steerT = 0;
  if (boat.auto) [thrT, steerT] = autopilot(dt);
  else if (boat.running && !boat.seq && started) { thrT = input.thr; steerT = input.steer; }
  const kicker = st.fuel <= 0;
  if (kicker) thrT = clamp(thrT, -0.25, 0.25);

  boat.thr += (thrT - boat.thr) * (1 - Math.exp(-dt * (Math.abs(thrT) < Math.abs(boat.thr) ? 2.4 : 1.5)));
  boat.steer += (steerT - boat.steer) * (1 - Math.exp(-dt * 3.4));
  const rpmT = boat.running ? (kicker ? 0.08 + 0.2 * Math.abs(boat.thr) : 0.12 + 0.88 * Math.abs(boat.thr)) : 0;
  boat.rpm += (rpmT - boat.rpm) * (1 - Math.exp(-dt * (boat.running ? 2.6 : 1.4)));
  const drive = boat.running ? boat.thr : 0;

  const c = Math.cos(boat.h), s = Math.sin(boat.h);
  let u = boat.u, v = boat.v;
  const D = -heightAt(boat.x, boat.y);
  const shoal = clamp((HULL.draft * 1.7 - D) / (HULL.draft * 1.3), 0, 1);

  // planing
  const pmax = hullPlaneMax(), want = sstep(6.0, 11.5, u);
  const pT = want * pmax;
  boat.plane += (pT - boat.plane) * (1 - Math.exp(-dt * (pT > boat.plane ? 1.3 : 2.4)));
  const p = boat.plane;
  boat.deficit = Math.max(0, want - p);
  const hump = 3.4 * Math.exp(-(((u - 6.8) / 2.6) ** 2)) * (1 - 0.85 * p);
  const Tmax = kicker ? 1.9 : ENGINES[UP.engine].thrust;
  const thrust = drive >= 0 ? drive * Tmax * (1 - 0.33 * clamp(u / 30, 0, 1)) : drive * Tmax * 0.55;
  const drag = u >= 0 ? 0.08 * u + 0.0068 * u * u + hump + 0.03 * u * u * boat.deficit : 0.3 * u - 0.03 * u * u;
  u += (thrust - drag) * dt;
  u *= Math.exp(-dt * shoal * 2.4);
  const trimT = 7.5 * Math.exp(-(((u - 7) / 3) ** 2)) * (1 - p) + 3.2 * p + 6 * boat.deficit * sstep(5, 9, u);
  boat.trim += (trimT - boat.trim) * (1 - Math.exp(-dt * 2.5));

  // steering: outboards steer by thrust, so at rest she only turns with the throttle open
  // (twin outboards also let her pivot almost on the spot at low speed)
  const au = Math.abs(u), flow = sstep(0.2, 3.5, au);
  const rMax = 0.56 / (1 + au / 26);
  const rT = boat.steer * (rMax * flow * (0.55 + 0.45 * Math.min(1, Math.abs(drive) + 0.35)) + 0.5 * Math.sqrt(Math.abs(drive)) * (1 - flow)) * (u < -0.3 ? -1 : 1);
  boat.r += (rT - boat.r) * (1 - Math.exp(-dt * (2.0 + 1.2 * p)));
  v += -boat.r * u * 0.12 * dt;
  v *= Math.exp(-dt * (1.8 + 2.6 * p));
  boat.h += boat.r * dt;
  boat.u = u; boat.v = v;
  const nc = Math.cos(boat.h), ns = Math.sin(boat.h);
  const cur = currentAt(boat.x, boat.y);
  boat.gx = nc * u - ns * v + cur[0]; boat.gy = ns * u + nc * v + cur[1];
  boat.x += boat.gx * dt; boat.y += boat.gy * dt;

  // motion: bank into turns once planing, pitch and heave from waves, springs back
  const rollT = boat.r * u * (0.022 * p - 0.008 * (1 - p));
  boat.rollV += ((rollT - boat.roll) * 9 - boat.rollV * 3.2) * dt; boat.roll += boat.rollV * dt;
  boat.pitchV += (-boat.pitch * 22 - boat.pitchV * 4.2) * dt; boat.pitch += boat.pitchV * dt;
  boat.heaveV += (-boat.heave * 16 - boat.heaveV * 3.5) * dt; boat.heave += boat.heaveV * dt;

  // fuel: a full tank is a long day at cruise
  if (started && boat.running && !kicker) {
    const burn = (0.006 + 0.24 * Math.pow(Math.abs(drive), 1.6) * (0.9 + 0.1 * UP.engine)) * dt;
    st.fuel = Math.max(0, st.fuel - burn);
    fuelWarnings();
  }
  collide(dt);
  const m = 60;
  if (boat.x < m) boat.x = m; if (boat.x > W - m) boat.x = W - m; if (boat.y < m) boat.y = m; if (boat.y > W - m) boat.y = W - m;
  return D;
}
let lowWarned = false, emptyWarned = false;
function fuelWarnings() {
  const cap = tankCap();
  if (!lowWarned && st.fuel < cap * 0.2) { lowWarned = true; toast('Fuel', 'Down to a fifth. Press F for the nearest fuel.', 5200); }
  if (st.fuel > cap * 0.3) lowWarned = false;
  if (st.fuel <= 0 && !emptyWarned) { emptyWarned = true; toast('Out of fuel', 'The outboards cough and die. The little kicker motor will get you to a jetty, slowly.', 6000); }
  if (st.fuel > 0) emptyWarned = false;
}

/* Hull contact with the ground, piers, barges and other boats. */
function collide(dt) {
  const nc = Math.cos(boat.h), ns = Math.sin(boat.h);
  let impact = 0, kind = 'sand';
  for (const [lx, ly] of HULL_PTS) {
    const px = boat.x + nc * lx - ns * ly, py = boat.y + ns * lx + nc * ly;
    let nx = 0, ny = 0, pen = 0;
    const hh = heightAt(px, py) + HULL.draft;
    if (hh > 0) {
      const e = 1.5, gx = (heightAt(px + e, py) - heightAt(px - e, py)) / (2 * e), gy = (heightAt(px, py + e) - heightAt(px, py - e)) / (2 * e);
      const g = Math.hypot(gx, gy) || 1e-3; nx = -gx / g; ny = -gy / g; pen = Math.min(2.5, hh / Math.max(g, 0.06));
      if (expoAt(px, py) > 0.5 || g > 0.35) kind = 'rock';
    }
    if (!boat.auto) for (const d of docks) for (const sg of d.solid) {
      if (Math.abs(px - sg[0]) > 120 && Math.abs(px - sg[2]) > 120) continue;
      const [dd, cx, cy] = segDist(px, py, sg[0], sg[1], sg[2], sg[3]), rad = sg[4];
      if (dd < rad) { const l = dd || 1e-3; nx = (px - cx) / l; ny = (py - cy) / l; pen = rad - dd; kind = 'pier'; }
    }
    if (pen > 0) {
      boat.x += nx * pen * 0.8; boat.y += ny * pen * 0.8;
      const vn_ = boat.gx * nx + boat.gy * ny;
      if (vn_ < 0) {
        const c = Math.cos(boat.h), s = Math.sin(boat.h);
        let vx = c * boat.u - s * boat.v - 1.35 * vn_ * nx, vy = s * boat.u + c * boat.v - 1.35 * vn_ * ny;
        vx *= 0.86; vy *= 0.86;
        boat.u = vx * c + vy * s; boat.v = -vx * s + vy * c;
        const rx = px - boat.x, ry = py - boat.y; boat.r += (rx * (-vn_ * ny) - ry * (-vn_ * nx)) * 0.003;
        impact = Math.max(impact, -vn_);
      }
    }
  }
  for (const b of npcs) {
    const dx = boat.x - b.x, dy = boat.y - b.y, d = Math.hypot(dx, dy), rad = (b.len * 0.5 + 3) * (b.kind === 'ferry' || b.kind === 'coaster' ? 0.6 : 0.8);
    if (d < rad && d > 0.01) {
      const nx = dx / d, ny = dy / d; boat.x += nx * (rad - d) * 0.6; boat.y += ny * (rad - d) * 0.6;
      const vn_ = boat.gx * nx + boat.gy * ny;
      if (vn_ < 0) { const c = Math.cos(boat.h), s = Math.sin(boat.h); boat.u -= 1.3 * vn_ * (nx * c + ny * s); boat.v -= 1.3 * vn_ * (-nx * s + ny * c); impact = Math.max(impact, -vn_ * 0.8); kind = 'boat'; }
    }
  }
  boat.bumpCD -= dt;
  if (impact > 1.1 && boat.bumpCD <= 0) {
    boat.bumpCD = 0.35;
    if (kind === 'rock') SFX.crunch(impact); else SFX.bump(impact);
    cam.shake = Math.min(1, impact / 14);
    const mult = kind === 'rock' ? 1.3 : kind === 'sand' ? 0.35 : 0.8;
    if (impact > 3 && !boat.auto) {
      const dmg = (impact - 3) * 2.4 * HULLS[UP.hull].armor * mult;
      const before = st.hull; st.hull = Math.max(0, st.hull - dmg);
      if (dmg > 2.5) toast('', `Hull ${Math.round(st.hull)}%. ${kind === 'rock' ? 'That was rock.' : kind === 'sand' ? 'Sand, at least.' : ''} ${st.hull < 70 && before >= 70 ? 'She won’t get properly onto the plane like this.' : ''}`, 3000);
    }
    try { navigator.vibrate && navigator.vibrate(12); } catch (e) { }
  }
}
const segDist = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1); const cx = x1 + dx * t, cy = y1 + dy * t; return [Math.hypot(px - cx, py - cy), cx, cy]; };

/* A wake crest passing under the hull: she pitches, heaves, loses a little way and gets
   knocked off line. Harder the faster you meet it. */
function hitWave(w, rel) {
  const k = w.amp * clamp(Math.abs(rel) / 5, 0.35, 1.8);
  if (k < 0.04) return;
  const f = Math.cos(boat.h) * w.nx + Math.sin(boat.h) * w.ny;
  boat.pitchV += k * 2.8 * (0.5 + Math.abs(f)); boat.heaveV += k * 1.8;
  boat.rollV += k * 1.6 * Math.sign(Math.cos(boat.h) * w.ny - Math.sin(boat.h) * w.nx || 1) * (1 - Math.abs(f));
  boat.u *= 1 - 0.06 * k * clamp(boat.u / 10, 0, 1);
  boat.r += (Math.random() - 0.5) * 0.16 * k;
  cam.shake = Math.max(cam.shake, Math.min(0.8, k * 0.55));
  SFX.wake(Math.min(0.5, 0.12 + k * 0.25));
  if (k > 0.45) for (let i = 0; i < 10; i++) { const a = boat.h + (Math.random() - 0.5) * 2.4; spray.push({ x: boat.x + Math.cos(boat.h) * 4, y: boat.y + Math.sin(boat.h) * 4, vx: Math.cos(a) * (3 + Math.random() * 5) + boat.gx * 0.5, vy: Math.sin(a) * (3 + Math.random() * 5) + boat.gy * 0.5, t: 0, life: 0.6 + Math.random() * 0.3 }); }
  try { navigator.vibrate && navigator.vibrate(8); } catch (e) { }
}

/* ---------- engines on, engines off ---------- */
function cutEngines(then) {
  if (!boat.running) { if (then) then(); return; }
  SFX.cut(); boat.seq = { kind: 'cut', t: 0, then };
}
function startEngines(then) {
  if (boat.running) { if (then) then(); return; }
  SFX.starter(); boat.seq = { kind: 'start', t: 0, then };
}
function updateSeq(dt) {
  const q = boat.seq; if (!q) return;
  q.t += dt;
  if (q.kind === 'cut') { if (q.t > 0.55 && boat.running) boat.running = false; if (q.t > 1.1) { boat.seq = null; if (q.then) q.then(); } }
  else { if (q.t > 0.55 && !boat.running) { boat.running = true; boat.rpm = 0.34; } if (q.t > 1.0) { boat.seq = null; if (q.then) q.then(); } }
}

/* ---------- autopilot: bringing her alongside and taking her off again, under power ---------- */
function autopilot(dt) {
  const a = boat.auto; a.t += dt;
  const u = boat.u;
  if (a.mode === 'dock') {
    const tgt = a.wps[a.i], dx = tgt[0] - boat.x, dy = tgt[1] - boat.y, dist = Math.hypot(dx, dy);
    const last = a.i === a.wps.length - 1;
    if (!last && dist < 10) a.i++;
    let rest = dist; for (let k = a.i; k < a.wps.length - 1; k++) rest += Math.hypot(a.wps[k + 1][0] - a.wps[k][0], a.wps[k + 1][1] - a.wps[k][1]);
    const brg = last && dist < 5 ? a.d.berth.h : Math.atan2(dy, dx), err = angDiff(boat.h, brg);
    const vd = clamp(rest * 0.22, 0.6, 4.5);
    let thr = clamp((vd - u) * 0.6 + 0.12, -0.7, 0.55);
    if (Math.abs(err) > 1.1) thr = Math.min(thr, 0.3);
    if ((last && dist < 5 && Math.abs(u) < 2.8) || a.t > 20) { boat.auto = null; settleAtBerth(a.d); return [0, 0]; }
    return [thr, clamp(err * 2.4, -1, 1) * (u < -0.3 ? -1 : 1)];
  }
  if (a.mode === 'leave') {
    if (a.t < 2.6) return [-0.34, 0];
    if (a.dir === undefined) {
      // the most open water, leaning towards the way we came in
      const want = Math.atan2(a.out[1], a.out[0]); let best = want, bs = -1;
      for (let k = 0; k < 24; k++) {
        const ang = k / 24 * TAU, c = Math.cos(ang), s = Math.sin(ang); let r = 0;
        for (; r < 300; r += 12) if (hDatum(boat.x + c * r, boat.y + s * r) > -1.8) break;
        const score = r + Math.cos(angDiff(ang, want)) * 60; if (score > bs) { bs = score; best = ang; }
      }
      a.dir = best;
    }
    const err = angDiff(boat.h, a.dir);
    if ((Math.abs(err) < 0.3 && a.t > 3.4) || a.t > 12) { boat.auto = null; return [0.15, 0]; }
    return [0.4, clamp(err * 2, -1, 1)];
  }
  return [0, 0];
}
function settleAtBerth(d) {
  boat.seq = { kind: 'moor', t: 0 };
  const b = d.berth, x0 = boat.x, y0 = boat.y, h0 = boat.h;
  let t = 0;
  SFX.rope(); setTimeout(() => SFX.creak(), 500);
  boat.mooring = dt => {
    t += dt / 1.1; const e = sstep(0, 1, Math.min(1, t));
    boat.x = lerp(x0, b.x, e); boat.y = lerp(y0, b.y, e); boat.h = h0 + angDiff(h0, b.h) * e;
    boat.u *= Math.exp(-dt * 3); boat.v *= Math.exp(-dt * 3); boat.r *= Math.exp(-dt * 3);
    if (t >= 1) { boat.mooring = null; boat.u = boat.v = boat.r = 0; boat.seq = null; boat.tied = d; cutEngines(() => arrive(d)); }
  };
}
function castOffFrom(d) {
  boat.tied = null;
  // head for open water: straight back off the berth, then out along the way we came in
  const o = d.approach ? [d.approach[0] - d.berth.x, d.approach[1] - d.berth.y] : [-Math.cos(d.berth.h), -Math.sin(d.berth.h)];
  startEngines(() => { boat.auto = { mode: 'leave', t: 0, out: o }; });
}

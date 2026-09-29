'use strict';
/* Boot, the frame loop, the camera, the tide, pickups, saving. */

const SAVE_KEY = 'fogbound.v1';
let glc = null, ctx = null, glScale = 1;

function resize() {
  const ovc = $('#ov');
  cssW = ovc.clientWidth || innerWidth; cssH = ovc.clientHeight || innerHeight;
  dpr = Math.min(devicePixelRatio || 1, 2);
  ovc.width = Math.round(cssW * dpr); ovc.height = Math.round(cssH * dpr);
  glc.width = Math.round(cssW * glScale); glc.height = Math.round(cssH * glScale);
  if (GL.gl) GL.gl.viewport(0, 0, glc.width, glc.height);
}

/* ---------- tide: high, mid, low, with slow changes between ---------- */
function updateTide(dt) {
  tide.t += dt;
  const cyc = TIDE.hold + TIDE.trans, k = Math.floor(tide.t / cyc) % 4, u = tide.t % cyc;
  const p = u < TIDE.hold ? 0 : sstep(0, 1, (u - TIDE.hold) / TIDE.trans);
  if (k !== tide.k) { tide.k = k; if (started) { SFX.bell(); toast('Tide', TIDE.name[k] + (TIDE.stream[k] ? '. The streams are running.' : '. The streams go slack.'), 3200); } }
  tide.p = p;
  tide.level = lerp(TIDE.level[k], TIDE.level[(k + 1) % 4], p);
  tide.stream = lerp(TIDE.stream[k], TIDE.stream[(k + 1) % 4], p);
}

/* ---------- camera: closer in harbour, further out on open water and in the deep ---------- */
let prevZ = 0;
function updateCamera(dt) {
  tsample(boat.x, boat.y);
  const open = sstep(60, 700, ts.sd), rem = ts.r, spd = sstep(3, 20, Math.hypot(boat.gx, boat.gy));
  let zA = Math.log(3.1) - 0.7 * spd - 0.7 * open - 1.35 * rem;
  if (boat.auto || boat.tied || boat.mooring) zA = Math.log(4.6);
  let zT = cam.chart ? Math.log(Math.min(cssW, cssH) / 15500) : zA + cam.zUser;
  zT = clamp(zT, Math.log(Math.min(cssW, cssH) / 17000), Math.log(10));
  prevZ = cam.z;
  cam.z += (zT - cam.z) * (1 - Math.exp(-dt * (cam.chart ? 2.2 : 1.2)));
  const s = S(), lead = Math.min(1.4, 110 / s / 24);
  let tx = boat.x + boat.gx * lead, ty = boat.y + boat.gy * lead;
  if (cam.headUp && !cam.chart) { const f = cssH * 0.17 / s; tx += Math.cos(boat.h) * f; ty += Math.sin(boat.h) * f; }
  if (cam.chart) { tx = lerp(boat.x, WC, 0.7); ty = lerp(boat.y, WC, 0.7); }
  const k = 1 - Math.exp(-dt * (cam.chart ? 3 : 2.6)); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  const rT = cam.headUp && !cam.chart ? -Math.PI / 2 - boat.h : 0;
  cam.rot += angDiff(cam.rot, rT) * (1 - Math.exp(-dt * 2.0));
  cam.atmo += ((cam.chart ? 0 : 1) - cam.atmo) * (1 - Math.exp(-dt * 3));
  cam.shake *= Math.exp(-dt * 6);
  const sh = cam.shake * 6 / s; cam.sx = (Math.random() - 0.5) * sh; cam.sy = (Math.random() - 0.5) * sh;
  if (A.ctx) { const zv = Math.abs(cam.z - prevZ) / Math.max(dt, 1e-3); A.whoosh.g.gain.setTargetAtTime(Math.min(0.07, zv * 0.03), A.ctx.currentTime, 0.05); A.whoosh.f.frequency.setTargetAtTime(350 + zv * 500, A.ctx.currentTime, 0.05); }
}

/* ---------- pickups ---------- */
let streak = 0, lastPick = -10;
function collectItems(dt) {
  for (const it of items) {
    if (!it.alive || it.beach) continue;
    const dx = boat.x - it.x, dy = boat.y - it.y, d = Math.hypot(dx, dy);
    if (d < 45) { const pull = (1 - d / 45) * dt * 4; it.x += dx * pull; it.y += dy * pull; }
    if (d < 13) collect(it);
  }
}
function collect(it) {
  it.alive = false; got.add(it.id);
  const [sx, sy] = w2s(it.x, it.y), pan = (sx / cssW) * 2 - 1;
  foam.push({ x: it.x, y: it.y, vx: 0, vy: 0, t: 0, life: 0.8, r0: 1, r1: 5 });
  try { navigator.vibrate && navigator.vibrate(6); } catch (e) { }
  if (it.kind === 'float') {
    streak = time - lastPick < 2.6 ? streak + 1 : 0; lastPick = time;
    SFX.chime(streak, pan); st.floats++;
    const r = $('#c-float').getBoundingClientRect();
    flyers.push({ x0: sx, y0: sy, x1: r.left + r.width / 2, y1: r.top + r.height / 2, t: 0, life: 0.55, hue: it.hue });
    setTimeout(() => updateCounts('#c-float'), 550);
  } else if (it.kind === 'page') gainPage(it);
  save();
}

/* ---------- the Veil ---------- */
let veilWarned = false;
function veilCheck(dt) {
  const dx = boat.x - WC, dy = boat.y - WC, d = Math.hypot(dx, dy);
  if (d > 7350) {
    const k = (d - 7350) / 400, c = Math.cos(boat.h), s = Math.sin(boat.h), ux = -dx / d, uy = -dy / d;
    boat.u += (ux * c + uy * s) * k * 6 * dt; boat.v += (-ux * s + uy * c) * k * 6 * dt;
    if (!veilWarned) { veilWarned = true; toast('The Veil', 'The fog here is a wall. The chart ends, and so, for now, does the sea.', 5200); }
  } else if (d < 7000) veilWarned = false;
}

/* ---------- sound of the water ---------- */
function waterSound(D) {
  if (!A.ctx) return;
  const now = A.ctx.currentTime, sp = Math.hypot(boat.gx, boat.gy), k = sp / 22;
  engineSound(boat.rpm, Math.abs(boat.thr) * (1 - boat.plane * 0.4), 0);
  A.wash.g.gain.setTargetAtTime(paused ? 0.01 : 0.02 + Math.min(1, k) * 0.08, now, 0.2); A.wash.f.frequency.setTargetAtTime(260 + k * 900, now, 0.2);
  A.wind.g.gain.setTargetAtTime(!paused && boat.plane > 0.5 ? 0.006 + k * 0.016 : 0, now, 0.4);
  const shoal = clamp((HULL.draft * 1.7 - D) / (HULL.draft * 1.3), 0, 1);
  A.scrape.g.gain.setTargetAtTime(paused ? 0 : shoal * Math.min(1, k * 3) * 0.1, now, 0.08);
  if (!paused && boat.plane > 0.6 && Math.random() < 0.03 * boat.plane) SFX.slap(0.015 + 0.025 * Math.random());
}

/* ---------- save / load (this browser only) ---------- */
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function save() {
  if (!started) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      got: [...got], x: boat.x, y: boat.y, h: boat.h, tied: boat.tied ? boat.tied.id : null, fog: b64(fog), st, UP, tide: tide.t, headUp: cam.headUp, chartAll,
      found: labels.filter(l => l.found).map(l => l.text), finds: finds.filter(f => f.found).map(f => f.id),
    }));
  } catch (e) { }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!s) return false;
    const bin = atob(s.fog); for (let i = 0; i < bin.length && i < fog.length; i++) fog[i] = bin.charCodeAt(i);
    chartedCount = 0; for (let j = 0; j < FR; j++) for (let i = 0; i < FR; i++) if (fog[j * FR + i] >= 128 && Math.hypot((i + 0.5) * W / FR - WC, (j + 0.5) * W / FR - WC) < CHART_R) chartedCount++;
    for (const id of s.got) got.add(id);
    for (const it of items) if (got.has(it.id)) it.alive = false;
    Object.assign(st, s.st); Object.assign(UP, s.UP); tide.t = s.tide || 0; chartAll = !!s.chartAll;
    const f = new Set(s.found || []); for (const l of labels) if (f.has(l.text)) l.found = true;
    const fd = new Set(s.finds || []); for (const d of finds) if (fd.has(d.id)) d.found = true;
    if (s.headUp) toggleHeadUp();
    const tied = s.tied && docks.find(d => d.id === s.tied);
    if (tied) { boat.x = tied.berth.x; boat.y = tied.berth.y; boat.h = tied.berth.h; boat.tied = tied; }
    else if (Number.isFinite(s.x)) { boat.x = s.x; boat.y = s.y; boat.h = s.h; boat.tied = null; }
    return true;
  } catch (e) { return false; }
}

/* ---------- the loop ---------- */
let lastT = performance.now(), frameAvg = 16, fogUpT = 0, saveT = 0, lastD = 10;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; time += dt;
  frameAvg = lerp(frameAvg, dt * 1000, 0.03);
  if (frameAvg > 25 && glScale > 0.5 && time > 4) { glScale *= 0.85; frameAvg = 16; resize(); }
  if (!paused) {
    updateTide(dt);
    readInput(dt);
    updateSeq(dt);
    if (boat.mooring) boat.mooring(dt); else lastD = simBoat(dt);
    boatTrail(dt); simWaves(dt); simNPCs(dt);
    if (started) { collectItems(dt); chartTick(dt); veilCheck(dt); }
    checkDocks(); checkDiscoveries(dt); simRadio(dt); simAmbience(dt);
  } else updateSeq(dt);
  waterSound(lastD);
  updateCamera(dt);
  fogUpT += dt;
  if (fogDirty && fogUpT > 0.1) { fogUpT = 0; fogDirty = false; uploadFog(); }
  drawWorld(glc, cssW);
  drawOverlay(lastD);
  drawInstruments(lastD, dt);
  saveT += dt; if (saveT > 12) { saveT = 0; save(); }
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
async function boot() {
  glc = $('#gl'); ctx = $('#ov').getContext('2d');
  glScale = Math.min(devicePixelRatio || 1, 1.25);
  resize(); addEventListener('resize', resize);
  const p = $('#prog');
  if (!initGL(glc)) { p.textContent = 'This chart needs WebGL 2, which this browser does not offer.'; return; }
  setupInput();
  prepareDefs();
  await buildTerrain(v => p.textContent = `Sounding the sea… ${Math.round(v * 100)}%`);
  await buildCurrents(v => p.textContent = `Working out the tidal streams… ${Math.round(v * 100)}%`);
  p.textContent = 'Charting the harbours…'; await nextTick();
  buildNav();
  placeWorld();
  setupTraffic();
  for (const b of npcs) if (b.kind === 'fishing') { const f = { follow: b, birds: [] }; for (let k = 0; k < 6; k++) f.birds.push({ w: (k % 2 ? -1 : 1) * (0.2 + h01(k, 3) * 0.2), p: h01(k, 9) * TAU, r: 30 + h01(k, 5) * 40, alt: 15 + h01(k, 1) * 20 }); gulls.push(f); }
  initChart();
  const home = docks.find(d => d.id === 'lm-yard');
  boat.x = home.berth.x; boat.y = home.berth.y; boat.h = home.berth.h; boat.tied = home;
  const resumed = load();
  updateTide(0);
  if (!resumed) { reveal(boat.x, boat.y, 1400); const k = docks.find(d => d.id === 'kestle'); if (k) reveal(k.berth.x, k.berth.y, 300); }
  for (const l of labels) if (fogAt(l.x, l.y) > 170) l.found = true;
  if (!resumed) for (const f of finds) if (fogAt(f.x, f.y) > 175) f.found = true;
  cam.x = boat.x; cam.y = boat.y; cam.z = Math.log(4.6);
  setupGL(buildMask()); tidePath(); updateCounts();
  p.textContent = resumed ? 'Your chart is where you left it.' : 'Chart ready.';
  const go = $('#b-go'); go.disabled = false; go.textContent = resumed ? 'Carry on' : 'Cast off'; go.focus();
  go.addEventListener('click', () => {
    initAudio(); audioKick(); started = true; $('#intro').hidden = true;
    if (boat.tied) castOffFrom(boat.tied); else startEngines();
    if (!resumed) {
      toast('Lanternmouth', 'Tanks full, hull sound. W and S set the throttle and it stays where you leave it; A and D steer. Or hold on the water to steer.', 7000);
      toast('', 'Press F for the nearest fuel, H for heading-up, M for the whole chart.', 5200);
    } else toast('Welcome back', `${st.pages} of 8 log pages found.`, 3600);
  }, { once: true });
  // physics without drawing, for tests: n steps of 1/60 s with the lever and wheel held
  const step = (n, thr, steer) => {
    const out = [], dt = 1 / 60;
    for (let i = 0; i < n; i++) {
      lever = thr; input.thr = thr; input.steer = steer || 0;
      time += dt; updateTide(dt); updateSeq(dt);
      if (boat.mooring) boat.mooring(dt); else simBoat(dt);
      boatTrail(dt); simWaves(dt); simNPCs(dt); checkDocks();
      if (started) { collectItems(dt); chartTick(dt); checkDiscoveries(dt); }
      if (i % 60 === 59) out.push({ t: Math.round((i + 1) / 60), kn: +(boat.u * MS_TO_KN).toFixed(1), plane: +boat.plane.toFixed(2), trim: +boat.trim.toFixed(1), def: +boat.deficit.toFixed(2), fuel: +st.fuel.toFixed(1), label: planeLabel(), hdg: Math.round(bearingDeg(Math.cos(boat.h), Math.sin(boat.h))), x: boat.x | 0, y: boat.y | 0 });
    }
    return out;
  };
  // hosts that hot-swap the page (Claude artifacts) ask for a snapshot first: save the voyage
  try { window.claude?.hot?.snapshot?.(() => { save(); return { saved: true }; }); } catch (e) { }
  window.__settleCam = n => { for (let i = 0; i < n; i++) updateCamera(1 / 60); };
  window.__startDock = startDocking; window.__leaveYard = leaveYard; window.__castOff = castOffFrom; window.__emitWake = emitWake;
  window.__fog = { step, boat, cam, st, UP, tide, docks: () => docks, npcs: () => npcs, heightAt, hDatum, reveal, S, setPaused: v => paused = v, chartAll: v => { chartAll = v; }, openYard, findFuel, toggleHeadUp, teleport: (x, y, h) => { boat.x = x; boat.y = y; boat.h = h || 0; boat.u = boat.v = boat.r = boat.plane = boat.trim = 0; boat.tied = null; boat.auto = null; cam.x = x; cam.y = y; }, labels: () => labels, items: () => items, towns: () => towns, roads: () => roads };
  requestAnimationFrame(t => { lastT = t; frame(t); });
}
boot().catch(err => { $('#prog').textContent = 'The chart could not be drawn: ' + err.message; console.error(err); });

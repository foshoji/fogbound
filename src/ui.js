'use strict';
/* HUD, dialogs, the boatworks, and input. */

/* ---------- toasts and the radio ---------- */
const toastQ = []; let toastBusy = false;
function toast(title, body, ms = 3600) { if (toastQ.length > 4) toastQ.shift(); toastQ.push({ title, body, ms }); if (!toastBusy) nextToast(); }
function nextToast() {
  const el = $('#toast'), t = toastQ.shift(); if (!t) { toastBusy = false; return; }
  toastBusy = true; el.innerHTML = (t.title ? `<b>${esc(t.title)}</b>` : '') + (t.body || ''); el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); setTimeout(nextToast, 380); }, t.ms);
}
let radioHide = 0;
function radioLine(who, text) {
  const el = $('#radio'); el.innerHTML = `<span class="ch">CH 16</span><b>${esc(who)}</b> ${esc(text)}`; el.classList.add('show');
  clearTimeout(radioHide); radioHide = setTimeout(() => el.classList.remove('show'), 8000);
}
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 220); }
function updateCounts(which) {
  $('#c-float').textContent = st.floats;
  $('#c-page').textContent = `${st.pages} / 8`;
  $('#c-chart').textContent = `${chartedPct()}%`;
  if (which) bump($(which));
}

/* ---------- instruments ---------- */
const depthHist = new Array(150).fill(10);
let instT = 0, sampT = 0;
const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function tidePath() {
  const cyc = TIDE.hold + TIDE.trans, tot = cyc * 4, X = t => t / tot * 160, Y = l => 17 - l * 9.5;
  let d = `M0 ${Y(TIDE.level[0])}`;
  for (let k = 0; k < 4; k++) { const t0 = k * cyc; d += `L${X(t0 + TIDE.hold)} ${Y(TIDE.level[k])}`; for (let i = 1; i <= 8; i++) { const p = sstep(0, 1, i / 8); d += `L${X(t0 + TIDE.hold + TIDE.trans * i / 8)} ${Y(lerp(TIDE.level[k], TIDE.level[(k + 1) % 4], p))}`; } }
  $('#t-path').setAttribute('d', d);
}
function drawInstruments(D, dt) {
  sampT += dt; if (sampT > 0.08) { sampT = 0; depthHist.push(Math.max(0, D)); depthHist.shift(); }
  // the planing icon moves every frame; the rest ten times a second
  const hull = $('#pl-hull'), p = boat.plane;
  hull.setAttribute('transform', `translate(0 ${(-p * 2.6 - boat.heave * 2).toFixed(2)}) rotate(${(-boat.trim - boat.pitch * 6).toFixed(2)} 16 31)`);
  $('#pl-spray').style.opacity = (p * sstep(8, 14, boat.u)).toFixed(2);
  $('#pl-wash').style.opacity = (sstep(3, 7, boat.u) * (1 - p) * 0.9).toFixed(2);
  instT += dt; if (instT < 0.1) return; instT = 0;
  const sog = Math.hypot(boat.gx, boat.gy) * MS_TO_KN;
  $('#i-spd').textContent = sog.toFixed(sog < 10 ? 1 : 0);
  const lbl = planeLabel(), pl = $('#i-plane'); if (pl.textContent !== lbl) { pl.textContent = lbl; pl.className = 'plane-l ' + (lbl === 'Planing' ? 'on' : lbl === 'Ploughing' ? 'bad' : ''); }
  $('#i-thr').style.width = (Math.abs(boat.thr) * 100) + '%'; $('#i-thr').classList.toggle('astern', boat.thr < -0.02);
  $('#i-rpm').textContent = boat.running ? `${Math.round(700 + boat.rpm * 5300)} rpm` : (boat.seq && boat.seq.kind === 'start' ? 'cranking' : 'engines off');
  const dEl = $('#i-depth'); dEl.textContent = D > 0 ? (D < 20 ? D.toFixed(1) : Math.round(D)) + ' m' : 'aground'; dEl.classList.toggle('warn', D < 1.2);
  $('#i-hdg').textContent = fmtBearing(bearingDeg(Math.cos(boat.h), Math.sin(boat.h)));
  const cap = tankCap(), fp = st.fuel / cap;
  $('#b-fuel').style.width = (fp * 100) + '%'; $('#b-fuel').classList.toggle('low', fp < 0.2);
  const burn = 0.006 + 0.24 * Math.pow(Math.max(0.55, Math.abs(boat.thr)), 1.6);
  $('#t-fuel').textContent = st.fuel <= 0 ? 'empty' : `${Math.round(st.fuel)} L · ${fmtT(st.fuel / burn)}`;
  $('#b-hull').style.width = st.hull + '%'; $('#b-hull').classList.toggle('low', st.hull < 70); $('#t-hull').textContent = Math.round(st.hull) + '%';
  // sounder trace
  const sc = $('#sounder'), sctx = sc.getContext('2d'), r = sc.getBoundingClientRect(), w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
  if (sc.width !== w || sc.height !== h) { sc.width = w; sc.height = h; }
  const mx = Math.max(10, ...depthHist) * 1.15;
  const g = sctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#cfeceb'); g.addColorStop(1, '#2f6f98');
  sctx.fillStyle = g; sctx.fillRect(0, 0, w, h);
  sctx.fillStyle = '#b89a6a'; sctx.beginPath(); sctx.moveTo(0, h); depthHist.forEach((d, i) => sctx.lineTo(i / (depthHist.length - 1) * w, d / mx * h)); sctx.lineTo(w, h); sctx.fill();
  sctx.strokeStyle = '#3e3122'; sctx.lineWidth = dpr; sctx.beginPath(); depthHist.forEach((d, i) => { const x = i / (depthHist.length - 1) * w, y = d / mx * h; i ? sctx.lineTo(x, y) : sctx.moveTo(x, y); }); sctx.stroke();
  sctx.fillStyle = '#1d2b33'; sctx.font = `${9 * dpr}px "Azeret Mono", monospace`; sctx.textAlign = 'right'; sctx.fillText(Math.round(mx) + ' m', w - 3 * dpr, h - 3 * dpr);
  // tide
  const cyc = TIDE.hold + TIDE.trans, u = tide.t % cyc, ph = (tide.t % (cyc * 4)) / (cyc * 4) * 160;
  $('#t-mark').setAttribute('x1', ph); $('#t-mark').setAttribute('x2', ph);
  const nk = (tide.k + 1) % 4, levelTxt = (tide.level >= 0 ? '+' : '') + tide.level.toFixed(1) + ' m';
  if (tide.p > 0) { $('#t-name').textContent = `→ ${TIDE.short[nk]}`; $('#t-next').textContent = `${tide.level < TIDE.level[nk] ? 'Rising' : 'Falling'} · ${levelTxt}`; }
  else { $('#t-name').textContent = TIDE.name[tide.k].split(' · ')[0]; $('#t-next').textContent = `${levelTxt} · turns in ${fmtT(TIDE.hold - u)}`; }
  const cs = Math.abs(tide.stream);
  $('#t-stream').textContent = cs < 0.1 ? 'Streams slack' : `${tide.stream > 0 ? 'Flood' : 'Ebb'} running`;
  // compass and scale
  $('#rose').style.transform = `rotate(${cam.rot}rad)`;
  const s = S(), target = 120 / s, nice = [20, 50, 100, 200, 500, 1000, 2000, 5000].find(v => v >= target * 0.6) || 5000;
  $('#scale-bar').style.width = (nice * s) + 'px'; $('#scale-t').textContent = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
  const rem = remAt(boat.x, boat.y);
  $('#vis').textContent = rem < 0.15 ? 'Visibility good' : rem < 0.45 ? 'Visibility moderate' : rem < 0.75 ? 'Visibility poor' : 'Visibility very poor';
}

/* ---------- the dock prompt ---------- */
let nearDock = null;
function checkDocks() {
  let best = null, bd = 1e9;
  for (const d of docks) { const dist = Math.hypot(boat.x - d.berth.x, boat.y - d.berth.y); if (dist < DOCK_R && dist < bd) { bd = dist; best = d; } }
  const bar = $('#dockbar'), btn = $('#b-dock'), hint = $('#dock-hint');
  if (!best || boat.auto || boat.tied || boat.seq || paused || !started) { bar.hidden = true; nearDock = null; return; }
  nearDock = best; bar.hidden = false;
  const slow = Math.hypot(boat.gx, boat.gy) < 4.5;
  btn.hidden = !slow; hint.hidden = slow;
  btn.innerHTML = `${best.type === 'landing' ? 'Go ashore' : 'Come alongside'} · ${esc(best.name)} <kbd>⏎</kbd>`;
}
function startDocking(d) {
  $('#dockbar').hidden = true;
  const wps = [];
  const ahead = Math.hypot(boat.x - d.berth.x, boat.y - d.berth.y) > 30;
  if (ahead) { const ax = d.berth.x - Math.cos(d.berth.h) * 26, ay = d.berth.y - Math.sin(d.berth.h) * 26; wps.push([ax, ay]); }
  wps.push([d.berth.x, d.berth.y]);
  boat.auto = { mode: 'dock', d, wps, i: 0, t: 0 };
}
function arrive(d) { if (d.type === 'landing') landAt(d); else openYard(d); }

/* ---------- dialogs ---------- */
let cardThen = null;
function openCard(eye, title, html, then) {
  paused = true; cardThen = then || null;
  $('#card-eye').textContent = eye; $('#card-title').textContent = title; $('#card-body').innerHTML = html;
  $('#card').hidden = false; $('#card-go').textContent = boat.tied ? (boat.tied.type === 'landing' ? 'Back aboard' : 'Cast off') : 'Carry on'; $('#card-go').focus();
}
// anything that stops the game stops the engines first, and lets her drift to a halt
function presentCard(eye, title, html, then) {
  if (boat.running && !boat.tied) { cutEngines(() => setTimeout(() => openCard(eye, title, html, then), 250)); }
  else openCard(eye, title, html, then);
}
function closeCard() {
  $('#card').hidden = true; paused = !$('#yard').hidden;
  const f = cardThen; cardThen = null;
  if (f) { f(); return; }
  if (boat.tied && $('#yard').hidden) { const d = boat.tied; castOffFrom(d); }
  else if (!boat.tied && !boat.running) startEngines();
  save();
}
function landAt(d) {
  const first = !got.has('beach:' + d.id);
  let body = `<p class="tag">${esc(d.tag || '')}</p><p>${esc(d.lore || 'A quiet landing.')}</p>`;
  if (first) { got.add('beach:' + d.id); st.floats += 10; body += `<p class="gain">+10 floats</p>`; }
  const page = items.find(it => it.beach === d.id && it.alive);
  if (page) { page.alive = false; got.add(page.id); body += `<p class="k">Tucked under a stone: a loose page, in a careful hand.</p>`; }
  updateCounts('#c-float');
  openCard('Ashore', d.name, body, page ? () => { $('#card').hidden = true; gainPage(page); } : null);
  save();
}
function gainPage(it) {
  st.pages++; st.floats += 10; SFX.page();
  updateCounts('#c-page'); updateCounts();
  const html = `<p class="page">${esc(it.text)}</p><p class="gain">+10 floats</p>` + (st.pages >= 8 ? `<p class="k">That is all eight. The rest of the log, if there is a rest, is out past the Veil.</p>` : '');
  const inner = () => openCard('The Wayfinder’s log', `Page ${it.n} of 8`, html);
  if (boat.tied) inner(); else presentCard('The Wayfinder’s log', `Page ${it.n} of 8`, html);
  if (st.pages >= 8) { chartAll = true; }
}

/* ---------- the boatworks: a floor plan ---------- */
const SHOP = {
  engine: { title: 'Engine bench', blurb: 'Twin outboards on the bracket. More power gets her over the hump sooner.', list: ENGINES, key: 'engine' },
  tank: { title: 'Fuel store', blurb: 'Bigger tanks, longer days. Fuel itself is free at every pump and barge.', list: TANKS, key: 'tank' },
  hull: { title: 'Hull bay', blurb: 'Fibreglass forgives a lot. These make it forgive more.', list: HULLS, key: 'hull' },
  radar: { title: 'Electronics desk', blurb: 'Radar is how you see through the fog, and how the chart gets drawn.', list: RADARS, key: 'radar' },
};
let yardDock = null, yardSel = 'engine';
function boatPlan(x, y, sc, rot) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})" stroke="#1d2b33" stroke-width="${1.1 / sc}">
    <path d="M6.3 0C5.6 -0.95 4.3 -1.72 2.2 -1.85L-5.95 -1.85Q-6.2 -1.85 -6.2 -1.6L-6.2 1.6Q-6.2 1.85 -5.95 1.85L2.2 1.85C4.3 1.72 5.6 0.95 6.3 0Z" fill="#e8e6df"/>
    <path d="M-5.6 -1.35L-2.4 -1.35L-2.4 1.35L-5.6 1.35Z" fill="#d7c2a4" stroke-width="${0.6 / sc}"/>
    <path d="M-2.7 -1.42L1.2 -1.42L1.2 1.42L-2.7 1.42Z" fill="none" stroke-dasharray="${3 / sc} ${2 / sc}"/>
    <rect x="-7.45" y="-1.18" width="1.25" height="0.8" rx="0.28" fill="#2b3034"/><rect x="-7.45" y="0.38" width="1.25" height="0.8" rx="0.28" fill="#2b3034"/></g>`;
}
function planSVG(d) {
  const ws = d.type === 'yard';
  const st_ = (id, x, y, w, h, label, glyph) => `<g class="station${yardSel === id ? ' sel' : ''}" data-st="${id}" role="button" tabindex="0" aria-label="${label}"><rect class="hit" x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 26}"/><rect class="frame" x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#1d2b33" stroke-width="1.4"/>${glyph}<text x="${x + w / 2}" y="${y + h + 15}" text-anchor="middle" font-family="IM Fell English SC, Georgia, serif" font-size="12" letter-spacing="1" fill="#1d2b33">${label}${UP[SHOP[id].key] ? ' ✓' : ''}</text></g>`;
  let s = `<svg viewBox="0 0 640 460" role="img" aria-label="Floor plan of ${esc(d.name)}"><defs>
    <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#1d2b33" stroke-width="1.2"/></pattern>
    <pattern id="water" width="22" height="9" patternUnits="userSpaceOnUse"><path d="M0 5 Q5.5 2 11 5 T22 5" fill="none" stroke="#4f86a8" stroke-width="0.9"/></pattern>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="rgba(29,43,51,.07)"/></pattern></defs>
    <rect width="640" height="460" fill="url(#grid)"/>
    <rect x="0" y="330" width="640" height="130" fill="url(#water)"/><line x1="0" y1="330" x2="640" y2="330" stroke="#1d2b33" stroke-width="2"/>
    <text x="24" y="440" font-family="IM Fell English, Georgia, serif" font-style="italic" font-size="14" fill="#2f5f82">${d.type === 'barge' ? 'Alongside · 40 m of water' : 'Harbour · soundings 2–4 m'}</text>`;
  if (ws) {
    s += `<path d="M60 40H250M390 40H580V300H410M230 300H60V40" fill="none" stroke="url(#hatch)" stroke-width="10"/><path d="M60 40H250M390 40H580V300H410M230 300H60V40" fill="none" stroke="#1d2b33" stroke-width="1"/>
      <path d="M270 110L370 110L380 460L260 460Z" fill="rgba(179,137,58,.08)" stroke="#1d2b33" stroke-width="1.2" stroke-dasharray="6 4"/>
      <text x="320" y="100" text-anchor="middle" font-family="IM Fell English SC, Georgia, serif" font-size="12" letter-spacing="1" fill="#1d2b33">Slipway</text>
      ${boatPlan(320, 225, 11, -90)}
      <g><line x1="60" y1="22" x2="580" y2="22" stroke="#1d2b33" stroke-width="0.8"/><line x1="60" y1="16" x2="60" y2="28" stroke="#1d2b33"/><line x1="580" y1="16" x2="580" y2="28" stroke="#1d2b33"/><text x="320" y="16" text-anchor="middle" font-family="Azeret Mono, monospace" font-size="10" fill="#1d2b33">28.0 m</text></g>`;
    s += st_('engine', 82, 62, 120, 60, 'Engine bench', `<rect x="96" y="74" width="16" height="36" rx="6" fill="#1f2326"/><rect x="118" y="74" width="16" height="36" rx="6" fill="#1f2326"/><circle cx="172" cy="96" r="9" fill="none" stroke="#1d2b33"/>`);
    s += st_('hull', 82, 170, 120, 90, 'Hull bay', `<path d="M96 196L186 196M96 214L186 214" stroke="#5a6166" stroke-width="5" stroke-linecap="round"/><path d="M104 240L178 240" stroke="#e0612b" stroke-width="3"/>`);
    s += st_('radar', 438, 62, 120, 60, 'Electronics', `<rect x="452" y="72" width="36" height="24" fill="#cfe3ea" stroke="#1d2b33"/><circle cx="520" cy="92" r="16" fill="none" stroke="#1d2b33"/><path d="M520 92L534 84" stroke="#2f6f98" stroke-width="2"/>`);
    s += st_('tank', 438, 170, 120, 90, 'Fuel store', `<rect x="456" y="186" width="30" height="58" rx="6" fill="#d9d6cc" stroke="#1d2b33"/><rect x="496" y="186" width="30" height="58" rx="6" fill="#d9d6cc" stroke="#1d2b33"/>`);
    s += `<g font-family="Azeret Mono, monospace" font-size="9" fill="#1d2b33"><rect x="470" y="386" width="160" height="62" fill="#fbf8ef" stroke="#1d2b33"/><line x1="470" y1="404" x2="630" y2="404" stroke="#1d2b33"/><text x="478" y="399" font-family="IM Fell English SC, Georgia, serif" font-size="12">${esc(d.name)}</text><text x="478" y="418">GROUND FLOOR · 1:50</text><text x="478" y="432">VESSEL: KESTREL</text><text x="478" y="444">SHEET 1 OF 1</text></g>`;
  } else if (d.type === 'barge') {
    s += `<rect x="120" y="200" width="400" height="120" rx="40" fill="#e9dcc8" stroke="#1d2b33" stroke-width="1.6"/><rect x="170" y="225" width="80" height="70" rx="30" fill="#fff" stroke="#1d2b33"/><rect x="270" y="225" width="80" height="70" rx="30" fill="#fff" stroke="#1d2b33"/><rect x="370" y="225" width="80" height="70" rx="30" fill="#fff" stroke="#1d2b33"/>${boatPlan(320, 375, 9, 0)}
      <text x="320" y="190" text-anchor="middle" font-family="IM Fell English SC, Georgia, serif" font-size="13" letter-spacing="1">${esc(d.name)}</text>`;
    s += st_('tank', 470, 232, 40, 40, 'Pump', `<rect x="482" y="242" width="16" height="20" fill="#2f7a4a"/>`);
    s += `<text x="24" y="40" font-family="IM Fell English, Georgia, serif" font-style="italic" font-size="15" fill="#1d2b33">A fuel barge. For fittings and proper repairs, find a boatworks.</text>`;
  } else {
    s += `<rect x="180" y="250" width="280" height="80" fill="url(#hatch)" stroke="#1d2b33"/><rect x="300" y="330" width="40" height="120" fill="#fff" stroke="#1d2b33" stroke-width="1.4"/>
      ${boatPlan(385, 400, 7, -90)}<text x="320" y="240" text-anchor="middle" font-family="IM Fell English SC, Georgia, serif" font-size="13" letter-spacing="1">Quay</text>`;
    s += st_('tank', 220, 270, 50, 40, 'Fuel pump', `<rect x="235" y="280" width="20" height="20" fill="#2f7a4a"/>`);
    s += `<text x="24" y="40" font-family="IM Fell English, Georgia, serif" font-style="italic" font-size="15" fill="#1d2b33">A fuel jetty. For fittings and proper repairs, find a boatworks.</text>`;
  }
  return s + `</svg>`;
}
function renderBench() {
  const sh = SHOP[yardSel], lvl = UP[sh.key], ws = yardDock.type === 'yard';
  let h = `<h3>${sh.title}</h3><p>${sh.blurb}</p>`;
  if (!ws) h += `<p class="k">Only a boatworks can fit this.</p>`;
  sh.list.forEach((t, i) => {
    const next = i === lvl + 1, can = ws && next && st.floats >= t.cost;
    h += `<div class="tier${i === lvl ? ' fitted' : ''}"><b>${t.name}</b>${i === lvl ? '<span class="tag">Fitted</span>' : i < lvl ? '<span class="tag">Replaced</span>' : next && ws ? `<button type="button" data-buy="${i}" ${can ? '' : 'disabled'}>Fit · ${t.cost} floats</button>` : `<span class="tag">${t.cost ? t.cost + ' floats' : ''}</span>`}<span>${t.note}</span></div>`;
  });
  $('#bench').innerHTML = h;
  $('#bench').querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.buy, t = sh.list[i]; if (st.floats < t.cost) return;
    st.floats -= t.cost; UP[sh.key] = i; SFX.fit();
    if (sh.key === 'tank') st.fuel = Math.min(tankCap(), st.fuel);
    updateYard(); updateCounts('#c-float'); save();
  }));
}
function updateYard() {
  const d = yardDock; if (!d) return;
  $('#plan').innerHTML = planSVG(d);
  $('#plan').querySelectorAll('.station').forEach(g => { const pick = () => { yardSel = g.dataset.st; updateYard(); }; g.addEventListener('click', pick); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }); });
  renderBench();
  $('#yard-purse').textContent = `${st.floats} floats`;
  const cap = tankCap();
  $('#y-fuel').style.width = (st.fuel / cap * 100) + '%'; $('#y-fuel-t').textContent = `${Math.round(st.fuel)} / ${cap} L`;
  $('#y-fill').disabled = st.fuel >= cap - 0.5;
  $('#y-hull').style.width = st.hull + '%'; $('#y-hull-t').textContent = Math.round(st.hull) + '%';
  const need = 100 - st.hull, cost = Math.ceil(need / 5), ws = d.type === 'yard', rb = $('#y-repair');
  if (need < 0.5) { rb.textContent = 'Hull sound'; rb.disabled = true; }
  else if (!ws) { rb.textContent = st.hull < 75 ? 'Patch to 75% · free' : 'Needs a boatworks'; rb.disabled = st.hull >= 75; }
  else if (st.floats >= cost) { rb.textContent = `Repair · ${cost} floats`; rb.disabled = false; }
  else if (st.floats > 0) { rb.textContent = `Repair ${st.floats * 5}% · ${st.floats} floats`; rb.disabled = false; }
  else { rb.textContent = st.hull < 75 ? 'Patch to 75% · free' : 'Save up floats to repair'; rb.disabled = st.hull >= 75; }
}
function openYard(d) {
  yardDock = d; yardSel = d.type === 'yard' ? 'engine' : 'tank'; paused = true;
  $('#yard-title').textContent = d.name; $('#yard-sub').textContent = d.tag || '';
  $('#yard').hidden = false; updateYard(); SFX.fit(); $('#y-go').focus();
  if (d.type !== 'yard' && st.fuel < tankCap() - 0.5) { st.fuel = tankCap(); SFX.fuel(); updateYard(); }
}
function leaveYard() {
  const d = yardDock; $('#yard').hidden = true; yardDock = null; paused = !$('#card').hidden;
  if (d) castOffFrom(d);
  save();
}

/* ---------- input ---------- */
const keys = new Set(), pointers = new Map();
let steerP = null, pinch = null, ov = null;
function setupInput() {
  ov = $('#ov');
  ov.addEventListener('pointerdown', e => {
    ov.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.zUser }; steerP = null; }
    else if (pointers.size === 1) steerP = { id: e.pointerId, x: e.clientX, y: e.clientY };
    audioKick();
  });
  ov.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) { const [a, b] = [...pointers.values()]; cam.zUser = clamp(pinch.z + Math.log(Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d), -2.4, 1.8); }
    else if (steerP && steerP.id === e.pointerId) { steerP.x = e.clientX; steerP.y = e.clientY; }
  });
  const endP = e => { pointers.delete(e.pointerId); if (steerP && steerP.id === e.pointerId) { steerP = null; lever = 0; } if (pointers.size < 2) pinch = null; };
  ov.addEventListener('pointerup', endP); ov.addEventListener('pointercancel', endP);
  ov.addEventListener('wheel', e => { e.preventDefault(); const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; cam.zUser = clamp(cam.zUser - clamp(e.deltaY * k, -120, 120) * 0.0022, -2.4, 1.8); }, { passive: false });
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('#help').hidden) $('#help').hidden = true; else if (!$('#card').hidden) closeCard(); else if (!$('#yard').hidden) leaveYard(); return; }
    if (!$('#intro').hidden) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') { if (!$('#card').hidden) { e.preventDefault(); closeCard(); return; } if (!$('#yard').hidden) { e.preventDefault(); leaveYard(); return; } if (nearDock && !$('#b-dock').hidden) { e.preventDefault(); startDocking(nearDock); return; } }
    if (paused) return;
    if (k === 'h') { toggleHeadUp(); return; }
    if (k === 'f') { findFuel(); return; }
    if (k === 'm') { cam.chart = !cam.chart; return; }
    if ('01234'.includes(k) && k.length === 1) { lever = [0, 0.15, 0.45, 0.72, 1][+k]; return; }
    if (k === 'x' || k === ' ') { lever = 0; e.preventDefault(); return; }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'q', 'e', '-', '=', '+', '_'].includes(k)) { keys.add(k); e.preventDefault(); audioKick(); }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  $('#b-dock').addEventListener('click', () => { if (nearDock) startDocking(nearDock); });
  $('#card-go').addEventListener('click', closeCard);
  $('#y-go').addEventListener('click', leaveYard);
  $('#y-fill').addEventListener('click', () => { st.fuel = tankCap(); SFX.fuel(); updateYard(); });
  $('#y-repair').addEventListener('click', () => {
    const need = 100 - st.hull, cost = Math.ceil(need / 5), ws = yardDock && yardDock.type === 'yard';
    if (!ws || st.floats === 0) st.hull = Math.max(st.hull, 75);
    else if (st.floats >= cost) { st.floats -= cost; st.hull = 100; }
    else { st.hull = Math.min(100, st.hull + st.floats * 5); st.floats = 0; }
    SFX.fit(); updateYard(); updateCounts('#c-float'); save();
  });
  $('#b-mute').addEventListener('click', () => { A.on = !A.on; $('#b-mute').setAttribute('aria-pressed', String(!A.on)); $('#b-mute').classList.toggle('off', !A.on); if (A.master) A.master.gain.setTargetAtTime(A.on ? 0.9 : 0, A.ctx.currentTime, 0.05); });
  $('#b-hdg').addEventListener('click', toggleHeadUp);
  $('#compass').addEventListener('click', toggleHeadUp);
  $('#b-fuel').parentElement.addEventListener('click', findFuel);
  $('#b-help').addEventListener('click', () => { $('#help').hidden = false; });
  $('#help-close').addEventListener('click', () => { $('#help').hidden = true; });
  let resetArm = 0;
  $('#b-reset').addEventListener('click', () => {
    if (Date.now() - resetArm > 3000) { resetArm = Date.now(); $('#b-reset').textContent = 'Tap again'; setTimeout(() => $('#b-reset').textContent = 'New voyage', 3000); return; }
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { } location.reload();
  });
}
let lever = 0;
function readInput(dt) {
  let thr = lever, steer = 0;
  if (keys.has('arrowup') || keys.has('w')) lever = Math.min(1, lever + dt * 0.7);
  if (keys.has('arrowdown') || keys.has('s')) lever = Math.max(-0.5, lever - dt * 0.9);
  thr = lever;
  if (keys.has('arrowleft') || keys.has('a')) steer = -1;
  if (keys.has('arrowright') || keys.has('d')) steer = 1;
  if (keys.has('q') || keys.has('-') || keys.has('_')) cam.zUser = clamp(cam.zUser - dt * 1.4, -2.4, 1.8);
  if (keys.has('e') || keys.has('=') || keys.has('+')) cam.zUser = clamp(cam.zUser + dt * 1.4, -2.4, 1.8);
  if (steerP) {
    const [bx, by] = w2s(boat.x, boat.y), dx = steerP.x - bx, dy = steerP.y - by, dist = Math.hypot(dx, dy);
    if (dist > 24) {
      const [wx, wy] = s2w(steerP.x, steerP.y), want = Math.atan2(wy - boat.y, wx - boat.x), d = angDiff(boat.h, want);
      steer = clamp(d * 1.9, -1, 1); thr = clamp((dist - 24) / 220, 0.1, 1) * (Math.abs(d) > 2.2 ? 0.35 : 1); lever = thr;
    }
  }
  input.thr = thr; input.steer = steer;
}
function toggleHeadUp() { cam.headUp = !cam.headUp; $('#b-hdg').textContent = cam.headUp ? 'Head up' : 'North up'; $('#b-hdg').setAttribute('aria-pressed', String(cam.headUp)); save(); }

/* F: the nearest fuel, then the next nearest, and so on */
function findFuel() {
  const list = docks.filter(d => d.type !== 'landing').map(d => ({ d, dist: Math.hypot(d.berth.x - boat.x, d.berth.y - boat.y) })).sort((a, b) => a.dist - b.dist);
  const idx = finder && time < finder.until ? (finder.idx + 1) % Math.min(3, list.length) : 0;
  const { d, dist } = list[idx];
  finder = { d, idx, until: time + 10 };
  const sp = Math.max(8, Math.hypot(boat.gx, boat.gy));
  toast(idx ? 'Next nearest fuel' : 'Nearest fuel', `${esc(d.name)} · ${fmtNm(dist)} · bearing ${fmtBearing(bearingDeg(d.berth.x - boat.x, d.berth.y - boat.y))} · about ${Math.max(1, Math.round(dist / sp / 60))} min`, 3800);
  SFX.radio();
}

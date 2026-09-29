'use strict';
/* The overlay canvas: everything that sits on the water or the land. World → screen goes
   through the camera's rotation, so heading-up works for all of it; text stays upright. */

let cssW = 1, cssH = 1, dpr = 1;
const S = () => Math.exp(cam.z);
function w2s(x, y) {
  const s = S(), dx = x - cam.x - cam.sx, dy = y - cam.y - cam.sy, c = Math.cos(cam.rot), sn = Math.sin(cam.rot);
  return [(dx * c - dy * sn) * s + cssW / 2, (dx * sn + dy * c) * s + cssH / 2];
}
function s2w(px, py) {
  const s = S(), ox = (px - cssW / 2) / s, oy = (py - cssH / 2) / s, c = Math.cos(cam.rot), sn = Math.sin(cam.rot);
  return [cam.x + cam.sx + c * ox + sn * oy, cam.y + cam.sy - sn * ox + c * oy];
}
const INK = '#1d2b33';
const HC = () => 6000 / S();
// how much the height h (m) at screen point (sx, sy) leans outward, in screen px
const leanPx = (sx, sy, h) => { const k = h / HC(); return [(sx - cssW / 2) * k, (sy - cssH / 2) * k]; };

/* ---------- JS twin of the shader's fog, for fading things drawn on top of it ---------- */
function fogNJ(x, y) {
  const wx = x + 0.35 * vn(x * 0.6 + 9.1, y * 0.6 + 2.7, 2), wy = y + 0.35 * vn(x * 0.6 + 9.1, y * 0.6 + 2.7, 3);
  const rx = 0.8 * wx - 0.6 * wy, ry = 0.6 * wx + 0.8 * wy, r2x = 0.8 * rx - 0.6 * ry, r2y = 0.6 * rx + 0.8 * ry;
  return vn(wx, wy, 0) * 0.55 + vn(rx * 2.03 + 4.1, ry * 2.03 + 1.3, 1) * 0.28 + vn(r2x * 4.1 + 1.7, r2y * 4.1 + 8.3, 2) * 0.17;
}
function layerJ(x, y, rem, alt, scale, dx, dy, lo, hi, op, vis) {
  const f = 1 - alt / HC(), fade = sstep(0.3, 0.6, f); if (fade <= 0) return 0;
  const thick = sstep(lo, hi, rem); if (thick < 0.001) return 0;
  const n = fogNJ(x / scale + dx * time, y / scale + dy * time) * 0.5 + 0.5;
  const b = sstep(vis * 0.42, vis * 1.25, Math.hypot(x - boat.x, y - boat.y));
  return sstep(0.62 - 1.05 * thick, 0.98 - 0.85 * thick, n) * thick * b * fade * op * cam.atmo;
}
function fogOver(x, y) {
  if (!chartAll && fogAt(x, y) < 120) return 1;
  const rem = remAt(x, y), vis = visRadius();
  const a = layerJ(x, y, rem, 45, 520, 0.012, 0.004, -0.25, 0.5, 0.55, vis), b = layerJ(x, y, rem, 150, 900, 0.007, 0.003, 0.1, 0.7, 0.72, vis), c = layerJ(x, y, rem, 380, 1500, 0.004, 0.002, 0.35, 0.95, 0.88, vis);
  const veil = sstep(6800, 7900, Math.hypot(x - WC, y - WC));
  return 1 - (1 - a) * (1 - b) * (1 - c) * (1 - veil);
}

/* ---------- the boat, from above ---------- */
const P_HULL = new Path2D('M6.3 0C5.6 -0.95 4.3 -1.72 2.2 -1.85L-5.95 -1.85Q-6.2 -1.85 -6.2 -1.6L-6.2 1.6Q-6.2 1.85 -5.95 1.85L2.2 1.85C4.3 1.72 5.6 0.95 6.3 0Z');
const P_DECK = new Path2D('M5.95 0C5.3 -0.8 4.1 -1.5 2.2 -1.62L-5.85 -1.62L-5.85 1.62L2.2 1.62C4.1 1.5 5.3 0.8 5.95 0Z');
const P_RAIL = new Path2D('M5.5 0C4.9 -0.6 3.9 -1.2 2.2 -1.35M5.5 0C4.9 0.6 3.9 1.2 2.2 1.35');
const P_COCK = new Path2D('M-5.6 -1.35L-2.4 -1.35L-2.4 1.35L-5.6 1.35Z');
const P_SCREEN = new Path2D('M0.7 -1.45C1.5 -1.3 1.9 -0.6 1.95 0C1.9 0.6 1.5 1.3 0.7 1.45L0.95 0Z');
const P_TOP = new Path2D('M-2.7 -1.42L0.75 -1.42Q1.2 -1.42 1.2 -0.95L1.2 0.95Q1.2 1.42 0.75 1.42L-2.7 1.42Q-3 1.42 -3 1.1L-3 -1.1Q-3 -1.42 -2.7 -1.42Z');
function drawYourBoat(sx, sy, s, alpha, D) {
  const h = boat.h + cam.rot, c = Math.cos(h), si = Math.sin(h);
  const rollK = boat.roll, lift = boat.trim / 7 + boat.heave * 0.4 + boat.pitch * 0.3;
  const hc = HC();
  // things higher up the boat lean away from the screen centre, and to the low side in a bank
  const off = hgt => {
    const lx = (sx - cssW / 2) / s * hgt / hc, ly = (sy - cssH / 2) / s * hgt / hc;
    const bx = lx * c + ly * si, by = -lx * si + ly * c;
    return [bx - lift * hgt * 0.12, by + rollK * hgt * 0.35];
  };
  ctx.save(); ctx.globalAlpha = alpha;
  // shadow on the water: further off the hull the more she lifts
  const so = 0.5 + lift * 0.9 + Math.min(D, 10) * 0.25, sa = 0.22 * (1 - sstep(3, 16, D)) + 0.07;
  ctx.save(); ctx.translate(sx + so * s * 0.7, sy + so * s * 0.8); ctx.rotate(h); ctx.scale(s, s); ctx.fillStyle = `rgba(12,34,48,${sa})`; ctx.fill(P_HULL); ctx.restore();
  ctx.translate(sx, sy); ctx.rotate(h);
  const pb = 1 + boat.pitch * 0.02;
  ctx.scale(s * pb, s);
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.fillStyle = '#2d3942'; ctx.fill(P_HULL);
  ctx.strokeStyle = '#11181d'; ctx.lineWidth = 0.1; ctx.stroke(P_HULL);
  ctx.fillStyle = '#efede7'; ctx.fill(P_DECK);
  ctx.strokeStyle = '#e0612b'; ctx.lineWidth = 0.14; ctx.stroke(P_DECK);
  if (s > 3) { ctx.fillStyle = 'rgba(0,0,0,.06)'; for (let x = 2.4; x < 5.2; x += 0.45) for (let y = -0.9; y <= 0.9; y += 0.45) if (Math.abs(y) < (5.8 - x) * 0.6) ctx.fillRect(x, y, 0.1, 0.1); }
  ctx.fillStyle = 'rgba(60,70,78,.35)'; ctx.beginPath(); ctx.roundRect(2.6, -0.45, 0.9, 0.9, 0.15); ctx.fill();
  ctx.strokeStyle = '#b9c2c8'; ctx.lineWidth = 0.07; ctx.stroke(P_RAIL);
  ctx.fillStyle = '#b3865a'; ctx.fill(P_COCK);
  if (s > 4) { ctx.strokeStyle = 'rgba(70,45,20,.35)'; ctx.lineWidth = 0.03; ctx.beginPath(); for (let y = -1.2; y < 1.35; y += 0.22) { ctx.moveTo(-5.6, y); ctx.lineTo(-2.4, y); } ctx.stroke(); }
  ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.roundRect(-5.55, -1.3, 0.8, 2.6, 0.25); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 0.05; ctx.stroke();
  // outboards, steered with the wheel
  for (const y of [-0.78, 0.78]) {
    ctx.save(); ctx.translate(-6.2, y); ctx.rotate(-boat.steer * 0.32);
    ctx.fillStyle = '#15191c'; ctx.beginPath(); ctx.roundRect(-1.25, -0.4, 1.25, 0.8, 0.28); ctx.fill();
    ctx.fillStyle = '#e0612b'; ctx.fillRect(-1.0, -0.06, 0.75, 0.12);
    ctx.restore();
  }
  // nav lights
  ctx.fillStyle = '#d33a2c'; ctx.beginPath(); ctx.arc(4.7, -1.2, 0.13, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2f9b5b'; ctx.beginPath(); ctx.arc(4.7, 1.2, 0.13, 0, TAU); ctx.fill();
  // windscreen and hardtop, lifted
  let [ox, oy] = off(1.4);
  ctx.save(); ctx.translate(ox, oy); ctx.fillStyle = 'rgba(40,62,78,.85)'; ctx.fill(P_SCREEN); ctx.strokeStyle = 'rgba(190,225,240,.5)'; ctx.lineWidth = 0.06; ctx.stroke(P_SCREEN); ctx.restore();
  [ox, oy] = off(2.4);
  ctx.save(); ctx.translate(ox * 0.5, oy * 0.5); ctx.fillStyle = 'rgba(15,20,24,.18)'; ctx.fill(P_TOP); ctx.restore();
  ctx.save(); ctx.translate(ox, oy);
  const g = ctx.createLinearGradient(0, -1.4, 0, 1.4); g.addColorStop(0, '#3b4650'); g.addColorStop(1, '#232b32');
  ctx.fillStyle = g; ctx.fill(P_TOP);
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 0.06; ctx.stroke(P_TOP);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(0.85, -1.1, 0.14, 2.2);
  if (UP.radar) { ctx.fillStyle = '#f5f5f2'; if (UP.radar > 1) { ctx.save(); ctx.translate(-0.9, 0); ctx.rotate(time * 4); ctx.fillRect(-0.12, -1.1, 0.24, 2.2); ctx.restore(); } else { ctx.beginPath(); ctx.arc(-0.9, 0, 0.55, 0, TAU); ctx.fill(); } }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-2.6, 0, 0.12, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.restore();
}

/* ---------- the chase-cam card you see when you're high up ---------- */
const MODEL = (() => {
  const deck = [[6.3, 0, 1.5], [5.3, 1.0, 1.35], [4.0, 1.55, 1.22], [2.2, 1.85, 1.15], [-6.2, 1.85, 1.1]];
  const wl = [[5.3, 0, 0.05], [4.4, 1.05, 0], [2.4, 1.55, 0], [-6.1, 1.62, 0]];
  return { deck, wl };
})();
function drawChaseCam(bx, by, alpha) {
  const Wc = 176, Hc = 120, pad = 14;
  let cx = clamp(bx, Wc / 2 + 12, cssW - Wc / 2 - 12), cy = by - Hc / 2 - 34;
  const below = cy - Hc / 2 < 64; if (below) cy = by + Hc / 2 + 34;
  ctx.save(); ctx.globalAlpha = alpha;
  // pointer
  ctx.fillStyle = INK; ctx.beginPath();
  if (below) { ctx.moveTo(bx, by + 8); ctx.lineTo(cx - 9, cy - Hc / 2 + 2); ctx.lineTo(cx + 9, cy - Hc / 2 + 2); }
  else { ctx.moveTo(bx, by - 8); ctx.lineTo(cx - 9, cy + Hc / 2 - 2); ctx.lineTo(cx + 9, cy + Hc / 2 - 2); }
  ctx.fill();
  ctx.beginPath(); ctx.arc(bx, by, 4, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
  // card
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(cx - Wc / 2 - 3, cy - Hc / 2 - 3, Wc + 6, Hc + 6, 10); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save(); ctx.beginPath(); ctx.roundRect(cx - Wc / 2, cy - Hc / 2, Wc, Hc, 8); ctx.clip();
  const rem = remAt(boat.x, boat.y);
  // the camera: behind, above, a little off to starboard
  const yaw = -boat.r * 0.9 + Math.sin(time * 0.3) * 0.03;
  const eye = [-21, 6.5, 8.2], tgt = [1.5, 0, 1.4];
  const f = norm3(sub3(tgt, eye)), rt = norm3(cross3(f, [0, 0, 1])), up = cross3(rt, f), focal = 150;
  const trim = -boat.trim * Math.PI / 180 - boat.pitch * 0.05, roll = boat.roll * 0.6;
  const ct = Math.cos(trim), stt = Math.sin(trim), cr = Math.cos(roll), sr = Math.sin(roll), cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const heave = boat.heave * 0.5 + boat.plane * 0.25;
  const xf = p => { let [x, y, z] = p; z -= 0.4; const x1 = x * ct - z * stt, z1 = x * stt + z * ct; const y2 = y * cr - z1 * sr, z2 = y * sr + z1 * cr; const x3 = x1 * cyw - y2 * syw, y3 = x1 * syw + y2 * cyw; return [x3, y3, z2 + 0.4 + heave]; };
  const proj = p => { const d = sub3(p, eye), z = dot3(d, f); return [cx + dot3(d, rt) / z * focal, cy + 12 - dot3(d, up) / z * focal, z]; };
  const P = p => proj(xf(p));
  // sky and sea
  const hy = proj([400, 0, 0])[1];
  const sky = ctx.createLinearGradient(0, cy - Hc / 2, 0, hy);
  sky.addColorStop(0, `rgb(${lerp(196, 176, rem)},${lerp(210, 186, rem)},${lerp(214, 192, rem)})`); sky.addColorStop(1, `rgb(${lerp(226, 200, rem)},${lerp(232, 206, rem)},${lerp(230, 208, rem)})`);
  ctx.fillStyle = sky; ctx.fillRect(cx - Wc / 2, cy - Hc / 2, Wc, hy - (cy - Hc / 2) + 1);
  const sea = ctx.createLinearGradient(0, hy, 0, cy + Hc / 2);
  sea.addColorStop(0, `rgb(${lerp(150, 170, rem)},${lerp(178, 180, rem)},${lerp(188, 186, rem)})`); sea.addColorStop(1, `rgb(${lerp(34, 38, rem)},${lerp(92, 70, rem)},${lerp(122, 92, rem)})`);
  ctx.fillStyle = sea; ctx.fillRect(cx - Wc / 2, hy, Wc, cy + Hc / 2 - hy);
  // the water moving past
  const sp = Math.hypot(boat.gx, boat.gy);
  boat.camTravel = ((boat.camTravel || 0) + sp / 60) % 6;
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
  for (let k = -2; k < 26; k++) { const x = 30 - k * 6 + boat.camTravel; const [, y, z] = proj([x, 0, 0]); if (z < 2) continue; const a = clamp(1 - z / 60, 0, 1) * 0.5; ctx.globalAlpha = alpha * a; ctx.beginPath(); ctx.moveTo(cx - Wc / 2, y); ctx.lineTo(cx + Wc / 2, y); ctx.stroke(); }
  for (let k = 0; k < 14; k++) { const fx = 40 - ((k * 13.7 + boat.camTravel * 2.2 + time * sp * 0.3) % 60), fy = ((k * 7.31) % 16) - 8; const [x, y, z] = proj([fx, fy, 0]); if (z < 2) continue; ctx.globalAlpha = alpha * 0.5 * clamp(1 - z / 45, 0, 1); ctx.fillStyle = '#fff'; ctx.fillRect(x - 1.5, y, 3, 1); }
  ctx.globalAlpha = alpha;
  // wake behind her
  if (sp > 1) {
    const k = clamp(sp / 20, 0, 1), L = 14 + 26 * k;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.4 * k})`;
    const a1 = P([-6.4, -1.1, 0]), a2 = P([-6.4, 1.1, 0]), b1 = P([-6.4 - L, -1.8 - L * 0.12, 0]), b2 = P([-6.4 - L, 1.8 + L * 0.12, 0]);
    ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(a2[0], a2[1]); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * k})`; ctx.lineWidth = 1.4;
    for (const sd of [-1, 1]) { const s0 = P([-4, sd * 1.8, 0]), s1 = P([-4 - L * 1.4, sd * (1.8 + L * 1.4 * 0.35), 0]); ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke(); }
  }
  // hull: sides, transom, deck
  const side = sd => { const pts = [...MODEL.deck.map(p => [p[0], p[1] * sd, p[2]]), ...MODEL.wl.slice().reverse().map(p => [p[0], p[1] * sd, p[2]])]; return pts.map(P); };
  const poly = (pts, fill) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  poly(side(-1), '#26313a'); poly(side(1), '#34414b');
  const tr = [[-6.2, -1.85, 1.1], [-6.2, 1.85, 1.1], [-6.1, 1.62, 0], [-6.1, -1.62, 0]].map(P);
  poly(tr, '#1e272e');
  ctx.strokeStyle = '#e0612b'; ctx.lineWidth = 1.2; ctx.beginPath(); [[-6.2, -1.8, 0.75], [-6.2, 1.8, 0.75]].map(P).forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
  for (const sd of [-1, 1]) { ctx.beginPath(); [[-6.2, sd * 1.84, 0.8], [2.2, sd * 1.84, 0.85], [4.0, sd * 1.54, 0.95], [5.3, sd * 1.0, 1.08]].map(P).forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }
  const deck = [...MODEL.deck.map(p => [p[0], -p[1], p[2]]), ...MODEL.deck.slice().reverse().map(p => [p[0], p[1], p[2]])].map(P);
  poly(deck, '#ecebe5');
  poly([[-5.6, -1.4, 1.1], [-2.4, -1.4, 1.1], [-2.4, 1.4, 1.1], [-5.6, 1.4, 1.1]].map(P), '#b3865a');
  // name on the transom
  const nm = P([-6.25, 0, 0.5]);
  ctx.fillStyle = 'rgba(240,236,228,.85)'; ctx.font = '600 7px "Azeret Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('KESTREL', nm[0], nm[1] + 2);
  // hardtop: posts, roof, windscreen
  ctx.strokeStyle = '#1b2227'; ctx.lineWidth = 2;
  for (const [x, y] of [[-2.8, -1.35], [-2.8, 1.35], [0.9, -1.35], [0.9, 1.35]]) { const a = P([x, y, 1.1]), b = P([x, y, 2.55]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  poly([[0.9, -1.4, 1.2], [1.8, -1.35, 1.25], [1.25, -1.3, 2.3], [0.9, -1.4, 2.5]].map(P), 'rgba(50,78,96,.8)');
  poly([[0.9, 1.4, 1.2], [1.8, 1.35, 1.25], [1.25, 1.3, 2.3], [0.9, 1.4, 2.5]].map(P), 'rgba(60,90,108,.8)');
  poly([[-3.0, -1.45, 2.55], [1.2, -1.45, 2.6], [1.2, 1.45, 2.6], [-3.0, 1.45, 2.55]].map(P), '#2c363e');
  poly([[-3.0, -1.45, 2.55], [-3.0, 1.45, 2.55], [-3.0, 1.45, 2.4], [-3.0, -1.45, 2.4]].map(P), '#1a2025');
  if (UP.radar) { const r0 = P([-0.9, 0, 2.95]); ctx.fillStyle = '#f2f2ee'; ctx.beginPath(); ctx.ellipse(r0[0], r0[1], 5, 3, 0, 0, TAU); ctx.fill(); }
  // outboards
  for (const y of [-0.78, 0.78]) {
    const st_ = -boat.steer * 0.3;
    const pt = (x, yy, z) => { const dx = x + 6.2; return P([-6.2 + dx * Math.cos(st_), y + yy + dx * Math.sin(st_), z]); };
    poly([pt(-0.3, -0.38, 0.1), pt(-0.3, 0.38, 0.1), pt(-1.2, 0.36, 0.3), pt(-1.25, 0.34, 1.55), pt(-1.25, -0.34, 1.55), pt(-1.2, -0.36, 0.3)], '#15191c');
    poly([pt(-1.25, -0.34, 1.55), pt(-1.25, 0.34, 1.55), pt(-0.2, 0.3, 1.7), pt(-0.2, -0.3, 1.7)], '#2a3034');
    const l1 = pt(-1.26, -0.3, 1.1), l2 = pt(-1.26, 0.3, 1.1); ctx.strokeStyle = '#e0612b'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(l1[0], l1[1]); ctx.lineTo(l2[0], l2[1]); ctx.stroke();
  }
  // spray off the chines when she's up and running
  if (boat.plane > 0.3) {
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let k = 0; k < 16; k++) { const sd = k % 2 ? 1 : -1, t = ((time * 3 + k * 0.37) % 1), p = P([2 - t * 5, sd * (1.9 + t * 3.5), 0.2 + Math.sin(t * Math.PI) * 1.4]); ctx.globalAlpha = alpha * (1 - t) * boat.plane; ctx.beginPath(); ctx.arc(p[0], p[1], 1.2 + t * 1.5, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = alpha;
  }
  // fog across the top of the card, thicker far out
  const fg = ctx.createLinearGradient(0, cy - Hc / 2, 0, cy + Hc / 2);
  fg.addColorStop(0, `rgba(222,226,226,${0.25 + 0.6 * rem})`); fg.addColorStop(0.5, `rgba(222,226,226,${0.1 + 0.3 * rem})`); fg.addColorStop(1, 'rgba(222,226,226,0)');
  ctx.fillStyle = fg; ctx.fillRect(cx - Wc / 2, cy - Hc / 2, Wc, Hc);
  ctx.restore();
  // readout strip
  ctx.fillStyle = 'rgba(29,43,51,.82)'; ctx.fillRect(cx - Wc / 2, cy + Hc / 2 - 17, Wc, 17);
  ctx.fillStyle = '#f5f0e3'; ctx.font = '600 10px "Azeret Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`${(sp * MS_TO_KN).toFixed(0)} kn`, cx - Wc / 2 + 8, cy + Hc / 2 - 8.5);
  ctx.textAlign = 'right'; ctx.fillText(fmtBearing(bearingDeg(Math.cos(boat.h), Math.sin(boat.h))), cx + Wc / 2 - 8, cy + Hc / 2 - 8.5);
  ctx.textAlign = 'center'; ctx.font = 'italic 11px "IM Fell English", Georgia, serif'; ctx.fillText(planeLabel(), cx, cy + Hc / 2 - 8.5);
  ctx.restore();
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ---------- other boats ---------- */
function drawNPC(b, s) {
  const [x, y] = w2s(b.x, b.y); if (x < -120 || y < -120 || x > cssW + 120 || y > cssH + 120) return;
  const fa = 1 - fogOver(b.x, b.y); if (fa < 0.03) return;
  const kind = b.kind === 'moored' ? b.look : b.kind, L = b.len / 2;
  ctx.save(); ctx.globalAlpha = fa; ctx.translate(x, y); ctx.rotate(b.h + cam.rot + Math.sin(b.bob * 1.4 + b.ph) * 0.02);
  if (b.len * s < 7) { ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3, -2.4); ctx.lineTo(-3, 2.4); ctx.fill(); ctx.restore(); return; }
  ctx.scale(s, s);
  const Bm = b.len * (kind === 'ferry' ? 0.21 : kind === 'coaster' ? 0.16 : kind === 'dinghy' ? 0.42 : 0.3) / 2;
  ctx.fillStyle = 'rgba(12,34,48,.16)'; ctx.beginPath(); ctx.ellipse(1.2, 1.4, L, Bm, 0, 0, TAU); ctx.fill();
  const hull = new Path2D(); hull.moveTo(L, 0); hull.quadraticCurveTo(L * 0.75, -Bm, L * 0.1, -Bm); hull.lineTo(-L, -Bm * 0.9); hull.lineTo(-L, Bm * 0.9); hull.lineTo(L * 0.1, Bm); hull.quadraticCurveTo(L * 0.75, Bm, L, 0); hull.closePath();
  if (kind === 'ferry') {
    ctx.fillStyle = '#2b3a46'; ctx.fill(hull); ctx.fillStyle = '#e9e6dd'; ctx.save(); ctx.scale(0.94, 0.86); ctx.fill(hull); ctx.restore();
    ctx.fillStyle = '#b8b4aa'; ctx.fillRect(-L * 0.85, -Bm * 0.55, L * 1.3, Bm * 1.1);
    ctx.fillStyle = '#f5f3ee'; ctx.fillRect(-L * 0.35, -Bm * 0.72, L * 0.95, Bm * 1.44);
    ctx.fillStyle = '#29343c'; ctx.fillRect(L * 0.45, -Bm * 0.6, 1.2, Bm * 1.2);
    ctx.fillStyle = '#c4523a'; ctx.beginPath(); ctx.ellipse(-L * 0.05, 0, 1.8, 1.2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#1d2227'; ctx.beginPath(); ctx.ellipse(-L * 0.05, 0, 0.9, 0.6, 0, 0, TAU); ctx.fill();
  } else if (kind === 'coaster') {
    ctx.fillStyle = '#6d2e26'; ctx.fill(hull); ctx.fillStyle = '#7a3a30'; ctx.save(); ctx.scale(0.96, 0.84); ctx.fill(hull); ctx.restore();
    for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? '#3f5e6e' : '#46616e'; ctx.fillRect(L * 0.55 - k * L * 0.3, -Bm * 0.62, L * 0.26, Bm * 1.24); }
    ctx.fillStyle = '#e8e5dc'; ctx.fillRect(-L * 0.95, -Bm * 0.7, L * 0.28, Bm * 1.4); ctx.fillStyle = '#23292e'; ctx.fillRect(-L * 0.78, -0.8, 1.6, 1.6);
  } else if (kind === 'yacht') {
    ctx.fillStyle = '#f5f3ee'; ctx.fill(hull); ctx.strokeStyle = '#2b3136'; ctx.lineWidth = 0.14; ctx.stroke(hull);
    ctx.fillStyle = '#c29b6b'; ctx.fillRect(-L * 0.85, -Bm * 0.5, L * 0.5, Bm);
    ctx.fillStyle = '#e5e2da'; ctx.beginPath(); ctx.roundRect(-L * 0.3, -Bm * 0.45, L * 0.6, Bm * 0.9, 0.5); ctx.fill();
    if (b.kind !== 'moored') { ctx.fillStyle = 'rgba(252,252,248,.95)'; ctx.beginPath(); ctx.moveTo(L * 0.25, 0); ctx.quadraticCurveTo(-L * 0.3, Bm * 2.3, -L * 0.85, 0.3); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(40,50,56,.4)'; ctx.stroke(); ctx.beginPath(); ctx.moveTo(L * 0.9, 0); ctx.quadraticCurveTo(L * 0.5, Bm * 1.5, L * 0.28, 0.2); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#2b3136'; ctx.beginPath(); ctx.arc(L * 0.25, 0, 0.3, 0, TAU); ctx.fill();
  } else if (kind === 'dinghy') {
    ctx.fillStyle = '#d7d3c8'; ctx.fill(hull); ctx.strokeStyle = '#6b6a64'; ctx.lineWidth = 0.35; ctx.stroke(hull); ctx.fillStyle = '#8a6b4a'; ctx.fillRect(-0.3, -Bm * 0.8, 0.6, Bm * 1.6);
  } else if (kind === 'launch') {
    ctx.fillStyle = '#f1efe8'; ctx.fill(hull); ctx.strokeStyle = '#2b3136'; ctx.lineWidth = 0.12; ctx.stroke(hull);
    ctx.fillStyle = '#1f6e8c'; ctx.fillRect(-L * 0.6, -Bm * 0.72, L * 0.9, Bm * 1.44); ctx.fillStyle = '#e8e5dd'; ctx.fillRect(-L * 0.55, -Bm * 0.6, L * 0.8, Bm * 1.2);
  } else { // fishing
    ctx.fillStyle = b.kind === 'moored' ? '#5c7d8f' : '#3f6b82'; ctx.fill(hull); ctx.fillStyle = '#d9d4c6'; ctx.save(); ctx.scale(0.9, 0.8); ctx.fill(hull); ctx.restore();
    ctx.fillStyle = '#f2efe6'; ctx.strokeStyle = '#2b3136'; ctx.lineWidth = 0.15; ctx.fillRect(-L * 0.1, -Bm * 0.6, L * 0.5, Bm * 1.2); ctx.strokeRect(-L * 0.1, -Bm * 0.6, L * 0.5, Bm * 1.2);
    ctx.fillStyle = '#c75f2c'; for (let k = 0; k < 3; k++) ctx.fillRect(-L * 0.85 + k * 1.3, -Bm * 0.3, 0.8, 0.8);
    ctx.strokeStyle = '#6b5b45'; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.moveTo(-L * 0.4, 0); ctx.lineTo(-L * 0.4 - 2, -Bm * 1.8); ctx.moveTo(-L * 0.4, 0); ctx.lineTo(-L * 0.4 - 2, Bm * 1.8); ctx.stroke();
  }
  ctx.restore();
  if (b.tagT > 0 && b.name) drawRadioTag(b, x, y, fa * Math.min(1, b.tagT, 7 - b.tagT + 0.5));
}
function drawRadioTag(b, x, y, a) {
  ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
  const w1 = 16 + Math.max(measure(b.name, '13px "IM Fell English SC", Georgia, serif'), measure(b.tag || '', 'italic 11px "IM Fell English", Georgia, serif'), Math.min(260, measure(b.line || '', 'italic 13px "IM Fell English", Georgia, serif')));
  const w = Math.min(290, w1), h = 54, tx = clamp(x + 18, 8, cssW - w - 8), ty = clamp(y - h - 16, 8, cssH - h - 8);
  ctx.strokeStyle = 'rgba(29,43,51,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty + h); ctx.stroke();
  ctx.fillStyle = 'rgba(245,240,227,.94)'; ctx.fillRect(tx, ty, w, h); ctx.strokeStyle = INK; ctx.strokeRect(tx + 0.5, ty + 0.5, w - 1, h - 1);
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '13px "IM Fell English SC", Georgia, serif'; ctx.fillText(b.name, tx + 8, ty + 16);
  ctx.fillStyle = 'rgba(29,43,51,.6)'; ctx.font = 'italic 11px "IM Fell English", Georgia, serif'; ctx.fillText(b.tag || '', tx + 8, ty + 29);
  ctx.fillStyle = '#2f5f82'; ctx.font = 'italic 13px "IM Fell English", Georgia, serif'; ctx.fillText(fitText('“' + (b.line || '') + '”', w - 16), tx + 8, ty + 46);
  ctx.restore();
}
const measCache = new Map();
function measure(t, font) { const k = font + '|' + t; let v = measCache.get(k); if (v === undefined) { ctx.save(); ctx.font = font; v = ctx.measureText(t).width; ctx.restore(); if (measCache.size > 500) measCache.clear(); measCache.set(k, v); } return v; }
function fitText(t, w) { if (ctx.measureText(t).width <= w) return t; while (t.length > 4 && ctx.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }

/* ---------- things in the water ---------- */
function drawFloat(x, y, r, hue) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.3, hue); g.addColorStop(1, shade(hue, -0.3));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (r > 4) { ctx.strokeStyle = 'rgba(120,95,60,.55)'; ctx.lineWidth = Math.max(0.5, r * 0.08); ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y + r * 0.35, x + r, y); ctx.stroke(); }
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const f = v => Math.round(clamp(v + (k < 0 ? v * k : (255 - v) * k), 0, 255)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
function drawBottle(x, y, r, t) {
  ctx.save(); ctx.translate(x, y); const glow = 0.5 + 0.5 * Math.sin(t * 2.2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.6); g.addColorStop(0, `rgba(255,240,190,${0.45 + 0.3 * glow})`); g.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 3.6, 0, TAU); ctx.fill();
  ctx.rotate(0.5 + Math.sin(t * 1.1) * 0.25); ctx.fillStyle = 'rgba(64,130,92,.9)'; ctx.strokeStyle = '#1f3b2a'; ctx.lineWidth = Math.max(0.8, r * 0.1);
  ctx.beginPath(); ctx.roundRect(-r * 1.2, -r * 0.5, r * 1.6, r, r * 0.35); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(r * 0.35, -r * 0.22, r * 0.75, r * 0.44, r * 0.1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b98a52'; ctx.fillRect(r * 1.05, -r * 0.2, r * 0.3, r * 0.4); ctx.fillStyle = '#f3ead2'; ctx.fillRect(-r * 0.9, -r * 0.2, r * 1.0, r * 0.4); ctx.restore();
}

/* ---------- docks ---------- */
function drawDock(d, s) {
  const fa = 1 - fogOver(d.berth.x, d.berth.y); if (fa < 0.03) return;
  ctx.save(); ctx.globalAlpha = fa;
  if (d.barge) {
    const b = d.barge, [x, y] = w2s(b.x, b.y);
    ctx.translate(x, y); ctx.rotate(b.h + cam.rot + Math.sin(time * 0.4 + b.x) * 0.01);
    if (b.len * s < 8) { ctx.fillStyle = '#7a3a24'; ctx.fillRect(-4, -2, 8, 4); ctx.restore(); return; }
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(12,34,48,.2)'; ctx.beginPath(); ctx.roundRect(-b.len / 2 + 1.2, -b.beam / 2 + 1.4, b.len, b.beam, 2.5); ctx.fill();
    ctx.fillStyle = '#5a3526'; ctx.beginPath(); ctx.roundRect(-b.len / 2, -b.beam / 2, b.len, b.beam, 2.5); ctx.fill();
    ctx.fillStyle = '#8a4a2e'; ctx.beginPath(); ctx.roundRect(-b.len / 2 + 0.7, -b.beam / 2 + 0.7, b.len - 1.4, b.beam - 1.4, 1.8); ctx.fill();
    for (let k = 0; k < 3; k++) { const cx = -b.len / 2 + 6 + k * 8.5; const g = ctx.createLinearGradient(0, -2.6, 0, 2.6); g.addColorStop(0, '#d9d6cc'); g.addColorStop(1, '#8e8b83'); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(cx - 3.6, -2.7, 7.2, 5.4, 2.6); ctx.fill(); }
    ctx.fillStyle = '#e8e4d8'; ctx.fillRect(b.len / 2 - 6.5, -2.4, 4.5, 4.8); ctx.fillStyle = '#2d3a40'; ctx.fillRect(b.len / 2 - 5.8, -1.9, 1.4, 3.8);
    ctx.fillStyle = '#2f7a4a'; ctx.fillRect(-2, b.beam / 2 - 1.8, 1.2, 1.1);
    ctx.fillStyle = '#1d1d1b'; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(k * 6, b.beam / 2 + 0.25, 0.5, 0, TAU); ctx.fill(); }
    ctx.restore(); return;
  }
  if (d.pier) {
    const [x1, y1] = w2s(d.pier[0], d.pier[1]), [x2, y2] = w2s(d.pier[2], d.pier[3]);
    const wpx = Math.max(1.6, d.pier[4] * 2 * s);
    ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(12,34,48,.25)'; ctx.lineWidth = wpx; ctx.beginPath(); ctx.moveTo(x1 + wpx * 0.35, y1 + wpx * 0.45); ctx.lineTo(x2 + wpx * 0.35, y2 + wpx * 0.45); ctx.stroke();
    ctx.strokeStyle = '#5b4632'; ctx.lineWidth = wpx; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (wpx > 5) {
      ctx.strokeStyle = '#a7865e'; ctx.lineWidth = wpx - 2; ctx.stroke();
      const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L; ctx.strokeStyle = 'rgba(70,50,30,.35)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let t = 0; t < L; t += Math.max(3, 0.5 * s)) { ctx.moveTo(x1 + ux * t - uy * wpx / 2, y1 + uy * t + ux * wpx / 2); ctx.lineTo(x1 + ux * t + uy * wpx / 2, y1 + uy * t - ux * wpx / 2); } ctx.stroke();
      ctx.fillStyle = '#2a2622'; for (let t = 6 * s; t < L; t += 9 * s) for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(x1 + ux * t - uy * sd * wpx / 2, y1 + uy * t + ux * sd * wpx / 2, Math.max(1, 0.35 * s), 0, TAU); ctx.fill(); }
    }
    // shore works: a shed for the yards, a kiosk and pump for fuel
    if (s > 0.5) {
      const nx = d.nx, ny = d.ny, rx = d.coast[0] - nx * 14, ry = d.coast[1] - ny * 14;
      const [sx, sy] = w2s(rx, ry), a = Math.atan2(ny, nx) + cam.rot;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.scale(s, s);
      if (d.type === 'yard') {
        ctx.fillStyle = 'rgba(12,34,48,.25)'; ctx.fillRect(-9, -6 + 3, 16, 14);
        ctx.fillStyle = '#6e7b82'; ctx.fillRect(-11, -7, 16, 14); ctx.fillStyle = '#8b989f'; ctx.fillRect(-11, -7, 16, 7);
        ctx.fillStyle = '#b8b2a4'; ctx.fillRect(6, 6, 22, 7); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.3; ctx.strokeRect(6, 6, 22, 7);
      } else {
        ctx.fillStyle = 'rgba(12,34,48,.25)'; ctx.fillRect(-3, -2, 6, 5);
        ctx.fillStyle = '#f1ede2'; ctx.fillRect(-4, -3, 6, 5); ctx.fillStyle = '#b7482f'; ctx.fillRect(-4, -3, 6, 2);
        ctx.fillStyle = '#2f7a4a'; ctx.fillRect(4, 3, 1.4, 1.4);
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

/* ---------- towns ---------- */
function drawTowns(s, inView) {
  if (s < 0.3) return;
  const sunX = 0.62, sunY = 0.55;
  for (const t of towns) {
    if (!inView(t.x, t.y, t.r + 200)) continue;
    const fa = 1 - fogOver(t.x, t.y); if (fa < 0.03) continue;
    ctx.save(); ctx.globalAlpha = fa;
    for (const b of t.bl) {
      const [x, y] = w2s(b.x, b.y);
      if (x < -60 || y < -60 || x > cssW + 60 || y > cssH + 60) continue;
      const a = b.a + cam.rot, c = Math.cos(a), sn = Math.sin(a), hw = b.w / 2 * s, hl = b.l / 2 * s;
      const corner = (u, v) => [x + c * u - sn * v, y + sn * u + c * v];
      const base = [corner(-hl, -hw), corner(hl, -hw), corner(hl, hw), corner(-hl, hw)];
      // shadow
      const cr = Math.cos(cam.rot), sr = Math.sin(cam.rot), shx = (sunX * cr - sunY * sr) * b.ht * 0.7 * s, shy = (sunX * sr + sunY * cr) * b.ht * 0.7 * s;
      ctx.fillStyle = 'rgba(20,30,20,.28)'; ctx.beginPath(); base.forEach((p, i) => i ? ctx.lineTo(p[0] + shx, p[1] + shy) : ctx.moveTo(p[0] + shx, p[1] + shy)); base.slice().reverse().forEach(p => ctx.lineTo(p[0], p[1])); ctx.fill();
      ctx.beginPath(); base.forEach((p, i) => i ? ctx.lineTo(p[0] + shx, p[1] + shy) : ctx.moveTo(p[0] + shx, p[1] + shy)); ctx.closePath(); ctx.fill();
      const [lx, ly] = leanPx(x, y, b.ht);
      const roof = base.map(p => [p[0] + lx, p[1] + ly]);
      if (s > 1.2) { ctx.fillStyle = b.wall; ctx.beginPath(); for (let k = 0; k < 4; k++) { const p = base[k], q = base[(k + 1) % 4], pr = roof[k], qr = roof[(k + 1) % 4]; ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(qr[0], qr[1]); ctx.lineTo(pr[0], pr[1]); ctx.closePath(); } ctx.fill(); }
      // roof: two pitches along the long axis, lit and shaded
      const mid1 = [(roof[0][0] + roof[3][0]) / 2, (roof[0][1] + roof[3][1]) / 2], mid2 = [(roof[1][0] + roof[2][0]) / 2, (roof[1][1] + roof[2][1]) / 2];
      const lit = (Math.cos(a - Math.PI / 2) * -0.55 + Math.sin(a - Math.PI / 2) * -0.62) > 0;
      ctx.fillStyle = lit ? b.roof : b.roofD; ctx.beginPath(); ctx.moveTo(roof[0][0], roof[0][1]); ctx.lineTo(roof[1][0], roof[1][1]); ctx.lineTo(mid2[0], mid2[1]); ctx.lineTo(mid1[0], mid1[1]); ctx.fill();
      ctx.fillStyle = lit ? b.roofD : b.roof; ctx.beginPath(); ctx.moveTo(mid1[0], mid1[1]); ctx.lineTo(mid2[0], mid2[1]); ctx.lineTo(roof[2][0], roof[2][1]); ctx.lineTo(roof[3][0], roof[3][1]); ctx.fill();
      if (s > 1.5) { ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(mid1[0], mid1[1]); ctx.lineTo(mid2[0], mid2[1]); ctx.stroke(); }
      if (b.tower && s > 0.8) { const [tx, ty] = leanPx(x, y, b.ht * 3); ctx.fillStyle = '#d8d2c2'; ctx.beginPath(); ctx.arc(x + tx, y + ty, Math.max(1.5, 2.2 * s), 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke(); }
    }
    // lamps along the waterfront
    if (s > 0.6) for (const l of t.lamps) {
      const [x, y] = w2s(l[0], l[1]), fl = 0.75 + 0.25 * Math.sin(time * 7 + l[0]) * Math.sin(time * 3.1 + l[1]);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 6 + 3 * s); g.addColorStop(0, `rgba(255,214,140,${0.55 * fl})`); g.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 6 + 3 * s, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff4d8'; ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
    }
    ctx.restore();
  }
}

/* ---------- lights, buoys, gulls ---------- */
function drawLights(s) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const [x, y] = w2s(l.x, l.y); if (x < -900 || y < -900 || x > cssW + 900 || y > cssH + 900) continue;
    const fo = fogOver(l.x, l.y), rem = remAt(boat.x, boat.y);
    const a = time / l.period * TAU, len = clamp(1400 * s, 90, 900), vis = 0.1 + 0.25 * rem + 0.15 * fo;
    for (const k of [0, Math.PI]) {
      const ang = a + k + cam.rot;
      const g = ctx.createRadialGradient(x, y, 0, x, y, len); g.addColorStop(0, `rgba(255,236,190,${0.5 * vis})`); g.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, ang - 0.09, ang + 0.09); ctx.closePath(); ctx.fill();
    }
    const flash = Math.pow(Math.max(0, Math.cos(a - Math.atan2(boat.y - l.y, boat.x - l.x))), 40);
    const r = 5 + 10 * flash + 3 * s;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3); g.addColorStop(0, `rgba(255,240,200,${0.7})`); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawBuoys(s) {
  if (s < 0.25) return;
  for (const b of buoys) {
    const [x, y] = w2s(b.x, b.y); if (x < -20 || y < -20 || x > cssW + 20 || y > cssH + 20) continue;
    const fa = 1 - fogOver(b.x, b.y); if (fa < 0.05) continue;
    const bob = Math.sin(time * 1.8 + b.x) * 0.6, r = Math.max(2.4, 1.1 * s);
    ctx.save(); ctx.globalAlpha = fa; ctx.translate(x, y + bob);
    ctx.fillStyle = 'rgba(12,34,48,.25)'; ctx.beginPath(); ctx.arc(r * 0.4, r * 0.5, r, 0, TAU); ctx.fill();
    if (b.kind === 'cardinal') { ctx.fillStyle = '#e9c230'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(0, 0, r, b.top ? Math.PI : 0, b.top ? TAU : Math.PI); ctx.fill(); }
    else if (b.kind === 'safe') { ctx.fillStyle = '#f4f2ee'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.fillStyle = '#c8322b'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, 0, Math.PI / 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, Math.PI, Math.PI * 1.5); ctx.fill(); }
    else { ctx.fillStyle = b.kind === 'port' ? '#c8322b' : '#2e8a4f'; ctx.beginPath(); if (b.kind === 'port') ctx.rect(-r, -r, 2 * r, 2 * r); else { ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 1.1, r); ctx.lineTo(-r * 1.1, r); ctx.closePath(); } ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 0.8; ctx.stroke();
    const on = (time + b.x * 0.01) % (b.period || 4) < 0.35;
    if (on && b.kind !== 'cardinal') { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 9); g.addColorStop(0, b.kind === 'port' ? 'rgba(255,90,70,.8)' : b.kind === 'stbd' ? 'rgba(90,255,140,.8)' : 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}
function drawGulls(s) {
  if (s < 0.45) return;
  ctx.save();
  for (const f of gulls) {
    let cx = f.x, cy = f.y; if (f.follow) { cx = f.follow.x; cy = f.follow.y; }
    for (const g of f.birds) {
      const a = time * g.w + g.p, x = cx + Math.cos(a) * g.r + Math.sin(a * 0.37) * 20, y = cy + Math.sin(a) * g.r * 0.8;
      const fa = 1 - fogOver(x, y); if (fa < 0.05) continue;
      const [sx, sy] = w2s(x, y); if (sx < -30 || sy < -30 || sx > cssW + 30 || sy > cssH + 30) continue;
      const [lx, ly] = leanPx(sx, sy, g.alt);
      const hd = a + Math.PI / 2 * Math.sign(g.w) + cam.rot, flap = Math.sin(time * 9 + g.p * 5) * 0.5;
      const sz = Math.max(3, 0.9 * s);
      ctx.globalAlpha = fa * 0.35; ctx.fillStyle = '#10222e';
      const cr = Math.cos(cam.rot), sr = Math.sin(cam.rot), shx = (0.62 * cr - 0.55 * sr) * g.alt * 0.5 * s, shy = (0.62 * sr + 0.55 * cr) * g.alt * 0.5 * s;
      gullShape(sx + shx, sy + shy, hd, sz, flap, true);
      ctx.globalAlpha = fa; gullShape(sx + lx, sy + ly, hd, sz, flap, false);
    }
  }
  ctx.restore();
}
function gullShape(x, y, h, sz, flap, shadow) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(h); ctx.scale(sz, sz);
  ctx.beginPath(); ctx.moveTo(0.4, 0); ctx.quadraticCurveTo(-0.1, -0.6 - flap * 0.5, -0.5, -1.4 - flap); ctx.quadraticCurveTo(0, -0.5, -0.3, 0); ctx.quadraticCurveTo(0, 0.5, -0.5, 1.4 + flap); ctx.quadraticCurveTo(-0.1, 0.6 + flap * 0.5, 0.4, 0);
  if (!shadow) { ctx.fillStyle = '#fbfbf8'; ctx.fill(); ctx.strokeStyle = 'rgba(40,50,56,.55)'; ctx.lineWidth = 0.12; ctx.stroke(); ctx.fillStyle = '#2b3136'; ctx.beginPath(); ctx.arc(-0.45, -1.3 - flap, 0.12, 0, TAU); ctx.arc(-0.45, 1.3 + flap, 0.12, 0, TAU); ctx.fill(); }
  else ctx.fill();
  ctx.restore();
}

/* ---------- the whole overlay ---------- */
const FLOAT_HUES = ['#7fb3a6', '#9cc4c6', '#a9c49b', '#c9b886', '#8eaec8'];
let flyers = [], finder = null;
function drawOverlay(D) {
  const s = S();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cssW, cssH);
  const R_ = Math.hypot(cssW, cssH) / 2 / s;
  const inView = (x, y, m) => Math.abs(x - cam.x) < R_ + m && Math.abs(y - cam.y) < R_ + m;
  const charted = (x, y) => chartAll || fogAt(x, y) > 140;

  // roads
  if (s > 0.2) {
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const r of roads) {
      ctx.beginPath(); let on = false;
      for (const p of r.pts) { if (!inView(p[0], p[1], 200) || !charted(p[0], p[1])) { on = false; continue; } const [x, y] = w2s(p[0], p[1]); if (!on) { ctx.moveTo(x, y); on = true; } else ctx.lineTo(x, y); }
      if (r.kind === 'track') { ctx.strokeStyle = 'rgba(92,72,48,.6)'; ctx.lineWidth = Math.max(1, 2.2 * s); ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.strokeStyle = 'rgba(70,58,44,.55)'; ctx.lineWidth = Math.max(2.2, 6.5 * s); ctx.stroke(); ctx.strokeStyle = '#e4d8b8'; ctx.lineWidth = Math.max(1.1, 5 * s); ctx.stroke(); }
    }
  }
  drawTowns(s, inView);
  for (const d of docks) if (inView(d.berth.x, d.berth.y, 300) && charted(d.berth.x, d.berth.y)) drawDock(d, s);
  drawBuoys(s);

  // wake crests, prop wash
  ctx.lineCap = 'round';
  for (const w of waves) {
    if (!inView(w.x, w.y, 60)) continue;
    const k = w.age / w.life, a = Math.min(0.55, w.amp * (w.src === 'you' ? 0.65 : 1.0)) * (1 - k) * (1 - k) * sstep(0, 0.3, w.age);
    if (a < 0.02) continue;
    const tx = -w.ny * w.len / 2, ty = w.nx * w.len / 2;
    const [x1, y1] = w2s(w.x - tx, w.y - ty), [x2, y2] = w2s(w.x + tx, w.y + ty), [xm, ym] = w2s(w.x + w.nx * w.len * 0.08, w.y + w.ny * w.len * 0.08);
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = Math.max(0.7, (0.35 + w.amp * 0.6) * s);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(xm, ym, x2, y2); ctx.stroke();
  }
  for (const p of foam) {
    if (!inView(p.x, p.y, 20)) continue;
    const k = p.t / p.life, [x, y] = w2s(p.x, p.y), r = lerp(p.r0, p.r1, Math.sqrt(k)) * s;
    ctx.fillStyle = `rgba(255,255,255,${0.32 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, r), 0, TAU); ctx.fill();
  }

  // floats and bottles
  const itemR = Math.max(1.8, 0.6 * s);
  for (const it of items) {
    if (!it.alive || it.beach || !inView(it.x, it.y, 40) || !charted(it.x, it.y)) continue;
    const fa = 1 - fogOver(it.x, it.y); if (fa < 0.05) continue;
    const [x, y] = w2s(it.x, it.y + Math.sin(time * 1.7 + it.phase) * 0.3);
    ctx.globalAlpha = fa;
    if (it.kind === 'float') { if (s < 0.25) { ctx.fillStyle = it.hue; ctx.fillRect(x - 1, y - 1, 2, 2); } else drawFloat(x, y, itemR, it.hue); }
    else drawBottle(x, y, Math.max(6, 1.2 * s), time + it.phase);
    ctx.globalAlpha = 1;
  }
  for (const b of npcs) if (inView(b.x, b.y, 100)) drawNPC(b, s);

  // landing marks and the docking circle
  if (s > 0.35) for (const d of docks) {
    if (!inView(d.berth.x, d.berth.y, 200) || !charted(d.berth.x, d.berth.y)) continue;
    const fa = 1 - fogOver(d.berth.x, d.berth.y); if (fa < 0.05) continue;
    const [x, y] = w2s(d.berth.x, d.berth.y);
    ctx.globalAlpha = fa;
    if (d.type === 'landing') { const [cx, cy] = w2s(d.coast[0] - d.nx * 10, d.coast[1] - d.ny * 10); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 12); ctx.stroke(); ctx.fillStyle = '#a8327a'; ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 7, cy - 9); ctx.lineTo(cx, cy - 6); ctx.fill(); }
    if (!boat.tied && !boat.auto && Math.hypot(boat.x - d.berth.x, boat.y - d.berth.y) < 260) { ctx.strokeStyle = 'rgba(168,50,122,.55)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, DOCK_R * s, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    if (s > 0.45 && Math.hypot(boat.x - d.berth.x, boat.y - d.berth.y) > 35) {
      const lab = d.type === 'landing' ? d.name : d.type === 'barge' ? d.name.replace('Fuel barge ', '') + ' · fuel' : d.type === 'yard' ? d.name : 'Fuel';
      ctx.font = '12px "IM Fell English SC", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,240,227,.8)';
      ctx.strokeText(lab, x, y + 24); ctx.fillStyle = d.type === 'yard' ? 'rgba(168,50,122,.95)' : INK; ctx.fillText(lab, x, y + 24);
    }
    ctx.globalAlpha = 1;
  }

  // soundings, reduced to the tide right now
  if (s > 1.3) {
    const a = sstep(1.3, 2.2, s) * 0.6, step = Math.pow(2, Math.ceil(Math.log2(110 / s)));
    const [bx, by] = w2s(boat.x, boat.y);
    ctx.font = 'italic 12px "IM Fell English", Georgia, serif'; ctx.fillStyle = `rgba(30,58,80,${a})`;
    const x0 = cam.x - R_, x1 = cam.x + R_, y0 = cam.y - R_, y1 = cam.y + R_;
    for (let gy = Math.floor(y0 / step); gy <= Math.ceil(y1 / step); gy++) for (let gx = Math.floor(x0 / step); gx <= Math.ceil(x1 / step); gx++) {
      const wx = (gx + 0.5 + (h01(gx + 5000, gy + 7000) - 0.5) * 0.7) * step, wy = (gy + 0.5 + (h01(gx + 9000, gy + 3000) - 0.5) * 0.7) * step;
      if (!charted(wx, wy)) continue;
      const d = -heightAt(wx, wy); if (d < 0.5) continue;
      const [x, y] = w2s(wx, wy); if (x < 0 || y < 0 || x > cssW || y > cssH || Math.hypot(x - bx, y - by) < 40) continue;
      ctx.textAlign = 'center'; ctx.fillText(d < 20 ? d.toFixed(1).replace('.0', '') : String(Math.round(d)), x, y);
    }
  }
  // reefs, as the chart marks them
  if (s > 0.3) for (const r of REEF_MARKS) {
    if (!inView(r.x, r.y, 100) || !charted(r.x, r.y)) continue;
    const [x, y] = w2s(r.x, r.y); ctx.strokeStyle = 'rgba(29,43,51,.85)'; ctx.lineWidth = 1.1; ctx.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5); ctx.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); } ctx.stroke();
    if (tide.level < -0.5) { ctx.setLineDash([1.5, 2.5]); ctx.beginPath(); ctx.arc(x, y, Math.max(9, r.r * s), 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    if (s > 0.5) { ctx.font = 'italic 12px "IM Fell English", Georgia, serif'; ctx.fillStyle = 'rgba(168,50,122,.9)'; ctx.textAlign = 'left'; ctx.fillText(r.name, x + 9, y + 4); }
  }

  // you
  const [bx, by] = w2s(boat.x, boat.y), lenPx = HULL.len * s;
  for (const p of spray) { const k = p.t / p.life, [x, y] = w2s(p.x, p.y); ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, 0.25 * s), 0, TAU); ctx.fill(); }
  const mk = 1 - sstep(12, 18, lenPx);
  if (mk < 1) drawYourBoat(bx, by, s, 1 - mk, D);
  else { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bx, by, 3, 0, TAU); ctx.fill(); }
  drawGulls(s);
  drawLights(s);

  // place names, with a line of lore once you're close enough to care
  for (const l of labels) {
    let a = l.rank === 1 ? 1 - sstep(0.25, 0.6, s) : l.rank === 2 ? sstep(0.07, 0.14, s) * (1 - sstep(3.2, 5, s)) : sstep(0.35, 0.7, s) * (1 - sstep(5, 8, s));
    if (a < 0.02 || !inView(l.x, l.y, 900)) continue;
    a *= chartAll ? 1 : sstep(120, 200, fogAt(l.x, l.y)); if (a < 0.02) continue;
    const [x, y] = w2s(l.x, l.y), water = l.kind === 'water';
    ctx.font = l.rank === 1 ? '22px "IM Fell English SC", Georgia, serif' : l.rank === 2 ? `${water ? 'italic ' : ''}17px "IM Fell English", Georgia, serif` : `${water ? 'italic ' : ''}14px "IM Fell English", Georgia, serif`;
    const text = l.rank === 1 ? l.text.split('').join(' ') : l.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3.5; ctx.strokeStyle = `rgba(245,240,227,${0.7 * a})`; ctx.strokeText(text, x, y);
    ctx.fillStyle = water ? `rgba(34,82,118,${a})` : `rgba(62,49,34,${a})`; ctx.fillText(text, x, y);
    if (l.tag) {
      const ta = a * (l.rank === 1 ? 1 - sstep(0.12, 0.3, s) : l.rank === 2 ? sstep(0.3, 0.6, s) : sstep(0.9, 1.4, s));
      if (ta > 0.02) { ctx.font = 'italic 12.5px "IM Fell English", Georgia, serif'; ctx.lineWidth = 3; ctx.strokeStyle = `rgba(245,240,227,${0.7 * ta})`; ctx.strokeText(l.tag, x, y + (l.rank === 1 ? 20 : 17)); ctx.fillStyle = `rgba(62,49,34,${0.8 * ta})`; ctx.fillText(l.tag, x, y + (l.rank === 1 ? 20 : 17)); }
    }
  }
  // seabed finds, once charted
  if (s > 0.15 && s < 3) for (const f of finds) {
    if (!f.found || !inView(f.x, f.y, 300)) continue;
    const [x, y] = w2s(f.x, f.y); ctx.font = 'italic 13px "IM Fell English", Georgia, serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,240,227,.7)';
    const ly = y - Math.max(26, 60 * s); ctx.strokeText(f.name, x, ly); ctx.fillStyle = 'rgba(34,82,118,.95)'; ctx.fillText(f.name, x, ly);
  }

  drawFinder(s, bx, by);
  if (mk > 0 && cam.atmo > 0.5) drawChaseCam(bx, by, mk * sstep(0.5, 0.9, cam.atmo));
  if (cam.atmo < 0.9) drawBoatArrow(bx, by, 1 - cam.atmo);
  for (let i = flyers.length - 1; i >= 0; i--) { const f = flyers[i]; f.t += 1 / 60; const k = Math.min(1, f.t / f.life), e = 1 - Math.pow(1 - k, 3); drawFloat(lerp(f.x0, f.x1, e), lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * 50, 4 * (1 - k * 0.4), f.hue); if (k >= 1) flyers.splice(i, 1); }
}

function drawBoatArrow(x, y, a) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(boat.h + cam.rot);
  ctx.fillStyle = '#e0612b'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
/* The finder: press F for the nearest fuel. A bearing line, a ring round the pump, and an
   arrow on the edge of the screen if it's out of sight. */
function drawFinder(s, bx, by) {
  if (!finder || time > finder.until) return;
  const d = finder.d, a = Math.min(1, (finder.until - time) / 1.2);
  const [x, y] = w2s(d.berth.x, d.berth.y);
  ctx.save(); ctx.globalAlpha = a;
  ctx.strokeStyle = 'rgba(179,137,58,.95)'; ctx.lineWidth = 2; ctx.setLineDash([7, 6]); ctx.lineDashOffset = -time * 24;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
  const pulse = 10 + 6 * Math.sin(time * 5);
  ctx.beginPath(); ctx.arc(x, y, pulse, 0, TAU); ctx.stroke();
  const dist = Math.hypot(d.berth.x - boat.x, d.berth.y - boat.y), brg = bearingDeg(d.berth.x - boat.x, d.berth.y - boat.y);
  const txt = `${d.name} · ${fmtNm(dist)} · ${fmtBearing(brg)}`;
  const m = 34, on = x > m && y > m && x < cssW - m && y < cssH - m;
  let lx = x, ly = y - 22;
  if (!on) {
    const dx = x - bx, dy = y - by, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const t = Math.min(ux > 0 ? (cssW - m - bx) / ux : ux < 0 ? (m - bx) / ux : 1e9, uy > 0 ? (cssH - m - by) / uy : uy < 0 ? (m - by) / uy : 1e9);
    const ex = bx + ux * t, ey = by + uy * t, ang = Math.atan2(uy, ux);
    ctx.fillStyle = '#b3893a'; ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    lx = clamp(ex - ux * 20, 90, cssW - 90); ly = clamp(ey - uy * 26, 60, cssH - 40);
  }
  ctx.font = '14px "IM Fell English SC", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width + 18;
  ctx.fillStyle = 'rgba(245,240,227,.95)'; ctx.fillRect(lx - w / 2, ly - 12, w, 24); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(lx - w / 2 + 0.5, ly - 11.5, w - 1, 23);
  ctx.fillStyle = INK; ctx.fillText(txt, lx, ly + 1);
  ctx.restore();
}

'use strict';
/* Charting. The sea you have seen stays charted (512², 32 m texels). No pings: the chart fills
   in steadily around you, as far as you can see, and how far you can see shrinks the further
   out you go. */

const FR = 512, fog = new Uint8Array(FR * FR);
let fogDirty = true, chartedCount = 0, chartTotal = 1, revealT = 0;
const CHART_R = 6900;
function initChart() {
  let n = 0; for (let j = 0; j < FR; j++) for (let i = 0; i < FR; i++) if (Math.hypot((i + 0.5) * W / FR - WC, (j + 0.5) * W / FR - WC) < CHART_R) n++;
  chartTotal = n;
}
function reveal(x, y, r) {
  const cx = x / W * FR, cy = y / W * FR, rr = r / W * FR;
  const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(FR - 1, Math.ceil(cx + rr)), y0 = Math.max(0, Math.floor(cy - rr)), y1 = Math.min(FR - 1, Math.ceil(cy + rr));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / rr; if (d >= 1) continue;
    const v = Math.min(255, ((1 - d) / 0.35) * 255) | 0, k = j * FR + i;
    if (v > fog[k]) {
      if (fog[k] < 128 && v >= 128 && Math.hypot((i + 0.5) * W / FR - WC, (j + 0.5) * W / FR - WC) < CHART_R) chartedCount++;
      fog[k] = v; fogDirty = true;
    }
  }
}
const fogAt = (x, y) => fog[clamp((y / W * FR) | 0, 0, FR - 1) * FR + clamp((x / W * FR) | 0, 0, FR - 1)];
function visRadius() { return lerp(1050, 270, remAt(boat.x, boat.y)) * RADARS[UP.radar].vis; }
function chartTick(dt) { revealT -= dt; if (revealT <= 0) { revealT = 0.1; reveal(boat.x, boat.y, visRadius() * 0.85); } }
const chartedPct = () => Math.min(100, Math.round(chartedCount / chartTotal * 100));

let discT = 0;
function checkDiscoveries(dt) {
  discT += dt; if (discT < 0.4) return; discT = 0;
  for (const l of labels) if (!l.found && fogAt(l.x, l.y) > 170) {
    l.found = true;
    if (started && l.rank > 1) { SFX.found(); toast('Charted · ' + l.text, l.tag ? `<i>${esc(l.tag)}</i>` : '', 3600); }
  }
  for (const f of finds) if (!f.found && fogAt(f.x, f.y) > 175) {
    f.found = true;
    if (started) { st.floats += f.reward; SFX.found(); toast('On the seabed · ' + f.name, `${esc(f.text)} <span class="gain">+${f.reward} floats</span>`, 6000); updateCounts('#c-float'); save(); }
  }
  updateCounts();
}

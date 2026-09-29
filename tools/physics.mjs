// Dev check: drives the boat without drawing and prints how she behaves.
// Usage: node tools/physics.mjs
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + path.resolve(process.env.FILE || 'index.html'));
await page.waitForFunction(() => !document.querySelector('#b-go').disabled, null, { timeout: 180000 });
await page.click('#b-go');
await page.waitForTimeout(500);
const run = (label, fn) => page.evaluate(fn).then(r => { console.log('\n== ' + label); for (const row of [].concat(r)) console.log(JSON.stringify(row)); });
const open = `__fog.setPaused(true); __fog.teleport(9000, 12600, 0); __fog.boat.running = true; __fog.boat.seq = null;`;

await run('full throttle from rest (every 2 s)', new Function(`${open} __fog.st.hull = 100; __fog.st.fuel = 380; return __fog.step(60*24, 1).filter((r, i) => i % 2 === 1);`));
await run('lever at 0.45 (stuck on the hump?)', new Function(`${open} return __fog.step(60*20, 0.45).slice(-3);`));
await run('lever at 0.72 (cruise)', new Function(`${open} return __fog.step(60*25, 0.72).slice(-2);`));
await run('hull 68%, full throttle', new Function(`${open} __fog.st.hull = 68; const r = __fog.step(60*25, 1).slice(-2); __fog.st.hull = 100; return r;`));
await run('hull 45%, full throttle', new Function(`${open} __fog.st.hull = 45; const r = __fog.step(60*25, 1).slice(-2); __fog.st.hull = 100; return r;`));
await run('fuel: a minute at full, a minute at cruise', new Function(`${open} __fog.st.fuel = 380; const a = __fog.step(60*60, 1).slice(-1)[0].fuel; const b = __fog.step(60*60, 0.72).slice(-1)[0].fuel; return { afterFullMinute: a, afterCruiseMinute: b, fullTankMinutesAtFull: +(380 / (380 - a)).toFixed(1), fullTankMinutesAtCruise: +(380 / (a - b)).toFixed(1) };`));
await run('hard turn on the plane (heading every second)', new Function(`${open} __fog.step(60*15, 1); return __fog.step(60*6, 1, 1);`));
await run('throttle off from full: coasting down', new Function(`${open} __fog.step(60*18, 1); return __fog.step(60*10, 0);`));
await run('docking under power at Lanternmouth Fuel Quay', () => {
  const d = __fog.docks().find(q => q.id === 'lm-fuel');
  __fog.teleport(d.approach[0], d.approach[1], Math.atan2(d.berth.y - d.approach[1], d.berth.x - d.approach[0])); __fog.boat.running = true; __fog.boat.seq = null;
  document.querySelector('#b-dock').hidden = false;
  const rows = [];
  window.__startDock(d);
  for (let k = 0; k < 40; k++) { const r = __fog.step(30, 0)[0] || {}; const b = __fog.boat; rows.push({ t: k / 2, dist: +Math.hypot(b.x - d.berth.x, b.y - d.berth.y).toFixed(1), kn: +(b.u * 1.94).toFixed(1), rpm: +b.rpm.toFixed(2), running: b.running, auto: b.auto ? b.auto.mode : null, tied: !!b.tied, yard: !document.querySelector('#yard').hidden }); if (!document.querySelector('#yard').hidden && k % 4 === 3) break; }
  return rows.filter((r, i) => i % 3 === 0 || r.yard);
});
await run('every dock: approach from its approach point, under autopilot', () => {
  const out = [];
  for (const d of __fog.docks()) {
    __fog.teleport(d.approach[0], d.approach[1], Math.atan2(d.berth.y - d.approach[1], d.berth.x - d.approach[0])); const b = __fog.boat; b.running = true; b.seq = null;
    window.__startDock(d);
    let t = 0, timedOut = false, minD = 1e9, grounded = 0;
    for (; t < 40 && !b.tied; t += 0.5) { if (b.auto && b.auto.t > 19.9) timedOut = true; __fog.step(30, 0); minD = Math.min(minD, Math.hypot(b.x - d.berth.x, b.y - d.berth.y)); if (__fog.heightAt(b.x, b.y) > -0.6) grounded++; }
    out.push({ dock: d.id, secs: t, tied: !!b.tied, timedOut, grounded, hull: Math.round(__fog.st.hull) });
    b.tied = null; document.querySelector('#yard').hidden = true; document.querySelector('#card').hidden = true; __fog.st.hull = 100;
  }
  return out;
});
await run('casting off from each dock: does she end up pointing at open water?', () => {
  const out = [];
  for (const d of __fog.docks()) {
    __fog.teleport(d.berth.x, d.berth.y, d.berth.h); const b = __fog.boat; b.running = false; b.seq = null; b.tied = d;
    window.__castOff(d);
    let t = 0; for (; t < 20 && (b.auto || b.seq); t += 0.5) __fog.step(30, 0);
    // look ahead along her heading: how far until land?
    let clear = 0; for (; clear < 300; clear += 10) if (__fog.hDatum(b.x + Math.cos(b.h) * clear, b.y + Math.sin(b.h) * clear) > -1) break;
    out.push({ dock: d.id, secs: t, moved: Math.round(Math.hypot(b.x - d.berth.x, b.y - d.berth.y)), clearAhead: clear, hull: Math.round(__fog.st.hull) });
    __fog.st.hull = 100;
  }
  return out;
});
await run('a ferry wake crossing under the hull', () => {
  __fog.teleport(9000, 12600, 0); __fog.boat.running = true; __fog.boat.seq = null;
  __fog.step(60 * 12, 0.8);
  const b = __fog.boat, before = { kn: +(b.u * 1.94).toFixed(1) };
  for (let k = 0; k < 60; k++) window.__emitWake('ferry-test', b.x + 150, b.y - 150 + k * 5, Math.PI / 2, 9, 0.9, 9);
  let maxPitch = 0; for (let k = 0; k < 720; k++) { __fog.step(1, 0.8); maxPitch = Math.max(maxPitch, Math.abs(b.pitch)); }
  return { before, after: { kn: +(b.u * 1.94).toFixed(1) }, maxPitch: +maxPitch.toFixed(3), shake: +__fog.cam.shake.toFixed(2) };
});
console.log('\nerrors:', errs.length ? errs.join('\n') : 'none');
await browser.close();

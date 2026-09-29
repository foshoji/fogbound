// Dev harness: loads the game headless, runs a scenario, saves screenshots.
// Usage: node tools/shoot.mjs <outdir> [scenario] [width] [height]
// Needs Playwright with a Chromium; uses SwiftShader for WebGL 2.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const out = path.resolve(process.argv[2] || 'shots');
const scenario = process.argv[3] || 'basic';
const Wd = +(process.argv[4] || 1280), Hd = +(process.argv[5] || 800);
const file = process.env.FILE || path.resolve('index.html');
fs.mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Wd, height: Hd } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('file://' + file);
const t0 = Date.now();
await page.waitForFunction(() => { const b = document.querySelector('#b-go'); return (b && !b.disabled) || /could not|needs WebGL/.test(document.querySelector('#prog').textContent); }, null, { timeout: 180000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's:', await page.textContent('#prog'));
const shot = async name => { await page.screenshot({ path: path.join(out, name + '.png') }); console.log('shot', name); };
const wait = ms => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);

if (scenario === 'basic' || scenario === 'all') {
  await shot('00-intro');
  await page.click('#b-go');
  await wait(6000);
  await shot('01-harbour');
}
if (scenario === 'tour' || scenario === 'all') {
  if (scenario === 'tour') { await page.click('#b-go'); await wait(3000); }
  await ev(() => { __fog.chartAll(true); });
  const spots = JSON.parse(process.env.SPOTS || '[[9500,9300,3],[8200,8600,0.12],[4500,9400,1.2],[13300,13000,0.6],[7300,11400,2.5]]');
  let i = 0;
  for (const [x, y, s] of spots) {
    await ev(([x, y, s]) => { __fog.teleport(x, y, 0); __fog.cam.zUser = 0; __fog.cam.z = Math.log(s); __fog.cam.zUser = Math.log(s) - __fog.cam.z; window.__lockZ = s; }, [x, y, s]);
    await ev(s => { const c = __fog.cam; const f = () => { c.z = Math.log(s); if (window.__lockZ === s) requestAnimationFrame(f); }; f(); }, s);
    await wait(2500);
    await shot(`tour-${String(i++).padStart(2, '0')}`);
  }
}
if (scenario === 'drive') {
  await page.click('#b-go'); await wait(5000);
  await page.keyboard.press('4'); await wait(9000); await shot('drive-01');
  await page.keyboard.down('d'); await wait(1500); await page.keyboard.up('d'); await wait(3000); await shot('drive-02');
  await page.keyboard.press('h'); await wait(3000); await shot('drive-03-headup');
  await page.keyboard.press('f'); await wait(1500); await shot('drive-04-finder');
  await page.keyboard.press('m'); await wait(3000); await shot('drive-05-chart');
}
if (scenario === 'ui') {
  await page.click('#b-go'); await wait(500);
  const go = (n, thr, steer) => ev(([n, thr, steer]) => { __fog.step(n, thr, steer); __settleCam(90); }, [n, thr, steer || 0]);
  await go(60 * 9, 0.6); await wait(900); await shot('ui-01-underway');
  await go(60 * 6, 1); await wait(900); await shot('ui-02-planing');
  await page.keyboard.press('h'); await go(30, 1, 0.4); await ev(() => __settleCam(240)); await wait(900); await shot('ui-03-headup');
  await page.keyboard.press('f'); await go(10, 1); await wait(900); await shot('ui-04-finder');
  await page.keyboard.press('h'); await page.keyboard.press('m'); await ev(() => __settleCam(300)); await wait(1200); await shot('ui-05-chart');
  await page.keyboard.press('m');
  await ev(() => { const d = __fog.docks().find(q => q.id === 'gw-jetty'); __fog.teleport(d.approach[0], d.approach[1], Math.atan2(d.berth.y - d.approach[1], d.berth.x - d.approach[0])); __fog.boat.running = true; __fog.boat.seq = null; __settleCam(200); });
  await go(60, 0.1); await wait(900); await shot('ui-06-dockprompt');
  await ev(() => { const d = __fog.docks().find(q => q.id === 'gw-jetty'); __startDock(d); });
  await go(60 * 7, 0); await wait(900); await shot('ui-07-docking');
  await go(60 * 9, 0); await wait(900); await shot('ui-08-yard');
  await ev(() => __leaveYard()); await go(60 * 3, 0); await wait(900); await shot('ui-09-castoff');
  await ev(() => { const p = __fog.items().find(i => i.kind === 'page' && !i.beach); __fog.teleport(p.x - 40, p.y, 0); __fog.boat.running = true; __fog.boat.seq = null; __fog.boat.u = 5; });
  await go(60 * 4, 0.2); await wait(900); await shot('ui-10-page');
}
if (scenario === 'voyage') {
  await page.click('#b-go'); await wait(300);
  const go = (n, thr, steer) => ev(([n, thr, steer]) => { __fog.step(n, thr, steer); __settleCam(120); }, [n, thr, steer || 0]);
  await go(60 * 14, 0);                       // cast off and clear the berth
  // steer for the harbour mouth, then out towards the south-east and the fog
  const steerTo = async (x, y, secs, thr) => { for (let k = 0; k < secs * 4; k++) await ev(([x, y, thr]) => { const b = __fog.boat; const want = Math.atan2(y - b.y, x - b.x), d = Math.atan2(Math.sin(want - b.h), Math.cos(want - b.h)); __fog.step(15, thr, Math.max(-1, Math.min(1, d * 1.8))); }, [x, y, thr]); await ev(() => __settleCam(120)); };
  await steerTo(9000, 9700, 12, 0.5); await wait(900); await shot('voyage-01-bay');
  await steerTo(8700, 10600, 12, 0.8); await steerTo(9600, 11600, 14, 1); await wait(900); await shot('voyage-02-reach');
  await steerTo(11000, 12400, 25, 1); await wait(900); await shot('voyage-03-outside');
  await steerTo(12600, 12500, 20, 1); await wait(900); await shot('voyage-04-fog');
  await page.keyboard.press('m'); await ev(() => __settleCam(400)); await wait(1500); await shot('voyage-05-chart');
}
if (scenario === 'docks') {
  await page.click('#b-go'); await wait(500);
  await ev(() => __fog.chartAll(true));
  const ids = (process.env.DOCKS || 'wh-pontoon,hs-quay,fr-station,barge-patience,hollow,sr-quay').split(',');
  for (const id of ids) {
    await ev(id => { const d = __fog.docks().find(q => q.id === id); __fog.teleport(d.berth.x - Math.cos(d.berth.h) * 30, d.berth.y - Math.sin(d.berth.h) * 30, d.berth.h); __fog.boat.running = true; __fog.boat.seq = null; __fog.setPaused(true); __fog.cam.x = d.berth.x; __fog.cam.y = d.berth.y; const s = +(window.__S || 1.6); const c = __fog.cam; window.__lock = id; const f = () => { c.z = Math.log(s); c.x = d.berth.x; c.y = d.berth.y; if (window.__lock === id) requestAnimationFrame(f); }; f(); }, id);
    await wait(2500); await shot('dock-' + id);
  }
}
const state = await ev(() => { const b = __fog.boat; return { x: b.x | 0, y: b.y | 0, u: +b.u.toFixed(2), plane: +b.plane.toFixed(2), running: b.running, tied: !!b.tied, fuel: +__fog.st.fuel.toFixed(1) }; }).catch(e => String(e));
console.log('state', JSON.stringify(state));
fs.writeFileSync(path.join(out, 'console.log'), logs.join('\n'));
console.log(logs.filter(l => /error|warn/i.test(l)).slice(0, 30).join('\n'));
await browser.close();

'use strict';
/* Sound, all synthesised. The engines are two detuned voices (port and starboard outboards)
   so they beat against each other the way twins do; rpm is driven by the helm. */

const A = { ctx: null, on: true };
function audioKick() { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); }
function initAudio() {
  if (A.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const c = new AC(); A.ctx = c;
  const master = c.createGain(); master.gain.value = A.on ? 0.9 : 0;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
  master.connect(comp).connect(c.destination); A.master = master;
  const sr = c.sampleRate;
  const brown = c.createBuffer(1, sr * 3, sr), bd = brown.getChannelData(0); let last = 0;
  for (let i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
  const white = c.createBuffer(1, sr * 2, sr), wd = white.getChannelData(0);
  for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
  A.white = white;
  const loop = (buf, type, freq, q) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(master); s.start(); return { f, g }; };
  A.wash = loop(brown, 'lowpass', 400);
  A.sea = loop(brown, 'lowpass', 320); A.sea.g.gain.value = 0.05;
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 0.03; lfo.connect(lg).connect(A.sea.g.gain); lfo.start();
  A.scrape = loop(white, 'bandpass', 900, 1.4);
  A.whoosh = loop(white, 'bandpass', 500, 0.9);
  A.wind = loop(white, 'highpass', 2400);
  // engines: saw + sub square through a soft clipper and a low-pass, one voice per outboard
  const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 2.2); }
  A.engBus = c.createGain(); A.engBus.gain.value = 0; A.engBus.connect(master);
  A.voices = [-0.35, 0.35].map((pan, i) => {
    const o1 = c.createOscillator(), o2 = c.createOscillator(), g2 = c.createGain(), ws = c.createWaveShaper(), lp = c.createBiquadFilter(), g = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; g2.gain.value = 0.45; ws.curve = curve;
    lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 1.6; g.gain.value = 0.5;
    o1.connect(ws); o2.connect(g2).connect(ws); ws.connect(lp).connect(g);
    let out = g; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(A.engBus); o1.start(); o2.start();
    return { o1, o2, lp, det: i ? 1.007 : 1 };
  });
  // exhaust burble: noise chopped at the firing rate
  const bs = c.createBufferSource(); bs.buffer = brown; bs.loop = true;
  const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 140; bf.Q.value = 1.2;
  A.burble = c.createGain(); A.burble.gain.value = 0;
  const chop = c.createGain(); chop.gain.value = 0.5; A.chopOsc = c.createOscillator(); A.chopOsc.type = 'square'; A.chopOsc.frequency.value = 10;
  const chopDepth = c.createGain(); chopDepth.gain.value = 0.5; A.chopOsc.connect(chopDepth).connect(chop.gain); A.chopOsc.start();
  bs.connect(bf).connect(chop).connect(A.burble).connect(master); bs.start();
  A.thudBus = c.createBiquadFilter(); A.thudBus.type = 'lowpass'; A.thudBus.frequency.value = 420; A.thudBus.connect(master);
  // a long, soft echo for foghorns and bells out in the fog
  A.echo = c.createDelay(2); A.echo.delayTime.value = 0.42; const fb = c.createGain(); fb.gain.value = 0.45; const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 900;
  A.echo.connect(ef).connect(fb).connect(A.echo); ef.connect(master);
}
function envG(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(type, f0, f1, t, peak, a, d, dest, pan) {
  const c = A.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d * 0.6);
  envG(g, t, peak, a, d);
  let node = o.connect(g);
  if (pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); node = node.connect(p); }
  node.connect(dest || A.master); o.start(t); o.stop(t + a + d + 0.05);
}
function noiseHit(t, type, freq, peak, d, dest, q) {
  const c = A.ctx, s = c.createBufferSource(); s.buffer = A.white; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
  const g = c.createGain(); envG(g, t, peak, 0.004, d); s.connect(f).connect(g).connect(dest || A.master); s.start(t, Math.random(), d + 0.1);
}
/* rpm: 0 (stopped) .. 1 (wide open). load: how hard the props are working. */
function engineSound(rpm, load, dt) {
  if (!A.ctx) return;
  const now = A.ctx.currentTime, f = 22 + rpm * 118;
  for (const v of A.voices) {
    v.o1.frequency.setTargetAtTime(f * v.det, now, 0.12); v.o2.frequency.setTargetAtTime(f * 0.5 * v.det, now, 0.12);
    v.lp.frequency.setTargetAtTime(160 + rpm * 1300 + load * 500, now, 0.15);
  }
  A.engBus.gain.setTargetAtTime(rpm > 0.01 ? 0.012 + rpm * 0.05 + load * 0.02 : 0, now, 0.12);
  A.chopOsc.frequency.setTargetAtTime(Math.max(4, f * 0.25), now, 0.1);
  A.burble.gain.setTargetAtTime(rpm > 0.01 ? 0.09 * (1 - sstep(0.15, 0.5, rpm)) : 0, now, 0.15);
}
const SFX = {
  starter() { if (!A.ctx) return; const t = A.ctx.currentTime; for (let i = 0; i < 5; i++) tone('sawtooth', 150 + i * 6, 170 + i * 6, t + i * 0.1, 0.03, 0.01, 0.08); noiseHit(t + 0.52, 'lowpass', 400, 0.12, 0.2, A.thudBus); tone('sine', 60, 42, t + 0.52, 0.18, 0.005, 0.25, A.thudBus); },
  cut() { if (!A.ctx) return; const t = A.ctx.currentTime; tone('sine', 55, 32, t + 0.6, 0.12, 0.005, 0.3, A.thudBus); noiseHit(t + 0.62, 'lowpass', 260, 0.06, 0.18, A.thudBus); },
  thud(amp) { if (!A.ctx) return; const t = A.ctx.currentTime + 0.01; tone('sine', 64, 40, t, amp, 0.006, 0.2, A.thudBus); noiseHit(t, 'lowpass', 300, amp * 0.3, 0.05, A.thudBus); },
  slap(amp) { if (!A.ctx) return; const t = A.ctx.currentTime; noiseHit(t, 'lowpass', 700, amp, 0.09); tone('sine', 110, 70, t, amp * 0.6, 0.003, 0.12); },
  wake(amp) { if (!A.ctx) return; const t = A.ctx.currentTime; noiseHit(t, 'lowpass', 900, amp * 0.8, 0.16); tone('sine', 90, 50, t, amp, 0.004, 0.3, A.thudBus); noiseHit(t + 0.12, 'highpass', 2500, amp * 0.25, 0.35); },
  chime(step, pan) { if (!A.ctx) return; const P = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; const f = 659.25 * Math.pow(2, P[step % P.length] / 12), t = A.ctx.currentTime + 0.005; tone('sine', f, 0, t, 0.07, 0.004, 0.9, null, pan); tone('sine', f * 2.76, 0, t, 0.018, 0.002, 0.3, null, pan); },
  page() { if (!A.ctx) return; const t = A.ctx.currentTime; noiseHit(t, 'highpass', 3000, 0.05, 0.25); [261.6, 329.6, 392, 523.3].forEach((f, i) => tone('triangle', f, 0, t + 0.1 + i * 0.06, 0.06, 0.08, 2.4)); tone('sine', 1046.5, 0, t + 0.4, 0.05, 0.004, 1.6); },
  bump(v) { if (!A.ctx) return; const t = A.ctx.currentTime, a = clamp(v / 12, 0.08, 0.5); tone('sine', 120, 55, t, a, 0.004, 0.28); tone('sine', 190, 150, t + 0.02, a * 0.35, 0.004, 0.15); noiseHit(t, 'lowpass', 500, a * 0.4, 0.15); },
  crunch(v) { if (!A.ctx) return; const t = A.ctx.currentTime, a = clamp(v / 10, 0.1, 0.5); for (let i = 0; i < 4; i++) noiseHit(t + i * 0.035, 'bandpass', 700 + Math.random() * 900, a * 0.5, 0.06, null, 3); tone('sine', 80, 40, t, a, 0.004, 0.35, A.thudBus); },
  found() { if (!A.ctx) return; const t = A.ctx.currentTime; tone('sine', 587.3, 0, t, 0.06, 0.02, 0.9); tone('sine', 880, 0, t + 0.18, 0.06, 0.02, 1.2); tone('sine', 1174.7, 0, t + 0.36, 0.04, 0.02, 1.4); },
  bell() { if (!A.ctx) return; const t = A.ctx.currentTime; tone('sine', 523.3, 0, t, 0.06, 0.004, 2.4); tone('sine', 523.3 * 2.4, 0, t, 0.018, 0.004, 1.2); },
  rope() { if (!A.ctx) return; const t = A.ctx.currentTime; noiseHit(t, 'bandpass', 320, 0.12, 0.35, null, 6); noiseHit(t + 0.25, 'bandpass', 260, 0.08, 0.3, null, 6); tone('sine', 90, 70, t + 0.1, 0.12, 0.01, 0.3); },
  creak() { if (!A.ctx) return; const t = A.ctx.currentTime; tone('sawtooth', 210, 160, t, 0.02, 0.05, 0.35); tone('sawtooth', 190, 230, t + 0.3, 0.015, 0.05, 0.3); },
  coin() { if (!A.ctx) return; const t = A.ctx.currentTime; tone('sine', 1318.5, 0, t, 0.05, 0.003, 0.4); tone('sine', 1760, 0, t + 0.07, 0.05, 0.003, 0.6); },
  fit() { if (!A.ctx) return; const t = A.ctx.currentTime; noiseHit(t, 'bandpass', 1800, 0.06, 0.05, null, 4); noiseHit(t + 0.12, 'bandpass', 1500, 0.06, 0.05, null, 4); tone('sine', 523.3, 0, t + 0.25, 0.06, 0.01, 0.8); tone('sine', 784, 0, t + 0.35, 0.06, 0.01, 1.0); },
  fuel() { if (!A.ctx) return; const t = A.ctx.currentTime; noiseHit(t, 'bandpass', 600, 0.05, 1.2, null, 2); tone('sine', 880, 0, t + 1.2, 0.04, 0.003, 0.3); },
  radio() { if (!A.ctx) return; const t = A.ctx.currentTime; noiseHit(t, 'bandpass', 2200, 0.035, 0.12, null, 1.5); tone('square', 1320, 0, t + 0.13, 0.008, 0.002, 0.05); },
  foghorn(pan, dist) { if (!A.ctx) return; const t = A.ctx.currentTime, a = 0.06 * clamp(1 - dist / 3000, 0.15, 1); const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300 + 500 * (1 - clamp(dist / 3000, 0, 1)); f.connect(A.master); f.connect(A.echo); tone('sawtooth', 98, 96, t, a, 0.4, 2.4, f, pan); tone('sawtooth', 103.5, 101, t, a * 0.8, 0.4, 2.4, f, pan); },
  buoyBell(pan, dist) { if (!A.ctx) return; const t = A.ctx.currentTime, a = 0.03 * clamp(1 - dist / 1500, 0.1, 1); tone('sine', 740, 0, t, a, 0.003, 1.8, A.echo, pan); tone('sine', 740 * 2.7, 0, t, a * 0.3, 0.003, 0.6, null, pan); },
  shiphorn(pan) { if (!A.ctx) return; const t = A.ctx.currentTime; tone('sawtooth', 147, 146, t, 0.05, 0.1, 1.3, null, pan); tone('sawtooth', 185, 184, t, 0.035, 0.1, 1.3, null, pan); },
};

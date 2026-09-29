'use strict';
/* Shared state. */

const TIDE = { hold: 150, trans: 60, level: [1.4, 0, -1.4, 0], stream: [0, -1, 0, 1], name: ['High water', 'Mid tide · falling', 'Low water', 'Mid tide · rising'], short: ['HW', 'Mid', 'LW', 'Mid'] };
const tide = { t: 0, level: 1.4, stream: 0, k: 0, p: 0 };

const HULL = { len: 12.4, beam: 3.7, draft: 0.75 };
const ENGINES = [
  { name: 'Twin 250s', note: 'Two 250 hp outboards. Over the hump at about two-thirds throttle; tops out in the mid-forties.', thrust: 7.0 },
  { name: 'Twin 300s', note: 'Onto the plane without drama. Near fifty knots flat out.', thrust: 8.1, cost: 40 },
  { name: 'Twin 350s, race-tuned', note: 'She stands up and goes. Mid-fifties, and thirstier for it.', thrust: 9.3, cost: 90 },
];
const TANKS = [
  { name: 'Tank, 380 L', note: 'The home waters and back, with some to spare.', cap: 380 },
  { name: 'Tank, 520 L', note: 'A long day, or out to the Farrows.', cap: 520, cost: 30 },
  { name: 'Tank, 700 L', note: 'Out past the last light and home again.', cap: 700, cost: 65 },
];
const HULLS = [
  { name: 'Standard gelcoat', note: 'Handsome, honest, and it chips.', armor: 1 },
  { name: 'Keel guard', note: 'A stainless strip along the keel. About a third less harm from knocks.', armor: 0.65, cost: 30 },
  { name: 'Kevlar laminate', note: 'Rocks and bars do much less harm.', armor: 0.4, cost: 70 },
];
const RADARS = [
  { name: 'Chart plotter', note: 'Charts what you can see, and not much more.', vis: 1 },
  { name: 'Broadband radar', note: 'See further through the fog. The chart fills in wider around you.', vis: 1.25, cost: 35 },
  { name: 'Open-array radar', note: 'The widest circle there is. The fog gives up its shapes sooner.', vis: 1.55, cost: 80 },
];
const UP = { engine: 0, tank: 0, hull: 0, radar: 0 };
const st = { floats: 0, pages: 0, fuel: 380, hull: 100 };

const boat = {
  x: 0, y: 0, h: 0, u: 0, v: 0, r: 0, gx: 0, gy: 0,
  thr: 0, steer: 0, rpm: 0, plane: 0, trim: 0, deficit: 0,
  pitch: 0, pitchV: 0, heave: 0, heaveV: 0, roll: 0, rollV: 0,
  running: false, auto: null, seq: null, tied: null, wakeT: 0, sprayT: 0, bumpCD: 0,
};
const cam = { x: 0, y: 0, z: Math.log(3), zUser: 0, rot: 0, headUp: false, chart: false, atmo: 1, shake: 0, sx: 0, sy: 0 };
const input = { thr: 0, steer: 0 };

let time = 0, started = false, paused = false, chartAll = false;
let towns = [], docks = [], roads = [], items = [], labels = [], finds = [], npcs = [], buoys = [], lights = [], gulls = [];
const got = new Set();
const tankCap = () => TANKS[UP.tank].cap;

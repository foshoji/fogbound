'use strict';
/* Olvenholt and the Hushing Sea. Positions in km (the loader multiplies by 1000).
   The coast itself is in coast.js; this file is everything that sits on or under it. */

// small rocks that were never on any survey
const EXTRA_ISLETS = [
  { id: 'skerry', name: 'Skerry Lamp', x: 8.75, y: 14.72, r: 0.07, peak: 16 },
  { id: 'sentinel', name: 'The Sentinel', x: 14.9, y: 9.1, r: 0.1, peak: 48 },
  { id: 'gannet', name: 'Gannet Stack', x: 1.55, y: 5.4, r: 0.08, peak: 34 },
];

const ISLANDS = {
  olvenholt: 'Silver groves, slate roofs, and a harbour that never quite empties.',
  brinehold: 'Terraced to the summit. Every terrace a garden, every garden a grudge.',
  littlebrine: 'One house, one well, one very old dog.',
  wick: 'A candle of rock. The gulls keep it lit.',
  tallow: 'Soft stone, soft landing.',
  hearth: 'Warm to the touch, even in the dead of winter.',
  maiden: 'Two islands, one argument, several hundred years long.',
  pales: 'White cliffs that hold the last of the light.',
  farrows: 'Seal country. The seals were here first.',
  hollow: 'An island with the sea inside it.',
  skerry: 'The last light before the Veil.',
  sentinel: 'It has watched the Veil longer than anyone has watched it.',
  gannet: 'Forty thousand birds and not one of them quiet.',
};

const TOWNS_DEF = [
  { id: 'lanternmouth', name: 'Lanternmouth', x: 9.52, y: 9.05, r: 0.3, tag: 'Every window lit before the fog comes in.' },
  { id: 'saltreach', name: 'Saltreach', x: 5.1, y: 9.62, r: 0.26, tag: 'Salt pans on the flats, salt in the bread, salt in the talk.' },
  { id: 'gullwhistle', name: 'Gullwhistle', x: 7.42, y: 7.45, r: 0.17, tag: 'Named for the wind in the chimney pots, not the birds.' },
  { id: 'coldharbour', name: 'Coldharbour', x: 10.78, y: 8.55, r: 0.18, tag: 'The boats go out at four. The kettles go on at five.' },
  { id: 'brinesteps', name: 'Brine Steps', x: 3.78, y: 9.2, r: 0.13, tag: 'Three hundred steps from quay to chapel. Nobody counts them twice.' },
  { id: 'hearthquay', name: 'Hearth Quay', x: 2.75, y: 12.95, r: 0.1, tag: 'A kiln, a quay, and a queue for both.' },
  { id: 'farrowstation', name: 'Farrow Station', x: 12.6, y: 4.6, r: 0.07, tag: 'A radio mast, a tin roof, and a keeper who talks to the seals.' },
];

// type: yard (repairs, fittings, fuel), fuel, barge (fuel, moored at sea), landing (go ashore)
const DOCKS_DEF = [
  { id: 'lm-yard', type: 'yard', name: 'Lanternmouth Boatworks', at: [9.66, 9.27], tag: 'If it floats, we can fix it. If it doesn’t, we can still charge you.' },
  { id: 'lm-fuel', type: 'fuel', name: 'Lanternmouth Fuel Quay', at: [9.36, 9.28], tag: 'Diesel, petrol, and opinions, all by the litre.' },
  { id: 'sr-quay', type: 'fuel', name: 'Saltreach Quay', at: [5.18, 9.88], tag: 'Come alongside the north face. The south face bites.' },
  { id: 'gw-jetty', type: 'fuel', name: 'Gullwhistle Jetty', at: [7.38, 7.2], tag: 'One pump, one bench, one view.' },
  { id: 'ch-yard', type: 'yard', name: 'Coldharbour Slip', at: [11.08, 8.52], tag: 'Hauled out, patched up, and back in by the evening tide.' },
  { id: 'wh-pontoon', type: 'fuel', name: 'Wren Head Pontoon', at: [7.72, 11.05], tag: 'Honesty box. Please be honest.' },
  { id: 'bs-jetty', type: 'fuel', name: 'Brine Steps Jetty', at: [4.08, 9.25], tag: 'The chapel bell tells you when the pump is open.' },
  { id: 'hs-quay', type: 'fuel', name: 'Hearth Quay', at: [2.9, 12.78], tag: 'Fuel warmed by the stones, they say. It isn’t.' },
  { id: 'pl-landing', type: 'fuel', name: 'Pales Landing', at: [8.15, 3.1], tag: 'A jetty of white stone and a pump of green iron.' },
  { id: 'fr-station', type: 'fuel', name: 'Farrow Station', at: [12.75, 4.85], tag: 'Last fuel before the Veil. The keeper will tell you so.' },
  { id: 'barge-patience', type: 'barge', name: 'Fuel barge Patience', at: [12.15, 7.15], h: 0.5, tag: 'Moored north-east of Horn Point. Diesel and hot tea.' },
  { id: 'barge-constance', type: 'barge', name: 'Fuel barge Constance', at: [8.45, 13.15], h: -0.35, tag: 'Swinging on her anchor off the south coast since anyone remembers.' },
  { id: 'barge-temperance', type: 'barge', name: 'Fuel barge Temperance', at: [3.3, 6.05], h: 1.1, tag: 'Out past the Wick, where the Shoals of Ess begin.' },
  { id: 'kestle', type: 'landing', name: 'Kestle Cove', at: [8.9, 6.55], tag: 'A beach you can only find by going the long way round.', lore: 'Pale sand, a driftwood bench, and initials cut into it going back further than the island’s church records.' },
  { id: 'tern', type: 'landing', name: 'Tern Hollow', at: [7.06, 9.92], tag: 'The terns nest here, and let you know it.', lore: 'The terns lift off the shingle all at once and settle again the moment you sit down. Somebody has left a kettle on a flat stone. It is still warm.' },
  { id: 'wick', type: 'landing', name: 'The Wick', at: [5.25, 7.32], tag: 'A candle of rock. The gulls keep it lit.', lore: 'Guano, thrift and a view straight up the Sound. The gulls regard you as a small and temporary inconvenience.' },
  { id: 'littlebrine', type: 'landing', name: 'Little Brine', at: [4.75, 10.33], tag: 'One house, one well, one very old dog.', lore: 'The dog walks down to meet you, sniffs your boots, and walks back up. The house is shut. The well is sweet.' },
  { id: 'maiden', type: 'landing', name: 'Maiden Strand', at: [4.95, 12.9], tag: 'Two islands, one argument.', lore: 'Two chapels, one on each island, facing each other across the channel. Their bells are tuned a semitone apart.' },
  { id: 'pale', type: 'landing', name: 'Pale Strand', at: [6.85, 4.9], tag: 'White cliffs that hold the last of the light.', lore: 'The cliffs are chalk, soft enough to write on, and people have. Most of it is names and dates. Some of it is directions.' },
  { id: 'hollow', type: 'landing', name: 'Hollow Lagoon', at: [13.35, 12.95], tag: 'An island with the sea inside it.', lore: 'Inside the lagoon the fog stops at the rim, as if it had been asked not to come in. The water is so still you can see your boat twice.' },
  { id: 'skerry', type: 'landing', name: 'Skerry Lamp', at: [8.75, 14.62], tag: 'The last light before the Veil.', lore: 'The lamp room is swept and the wick is trimmed. There is a logbook on the desk. The last entry is this morning’s date, in a hand you do not know.' },
];

const LIGHTS_DEF = [
  { name: 'Wren Head Light', x: 7.32, y: 11.5, period: 10, col: '#fff3c8' },
  { name: 'Horn Point Light', x: 11.25, y: 6.12, period: 7, col: '#fff3c8' },
  { name: 'Skerry Lamp', x: 8.75, y: 14.72, period: 12, col: '#ffe0b0' },
  { name: 'Pales Light', x: 8.45, y: 2.2, period: 9, col: '#fff3c8' },
  { name: 'Farrow Light', x: 14.85, y: 4.35, period: 15, col: '#ffe0b0' },
  { name: 'Hearth Light', x: 1.75, y: 13.1, period: 8, col: '#fff3c8' },
];

const REEFS = [
  { name: 'Widow’s Comb', x: 10.98, y: 11.25, r: 0.055, tag: 'Teeth at low water, lace at high.' },
  { name: 'The Teeth', x: 11.7, y: 5.95, r: 0.05 },
  { name: 'Sound Rock', x: 4.26, y: 9.98, r: 0.03 },
  { name: 'Hollow Bar', x: 13.05, y: 12.2, r: 0.04 },
  { name: 'Shoals of Ess', x: 2.3, y: 7.2, r: 0.09, tag: 'They move. The chart does its best.' },
];

const SEABED_DEF = [
  { kind: 'stones', id: 'ring', x: 6.2, y: 5.3, r: 0.06, n: 9, size: 0.007, amp: 9 },
  { kind: 'spiral', id: 'garden', x: 4.1, y: 11.7, n: 110, c: 0.0052, size: 0.0035, amp: 3 },
  { kind: 'wreck', id: 'wreck', x: 12.0, y: 9.7, h: 0.7, len: 0.046, amp: 4 },
  { kind: 'road', id: 'road', pts: [[3.62, 13.32], [3.95, 13.22], [4.32, 13.15]], w: 0.009, top: -3.2 },
  { kind: 'ring', id: 'bell', x: 10.1, y: 12.4, r: 0.012, w: 0.005, amp: 6 },
];
const FINDS_DEF = [
  { id: 'ring', name: 'The Ring of Nine', text: 'Nine standing stones, standing in thirty metres of water.', reward: 15, x: 6.2, y: 5.3 },
  { id: 'garden', name: 'The Turning Garden', text: 'A hundred and ten mounds, each turned from the last by the golden angle.', reward: 20, x: 4.1, y: 11.7 },
  { id: 'wreck', name: 'Wreck of the Merrow Queen', text: 'A three-master, upright on the sand, as if waiting for a tide.', reward: 15, x: 12.0, y: 9.7 },
  { id: 'road', name: 'The Drowned Road', text: 'A paved causeway between two islands that were never joined.', reward: 20, x: 3.95, y: 13.22 },
  { id: 'bell', name: 'The Sunken Bell', text: 'A bronze bell the size of a cottage. They say it rings in storms.', reward: 15, x: 10.1, y: 12.4 },
];

// The Wayfinder's log: eight loose pages. Some float in bottles; some wait ashore.
const PAGES_DEF = [
  { n: 1, beach: 'kestle', text: 'Day one. The island is smaller than the stories and larger than my chart.' },
  { n: 2, at: [5.9, 8.25], text: 'The fog doesn’t roll in. It was always here. The island just keeps it back.' },
  { n: 3, beach: 'wick', text: 'Brine Sound runs east on the flood and west on the ebb, like something breathing.' },
  { n: 4, at: [6.0, 5.55], text: 'Nine stones in a circle, thirty metres down. Whoever set them expected the sea to rise.' },
  { n: 5, beach: 'maiden', text: 'The Hearthstones are warm. The fishermen say that’s why the fish come. The fish say nothing.' },
  { n: 6, at: [9.4, 2.9], text: 'Past the Pales the soundings run out. My lead line doesn’t.' },
  { n: 7, at: [14.3, 5.6], text: 'The keeper at the Farrows has kept a log for thirty years. Every entry: “Fog.”' },
  { n: 8, beach: 'hollow', text: 'An island with the sea inside it, and inside the sea a quiet I have not heard anywhere else.' },
];

const SEA_LABELS = [
  { text: 'THE HUSHING SEA', x: 5.2, y: 4.2, rank: 1, tag: 'Sound carries strangely here.' },
  { text: 'VEILWATER', x: 13.6, y: 14.9, rank: 1, tag: 'Deep, cold, and quieter than it has any right to be.' },
  { text: 'Stillwater Bay', x: 9.5, y: 9.62, rank: 2, tag: 'Flat as a plate at any tide.' },
  { text: 'Brine Sound', x: 4.3, y: 9.55, rank: 2, tag: 'Runs like a river on the flood.' },
  { text: 'Tern Hollow', x: 6.65, y: 9.8, rank: 3 },
  { text: 'Wren Reach', x: 8.9, y: 11.2, rank: 2 },
  { text: 'Gullwhistle Road', x: 7.5, y: 6.4, rank: 3 },
  { text: 'Shoals of Ess', x: 2.3, y: 7.45, rank: 3, tag: 'They move. The chart does its best.' },
  { text: 'The Narrows', x: 3.9, y: 12.4, rank: 3 },
];
const LAND_LABELS = [
  { text: 'Mount Vigil', peak: 'olvenholt', rank: 2, tag: 'The beacon on top has not been lit in forty winters.' },
  { text: 'The Silverwood', x: 8.3, y: 8.3, rank: 3, tag: 'Olive trees older than the town that tends them.' },
  { text: 'The Weeping Stair', x: 6.6, y: 8.2, rank: 3, tag: 'A hundred small waterfalls, all of them quiet.' },
  { text: 'Wren Head', x: 7.35, y: 11.35, rank: 3, tag: 'Lit by hand, every night, by someone.' },
  { text: 'Horn Point', x: 11.1, y: 6.25, rank: 3, tag: 'Where the east wind comes ashore to argue.' },
];

const TRAFFIC = [
  { name: 'Lantern Wren', kind: 'ferry', speed: 8.2, stops: ['lm-fuel', 'bs-jetty'], dwell: 22, tag: 'Ferry · Lanternmouth to Brine Steps',
    lines: ['Mind our wash, fast boat. Morning to you.', 'Forty souls and a goat, outbound.', 'Tide’s with you through the Sound today.'] },
  { name: 'Old Tolly', kind: 'ferry', len: 30, speed: 6.8, stops: ['sr-quay', 'hs-quay'], dwell: 18, tag: 'Ferry · Saltreach to Hearth Quay',
    lines: ['Old Tolly, slow and steady. Pass us to port, if you please.', 'We’ve a cargo of kiln bricks and a very patient captain.'] },
  { name: 'Grey Heron', kind: 'coaster', speed: 6.2, stops: [[1.7, 4.0], [6.2, 1.3], [11.8, 1.7], [15.1, 6.3], [14.4, 11.7], [10.2, 15.3], [4.6, 15.2], [1.0, 10.2]], tag: 'Coaster · round the islands',
    lines: ['Heron here. We steer like a church, so give us room.', 'Seven knots and in no hurry. Nothing out here is.', 'You’re a long way out for a boat that size.'] },
  { name: 'Skipjack', kind: 'launch', speed: 12.5, stops: ['lm-fuel', 'ch-yard', 'gw-jetty', 'sr-quay'], dwell: 14, tag: 'Water taxi · round Olvenholt',
    lines: ['Skipjack, running late as usual.', 'Race you to Coldharbour. No, don’t.'] },
  { name: 'Brightfin', kind: 'fishing', at: [6.7, 5.95], r: 140, tag: 'Fishing · lines and pots', lines: ['Anyone seen my other glove.', 'Pots are down. Keep your wash to yourself.'] },
  { name: 'Mary Ellen', kind: 'fishing', at: [11.9, 10.0], r: 120, dir: -1, tag: 'Fishing · trawler', lines: ['Mary Ellen, trawling. Stay clear of the gear astern.'] },
  { name: 'Cod Almighty', kind: 'fishing', at: [3.3, 11.25], r: 100, tag: 'Fishing · crabber', lines: ['Crabs are biting. So is the skipper.'] },
  { name: 'Salt Wife', kind: 'fishing', at: [9.7, 12.3], r: 150, dir: -1, tag: 'Fishing · long-liner', lines: ['Salt Wife here. The fish have gone deep. So have we.'] },
  { name: 'Petrel', kind: 'yacht', at: [8.4, 10.7], tag: 'Yacht · out for the afternoon', lines: ['Lovely day for it, if you like grey.'] },
  { name: 'Quiet Hour', kind: 'yacht', at: [5.7, 8.35], tag: 'Yacht · anchored and drifting', lines: ['Quiet Hour, living up to the name.'] },
];

const RADIO = [
  { who: 'Lanternmouth Harbour', text: 'Lantern Wren departing for Brine Steps. Mind the wash in the bay.' },
  { who: 'Coastwatch', text: 'Visibility good inside the islands. Poor to very poor past the Pales.' },
  { who: 'Coastwatch', text: 'All vessels: fog bank east of the Farrows, drifting west.', far: true },
  { who: 'Saltreach Quay', text: 'Fuel’s on, kettle’s on. Come alongside the north face.' },
  { who: 'Brightfin', text: 'Anyone out there seen my other glove.' },
  { who: 'Farrow Station', text: 'Seals: forty. Keeper: one. Fog: yes.', far: true },
  { who: 'Coastwatch', text: 'Tide turns within the hour. Brine Sound will run hard.' },
  { who: 'Unknown vessel', text: '…say again, Lanternmouth, you’re breaking up…', far: true },
  { who: 'Barge Patience', text: 'Patience on station north-east of Horn Point. Diesel and hot tea.' },
  { who: 'Wren Head Light', text: 'Light is lit. Light is always lit.' },
  { who: 'Coldharbour Slip', text: 'Slip’s free this afternoon if anyone’s dented.', near: true },
  { who: 'Coastwatch', text: 'Reminder: the Veil is not on any chart. Do not rely on it being anywhere in particular.', far: true },
];

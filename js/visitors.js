// Visitors who knock on the front door. They can't be harmed (they never enter the house), but they are
// the worst possible witnesses at the worst possible moment, and they remember how they were treated.
import { GRID_H } from './data.js';
import { requestInvestigation } from './emergency.js';
import { houseDoor, visitingSide, annoyNeighbour, pleaseNeighbour } from './neighbours.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const SPEED = 2.0;

export const VISITOR_TYPES = {
  witnesses: { name: "Jehovah's Witness", count: 2, shirt: 0x2a2f45, icon: '📖',
    arrive: "Two Jehovah's Witnesses ring the doorbell. They'd love to talk about the end of the world. Timing: impeccable." },
  mormons: { name: 'Missionary', count: 2, shirt: 0xf4f4f4, icon: '🙏',
    arrive: 'Two missionaries in crisp white shirts and name tags knock on the door. Both of them are called Elder Johnson.' },
  neighbour: { name: 'Neighbour', count: 1, shirt: 0xb05a8a, icon: '☕', arrive: '' }, // filled in from the family next door
  salesman: { name: 'Knife Salesman', count: 1, shirt: 0x2a2a2a, icon: '🔪',
    arrive: 'A door-to-door salesman rings the bell. He sells knives. Very, very sharp knives. He keeps demonstrating.' },
  cop: { name: 'Officer Plod', count: 1, shirt: 0x1a2a5a, icon: '👮',
    arrive: 'Officer Plod stops by for a "routine" wellness check. He is writing things down.' },
};

// How each kind of visitor takes being treated a certain way: a line per kind (or a function of the
// visitor's name), plus what it does to the neighbours' patience and whether they ever come back.
const OUTCOMES = {
  ignored: { annoy: 5, lines: {
    witnesses: "Nobody answers. The Witnesses slip a pamphlet titled 'Is Anyone There? Is Anyone Saved?' under the door.",
    mormons: 'Nobody answers. The missionaries leave a Book of Mormon on the doormat, just in case.',
    neighbour: n => `Nobody answers. ${n} peers through the front window for an uncomfortable length of time, then goes home.`,
    salesman: "Nobody answers. The salesman leaves a catalogue. Page one: 'Knives For People Who Live With People'.",
    cop: "Nobody answers. Officer Plod leaves a card: 'Sorry I missed you. I will be back.'",
  } },
  slam: { annoy: 20, lines: {
    witnesses: "The Jehovah's Witnesses beam at the slammed door. 'See you next week!' They mean it.",
    mormons: 'The missionaries bow politely to the slammed door and try next door instead.',
    neighbour: n => `${n} stares at the slammed door, lips pursed. This will be raised at the residents' meeting.`,
    salesman: 'The salesman slides a business card under the door. Someone cuts a finger on it later.',
  } },
  chat: { please: 10, lines: {
    witnesses: 'An hour on the doorstep and the Witnesses run out of Armageddon. They leave glowing, and will definitely be back.',
    mormons: "The missionaries leave delighted. They've added this house to their prayer list, which is somehow worse.",
    neighbour: n => `${n} has a lovely natter on the doorstep and goes home with enough gossip for a month.`,
    salesman: 'An hour of demonstrations later, the salesman leaves without a sale and with noticeably less hope.',
  } },
  insult: { annoy: 30, lines: {
    witnesses: 'The Witnesses thank you for your honesty and promise to pray for you. Loudly. Next week.',
    mormons: 'The missionaries apologise for existing and hurry away.',
    neighbour: n => `${n} goes pale, then purple, and marches home to write a very long letter to the council.`,
    salesman: 'The salesman takes it personally and leaves. He knows where you live. He has knives.',
    cop: 'Officer Plod writes down every single word. (+5 suspicion)',
  } },
  gassed: { annoy: 40, ban: true, lines: {
    witnesses: "The Jehovah's Witnesses stagger back, clutching their pamphlets. This house is crossed off the list. Permanently.",
    mormons: 'The missionaries retch in perfect unison and decide God can reach this household without their help.',
    neighbour: n => `${n} gags, backs down the path with a hanky over their face, and will never pop round again.`,
    salesman: 'The salesman flees, leaving a very sharp sample on the doormat. He is taking this street off his route.',
    cop: 'Officer Plod radios for backup. For his nose. He refuses to come back, so the station sends an inspector instead.',
  } },
  stench: { annoy: 25, ban: true, lines: {
    witnesses: 'One sniff and the Witnesses conclude this household is beyond saving. They will not be back.',
    mormons: 'The missionaries hold their breath, back away slowly and cross the street. They will not be back.',
    neighbour: n => `${n} catches a whiff of whatever lives in your hallway and decides never to visit again.`,
    salesman: 'The salesman offers a free knife to anyone who will open a window, then leaves for good.',
    cop: "Officer Plod's eyes water. He retreats to his car and asks for someone else to take this address.",
  } },
  noise: { annoy: 10, lines: {
    witnesses: 'Nobody can hear the doorbell over the music. The Witnesses leave, ears ringing, humming along despite themselves.',
    mormons: 'Nobody can hear the doorbell over the music. The missionaries leave, ears ringing.',
    neighbour: n => `${n} can't hear themselves think over your music and storms home to bang on the wall.`,
    salesman: 'Nobody can hear the doorbell over the music. The salesman leaves, ears ringing.',
    cop: 'Nobody can hear the doorbell over the music. Officer Plod notes "noise" and "suspicious beats".',
  } },
  fire: { lines: {
    witnesses: "The Witnesses see smoke, shout 'It has begun!' with alarming enthusiasm, and call 112.",
    mormons: 'The missionaries see flames, call 112 and pray very, very quickly.',
    neighbour: n => `${n} sees the smoke, shrieks, and calls the fire brigade. And the local paper.`,
    salesman: 'The salesman sees flames, hands out a leaflet for fire extinguishers, calls 112 and leaves.',
    cop: 'Officer Plod sees the flames and calls it in. Then he writes down everything.',
  } },
  bought: { please: 5, lines: {
    salesman: 'The salesman leaves happier than anyone has ever left this house.',
  } },
};

let nextId = 1;
const doorSpot = (i, n) => [10.5 + (i - (n - 1) / 2) * 0.7, 11.7];
const streetSpot = (i, n) => [10.5 + (i - (n - 1) / 2) * 0.7, GRID_H + 2.4];
// Neighbours walk down their own path, along the pavement and up yours.
function routeFrom(side, i, n) {
  const [hx, hz] = houseDoor(side), [dx, dz] = doorSpot(i, n);
  return [[hx, hz + 0.3], [hx, GRID_H + 0.9], [10.5, GRID_H + 0.9], [dx, dz]];
}

export function scheduleNextVisit(g) {
  g.nextVisit = g.clock + rand(300, 660);
}

function pickKind(g) {
  if (g.contract && g.suspicion >= 40 && !g.visitBans.has('cop')) return 'cop';
  if (g.welcome && visitingSide(g) === g.welcome) return 'neighbour';
  const pool = ['witnesses', 'mormons', 'neighbour', 'salesman']
    .filter(k => !g.visitBans.has(k) && (k !== 'neighbour' || visitingSide(g)));
  return pool.length ? pick(pool) : null;
}

function spawn(g) {
  const kind = pickKind(g);
  if (!kind) { scheduleNextVisit(g); return; }
  let type = VISITOR_TYPES[kind], side = null;
  if (kind === 'neighbour') {
    side = visitingSide(g);
    const f = g.neighbours[side].family, welcome = g.welcome === side;
    if (welcome) g.welcome = null;
    type = { ...type, name: f.visitor, shirt: f.shirt, icon: welcome ? '🥘' : '☕',
      arrive: `${f.visitor} from next door ${welcome ? 'comes round with a welcome casserole. It is still bubbling. Ominously.' : f.hello}` };
  }
  const people = [];
  for (let i = 0; i < type.count; i++) {
    const route = side ? routeFrom(side, i, type.count) : [doorSpot(i, type.count)];
    const [x, z] = side ? houseDoor(side) : streetSpot(i, type.count);
    people.push({ id: 'v' + nextId++, first: type.name, x, z, route, moving: true, facing: Math.PI });
  }
  g.visit = { kind, type, side, people, state: 'arrive', wait: 0, knockT: 0 };
  g.log(`🚪 ${type.icon} ${type.arrive}`, 'warn');
}

// Sends the visitors home. `why` is logged.
export function dismissVisitors(g, why) {
  const v = g.visit;
  if (!v || v.state === 'leave') return;
  if (why) g.log(why, 'dim');
  v.state = 'leave';
  v.people.forEach((p, i) => { p.route = v.side ? routeFrom(v.side, i, v.people.length).reverse() : [streetSpot(i, v.people.length)]; });
  const nosy = v.kind === 'neighbour' && g.neighbours[v.side].family.trait === 'nosy';
  if (nosy && g.contract && g.world.tombstones.length) {
    g.addSuspicion(5 * g.world.tombstones.length, `☕ On the way out, ${v.type.name} counts the fresh graves in the garden. (${g.world.tombstones.length})`);
  }
}

// The visit ends the way the house treated them. Returns false if nobody is visiting.
export function visitorOutcome(g, how) {
  const v = g.visit;
  if (!v || v.state === 'leave') return false;
  const o = OUTCOMES[how];
  const line = o.lines[v.kind] || o.lines.witnesses;
  const bad = o.ban || (o.annoy || 0) >= 20;
  g.log(`${v.type.icon} ${typeof line === 'function' ? line(v.type.name) : line}`, bad ? 'evil' : 'dim');
  if (v.kind === 'neighbour') {
    if (o.ban) g.neighbours[v.side].banned = true;
    if (o.annoy) annoyNeighbour(g, v.side, o.annoy);
    if (o.please) pleaseNeighbour(g, v.side, o.please);
  } else if (o.ban) {
    g.visitBans.add(v.kind);
  }
  if (v.kind === 'cop' && how === 'insult') g.addSuspicion(5);
  if (v.kind === 'cop' && how === 'gassed') requestInvestigation(g, 'an officer being gassed on duty');
  if (how === 'fire' && g.brigade && g.brigade.state === 'unnoticed') g.brigade.t = 0;
  dismissVisitors(g);
  return true;
}

// Things visitors notice from the doorstep without anyone opening the door.
function senseHouse(g, v) {
  const near = (x, z, r) => v.people.some(p => Math.hypot(p.x - x, p.z - z) < r);
  if (v.state === 'wait' && g.world.fire.size) return visitorOutcome(g, 'fire');
  if (g.sims.some(s => s.alive && !s.status.swimming && s.needs.hygiene < 15 && near(s.x, s.z, 1.8))) return visitorOutcome(g, 'stench');
  if (v.state === 'wait' && v.wait > 15 && g.musicLevel() >= 1) return visitorOutcome(g, 'noise');
  return false;
}

function walk(p, gdt) {
  let budget = SPEED * gdt;
  while (budget > 0 && p.route.length) {
    const [x, z] = p.route[0];
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.001) p.facing = Math.atan2(dx, dz);
    if (d <= budget) { p.x = x; p.z = z; budget -= d; p.route.shift(); }
    else { p.x += dx / d * budget; p.z += dz / d * budget; budget = 0; }
  }
  p.moving = p.route.length > 0;
  if (!p.moving) p.facing = Math.PI;
  return !p.moving;
}

export function updateVisitors(g, gdt, min) {
  if (!g.visit) {
    if (g.clock >= g.nextVisit && !g.over && !g.investigation) spawn(g);
    return;
  }
  const v = g.visit;
  let allThere = true;
  for (const p of v.people) if (!walk(p, gdt)) allThere = false;
  if (v.state === 'arrive' && allThere) { v.state = 'wait'; v.wait = 0; }
  if (v.state !== 'leave' && senseHouse(g, v)) return;
  if (v.state === 'wait') {
    v.wait += min;
    v.knockT -= min;
    if (v.knockT <= 0) { v.knockT = 15; g.sfx('knock'); }
    if (v.wait > 90) visitorOutcome(g, 'ignored');
  }
  if (v.state === 'leave' && allThere) {
    g.visit = null;
    scheduleNextVisit(g);
  }
}

// Visitors standing within `r` cells of a point, for witness checks.
export function visitorsNear(g, x, z, r) {
  if (!g.visit) return [];
  return g.visit.people.filter(p => Math.hypot(p.x - x, p.z - z) <= r);
}

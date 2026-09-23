// Visitors who knock on the front door. They can't be harmed (they never enter the house),
// but they are the worst possible witnesses at the worst possible moment.
import { GRID_H } from './data.js';

const rand = (a, b) => a + Math.random() * (b - a);

export const VISITOR_TYPES = {
  witnesses: { name: "Jehovah's Witness", count: 2, shirt: 0x2a2f45, icon: '📖',
    arrive: "Two Jehovah's Witnesses ring the doorbell. They'd love to talk about the end of the world. Timing: impeccable." },
  mormons: { name: 'Missionary', count: 2, shirt: 0xf4f4f4, icon: '🙏',
    arrive: 'Two missionaries in crisp white shirts and name tags knock on the door. Both of them are called Elder Johnson.' },
  neighbour: { name: 'Mrs. Crabtree', count: 1, shirt: 0xb05a8a, icon: '☕',
    arrive: 'Mrs. Crabtree from next door drops by "just to say hello". Her eyes are everywhere.' },
  cop: { name: 'Officer Plod', count: 1, shirt: 0x1a2a5a, icon: '👮',
    arrive: 'Officer Plod stops by for a "routine" wellness check. He is writing things down.' },
};

let nextId = 1;
const doorSpot = (i, n) => [10.5 + (i - (n - 1) / 2) * 0.7, 11.7];
const streetSpot = (i, n) => [10.5 + (i - (n - 1) / 2) * 0.7, GRID_H + 2.4];

export function scheduleNextVisit(g) {
  g.nextVisit = g.clock + rand(300, 660);
}

function spawn(g) {
  const pool = g.contract && g.suspicion >= 40 ? ['cop'] : ['witnesses', 'mormons', 'neighbour'];
  const kind = pool[Math.floor(Math.random() * pool.length)];
  const t = VISITOR_TYPES[kind];
  const people = [];
  for (let i = 0; i < t.count; i++) {
    const [x, z] = streetSpot(i, t.count);
    people.push({ id: 'v' + nextId++, first: t.name, x, z, goal: doorSpot(i, t.count), moving: true, facing: Math.PI });
  }
  g.visit = { kind, type: t, people, state: 'arrive', wait: 0, knockT: 0 };
  g.log(`🚪 ${t.icon} ${t.arrive}`, 'warn');
}

// Sends the visitors back down the path. `why` is logged.
export function dismissVisitors(g, why) {
  const v = g.visit;
  if (!v || v.state === 'leave') return;
  if (why) g.log(why, 'dim');
  v.state = 'leave';
  v.people.forEach((p, i) => { p.goal = streetSpot(i, v.people.length); p.moving = true; });
  if (v.kind === 'neighbour' && g.contract && g.world.tombstones.length) {
    g.addSuspicion(5 * g.world.tombstones.length, `☕ On her way out, Mrs. Crabtree counts the fresh graves in the garden. (${g.world.tombstones.length})`);
  }
}

export function updateVisitors(g, gdt, min) {
  if (!g.visit) {
    if (g.clock >= g.nextVisit && !g.over) spawn(g);
    return;
  }
  const v = g.visit;
  let allThere = true;
  for (const p of v.people) {
    const dx = p.goal[0] - p.x, dz = p.goal[1] - p.z, d = Math.hypot(dx, dz);
    const step = 1.6 * gdt;
    if (d > step) { p.x += dx / d * step; p.z += dz / d * step; p.facing = Math.atan2(dx, dz); p.moving = true; allThere = false; }
    else { p.x = p.goal[0]; p.z = p.goal[1]; p.moving = false; p.facing = Math.PI; }
  }
  if (v.state === 'arrive' && allThere) { v.state = 'wait'; v.wait = 0; }
  if (v.state === 'wait') {
    v.wait += min;
    v.knockT -= min;
    if (v.knockT <= 0) { v.knockT = 15; g.sfx('knock'); }
    if (v.wait > 90) dismissVisitors(g, `🚪 Nobody answers the door. ${v.people.length > 1 ? 'The visitors give up and leave' : `${v.type.name} gives up and leaves`}.`);
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

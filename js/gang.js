// A biker gang. Summon one (or provoke one) and they roar up the street, beat up everyone they can find,
// roommates and visitors alike, smash a few things and ride off. They don't care whose side you're on.
import { GRID_H } from './data.js';
import { vehicle, driveVehicle, responder, routeTo, walk } from './emergency.js';
import { outsiders, hurtOutsider } from './outsiders.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const cap = s => s[0].toUpperCase() + s.slice(1);

const GANGS = ["the Hell's Grannies", 'the Suburban Reapers', 'the Sons of Anarchy Adjacent', 'the Road Weasels', 'the Leather Accountants'];
const BIKERS = ['Tiny', 'Knuckles', 'Grandma', 'Deathwish Derek', 'Moustache', 'Sprocket', 'Big Sue', 'Gravel'];
const FAR_CURB = GRID_H + 6.3;
const RAMPAGE = 120;   // game minutes before they get bored
const HITS = 4;        // punches before a biker moves on to someone else

export function summonGang(g, reason) {
  if (g.gang || g.over) return false;
  const name = pick(GANGS);
  g.gang = { state: 'coming', t: rand(30, 60), name, bikes: [], crew: [], spurned: false };
  g.log(`🏍️ ${reason} Somewhere across town, ${name} put down their pints.`, 'evil');
  return true;
}

const inside = (g, x, z) => g.world.inBounds(Math.floor(x), Math.floor(z));

// Anyone on the lot who isn't a biker: roommates, visitors at the door, firefighters, inspectors.
function victims(g, p) {
  const sims = g.sims.filter(s => s.alive && !s.status.swimming);
  const others = outsiders(g).filter(o => o.kind !== 'biker' && !o.dead && inside(g, o.x, o.z));
  return [...sims, ...others].filter(t => !p.beaten.has(t.id));
}

function punch(g, gang, p, t) {
  const dmg = rand(7, 14);
  g.sfx('punch');
  if (g.view) g.view.burst((p.x + t.x) / 2, (p.z + t.z) / 2, 'dust');
  if (t.needs) {
    // A roommate: bruised, running for it, maybe dead. Hotheads hit back.
    t.health -= dmg;
    g.popup(t, '-' + Math.round(dmg), '#ff5a5a');
    if (t.action && t.action.source === 'auto') t.endAction();
    t.status.fleeing = true;
    t.status.panic = 15;
    t.panicGoal = null;
    if (t.health <= 0) { g.kill(t, 'Biker Gang'); return true; }
    if (t.has('hotheaded') && Math.random() < 0.5) {
      g.log(`💢 ${t.first} punches ${p.first} right back.`, 'evil');
      hurtOutsider(g, p, rand(8, 16), 'Fight');
    }
    return false;
  }
  return hurtOutsider(g, t, dmg, 'Biker Gang');
}

// Bored bikers break things.
function vandalise(g, p) {
  const w = g.world;
  const near = [...w.objects.values()].filter(o => !o.broken && o.cells.length && Math.hypot(o.cells[0][0] + 0.5 - p.x, o.cells[0][1] + 0.5 - p.z) < 2.2);
  if (near.length && Math.random() < 0.5) {
    const o = pick(near);
    o.broken = true;
    g.sfx('crash');
    g.log(`🏍️ ${p.first} puts a boot through the ${o.name}.`, 'evil');
  } else if (inside(g, p.x, p.z)) {
    w.addMess(Math.floor(p.x), Math.floor(p.z), null);
  }
}

function bikerAct(g, gang, p, gdt, min) {
  if (p.onFire || p.trapped > 0 || p.dead) return;
  const t = p.target;
  const gone = !t || (t.needs ? !t.alive || t.status.swimming : t.dead || !outsiders(g).includes(t) || !inside(g, t.x, t.z));
  if (gone) {
    p.target = null;
    const list = victims(g, p).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    // Spread out: prefer someone the others aren't already on.
    p.target = list.find(v => !gang.crew.some(o => o !== p && o.target === v)) || list[0] || null;
    p.hits = 0;
    if (!p.target) {
      p.smashT = (p.smashT ?? rand(5, 20)) - min;
      if (p.smashT <= 0) { p.smashT = rand(15, 30); vandalise(g, p); }
      return;
    }
  }
  const target = p.target;
  const d = Math.hypot(target.x - p.x, target.z - p.z);
  if (d > 1.3) {
    p.chaseT = (p.chaseT || 0) - min;
    if (!p.route.length || p.chaseT <= 0) {
      p.chaseT = 3;
      if (!routeTo(g, p, Math.floor(target.x), Math.floor(target.z))) { p.beaten.add(target.id); p.target = null; return; }
    }
    walk(g, p, gdt, 2.8);
    return;
  }
  p.route = [];
  p.moving = false;
  p.pose = 'punch';
  p.facing = Math.atan2(target.x - p.x, target.z - p.z);
  p.hitT = (p.hitT || 0) - min;
  if (p.hitT > 0) return;
  p.hitT = 3;
  const killed = punch(g, gang, p, target);
  if (killed || ++p.hits >= HITS) { p.beaten.add(target.id); p.target = null; p.pose = 'idle'; }
}

export function updateGang(g, gdt, min) {
  const gang = g.gang;
  if (!gang) return;
  if (gang.state === 'coming') {
    gang.t -= min;
    if (gang.t > 0) return;
    gang.bikes = [0, 1, 2, 3].map(i => vehicle(g, 'bike', 11 + i * 1.4, 1, FAR_CURB));
    g.log(`🏍️💨 A thunder of engines: ${gang.name} roar into the street and park across your neighbours' flowerbeds.`, 'warn');
    gang.state = 'riding';
  } else if (gang.state === 'riding') {
    for (const b of gang.bikes) driveVehicle(g, b, gdt);
    if (gang.bikes.some(b => b.state !== 'parked')) return;
    const names = [...BIKERS].sort(() => Math.random() - 0.5);
    gang.crew = gang.bikes.map((b, i) => {
      const p = responder(g, 'biker', names[i], names[i], b.x, FAR_CURB - 0.9);
      p.beaten = new Set();
      p.bike = b;
      return p;
    });
    gang.t = RAMPAGE;
    g.annoyNeighbours(15);
    g.log(`🏍️ ${gang.crew.map(p => p.first).join(', ')} swagger up your garden path, cracking their knuckles. They are here to hurt everyone.`, 'evil');
    gang.state = 'rampage';
  } else if (gang.state === 'rampage') {
    gang.crew = gang.crew.filter(p => !p.dead);
    for (const p of gang.crew) bikerAct(g, gang, p, gdt, min);
    gang.t -= min;
    if (gang.t > 0 && gang.crew.length) return;
    for (const p of gang.crew) {
      p.target = null;
      p.pose = 'walk';
      const w = g.world, cx = Math.floor(p.x), cz = Math.floor(p.z);
      const path = w.inBounds(cx, cz) ? w.findPath(cx, cz, 10, GRID_H - 1) : null;
      p.route = [...(path || []).map(([x, z]) => [x + 0.5, z + 0.5]), [10.5, GRID_H + 0.4], [p.bike.x, FAR_CURB - 0.9]];
      p.home = true;
    }
    g.log(`🏍️ ${cap(gang.name)} get bored, spit on the lawn and head back to their bikes.`, 'dim');
    gang.state = 'leaving';
  } else if (gang.state === 'leaving') {
    gang.crew = gang.crew.filter(p => !p.dead);
    for (const p of gang.crew) if (!p.onFire && !(p.trapped > 0)) walk(g, p, gdt, 2.8);
    if (gang.crew.some(p => p.route.length)) return;
    g.responders = g.responders.filter(p => !gang.crew.includes(p));
    for (const b of gang.bikes) b.state = 'leave';
    gang.state = 'gone';
  } else if (gang.state === 'gone') {
    for (const b of gang.bikes) driveVehicle(g, b, gdt);
    if (gang.bikes.every(b => !g.vehicles.includes(b))) g.gang = null;
  }
}

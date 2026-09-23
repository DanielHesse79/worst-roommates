// Emergency services. A fire burns until a neighbour finally calls the brigade; a suspicious death
// brings a detective who searches the lot for evidence. Responders aren't sims: they walk the house
// grid directly, can't be harmed, and see everything.
import { GRID_W, GRID_H } from './data.js';
import { cellKey } from './world.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const CURB_Z = GRID_H + 2.3;       // emergency vehicles pull over here, clear of traffic
const STREET_START = -40, STREET_END = 66;
const FIRE_PARK_X = 6.5, POLICE_PARK_X = 15;
const REACH = 2.3;                        // hose range, in cells
const SPRAY_MIN = 1.2;                    // game minutes of hosing per burning cell
const POLICE_COOLDOWN = 600;              // quiet minutes after a search before another one
let nextId = 1;

const CALLERS = [
  'Mrs. Crabtree next door finally stops filming and calls it in.',
  'A passing jogger notices the smoke and calls 112 between sets.',
  'The neighbours argue over whose turn it is to call. Eventually someone does.',
  'Somebody posts "is that house ON FIRE??" in the neighbourhood group. A retired fireman calls it in.',
];
const FIRE_REPORTS = [
  'Cause of fire: "vibes". Case closed.',
  'Probably a candle. Or several. In a pile. Soaked in something.',
  'I have seen worse. Not recently, but I have.',
  'Tell the landlord the smoke alarm is now a smoke ornament.',
];

// ---------- shared helpers ----------

function responder(g, kind, first, title, x, z) {
  const p = { id: 'r' + nextId++, kind, first, title, x, z, facing: Math.PI, moving: false, pose: 'idle', route: [], pause: 0 };
  g.responders.push(p);
  return p;
}

function vehicle(g, kind, parkX) {
  const v = { id: 'car' + nextId++, kind, x: STREET_START, z: CURB_Z, parkX, state: 'arrive' };
  g.vehicles.push(v);
  return v;
}

function driveVehicle(g, v, gdt) {
  if (v.state === 'arrive') {
    const d = v.parkX - v.x;
    const step = clamp(d * 1.1, 2, 14) * gdt;
    if (d <= step) { v.x = v.parkX; v.state = 'parked'; }
    else v.x += step;
    g.sfx(v.kind === 'police' ? 'police' : 'siren');
  } else if (v.state === 'leave') {
    v.x += 9 * gdt;
    if (v.x > STREET_END) g.vehicles = g.vehicles.filter(o => o !== v);
  }
}

const gateCell = w => w.nearestWalkable(10, GRID_H - 1);

// Plans a walk to the cell (or the nearest free cell next to it). False if there's no way in.
function routeTo(g, p, cx, cz) {
  const w = g.world;
  const [tx, tz] = w.nearestWalkable(cx, cz);
  const outside = !w.inBounds(Math.floor(p.x), Math.floor(p.z));
  const [sx, sz] = outside ? gateCell(w) : [Math.floor(p.x), Math.floor(p.z)];
  const path = w.findPath(sx, sz, tx, tz);
  if (!path) return false;
  p.route = [...(outside ? [[sx + 0.5, GRID_H + 0.4], [sx + 0.5, sz + 0.5]] : []), ...path.map(([x, z]) => [x + 0.5, z + 0.5])];
  return true;
}

function routeHome(g, p, v, slot) {
  const w = g.world;
  const [gx, gz] = gateCell(w);
  const inside = w.inBounds(Math.floor(p.x), Math.floor(p.z));
  const path = inside ? w.findPath(Math.floor(p.x), Math.floor(p.z), gx, gz) : null;
  p.route = [...(path || []).map(([x, z]) => [x + 0.5, z + 0.5]), [gx + 0.5, GRID_H + 0.4], [v.x + slot, CURB_Z - 0.85]];
  p.pose = 'walk';
  p.home = true;
}

function walk(g, p, gdt, speed) {
  let budget = speed * gdt;
  while (budget > 0 && p.route.length) {
    const [x, z] = p.route[0];
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.001) p.facing = Math.atan2(dx, dz);
    if (d <= budget) {
      p.x = x; p.z = z; budget -= d;
      p.route.shift();
      if (!p.home) stepOnTrap(g, p);
    } else {
      p.x += dx / d * budget; p.z += dz / d * budget; budget = 0;
    }
  }
  p.moving = p.route.length > 0;
  if (p.moving) p.pose = 'walk';
}

// Logs a discovery and charges suspicion for it (free play has no meter, only the confiscation).
function exposed(g, msg, sus) {
  g.log(`${msg}${g.contract && sus > 0 && !g.result ? ` (+${sus} suspicion)` : ''}`, 'warn');
  if (sus > 0) g.addSuspicion(sus);
}

function stepOnTrap(g, p) {
  const t = g.world.trapAt(Math.floor(p.x), Math.floor(p.z));
  if (!t) return;
  g.world.removeTrap(t);
  const inv = g.investigation;
  if (inv) { inv.found++; inv.done.add('trap:' + cellKey(t.x, t.z)); }
  if (t.type === 'wax') {
    g.sfx('slip');
    exposed(g, `🧽 ${p.title} skids across a suspiciously waxed floor and lies there, staring at the ceiling, writing a report in his head.`, 8);
  } else {
    g.sfx('snap');
    exposed(g, `🪤 ${p.title} steps into a bear trap hidden in the lawn. His steel-toe boot survives. Your plausible deniability does not.`, 15);
  }
}

// Knocks through every bricked-up door. Real brickwork is evidence; Daniel's smart locks just "glitched".
function breakIn(g, p) {
  const doors = g.world.doors.filter(d => d.bricked);
  if (!doors.length) return false;
  const bricked = doors.filter(d => !d.hackLocked);
  for (const d of doors) { d.bricked = false; d.hackLocked = false; }
  g.world.rebuildEdges();
  g.sfx('crash');
  if (g.view) g.view.shake = 0.3;
  if (bricked.length) {
    const inv = g.investigation;
    if (inv) { inv.found++; for (const d of bricked) inv.done.add('door:' + d.id); }
    exposed(g, `🪓 ${p.title} takes an axe to the fresh brickwork where the ${bricked.map(d => d.name).join(' and the ')} used to be. "Who bricks up a DOOR?"`, 10 * bricked.length);
  } else {
    g.log(`🪓 ${p.title} axes through the smart locks. Daniel's "firmware glitch" is filed under: weird, but legal.`, 'dim');
  }
  return true;
}

export function respondersNear(g, x, z, r) {
  return g.responders.filter(p => Math.hypot(p.x - x, p.z - z) <= r);
}

// ---------- fire brigade ----------

function nearestFlame(w, p, reach) {
  let best = null, bd = reach;
  for (const f of w.fire.values()) {
    const d = Math.hypot(f.x + 0.5 - p.x, f.z + 0.5 - p.z);
    if (d <= bd) { bd = d; best = f; }
  }
  return best;
}

function fightFire(g, b, p, gdt, min) {
  const w = g.world;
  for (const s of g.sims) {
    if (s.alive && s.status.onFire > 0 && Math.hypot(s.x - p.x, s.z - p.z) < REACH + 0.5) {
      s.status.onFire = 0;
      if (g.view) g.view.burst(s.x, s.z, 'splash');
      g.log(`🧯 ${p.title} blasts ${s.first} with the hose. ${s.first} is no longer on fire, just furious and damp.`, 'dim');
    }
  }
  if (p.pause > 0) { p.pause -= min; p.pose = 'idle'; p.aim = null; return; }
  const flame = nearestFlame(w, p, REACH);
  if (flame) {
    p.route = [];
    p.moving = false;
    p.pose = 'spray';
    p.aim = [flame.x + 0.5, flame.z + 0.5];
    p.facing = Math.atan2(p.aim[0] - p.x, p.aim[1] - p.z);
    p.spray = (p.spray || 0) + min;
    if (p.spray >= SPRAY_MIN) {
      p.spray = 0;
      w.extinguish(flame.x, flame.z);
      if (g.view) g.view.burst(p.aim[0], p.aim[1], 'steam');
    }
    return;
  }
  p.aim = null;
  if (p.route.length) { walk(g, p, gdt, 2.6); return; }
  p.pose = 'idle';
  // Head for the flame nearest to this firefighter that nobody else is already handling.
  const taken = b.crew.filter(o => o !== p && o.goal).map(o => o.goal);
  const flames = [...w.fire.values()].sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z));
  const f = flames.find(fl => !taken.some(t => Math.abs(t[0] - fl.x) + Math.abs(t[1] - fl.z) < 3)) || flames[0];
  if (!f) return;
  p.goal = [f.x, f.z];
  if (!routeTo(g, p, f.x, f.z) && !(breakIn(g, p) && routeTo(g, p, f.x, f.z))) {
    // Sealed in somehow: they hose it down from the lawn, slowly.
    w.extinguish(f.x, f.z);
  }
}

function updateBrigade(g, gdt, min) {
  const w = g.world;
  let b = g.brigade;
  if (!b) {
    if (w.fire.size && !g.over) g.brigade = { state: 'unnoticed', t: rand(25, 45) };
    return;
  }
  if (b.state === 'unnoticed') {
    b.t -= min;
    if (b.t > 0) return;
    if (!w.fire.size) { g.brigade = null; return; }
    g.log(`☎️ ${pick(CALLERS)} The fire brigade is on its way. The fire keeps going until they get here.`, 'warn');
    b.truck = vehicle(g, 'firetruck', FIRE_PARK_X);
    b.state = 'driving';
  } else if (b.state === 'driving') {
    driveVehicle(g, b.truck, gdt);
    if (b.truck.state !== 'parked') return;
    if (!w.fire.size) {
      g.log('🚒 The fire brigade arrives to a smoking ruin and an awkward silence. They take a photo and leave.', 'dim');
      b.truck.state = 'leave';
      b.state = 'gone';
      return;
    }
    b.crew = [
      responder(g, 'firefighter', 'Blaze', 'Firefighter Blaze', b.truck.x - 0.5, CURB_Z - 0.85),
      responder(g, 'firefighter', 'Hank', 'Firefighter Hank', b.truck.x + 0.5, CURB_Z - 0.85),
    ];
    g.log('🚒 The fire engine screeches up outside. Blaze and Hank run up the garden path, dragging a hose.', 'warn');
    b.state = 'fighting';
  } else if (b.state === 'fighting') {
    for (const p of b.crew) fightFire(g, b, p, gdt, min);
    if (w.fire.size) return;
    g.log(`🚒 The fire is out. Chief's report: "${pick(FIRE_REPORTS)}"`, 'dim');
    b.crew.forEach((p, i) => { p.aim = null; routeHome(g, p, b.truck, i ? 0.5 : -0.5); });
    b.state = 'leaving';
  } else if (b.state === 'leaving') {
    for (const p of b.crew) walk(g, p, gdt, 2.6);
    if (b.crew.some(p => p.route.length)) return;
    g.responders = g.responders.filter(p => !b.crew.includes(p));
    b.truck.state = 'leave';
    b.state = 'gone';
  } else if (b.state === 'gone') {
    driveVehicle(g, b.truck, gdt);
    if (!g.vehicles.includes(b.truck)) g.brigade = null;
  }
}

// ---------- police investigation ----------

// Everything the detective might find, where it is, and how bad it looks.
function evidence(g) {
  const w = g.world, out = [];
  const add = (id, cell, sus, still, clear, found) => out.push({ id, cell, sus, still, clear, found });
  for (const t of w.traps.values()) {
    const k = cellKey(t.x, t.z);
    add('trap:' + k, [t.x, t.z], t.type === 'wax' ? 8 : 15, () => w.traps.has(k), () => w.traps.delete(k),
      t.type === 'wax' ? 'runs a finger over a patch of floor polished to a lethal shine. "Nobody waxes a floor this much. Nobody."'
        : 'finds a bear trap hidden in the grass. It goes in a very large evidence bag.');
  }
  for (const o of w.objects.values()) {
    const at = o.use || o.cells[0];
    if (o.sabotaged) {
      add('sab:' + o.id, at, 12, () => o.sabotaged, () => { o.sabotaged = false; },
        o.type === 'stove' || o.type === 'grill' ? `notices the ${o.name}'s gas valve has been loosened. With a wrench. Recently.`
          : `finds the wiring behind the ${o.name} stripped bare. "Mice," says nobody.`);
    }
    if (o.poisoned > 0) {
      if (o.untraceable) add('tox:' + o.id, at, 0, () => o.poisoned > 0, () => {}, `swabs the ${o.name}. Clean. Dr. Asraa Z's chemistry is, as always, undetectable.`);
      else add('tox:' + o.id, at, 15, () => o.poisoned > 0, () => { o.poisoned = 0; }, `swabs the ${o.name}. The swab turns a colour swabs should never turn.`);
    }
    if (o.chili > 0) add('chili:' + o.id, at, 3, () => o.chili > 0, () => { o.chili = 0; }, "confiscates Grandma's chili as a biohazard.");
    if (o.fireworks) add('fw:' + o.id, at, 10, () => o.fireworks, () => { o.fireworks = false; }, `pulls a bundle of fireworks out of the ${o.name}. "Planning a party?"`);
    if (o.bomb) add('bomb:' + o.id, at, 18, () => o.bomb, () => { o.bomb = false; o.flagUp = false; }, 'opens the mailbox and finds a ticking parcel. The bomb squad is not amused.');
    if (o.wobbly && !o.toppled) add('shelf:' + o.id, at, 8, () => o.wobbly && !o.toppled, () => { o.wobbly = false; }, 'notices the bookshelf brackets are unscrewed. The screws are in a neat little pile.');
  }
  for (const d of w.doors) {
    if (!d.bricked || d.hackLocked) continue;
    const cell = d.axis === 'x' ? [d.at - 1, d.pos] : [d.pos, d.at - 1];
    add('door:' + d.id, cell, 10, () => d.bricked, () => { d.bricked = false; w.rebuildEdges(); }, `taps the fresh brickwork where the ${d.name} used to be. "Load-bearing, is it?"`);
  }
  const ladder = w.ladder;
  if (!ladder.present) add('ladder', ladder.use, 10, () => !ladder.present, () => { ladder.present = true; }, 'notices the pool has no ladder. He writes "WHY" in his notebook and underlines it three times.');
  if (w.piranhas) add('piranhas', ladder.use, 15, () => w.piranhas, () => { w.piranhas = false; w.piranhasKnown = false; }, 'dips a finger in the pool and gets it back slightly shorter. Animal control is called about the piranhas.');
  const graves = w.tombstones.length;
  if (graves >= 2) {
    const t = w.tombstones[graves - 1];
    add('graves', [t.x, t.z], 4 * graves, () => true, () => {}, `counts ${graves} fresh graves in the garden. "That's a lot of graves for a rental."`);
  }
  return out;
}

export function requestInvestigation(g, reason) {
  if (g.over || g.investigation || g.clock < g.policeCooldown) return;
  g.investigation = { state: 'pending', t: rand(40, 80), reason, found: 0, done: new Set() };
}

// Sends the detective home early (charmed, bored or tricked away).
export function endInvestigation(g, msg) {
  const inv = g.investigation;
  if (!inv || !inv.detective || inv.state === 'leaving') return false;
  if (msg) g.log(msg, 'tool');
  inv.state = 'leaving';
  routeHome(g, inv.detective, inv.car, 0);
  return true;
}

function nextStop(g, inv) {
  while (inv.plan.length) {
    const stop = inv.plan.shift();
    if (inv.done.has(stop.id) || !stop.still()) continue;
    if (routeTo(g, inv.detective, ...stop.cell) || (breakIn(g, inv.detective) && routeTo(g, inv.detective, ...stop.cell))) return stop;
  }
  return null;
}

function updateInvestigation(g, gdt, min) {
  const inv = g.investigation;
  if (!inv) return;
  if (inv.state === 'pending') {
    inv.t -= min;
    if (inv.t > 0) return;
    inv.car = vehicle(g, 'police', POLICE_PARK_X);
    g.log(`🚓 A police car turns into the street, lights flashing. Someone is here about ${inv.reason}.`, 'warn');
    inv.state = 'driving';
  } else if (inv.state === 'driving') {
    driveVehicle(g, inv.car, gdt);
    if (inv.car.state !== 'parked') return;
    inv.detective = responder(g, 'detective', 'Gumshoe', 'Inspector Gumshoe', inv.car.x - 0.6, CURB_Z - 0.85);
    // He's thorough, not tireless: the five most damning things, then a look around.
    inv.plan = evidence(g).sort((a, b) => b.sus - a.sus).slice(0, 5);
    const rooms = [[4, 3], [10, 8], [3, 8], [14, 3]].sort(() => Math.random() - 0.5).slice(0, inv.plan.length ? 1 : 2);
    for (const c of rooms) inv.plan.push({ id: 'look:' + c, cell: c, sus: 0, still: () => true, clear: () => {}, found: null });
    g.log('🕵️ Inspector Gumshoe steps out, snaps on a pair of gloves and strolls up the path. "Mind if I look around? That wasn\'t a question."', 'warn');
    inv.state = 'searching';
  } else if (inv.state === 'searching') {
    const p = inv.detective;
    if (p.pause > 0) { p.pause -= min; p.pose = 'idle'; p.moving = false; return; }
    if (p.route.length) { walk(g, p, gdt, 2.2); return; }
    if (inv.stop) {
      p.pose = 'search';
      p.facing = Math.atan2(inv.stop.cell[0] + 0.5 - p.x, inv.stop.cell[1] + 0.5 - p.z);
      inv.examine -= min;
      if (inv.examine > 0) return;
      const s = inv.stop;
      inv.stop = null;
      if (s.found === null) g.log(`🔍 Inspector Gumshoe pokes around the ${g.world.roomAt(...s.cell)?.name || 'garden'} and mutters "hmm" several times.`, 'dim');
      else if (inv.done.has(s.id)) { /* already found on the way */ }
      else if (s.still()) {
        inv.done.add(s.id);
        s.clear();
        if (s.sus > 0) { inv.found++; exposed(g, `🕵️ Inspector Gumshoe ${s.found}`, s.sus); }
        else g.log(`🕵️ Inspector Gumshoe ${s.found}`, 'tool');
      } else {
        g.log('🔍 Inspector Gumshoe finds nothing but a suspiciously clean spot. He sniffs it anyway.', 'dim');
      }
      return;
    }
    const stop = nextStop(g, inv);
    if (stop) { inv.stop = stop; inv.examine = 12; return; }
    const clean = inv.found === 0;
    if (clean && g.contract && !g.result) g.suspicion = Math.max(0, g.suspicion - 10);
    endInvestigation(g, clean
      ? `🕵️ Inspector Gumshoe finds nothing. "Clean. Suspiciously clean. But clean."${g.contract ? ' (-10 suspicion)' : ''}`
      : `🕵️ Inspector Gumshoe snaps his notebook shut. "I'll be back." He sounds like he means it.`);
  } else if (inv.state === 'leaving') {
    const p = inv.detective;
    walk(g, p, gdt, 2.6);
    if (p.route.length) return;
    g.responders = g.responders.filter(o => o !== p);
    inv.car.state = 'leave';
    inv.state = 'gone';
  } else if (inv.state === 'gone') {
    driveVehicle(g, inv.car, gdt);
    if (g.vehicles.includes(inv.car)) return;
    g.investigation = null;
    g.policeCooldown = g.clock + POLICE_COOLDOWN;
  }
}

export function resetEmergency(g) {
  g.responders = [];
  g.vehicles = [];
  g.brigade = null;
  g.investigation = null;
  g.policeCooldown = 0;
}

export function updateEmergency(g, gdt, min) {
  if (g.result) return;
  updateBrigade(g, gdt, min);
  updateInvestigation(g, gdt, min);
}

// Where a sim should stand to talk to a responder (they may be halfway down the path).
export function responderSpot(g, p) {
  if (!g.responders.includes(p)) return null;
  return g.world.nearestWalkable(clamp(Math.floor(p.x), 0, GRID_W - 1), clamp(Math.floor(p.z), 0, GRID_H - 1));
}

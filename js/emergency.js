// Emergency services. A fire burns until a neighbour finally calls the brigade; a suspicious death
// brings a detective who searches the lot for evidence. Responders aren't sims: they walk the house
// grid directly, can't be harmed, and see everything.
import { GRID_W, GRID_H } from './data.js';
import { cellKey } from './world.js';
import { outsiders, outsiderTrap, hurtOutsider, setOnFire } from './outsiders.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const CURB_Z = GRID_H + 2.2;       // emergency vehicles pull over here, clear of traffic
const STREET_START = -40, STREET_END = 66;
const FIRE_PARK_X = 6.5, POLICE_PARK_X = 15;
const REACH = 2.3;                        // hose range, in cells
const SPRAY_MIN = 1.2;                    // game minutes of hosing per burning cell
const POLICE_COOLDOWN = 600;              // quiet minutes after a search before another one
// If an inspector dies on the job, the station sends the next one on the list.
const INSPECTORS = ['Gumshoe', 'Gumshoe Jr.', 'Hawkins', 'Sniffington', 'Poirot-Adjacent', 'Clueless'];
let nextId = 1;

const CALLERS = [
  'The neighbours finally stop filming and call it in.',
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

export function responder(g, kind, first, title, x, z) {
  const p = { id: 'r' + nextId++, kind, first, title, x, z, facing: Math.PI, moving: false, pose: 'idle', route: [], pause: 0, health: 100 };
  g.responders.push(p);
  return p;
}

// The fire engine comes from the west and the police from the east, and each U-turns and leaves the
// way it came, so parked vehicles never have to drive through each other. Removal vans (neighbours.js)
// use the far kerb.
export function vehicle(g, kind, parkX, side = kind === 'police' ? 1 : -1, z = CURB_Z) {
  const v = { id: 'car' + nextId++, kind, side, x: side < 0 ? STREET_START : STREET_END, z, baseZ: z, yaw: side < 0 ? 0 : Math.PI, turn: 0, parkX, state: 'arrive' };
  g.vehicles.push(v);
  return v;
}

const SIRENS = { police: 'police', firetruck: 'siren', bike: 'engine' };

export function driveVehicle(g, v, gdt) {
  if (v.state === 'arrive') {
    const d = Math.abs(v.parkX - v.x);
    const step = clamp(d * 1.1, 2, 14) * gdt;
    if (d <= step) { v.x = v.parkX; v.state = 'parked'; }
    else v.x -= v.side * step;
    if (SIRENS[v.kind]) g.sfx(SIRENS[v.kind]);
  } else if (v.state === 'leave') {
    v.turn = Math.min(1, v.turn + gdt / 1.2);
    v.yaw = (v.side < 0 ? 0 : Math.PI) + Math.PI * v.turn;
    // Swing out towards the middle of the road for the U-turn.
    v.z = v.baseZ + Math.sin(Math.PI * v.turn) * 0.9 * (v.baseZ > GRID_H + 4 ? -1 : 1);
    if (v.turn >= 1) v.x += v.side * 9 * gdt;
    if (v.x < STREET_START - 2 || v.x > STREET_END + 2) g.vehicles = g.vehicles.filter(o => o !== v);
  }
}

const gateCell = w => w.nearestWalkable(10, GRID_H - 1);

// Plans a walk to the cell (or the nearest free cell next to it). False if there's no way in.
export function routeTo(g, p, cx, cz) {
  const w = g.world;
  const [tx, tz] = w.nearestWalkable(cx, cz);
  const outside = !w.inBounds(Math.floor(p.x), Math.floor(p.z));
  const [sx, sz] = outside ? gateCell(w) : [Math.floor(p.x), Math.floor(p.z)];
  const path = w.findPath(sx, sz, tx, tz);
  if (!path) return false;
  p.sidestepped = false;
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

export function walk(g, p, gdt, speed) {
  // Stuck in a trap, or on fire and running for the street (outsiders.js moves them then).
  if (p.trapped > 0 || p.onFire) { p.moving = false; return; }
  let budget = speed * gdt;
  while (budget > 0 && p.route.length) {
    const [x, z] = p.route[0];
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.001) p.facing = Math.atan2(dx, dz);
    if (d <= budget) {
      p.x = x; p.z = z; budget -= d;
      p.route.shift();
      if (!p.home) stepOnTrap(g, p);
      if (p.dead || p.trapped > 0) break;
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

// Traps hurt whoever steps in them. Firefighters and detectives also report what they found.
function stepOnTrap(g, p) {
  const t = g.world.trapAt(Math.floor(p.x), Math.floor(p.z));
  if (!t) return;
  g.world.removeTrap(t);
  const dead = outsiderTrap(g, p, t);
  if (p.kind === 'biker') {
    if (!dead) g.log(t.type === 'beartrap' ? `🪤 ${p.first} stomps straight into a bear trap and invents several new swear words.` : `🍌 ${p.first} goes down like a sack of spanners.`, 'evil');
    return;
  }
  const inv = g.investigation;
  if (inv) { inv.found++; inv.done.add('trap:' + cellKey(t.x, t.z)); }
  const sus = { peel: t.by ? 0 : 4, wax: 8, beartrap: 15 }[t.type];
  if (dead) { if (sus) g.addSuspicion(sus); return; }
  if (t.type === 'peel') {
    exposed(g, `🍌 ${p.title} slips on a banana peel, lands flat on his back and stares at the sky, questioning his career.`, sus);
  } else if (t.type === 'wax') {
    exposed(g, `🧽 ${p.title} skids across a suspiciously waxed floor and lies there, staring at the ceiling, writing a report in his head.`, sus);
  } else {
    exposed(g, `🪤 ${p.title} steps into a bear trap hidden in the lawn. He's stuck, bleeding and very, very angry.`, sus);
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

// Nobody shares a spot: a responder who stops on top of a roommate (or a colleague who got there
// first) shuffles over to a free cell, once per destination.
function sidestep(g, p) {
  const w = g.world, cx = Math.floor(p.x), cz = Math.floor(p.z);
  if (p.moving || p.sidestepped || !w.inBounds(cx, cz)) return false;
  const i = g.responders.indexOf(p);
  const crowded = g.responders.some((o, j) => j < i && !o.moving && Math.hypot(o.x - p.x, o.z - p.z) < 0.6)
    || g.sims.some(s => s.alive && !s.moving && !s.status.swimming && Math.hypot(s.x - p.x, s.z - p.z) < 0.5);
  if (!crowded) return false;
  p.sidestepped = true;
  const taken = (x, z) => g.responders.some(o => o !== p && Math.floor(o.x) === x && Math.floor(o.z) === z)
    || g.sims.some(s => s.alive && s.cx === x && s.cz === z);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const nx = cx + dx, nz = cz + dz;
    if (w.canStep(cx, cz, nx, nz) && !taken(nx, nz)) { p.route = [[nx + 0.5, nz + 0.5]]; return true; }
  }
  return false;
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
  for (const o of outsiders(g)) {
    if (o.onFire && !o.dead && Math.hypot(o.x - p.x, o.z - p.z) < REACH + 0.5) {
      o.onFire = false;
      o.fleeRoute = null;
      if (g.view) g.view.burst(o.x, o.z, 'splash');
      g.log(`🧯 ${p.title} hoses down ${o.title || o.first}. Crispy, but alive.`, 'dim');
    }
  }
  if (p.trapped > 0) return;
  if (p.pause > 0) { p.pause -= min; p.pose = 'idle'; p.aim = null; return; }
  if (p.shuffle) { walk(g, p, gdt, 2.6); if (!p.route.length) p.shuffle = false; return; }
  const flame = nearestFlame(w, p, REACH);
  if (flame) {
    p.route = [];
    p.moving = false;
    if (sidestep(g, p)) { p.shuffle = true; return; }
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
    g.annoyNeighbours(5); // property values!
    b.state = 'fighting';
  } else if (b.state === 'fighting') {
    b.crew = b.crew.filter(p => !p.dead);
    for (const p of b.crew) fightFire(g, b, p, gdt, min);
    if (w.fire.size && b.crew.length) return;
    if (!b.crew.length) {
      g.log("🚒 The fire engine's radio crackles, unanswered. The driver takes the engine back to the station for reinforcements.", 'warn');
      b.truck.state = 'leave';
      b.state = 'gone';
      return;
    }
    g.log(`🚒 The fire is out. Chief's report: "${pick(FIRE_REPORTS)}"`, 'dim');
    b.crew.forEach((p, i) => { p.aim = null; routeHome(g, p, b.truck, i ? 0.5 : -0.5); });
    b.state = 'leaving';
  } else if (b.state === 'leaving') {
    b.crew = b.crew.filter(p => !p.dead);
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
  const add = (id, cell, sus, still, clear, found, bite) => out.push({ id, cell, sus, still, clear, found, bite });
  // Poking at your handiwork is dangerous: sometimes it goes off in his face.
  const at0 = o => [o.cells[0][0] + 0.5, o.cells[0][1] + 0.5];
  const gas = o => ({ chance: 0.35, run: p => {
    w.ignite(o.cells[0][0], o.cells[0][1]);
    setOnFire(g, p);
    g.log(`🔥 ${p.title} leans in to sniff the loosened gas valve with his pipe still lit. WHOOMPH.`, 'evil');
  } });
  const wires = o => ({ chance: 0.35, run: p => {
    g.sfx('zap');
    if (g.view) g.view.burst(p.x, p.z, 'sparks');
    g.log(`⚡ ${p.title} prods the frayed wire behind the ${o.name} with his pen. His moustache stands on end.`, 'evil');
    hurtOutsider(g, p, rand(45, 95), 'Electrocution');
  } });
  const taste = { chance: 0.25, run: p => {
    p.poisoned = 90;
    g.log(`👅 ${p.title} dabs a finger in the leftovers and tastes it. Professional habit. Bad habit.`, 'evil');
  } };
  const boom = (o, cause) => ({ chance: cause === 'Letter Bomb' ? 0.5 : 0.3, run: p => {
    const [x, z] = at0(o);
    if (cause === 'Letter Bomb') { o.bomb = false; o.flagUp = false; } else o.fireworks = false;
    g.explodeAt(x, z, { cause, suspicion: 0, radius: 2.2, lawn: cause === 'Letter Bomb',
      msg: cause === 'Letter Bomb' ? `📬💥 ${p.title} opens the ticking parcel "just to check it is a bomb". It is.` : `🎆💥 ${p.title} pokes around in the ${o.name} using a lighter for light.` });
  } });
  for (const t of w.traps.values()) {
    const k = cellKey(t.x, t.z);
    if (t.by) continue; // rubbish a roommate dropped isn't your handiwork
    const found = {
      wax: [8, 'runs a finger over a patch of floor polished to a lethal shine. "Nobody waxes a floor this much. Nobody."'],
      peel: [4, 'bags a banana peel placed with suspicious, almost loving, precision.'],
      beartrap: [15, 'finds a bear trap hidden in the grass. It goes in a very large evidence bag.'],
    }[t.type];
    add('trap:' + k, [t.x, t.z], found[0], () => w.traps.has(k), () => w.traps.delete(k), found[1]);
  }
  for (const o of w.objects.values()) {
    const at = o.use || o.cells[0];
    if (o.sabotaged) {
      const valve = `notices the ${o.name}'s gas valve has been loosened. With a wrench. Recently.`;
      const found = {
        stove: valve, grill: valve,
        candles: 'notices the scented candles are lined up under the towels. "Hygge, or homicide?"',
        vanity: 'reads the hairspray can: "EXTRA HOLD. EXTRA FLAMMABLE." The second line is handwritten.',
        shed: "finds the weed torch's gas hose neatly slit with a knife.",
      }[o.type] || `finds the wiring behind the ${o.name} stripped bare. "Mice," says nobody.`;
      const bite = o.type === 'stove' || o.type === 'grill' ? gas(o) : o.type === 'tv' || o.type === 'tub' ? wires(o) : null;
      add('sab:' + o.id, at, 12, () => o.sabotaged, () => { o.sabotaged = false; }, found, bite);
    }
    if (o.flour) add('flour:' + o.id, at, 8, () => o.flour, () => { o.flour = false; }, 'finds flour on every surface of the kitchen, including the ceiling. "Baking, was it?"');
    if (o.poisoned > 0) {
      if (o.untraceable) add('tox:' + o.id, at, 0, () => o.poisoned > 0, () => {}, `swabs the ${o.name}. Clean. Dr. Asraa Z's chemistry is, as always, undetectable.`, taste);
      else add('tox:' + o.id, at, 15, () => o.poisoned > 0, () => { o.poisoned = 0; }, `swabs the ${o.name}. The swab turns a colour swabs should never turn.`, taste);
    }
    if (o.chili > 0) add('chili:' + o.id, at, 3, () => o.chili > 0, () => { o.chili = 0; }, "confiscates Grandma's chili as a biohazard.");
    if (o.fireworks) add('fw:' + o.id, at, 10, () => o.fireworks, () => { o.fireworks = false; }, `pulls a bundle of fireworks out of the ${o.name}. "Planning a party?"`, boom(o, 'Explosion'));
    if (o.bomb) add('bomb:' + o.id, at, 18, () => o.bomb, () => { o.bomb = false; o.flagUp = false; }, 'opens the mailbox and finds a ticking parcel. The bomb squad is not amused.', boom(o, 'Letter Bomb'));
    if (o.wobbly && !o.toppled) add('shelf:' + o.id, at, 8, () => o.wobbly && !o.toppled, () => { o.wobbly = false; }, 'notices the bookshelf brackets are unscrewed. The screws are in a neat little pile.',
      { chance: 0.5, run: p => g.toppleShelf(`📚 ${p.title} gives the wobbly bookshelf a firm, investigative shove.`) });
  }
  for (const d of w.doors) {
    if (!d.bricked || d.hackLocked) continue;
    const cell = d.axis === 'x' ? [d.at - 1, d.pos] : [d.pos, d.at - 1];
    add('door:' + d.id, cell, 10, () => d.bricked, () => { d.bricked = false; w.rebuildEdges(); }, `taps the fresh brickwork where the ${d.name} used to be. "Load-bearing, is it?"`);
  }
  const wreck = w.wreck;
  if (wreck && !wreck.checked) {
    add('wreck', [Math.floor(wreck.x), Math.floor(wreck.z)], 10, () => !wreck.checked, () => { wreck.checked = true; },
      'crawls under the wreck in the front garden. The brake lines were cut. Neatly. With scissors.');
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
    const name = INSPECTORS[(g.inspectorsLost || 0) % INSPECTORS.length];
    inv.detective = responder(g, 'detective', name, `Inspector ${name}`, inv.car.x - 0.6, CURB_Z - 0.85);
    // He's thorough, not tireless: the five most damning things, then a look around.
    inv.plan = evidence(g).sort((a, b) => b.sus - a.sus).slice(0, 5);
    const rooms = [[4, 3], [10, 8], [3, 8], [14, 3]].sort(() => Math.random() - 0.5).slice(0, inv.plan.length ? 1 : 2);
    for (const c of rooms) inv.plan.push({ id: 'look:' + c, cell: c, sus: 0, still: () => true, clear: () => {}, found: null });
    g.annoyNeighbours(5);
    g.log(`🕵️ ${inv.detective.title} steps out, snaps on a pair of gloves and strolls up the path. "Mind if I look around? That wasn't a question."`, 'warn');
    inv.state = 'searching';
  } else if (inv.state === 'searching') {
    const p = inv.detective;
    if (p.trapped > 0 || p.onFire) return;
    if (p.pause > 0) { p.pause -= min; p.pose = 'idle'; p.moving = false; return; }
    if (p.route.length) { walk(g, p, gdt, 2.2); return; }
    if (sidestep(g, p)) return;
    if (inv.stop) {
      p.pose = 'search';
      p.facing = Math.atan2(inv.stop.cell[0] + 0.5 - p.x, inv.stop.cell[1] + 0.5 - p.z);
      inv.examine -= min;
      if (inv.examine > 0) return;
      const s = inv.stop;
      inv.stop = null;
      if (s.found === null) g.log(`🔍 ${p.title} pokes around the ${g.world.roomAt(...s.cell)?.name || 'garden'} and mutters "hmm" several times.`, 'dim');
      else if (inv.done.has(s.id)) { /* already found on the way */ }
      else if (s.still()) {
        inv.done.add(s.id);
        if (s.bite && Math.random() < s.bite.chance) s.bite.run(p);
        s.clear();
        if (s.sus > 0) inv.found++;
        if (p.dead) { if (s.sus > 0) g.addSuspicion(s.sus); }
        else if (s.sus > 0) exposed(g, `🕵️ ${p.title} ${s.found}`, s.sus);
        else g.log(`🕵️ ${p.title} ${s.found}`, 'tool');
      } else {
        g.log(`🔍 ${p.title} finds nothing but a suspiciously clean spot. He sniffs it anyway.`, 'dim');
      }
      return;
    }
    const stop = nextStop(g, inv);
    if (stop) { inv.stop = stop; inv.examine = 12; return; }
    const clean = inv.found === 0;
    if (clean && g.contract && !g.result) g.suspicion = Math.max(0, g.suspicion - 10);
    endInvestigation(g, clean
      ? `🕵️ ${p.title} finds nothing. "Clean. Suspiciously clean. But clean."${g.contract ? ' (-10 suspicion)' : ''}`
      : `🕵️ ${p.title} snaps his notebook shut. "I'll be back." He sounds like he means it.`);
  } else if (inv.state === 'leaving') {
    const p = inv.detective;
    if (p.trapped > 0 || p.onFire) return;
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
    // A dead inspector gets a replacement, straight away.
    if (g.pendingInquiry) {
      const reason = g.pendingInquiry;
      g.pendingInquiry = null;
      g.policeCooldown = 0;
      requestInvestigation(g, reason);
    }
  }
}

// A firefighter, inspector or biker has died: take them off the job.
export function responderDown(g, p) {
  g.responders = g.responders.filter(o => o !== p);
  const inv = g.investigation;
  if (inv && inv.detective === p) {
    inv.state = 'gone';
    if (inv.car) inv.car.state = 'leave';
    g.inspectorsLost = (g.inspectorsLost || 0) + 1;
    g.pendingInquiry = `the death of ${p.title}`;
    g.log(`🚓 ${p.title}'s partner drives off very fast, talking very loudly into the radio.`, 'warn');
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

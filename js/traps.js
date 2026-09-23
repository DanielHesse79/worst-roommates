// Hidden traps. Floor traps trigger when a sim steps on the tile; object traps are armed
// flags on furniture (see godPowers in interactions.js) that trigger when the object is used.

const rand = (a, b) => a + Math.random() * (b - a);

// Everything shown in the trap palette. `target` says what the player clicks to place it.
export const TRAPS = [
  { id: 'wax', name: 'Waxed floor', icon: '🧽', target: 'indoor', desc: 'An indoor tile polished to a lethal shine. Anyone walking over it may slip.' },
  { id: 'beartrap', name: 'Bear trap', icon: '🪤', target: 'outdoor', desc: 'Hidden in the grass. Snaps shut and pins the victim in place. Very obviously not an accident.' },
  { id: 'bookshelf', name: 'Wobbly bookshelf', icon: '📚', target: 'object', desc: 'Unscrew the wall brackets. The next sim to walk past gets buried in books.' },
  { id: 'fireworks', name: 'Fireworks stash', icon: '🎆', target: 'object', desc: 'Hide fireworks in the fireplace or grill. Goes off the moment someone lights it.' },
  { id: 'gas', name: 'Loose gas valve', icon: '🔧', target: 'object', desc: 'On the stove or grill. The next cook is far more likely to start a fire.' },
  { id: 'wiring', name: 'Frayed wiring', icon: '⚡', target: 'object', desc: 'On the TV or bathtub. The next user may get a lethal shock.' },
  { id: 'spoil', name: 'Spoiled leftovers', icon: '🦠', target: 'object', desc: 'Poison the food in the fridge. Two servings.' },
  { id: 'chili', name: "Grandma's chili", icon: '🫘', target: 'object', desc: 'Swap the leftovers for three-bean chili. Whoever eats it becomes a walking gas hazard: silent, but deadly.' },
  { id: 'letterbomb', name: 'Letter bomb', icon: '📬', target: 'object', desc: 'Post a parcel. The flag goes up, someone gets curious, and the mailbox goes off. Blatantly murder.' },
  { id: 'piranhas', name: 'Piranhas', icon: '🐟', target: 'pool', desc: 'Stock the pool. Swimmers get eaten — faster if the ladder has gone missing.' },
  { id: 'ghost', name: 'Restless spirit', icon: '👻', target: 'tomb', desc: "Wake a grave's ghost. It haunts the lot at night and can scare the weak to death." },
  { id: 'candles', name: 'Candles by the towels', icon: '🕯️', target: 'object', desc: 'Light the bathroom candles and nudge them under the towels. Sooner or later the bathroom goes up.' },
  { id: 'hairspray', name: 'Extra-hold hairspray', icon: '💇', target: 'object', desc: 'Swap the hairspray at the vanity. Whoever does their hair next becomes a walking torch near any flame: candles, stove, fireplace, grill.' },
  { id: 'flour', name: 'Flour everywhere', icon: '🍞', target: 'object', desc: 'Dust the kitchen with fine flour. The next person to cook or bake at the stove sets off a dust explosion.' },
  { id: 'torch', name: 'Leaky weed torch', icon: '🌿', target: 'object', desc: "Slit the gas hose on the weed torch in the garden shed. The next gardener goes up along with the weeds." },
  { id: 'brakes', name: 'Cut brake lines', icon: '🚗', target: 'car', desc: 'Click a passing car. It jumps the kerb, ploughs into the front garden and explodes. Time it well (pausing helps).' },
];
export const TRAP_COST = { wax: 15, beartrap: 25 };

export function canPlaceFloorTrap(g, id, x, z) {
  const w = g.world;
  if (w.isBlocked(x, z) || w.trapAt(x, z)) return false;
  return id === 'wax' ? w.isIndoor(x, z) : !w.isIndoor(x, z);
}

// A Hand of Fate power (for game.godAction) that plants a floor trap.
export function floorTrapPower(g, id, x, z) {
  const t = TRAPS.find(tt => tt.id === id);
  return {
    key: id, label: t.name, icon: t.icon, cost: TRAP_COST[id], cells: [[x, z]],
    run: () => {
      g.world.addTrap(id, x, z, id === 'wax' ? 3 : 1);
      g.log(id === 'wax' ? '🧽 A patch of floor is waxed to a mirror shine.' : '🪤 Something metallic is hidden in the grass.', 'tool');
    },
  };
}

function hurt(g, s, dmg, cause, color) {
  s.health -= dmg;
  g.popup(s, '-' + Math.round(dmg), color);
  if (s.health <= 0) { g.kill(s, cause); return true; }
  return false;
}

// Sharp-eyed sims (paranoid, or anyone once suspicion is high) sometimes spot a trap first.
function spotted(g, s, chance) {
  if (s.confused) return false;
  return Math.random() < (s.has('paranoid') ? chance : 0) + (g.wary ? chance * 0.6 : 0);
}

export function onEnterCell(g, s) {
  const w = g.world;
  const t = w.trapAt(s.cx, s.cz);
  if (t) {
    if (t.type === 'wax') {
      if (spotted(g, s, 0.2)) {
        w.removeTrap(t);
        g.log(`👀 ${s.first} notices the floor is suspiciously shiny and mops it dull.`, 'warn');
        g.addSuspicion(6);
      } else if (Math.random() < Math.min(0.9, 0.5 + (s.has('clumsy') ? 0.3 : 0) - (s.has('genius') ? 0.15 : 0))) {
        g.view.burst(s.x, s.z, 'dust');
        g.sfx('slip');
        g.log(`🧽 ${s.name} hits the waxed floor and goes horizontal!`, 'evil');
        if (!hurt(g, s, rand(30, 55), 'Slip', '#9ad8ff')) { s.endAction(); s.status.passedOut = 30; }
        if (--t.uses <= 0) w.removeTrap(t);
      }
    } else if (t.type === 'beartrap') {
      if (spotted(g, s, 0.3)) {
        w.removeTrap(t);
        g.log(`👀 ${s.first} spots a BEAR TRAP in the lawn. Who would do such a thing?!`, 'warn');
        g.addSuspicion(12);
      } else {
        w.removeTrap(t);
        g.view.burst(s.x, s.z, 'sparks');
        g.sfx('snap');
        g.log(`🪤 SNAP! ${s.name} steps right into a bear trap.`, 'evil');
        g.addSuspicion(10, '🕵️ A bear trap on a suburban lawn raises eyebrows.');
        if (!hurt(g, s, rand(35, 50), 'Bear Trap', '#ff5a5a')) { s.endAction(); s.status.trapped = 120; }
      }
    }
  }

  const shelf = w.objects.get('bookshelf');
  if (shelf.wobbly && !shelf.toppled) {
    const [bx, bz] = shelf.cells[0];
    if (Math.max(Math.abs(bx - s.cx), Math.abs(bz - s.cz)) <= 1) {
      shelf.toppled = true;
      shelf.wobbly = false;
      g.view.burst(bx + 0.5, bz + 0.5, 'dust');
      g.view.shake = 0.3;
      g.sfx('crash');
      g.log(`📚 The bookshelf groans... and topples onto ${s.name}!`, 'evil');
      for (const o of g.sims) {
        if (!o.alive || o.status.swimming) continue;
        if (Math.max(Math.abs(bx - o.cx), Math.abs(bz - o.cz)) > 1) continue;
        if (!hurt(g, o, rand(55, 95), 'Crushed', '#d9b38c')) { o.endAction(); o.status.passedOut = 45; }
      }
    }
  }
}

// Called when someone lights the fireplace or fires up the grill.
export function triggerFireworks(g, o) {
  if (!o.fireworks) return false;
  o.fireworks = false;
  const [cx, cz] = o.cells[0];
  explode(g, cx + 0.5, cz + 0.5);
  return true;
}

export function explode(g, x, z, { cause = 'Explosion', suspicion = 12, radius = 2.4, lawn = false, msg = '💥 KABOOM! Fireworks go off in every direction at once.' } = {}) {
  g.view.burst(x, z, 'explosion');
  g.view.shake = 0.9;
  g.sfx('explosion');
  g.log(msg, 'evil');
  for (const s of g.sims) {
    if (!s.alive) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d > radius) continue;
    if (!hurt(g, s, 25 + 110 * (1 - d / radius), cause, '#ffb347')) {
      s.endAction();
      if (!s.status.swimming) s.status.onFire = 20;
    }
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) if (Math.random() < 0.5) g.world.ignite(Math.floor(x) + dx, Math.floor(z) + dz, lawn);
  }
  g.addSuspicion(suspicion);
}

const CAR_NAMES = ['hatchback', 'minivan', 'delivery van', 'second-hand sports car', 'driving-school car', 'ice-cream van'];

// A car with no brakes ends its journey in the front garden (see Street.crash for the swerve).
export function carCrash(g, x, z) {
  g.world.wreck = { x, z };
  g.sfx('crash');
  explode(g, x, z, { cause: 'Car Crash', suspicion: 3, radius: 2.6, lawn: true,
    msg: `🚗💥 A ${CAR_NAMES[Math.floor(Math.random() * CAR_NAMES.length)]} loses its brakes, jumps the kerb and ploughs into the front garden. Then it explodes, because of course it does.` });
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, -1]]) g.world.ignite(Math.floor(x) + dx, Math.floor(z) + dz, true);
}

// Flour hanging in the air meets the gas flame.
export function dustExplosion(g, s, o) {
  o.flour = false;
  const [cx, cz] = o.cells[0];
  explode(g, cx + 0.5, cz + 1, { suspicion: 5, radius: 2.8,
    msg: `🍞💥 A cloud of flour drifts over the gas flame. ${s.name} learns what a dust explosion is, very briefly.` });
}

export function openMail(g, s, o) {
  if (!o.bomb) {
    o.flagUp = false;
    s.addNeed('fun', 8);
    g.log(`📬 ${s.first} checks the mail: three bills and a coupon for a funeral home.`, 'dim');
    return;
  }
  if (spotted(g, s, 0.7)) {
    g.log(`👀 ${s.first} hears a faint ticking, backs away slowly and leaves the parcel where it is.`, 'warn');
    g.addSuspicion(8);
    return;
  }
  o.bomb = false;
  o.flagUp = false;
  const [cx, cz] = o.cells[0];
  explode(g, cx + 0.5, cz + 0.5, { cause: 'Letter Bomb', suspicion: 25, radius: 1.9, msg: `📬💥 ${s.name} opens a suspiciously ticking parcel.` });
}

// A gassy sim lets one go: everyone close by (but not the culprit) suffers. Small rooms make it worse.
export function fartCloud(g, s, strength = 1) {
  g.view.burst(s.x, s.z, 'gas');
  g.sfx('fart');
  const room = g.world.roomAt(s.cx, s.cz);
  const boost = room && room.name === 'Bathroom' ? 1.7 : 1;
  const victims = [];
  for (const o of g.sims) {
    if (o === s || !o.alive || o.status.swimming) continue;
    if (Math.hypot(o.x - s.x, o.z - s.z) > 2) continue;
    victims.push(o.first);
    o.addNeed('fun', -12);
    hurt(g, o, rand(8, 16) * boost * strength, 'Fart', '#a8e05a');
  }
  if (victims.length) g.log(`💨 ${s.first} lets one go. ${victims.join(' and ')} ${victims.length > 1 ? 'reel' : 'reels'} in horror.`, 'evil');
}

// Piranha bites for anyone in the pool. Returns true if the sim died.
export function piranhaBite(g, s, min) {
  const w = g.world;
  if (!w.piranhas) return false;
  if (!w.piranhasKnown) {
    w.piranhasKnown = true;
    g.sfx('scream');
    g.log(`🐟 ${s.name} screams: there are PIRANHAS in the pool!`, 'evil');
    g.addSuspicion(20, '🕵️ Nobody believes the piranhas got there by themselves.');
    if (s.action && s.action.def.id === 'swim') s.endAction();
  }
  s.health -= 2.2 * min;
  if (Math.random() < 0.2 * min) g.view.burst(s.x, s.z, 'splash');
  if (s.health <= 0) { g.kill(s, 'Piranhas'); return true; }
  return false;
}

// ---------- ghosts ----------

export function updateGhosts(g, dt, min) {
  const night = g.isNight;
  for (const t of g.world.tombstones) {
    if (!t.ghost) continue;
    let gh = g.ghosts.find(x => x.tombId === t.id);
    if (night && !gh) {
      gh = { tombId: t.id, name: t.name, x: t.x + 0.5, z: t.z + 0.5, goal: null };
      g.ghosts.push(gh);
      g.log(`👻 The ghost of ${t.name} rises from the grave.`, 'evil');
    }
  }
  if (!night && g.ghosts.length) g.ghosts = [];

  for (const gh of g.ghosts) {
    if (!gh.goal || Math.hypot(gh.goal[0] - gh.x, gh.goal[1] - gh.z) < 0.2) {
      // Haunt near a living sim most of the time; ghosts float through walls.
      const living = g.sims.filter(s => s.alive && !s.status.swimming);
      const target = living.length && Math.random() < 0.6 ? living[Math.floor(Math.random() * living.length)] : null;
      gh.goal = target ? [target.x + rand(-1.5, 1.5), target.z + rand(-1.5, 1.5)] : [rand(1.5, 15.5), rand(1.5, 10.5)];
    }
    const dx = gh.goal[0] - gh.x, dz = gh.goal[1] - gh.z, d = Math.hypot(dx, dz);
    const step = Math.min(d, 0.9 * dt);
    if (d > 0) { gh.x += dx / d * step; gh.z += dz / d * step; }

    for (const s of g.sims) {
      if (!s.alive || s.status.swimming || (s.frightCd || 0) > 0) continue;
      if (Math.hypot(s.x - gh.x, s.z - gh.z) > 1.3) continue;
      s.frightCd = 90;
      g.log(`👻 ${s.name} comes face to face with the ghost of ${gh.name}!`, 'evil');
      g.sfx('ghost');
      s.addNeed('fun', -20);
      s.status.panic = 20;
      s.endAction();
      g.view.burst(s.x, s.z, 'fright');
      hurt(g, s, rand(15, 28), 'Fright', '#c9b8ff');
    }
  }
  for (const s of g.sims) if (s.frightCd > 0) s.frightCd -= min;
}

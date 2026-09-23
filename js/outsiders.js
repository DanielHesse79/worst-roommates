// Everyone who isn't a roommate: visitors, neighbours, responders and bikers. They aren't sims, but they
// can be hurt and killed by the same traps, fires and explosions. What a death means for each of them is
// handled by the game (Game.outsiderDied).
import { GRID_H } from './data.js';

const rand = (a, b) => a + Math.random() * (b - a);

export function outsiders(g) {
  return [...g.responders, ...(g.visit ? g.visit.people : [])];
}

export function outsidersNear(g, x, z, r) {
  return outsiders(g).filter(p => Math.hypot(p.x - x, p.z - z) <= r);
}

const nameOf = p => p.title || p.first;

// Deals damage; returns true if it killed them.
export function hurtOutsider(g, p, dmg, cause) {
  if (p.dead) return true;
  p.health = (p.health ?? 100) - dmg;
  if (dmg >= 5 && g.view) g.view.addPopup(p, '-' + Math.round(dmg), '#ff9a5a');
  if (p.health > 0) return false;
  // The Grim Reaper can't stand this gang. One of them he simply refuses to collect.
  if (p.kind === 'biker' && g.gang && !g.gang.spurned) {
    g.gang.spurned = true;
    p.immortal = true;
    p.health = 100;
    p.onFire = false;
    if (g.view) g.view.spawnReaper(p);
    g.log(`💀 The Grim Reaper arrives for ${nameOf(p)}, takes one look, and leaves again. "Not him. Not again. I had him in 1987 and he kept revving." ${nameOf(p)} is now, officially, unwanted by Death.`, 'tool');
    return false;
  }
  if (p.immortal) { p.health = 100; p.onFire = false; return false; }
  p.dead = true;
  g.outsiderDied(p, cause);
  return true;
}

export function setOnFire(g, p) {
  if (p.onFire || p.kind === 'firefighter' || p.dead) return;
  p.onFire = true;
  p.fleeRoute = null;
  g.log(`🔥 ${nameOf(p)} catches fire and runs for the street!`, 'evil');
}

// A floor trap going off under an outsider. Returns true if it killed them; callers write the story.
export function outsiderTrap(g, p, t) {
  g.sfx(t.type === 'beartrap' ? 'snap' : 'slip');
  p.trapped = t.type === 'beartrap' ? 25 : 4;
  const dmg = t.type === 'beartrap' ? rand(35, 55) : t.type === 'wax' ? rand(25, 45) : rand(20, 40);
  return hurtOutsider(g, p, dmg, t.type === 'beartrap' ? 'Bear Trap' : 'Slip');
}

// Walks a burning outsider towards the street; they burn until they die or a firefighter hoses them down.
function flee(g, p, gdt) {
  if (!p.fleeRoute) {
    const w = g.world, cx = Math.floor(p.x), cz = Math.floor(p.z);
    const path = w.inBounds(cx, cz) ? w.findPath(cx, cz, 10, GRID_H - 1) : null;
    p.fleeRoute = [...(path || []).map(([x, z]) => [x + 0.5, z + 0.5]), [10.5, GRID_H + 1.2], [10.5 + rand(-6, 6), GRID_H + 1.2]];
  }
  let budget = 3.2 * gdt;
  while (budget > 0 && p.fleeRoute.length) {
    const [x, z] = p.fleeRoute[0];
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.001) p.facing = Math.atan2(dx, dz);
    if (d <= budget) { p.x = x; p.z = z; budget -= d; p.fleeRoute.shift(); }
    else { p.x += dx / d * budget; p.z += dz / d * budget; budget = 0; }
  }
  p.moving = p.fleeRoute.length > 0;
  p.pose = 'walk';
}

export function updateOutsiders(g, gdt, min) {
  const w = g.world;
  for (const p of outsiders(g)) {
    if (p.dead) continue;
    if (p.trapped > 0) p.trapped -= min;
    if (w.isBurning(Math.floor(p.x), Math.floor(p.z))) {
      // Turnout gear: firefighters barely feel it.
      if (hurtOutsider(g, p, (p.kind === 'firefighter' ? 0.3 : 2.5) * min, 'Fire')) continue;
      setOnFire(g, p);
    }
    if (p.onFire) {
      if (hurtOutsider(g, p, 5 * min, 'Fire')) continue;
      // Visitors already walk themselves home; responders and bikers drop everything and run.
      if (p.kind !== 'visitor') flee(g, p, gdt);
    }
    if (p.poisoned > 0) {
      p.poisoned -= min;
      if (hurtOutsider(g, p, 1.1 * min, 'Poison')) continue;
    }
  }
}

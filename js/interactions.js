// Every interaction a sim can perform, plus "hand of fate" god actions.
// Def shape: { id, label, icon, evil?, duration (min | fn), spot(sim,target,game) -> [x,z],
//   approachSim?, available?, start?, tick?(s,t,g,a,min), finish?, facePos? }
import { triggerFireworks, openMail, fartCloud, dustExplosion, TRAPS, TOOLS, toolPrice, toolLock, canPlaceFloorTrap } from './traps.js';
import { spend, rehire } from './career.js';
import { responderSpot, evidenceIds } from './emergency.js';
import { witnessCrime, witnessCleanup } from './crime.js';
import { visitorOutcome } from './visitors.js';
import { GRID_W } from './data.js';
import { summonGang } from './gang.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const useSpot = (s, o) => o.use;
const objCenter = o => {
  const xs = o.cells.map(c => c[0]), zs = o.cells.map(c => c[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2 + 0.5, (Math.min(...zs) + Math.max(...zs)) / 2 + 0.5];
};

function once(a, key, t, fn) {
  if (!a.data[key] && a.t >= t) { a.data[key] = true; fn(); }
}
function accident(s, base) {
  return clamp(base + (s.has('clumsy') ? 0.2 : 0) - (s.has('genius') ? 0.1 : 0), 0.04, 0.85);
}
// Accident odds for using an object: sabotage adds a big (one-shot) bonus, wary sims are careful.
function risk(s, base, o, g) {
  let p = accident(s, base);
  if (s.confused) p += 0.2;
  if (o && o.sabotaged) { p += 0.45; o.sabotaged = false; }
  if (g.wary) p *= 0.7;
  return Math.min(0.95, p);
}
// Chance a sim notices something off about food or drink.
function notices(s, g, paranoidChance) {
  if (s.confused) return false;
  const nose = s === g.player ? (s.skills.chemistry || 0) * 0.08 : 0;
  return Math.random() < (s.has('paranoid') ? paranoidChance : 0) + (g.wary ? 0.35 : 0) + nose;
}
// What the target is doing right now (only once they've actually started doing it).
const doing = (t, ...ids) => !!(t.action && t.action.stage === 'do' && ids.includes(t.action.def.id));
const asleep = t => doing(t, 'sleep', 'nap');

// Drops rubbish on a few free floor cells near a sim, in the same room.
function scatterMess(g, s, n) {
  const w = g.world, room = w.roomAt(s.cx, s.cz);
  let made = 0;
  for (let tries = 0; tries < 30 && made < n; tries++) {
    const x = s.cx + Math.floor(rand(-2, 3)), z = s.cz + Math.floor(rand(-2, 3));
    if (w.roomAt(x, z) === room && w.addMess(x, z, s.id)) made++;
  }
  return made;
}

// Loud music can wake a sleeper, who then blames whoever turned it on.
function musicWakes(s, g, m) {
  const noise = g.noiseAt(s);
  if (!noise) return 1;
  s.sanity = Math.max(0, s.sanity - 0.05 * noise * m);
  if (Math.random() < 0.02 * noise * m) {
    const stereo = g.world.objects.get('stereo');
    const dj = g.sims.find(x => x.id === stereo.dj);
    if (dj && dj !== s) changeRel(s, dj, -12);
    g.log(`🔊 ${s.first} is jolted awake by the bass. Again. They are not okay.`, 'dim');
    s.endAction();
  }
  return 1 - 0.75 * noise;
}

// Sets a few lawn cells around a sim alight (weed torches, mostly).
function lawnFire(g, s, n) {
  const cells = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].sort(() => Math.random() - 0.5);
  for (const [dx, dz] of cells) if (n > 0 && g.world.ignite(s.cx + dx, s.cz + dz, true)) n--;
}
// Practice tops out at 10. Anyone born above that (Asraa's charisma goes to eleven) keeps it.
function learn(s, skill) {
  const gain = s.has('genius') ? 2 : s.has('lazy') ? 0.5 : 1, now = s.skills[skill] || 0;
  s.skills[skill] = Math.max(now, Math.min(10, now + gain));
}
// A kitchen fire. With the gas valve loosened, the cook goes up with it; otherwise they jump back in time.
function kitchenFire(s, o, g, gas, what) {
  g.world.ignite(o.cells[0][0], o.cells[0][1]);
  g.sfx('fire');
  if (gas) {
    s.status.onFire = 60;
    g.view.burst(s.x, s.z, 'explosion');
    g.log(`🔥 The loosened gas valve turns ${s.name}'s ${what} into a fireball, with ${s.first} in it!`, 'evil');
  } else {
    s.status.panic = 20;
    s.status.fleeing = true;
    s.panicGoal = null;
    g.log(`🔥 ${s.name}'s ${what} bursts into flames! ${s.first} jumps back just in time.`, 'evil');
    g.becomeCareful(s, 'fire', 'nearly went up in flames');
  }
  s.endAction();
}

// Your nose (and handiness) can catch a loosened valve that somebody else left for you.
function smellsGas(s, o, g) {
  if (s !== g.player || !o.sabotaged || o.rigger === s.id) return false;
  if (Math.random() > 0.3 + (s.skills.handiness || 0) * 0.07) return false;
  o.sabotaged = false;
  g.log(`👃 ${s.first} smells gas. Someone has loosened the ${o.name}'s valve! ${s.first} tightens it and makes a mental note.`, 'warn');
  return true;
}

// When one of the others rigs something while you're watching, you get to know about it, and your free
// will keeps away from it.
function youSawThat(g, s, o, what) {
  const me = g.player;
  if (!me || me === s || !me.alive || !g.witnesses(objCells(o)).includes(me)) return;
  o.knownBy = [...(o.knownBy || []), me.id];
  g.danger(`👀 ${me.first} saw ${s.first} ${what}. ${me.first} won't be touching that.`);
}

// Skill-building: an hour of practice at the right object.
const practise = (id, label, icon, skill, duration = 45) => ({
  id, label, icon, duration, spot: useSpot, available: (s, o) => !o.charred && !o.toppled,
  tick(s, o, g, a, m) { s.addNeed('fun', -0.05 * m); },
  finish(s, o, g) { learn(s, skill); if (s === g.player) g.log(`${icon} ${s.first} practises ${skill}. Now ${Math.floor(s.skills[skill])}/10.`, 'dim'); },
});
function changeRel(a, b, d) {
  a.rel[b.id] = clamp((a.rel[b.id] || 0) + d, -100, 100);
  b.rel[a.id] = clamp((b.rel[a.id] || 0) + d, -100, 100);
}
function shock(s, g, lo, hi, what) {
  const dmg = rand(lo, hi);
  s.health -= dmg;
  g.popup(s, '-' + Math.round(dmg), '#ffe14a');
  g.flash(s);
  g.sfx('zap');
  g.log(`⚡ ${s.name} ${what}`, 'evil');
  if (s.health <= 0) { g.kill(s, 'Electrocution'); return; }
  s.endAction();
  s.status.passedOut = 30;
  g.becomeCareful(s, 'wiring', 'got a nasty shock');
}
// Everyone sleeps in their own bed. A dead roommate's bed is up for grabs.
function bedOwner(o, g) { return g.sims.find(x => x.id === o.owner); }
function canSleepIn(s, o, g) {
  if (o.charred) return false;
  const owner = bedOwner(o, g);
  if (owner && owner !== s && owner.alive) return false;
  return !g.sims.some(x => x !== s && x.action && x.action.target === o && x.action.stage === 'do');
}
function bedWhyNot(s, o, g) {
  if (o.charred) return null;
  const owner = bedOwner(o, g);
  return owner && owner !== s && owner.alive ? `That's ${owner.first}'s bed` : 'Someone is already in it';
}

export function makeAction(def, target, source) {
  return { def, target, source, stage: 'go', t: 0, duration: 0, data: {} };
}

export const POOL_OBJ = { id: 'pool', type: 'pool', name: 'Swimming Pool', cells: [] };

export const SWIM = {
  id: 'swim', label: 'Go for a swim', icon: '🏊', duration: 90,
  spot: (s, o, g) => g.world.ladder.use,
  available: (s, o, g) => g.world.ladder.present && !s.status.swimming,
  start(s, o, g) { s.enterPool(g); g.sfx('splash'); g.view.burst(s.x, s.z, 'splash'); },
  tick(s, o, g, a, m) {
    s.addNeed('fun', 0.8 * m); s.addNeed('hygiene', 0.3 * m);
    if (s.needs.energy < 20) s.endAction(); // tired: head for the ladder
  },
  facePos: () => null,
};

export const WALK = { id: 'walk', label: 'Walk here', icon: '👣', duration: 0.01, spot: (s, t) => t.cell, facePos: () => null };

export const OBJECT_ACTIONS = {
  fridge: [
    { id: 'snack', label: 'Grab leftovers', icon: '🍗', duration: 20, spot: useSpot, available: (s, o) => !o.charred,
      start(s, o, g) {
        if (o.poisoned > 0) {
          if (notices(s, g, 0.6)) {
            g.log(`👀 ${s.first} sniffs the leftovers suspiciously and puts them back.`, 'dim');
            g.becomeCareful(s, 'poison', 'sniffed something nasty in the leftovers');
            return false;
          }
          o.poisoned--;
          if (o.untraceable) {
            s.status.poisoned += 110; // a professional dose
            s.status.untraceable = true;
            g.log(`⚗️ ${s.name} digs into the leftovers. They taste faintly, elegantly, of almonds.`, 'evil');
          } else {
            s.status.poisoned += s.has('glutton') ? 110 : 50;
            g.log(`🧪 ${s.name} digs into the leftovers. They taste... off.`, 'evil');
          }
          if (o.poisoned <= 0) o.untraceable = false;
        }
        if (o.chili > 0) {
          o.chili--;
          s.status.gassy = s.has('glutton') ? 480 : 300;
          g.log(`🫘 ${s.name} wolfs down Grandma's three-bean chili. Everyone should leave the house.`, 'evil');
        }
      },
      tick(s, o, g, a, m) { s.addNeed('hunger', (s.has('glutton') ? 2 : 1.6) * m); },
      finish(s, o, g) { if (s.has('lazy') && Math.random() < 0.4) scatterMess(g, s, 1); } },
    { id: 'poison', label: 'Poison the leftovers', icon: '🧪', evil: true, duration: 15, spot: useSpot,
      available: (s, o, g) => s !== g.player && !o.charred && !o.poisoned,
      finish(s, o, g) {
        o.poisoned = 3; o.poisonedBy = s.id; o.rigger = s.id;
        youSawThat(g, s, o, 'put something in the leftovers');
        s.evil = Math.min(100, s.evil + 5);
        g.log(`🧪 ${s.name} laces the leftovers with something foul.`, 'evil');
      } },
    { id: 'fish', label: 'Microwave fish in the shared kitchen', icon: '🐟', evil: true, duration: 10, spot: useSpot, available: (s, o) => !o.charred,
      finish(s, o, g) {
        g.world.stink = { room: 'Kitchen', until: g.clock + 240, by: s.id };
        s.addNeed('hunger', 30);
        g.log(`🐟 ${s.first} reheats leftover fish in the microwave. The kitchen will smell like a harbour for hours.`, 'evil');
      } },
    { id: 'trash', label: 'Trash the kitchen', icon: '🗑️', evil: true, duration: 15, spot: useSpot,
      finish(s, o, g) {
        scatterMess(g, s, 4);
        // A banana peel for flair. It's rubbish, not evidence: the police don't care about it.
        const w = g.world;
        for (let i = 0; i < 12; i++) {
          const x = s.cx + Math.floor(rand(-2, 3)), z = s.cz + Math.floor(rand(-2, 3));
          if (!w.isBlocked(x, z) && !w.trapAt(x, z) && !(x === s.cx && z === s.cz)) { w.addTrap('peel', x, z, 1); w.trapAt(x, z).by = s.id; break; }
        }
        s.addNeed('fun', 15);
        g.log(`🗑️ ${s.first} empties the bin across the kitchen floor, adds a banana peel for flair, and walks away.`, 'evil');
      } },
    { id: 'toxin', label: 'Lace with a designer toxin (untraceable)', icon: '⚗️', evil: true, duration: 20, spot: useSpot,
      available: (s, o) => s.rosterId === 'asraa' && !o.charred && !o.poisoned,
      finish(s, o, g) {
        o.poisoned = 2; o.poisonedBy = s.id; o.untraceable = true;
        g.log('⚗️ Dr. Asraa Z synthesises something elegant and untraceable, and garnishes the leftovers with it.', 'evil');
      } },
  ],
  stove: [
    { id: 'cook', label: 'Cook dinner', icon: '🍳', duration: 40, spot: useSpot, available: (s, o) => !o.charred,
      start(s, o, g) { smellsGas(s, o, g); },
      tick(s, o, g, a) {
        once(a, 'roll', 15, () => {
          if (o.flour) { dustExplosion(g, s, o); return; }
          const gas = !!o.sabotaged;
          if (Math.random() < risk(s, 0.15 - 0.03 * s.skills.cooking, o, g)) kitchenFire(s, o, g, gas, 'cooking');
        });
      },
      finish(s, o, g) { s.addNeed('hunger', 60); learn(s, 'cooking'); g.log(`${s.first} cooks a surprisingly edible meal.`, 'dim'); } },
    { id: 'npcgas', label: 'Loosen the gas valve', icon: '🔧', evil: true, duration: 8, spot: useSpot,
      available: (s, o, g) => s !== g.player && !o.charred && !o.sabotaged,
      finish(s, o, g) { o.sabotaged = true; o.rigger = s.id; youSawThat(g, s, o, 'loosen the gas valve'); } },
    { id: 'bake', label: 'Bake bread', icon: '🍞', duration: 60, spot: useSpot, available: (s, o) => !o.charred,
      tick(s, o, g, a) {
        // Flour in the air plus a gas flame: sabotage makes it certain, clumsy bakers make it likely.
        once(a, 'roll', 20, () => { if (o.flour || Math.random() < risk(s, 0.08 - 0.01 * s.skills.cooking, o, g)) dustExplosion(g, s, o); });
      },
      finish(s, o, g) { s.addNeed('hunger', 45); s.addNeed('fun', 15); learn(s, 'cooking'); g.log(`🍞 ${s.first} bakes a lopsided but edible loaf.`, 'dim'); } },
  ],
  candles: [
    { id: 'candlelit', label: 'Relax by candlelight', icon: '🕯️', duration: 30, spot: useSpot, available: (s, o) => !o.charred,
      start(s, o, g) { if (!(o.lit > 0)) { o.lit = 240; g.log(`🕯️ ${s.first} lights the scented candles. The scent is called "Midnight Arson".`, 'dim'); } },
      tick(s, o, g, a, m) { s.addNeed('fun', 0.9 * m); s.addNeed('hygiene', 0.3 * m); } },
    { id: 'lightcandles', label: 'Light the candles and leave', icon: '🔥', duration: 5, spot: useSpot, available: (s, o) => !o.charred && !(o.lit > 0),
      finish(s, o, g) { o.lit = 240; g.log(`🕯️ ${s.first} lights the candles and wanders off. What could go wrong?`, 'dim'); } },
    { id: 'blowcandles', label: 'Blow out the candles', icon: '💨', duration: 3, spot: useSpot, available: (s, o) => o.lit > 0,
      finish(s, o) { o.lit = 0; } },
  ],
  vanity: [
    practise('charm', 'Practise charm in the mirror', '💋', 'charisma', 30),
    { id: 'hair', label: 'Do your hair (lots of hairspray)', icon: '💇', duration: 20, spot: useSpot, available: (s, o) => !o.charred,
      tick(s, o, g, a, m) { s.addNeed('hygiene', 1.2 * m); s.addNeed('fun', 0.4 * m); },
      finish(s, o, g) {
        // Hairspray lingers: anywhere near a flame for the next few hours and they go up like a torch.
        const extra = !!o.sabotaged;
        o.sabotaged = false;
        s.status.hairspray = extra ? 240 : 90;
        s.status.extraHold = extra;
        g.log(extra ? `💇 ${s.name} empties a whole can of EXTRA HOLD hairspray. Their hair is now legally a fire hazard.`
          : `💇 ${s.first} uses half a can of hairspray. Flammable, but fabulous.`, extra ? 'evil' : 'dim');
      } },
  ],
  shed: [
    { id: 'weeds', label: 'Burn weeds with the gas torch', icon: '🌿', duration: 30, spot: useSpot, available: (s, o) => !o.charred,
      facePos: s => [s.x + 1, s.z + 1],
      tick(s, o, g, a) {
        once(a, 'roll', 10, () => {
          if (o.sabotaged) {
            o.sabotaged = false;
            s.status.onFire = 60;
            lawnFire(g, s, 3);
            g.log(`🌿🔥 The weed torch's slit hose flares like a dragon. ${s.name} is now the weed.`, 'evil');
          } else if (Math.random() < risk(s, 0.05, null, g)) {
            lawnFire(g, s, 1);
            if (s.has('clumsy') || Math.random() < 0.3) s.status.onFire = 30;
            g.log(`🌿🔥 ${s.name} torches the weeds, the lawn and ${s.status.onFire > 0 ? 'their own trousers' : 'very nearly their own trousers'}.`, 'evil');
          } else return;
          g.sfx('fire');
          s.endAction();
        });
      },
      finish(s, o, g) { s.addNeed('fun', 20); g.log(`🌿 ${s.first} torches every weed in the garden, plus a few innocent daisies.`, 'dim'); } },
  ],
  grill: [
    { id: 'grill', label: 'Grill mystery meat', icon: '🍔', duration: 35, spot: useSpot, available: (s, o) => !o.charred,
      start(s, o, g) { if (triggerFireworks(g, o)) return false; smellsGas(s, o, g); },
      tick(s, o, g, a) {
        once(a, 'roll', 12, () => {
          const gas = !!o.sabotaged;
          if (Math.random() < risk(s, 0.15 - 0.03 * s.skills.cooking, o, g)) kitchenFire(s, o, g, gas, 'grill');
        });
      },
      finish(s, o, g) { s.addNeed('hunger', 55); learn(s, 'cooking'); } },
  ],
  tv: [
    { id: 'watch', label: 'Watch TV', icon: '📺', duration: 60, spot: useSpot, available: (s, o) => !o.charred && !o.broken,
      start(s, o, g) { g.sfx('tv'); },
      tick(s, o, g, a, m) {
        s.addNeed('fun', 0.9 * m);
        once(a, 'roll', 5, () => { if (o.sabotaged && Math.random() < risk(s, 0, o, g)) shock(s, g, 50, 95, 'touches the TV and gets a face full of voltage.'); });
        if (s.action !== a) return;
        if (Math.random() < 0.002 * m) { o.broken = true; g.log('📺 The ancient TV sparks, pops and dies.', 'dim'); s.endAction(); }
      } },
    { id: 'repair', label: (s, o) => o.broken ? 'Repair the TV' : 'Tinker with the wiring', icon: '🔧', duration: 30,
      spot: useSpot, available: (s, o) => !o.charred,
      tick(s, o, g, a) {
        once(a, 'roll', 18, () => {
          if (Math.random() < risk(s, 0.42 - 0.04 * s.skills.handiness, o, g)) shock(s, g, 45, 90, 'grabs the wrong wire.');
        });
      },
      finish(s, o, g) { o.broken = false; learn(s, 'handiness'); s.addNeed('fun', 10); g.log(`🔧 ${s.first} fiddles with the TV and survives. Pity.`, 'dim'); } },
  ],
  fireplace: [
    { id: 'light', label: 'Light a cozy fire', icon: '🔥', duration: 15, spot: useSpot, available: (s, o) => !o.charred && o.lit <= 0,
      finish(s, o, g) {
        if (triggerFireworks(g, o)) return;
        o.lit = 240; s.addNeed('fun', 10); g.log(`${s.first} lights the fireplace. Cozy. For now.`, 'dim');
      } },
    { id: 'warm', label: 'Warm up by the fire', icon: '♨️', duration: 40, spot: useSpot, available: (s, o) => o.lit > 0,
      tick(s, o, g, a, m) { s.addNeed('fun', 0.6 * m); } },
    { id: 'stoke', label: 'Stoke it way too high', icon: '🪵', evil: true, duration: 10, spot: useSpot,
      available: (s, o) => o.lit > 0 && !o.stoked,
      finish(s, o, g) { o.lit += 240; o.stoked = true; g.log(`🪵 ${s.name} piles logs into the fireplace until it roars.`, 'evil'); } },
  ],
  heater: [
    { id: 'warmhands', label: 'Warm hands', icon: '🧤', duration: 30, spot: useSpot, available: (s, o) => !o.charred,
      tick(s, o, g, a, m) { s.addNeed('fun', 0.4 * m); } },
    { id: 'crank', label: 'Crank it to MAX', icon: '🌡️', evil: true, duration: 5, spot: useSpot,
      available: (s, o) => !o.charred && o.cranked <= 0,
      finish(s, o, g) { o.cranked = 200; g.log(`🌡️ ${s.name} cranks the space heater to max. It starts to glow.`, 'evil'); } },
  ],
  tub: [
    { id: 'bath', label: 'Take a bath', icon: '🛁', duration: 40, spot: useSpot, available: (s, o) => !o.charred,
      tick(s, o, g, a, m) {
        s.addNeed('hygiene', 2.2 * m);
        once(a, 'roll', 15, () => { if (o.sabotaged && Math.random() < risk(s, 0, o, g)) shock(s, g, 60, 110, 'discovers the frayed wire under the tub. Wet.'); });
      } },
    { id: 'radio', label: 'Bathe with the radio on the edge', icon: '📻', duration: 40, spot: useSpot, available: (s, o) => !o.charred,
      tick(s, o, g, a, m) {
        s.addNeed('hygiene', 2 * m); s.addNeed('fun', 1 * m);
        once(a, 'roll', 20, () => { if (Math.random() < risk(s, 0.3, o, g)) shock(s, g, 60, 120, 'knocks the radio into the bathwater.'); });
      } },
  ],
  bed: [
    { id: 'sleep', label: 'Sleep', icon: '😴', spot: useSpot, available: canSleepIn, whyNot: bedWhyNot,
      duration: s => Math.max(60, Math.min(480, (100 - s.needs.energy) / 0.35)),
      tick(s, o, g, a, m) {
        s.addNeed('energy', 0.35 * musicWakes(s, g, m) * m); s.health = Math.min(100, s.health + 0.08 * m);
        if (s.needs.hunger < 12 && a.source === 'auto') s.endAction(); // woken by a growling stomach
      } },
    { id: 'nap', label: 'Nap', icon: '💤', duration: 60, spot: useSpot, available: canSleepIn, whyNot: bedWhyNot,
      tick(s, o, g, a, m) { s.addNeed('energy', 0.35 * musicWakes(s, g, m) * m); } },
  ],
  stereo: [
    { id: 'dance', label: 'Dance to loud music', icon: '💃', duration: 40, spot: useSpot, available: (s, o) => !o.charred,
      start(s, o) { o.dj = s.id; },
      tick(s, o, g, a, m) { s.addNeed('fun', 1.2 * m); o.playing = Math.max(o.playing || 0, 5); } },
    { id: 'blast', label: 'Blast music at full volume', icon: '🔊', evil: true, duration: 6, spot: useSpot,
      available: (s, o) => !o.charred && !(o.blasting > 0),
      finish(s, o, g) {
        o.blasting = 180; o.dj = s.id;
        s.addNeed('fun', 15);
        g.log(`🔊 ${s.name} cranks the stereo to 11. The windows rattle. Somewhere, a baby starts crying.`, 'evil');
      } },
    { id: 'stopmusic', label: 'Turn the music off', icon: '🔇', duration: 3, spot: useSpot, available: (s, o) => o.blasting > 0 || o.playing > 0,
      finish(s, o, g) { o.blasting = 0; o.playing = 0; g.log(`🔇 ${s.first} yanks the stereo's plug out of the wall. Blessed silence.`, 'dim'); } },
  ],
  toilet: [
    { id: 'usetoilet', label: 'Use the toilet (and doomscroll)', icon: '🚽', duration: 20, spot: useSpot, available: (s, o) => !o.charred,
      tick(s, o, g, a, m) { s.addNeed('fun', 0.4 * m); s.addNeed('hygiene', 0.3 * m); } },
    // The Slob's oral hygiene routine: four hours of breath that can floor a grown adult.
    { id: 'toiletbrush', label: 'Brush teeth with the toilet brush', icon: '🪥', evil: true, duration: 8, spot: useSpot,
      available: (s, o) => !o.charred && s.canUse('breathe'),
      finish(s, o, g) {
        s.status.breath = 240;
        s.addNeed('hygiene', -10);
        s.addNeed('fun', 10);
        g.view.burst(s.x, s.z, 'stink', 1.35);
        g.log(`🪥 ${s.first} brushes their teeth with the toilet brush. Thoroughly. Gums and all. Their breath is now a weapon.`, 'evil');
        const seen = g.witnesses(objCells(o)).filter(x => x !== s && x.rel);
        for (const x of seen) { x.addNeed('fun', -12); changeRel(x, s, -6); }
        if (seen.length) g.log(`🤮 ${seen.map(x => x.first).join(' and ')} saw that. They will never unsee it.`, 'dim');
      } },
  ],
  table: [
    { id: 'toenails', label: 'Clip toenails at the dinner table', icon: '🦶', evil: true, duration: 12, spot: () => [4, 4],
      finish(s, o, g) {
        for (const x of g.sims) {
          if (x === s || !x.alive || Math.hypot(x.x - s.x, x.z - s.z) > 4) continue;
          x.addNeed('fun', -15);
          changeRel(x, s, -8);
        }
        scatterMess(g, s, 1);
        s.addNeed('fun', 10);
        g.log(`🦶 ${s.first} clips their toenails at the dinner table. One lands in the butter. Nobody will ever know which.`, 'evil');
      } },
  ],
  dresser: [
    { id: 'feral', label: 'Stop washing. Commit to the bit.', icon: '🦨', evil: true, duration: 5, spot: () => [6, 9],
      available: s => !(s.status.feral > 0),
      finish(s, o, g) {
        s.status.feral = 720;
        s.needs.hygiene = Math.min(s.needs.hygiene, 12);
        g.log(`🦨 ${s.first} puts on yesterday's socks. And the day before's. For the next twelve hours, soap is a rumour.`, 'evil');
      } },
  ],
  computer: [
    practise('code', 'Practise coding', '💻', 'logic'),
    { id: 'jobhunt', label: 'Look for a new job', icon: '📰', duration: 60, spot: useSpot,
      available: (s, o, g) => s === g.player && g.job && g.job.fired && !o.charred,
      finish(s, o, g) { rehire(g); g.log(`📰 ${s.first} talks their way back into a job as ${g.job.def.titles[0]}. Try turning up this time.`, 'tool'); } },
    { id: 'scheme', label: 'Scheme online', icon: '😈', duration: 45, spot: useSpot, available: (s, o) => !o.charred,
      tick(s, o, g, a, m) { s.addNeed('fun', 0.8 * m); s.addNeed('social', 0.3 * m); s.evil = Math.min(100, s.evil + 0.1 * m); } },
    { id: 'devgame', label: 'Make an obscure indie game', icon: '🕹️', duration: 90, spot: useSpot,
      available: (s, o) => !o.charred && s.rosterId === 'daniel',
      tick(s, o, g, a, m) { s.addNeed('fun', 0.6 * m); },
      finish(s, o, g) {
        g.cash += 15;
        g.log(`🕹️ ${s.first} releases "${say(GAMES)}". It sells three copies and one refund. (💵 +$15)`, 'tool');
      } },
    { id: 'insultbikers', label: 'Insult the local biker club online', icon: '🏍️', evil: true, duration: 20, spot: useSpot,
      available: (s, o, g) => !o.charred && !g.gang,
      finish(s, o, g) { summonGang(g, `${s.first} posts "your bikes are scooters" on the local biker club's forum, with this address.`); } },
    { id: 'hackwires', label: 'Hack: overload the wiring', icon: '⚡', duration: 30, spot: useSpot,
      available: (s, o) => !o.charred && s.rosterId === 'daniel',
      finish(s, o, g) {
        for (const id of ['tv', 'tub']) { const x = g.world.objects.get(id); if (!x.charred) x.sabotaged = true; }
        g.log(`💻 ${s.first} hacks the smart meter. The TV and the bathtub start to hum.`, 'evil');
      } },
    { id: 'hacklock', label: 'Hack: smart-lock every door (2h)', icon: '🔐', duration: 20, spot: useSpot,
      available: (s, o, g) => !o.charred && s.rosterId === 'daniel' && !g.hackLockUntil,
      finish(s, o, g) {
        for (const d of g.world.doors) if (!d.bricked) { d.bricked = true; d.hackLocked = true; }
        g.world.rebuildEdges();
        g.hackLockUntil = g.clock + 120;
        g.log(`🔐 ${s.first} pushes a "firmware update". Every door in the house locks itself for two hours.`, 'evil');
      } },
    { id: 'pizza', label: 'Order a pizza', icon: '🍕', duration: 45, spot: useSpot, available: (s, o) => !o.charred,
      finish(s, o, g) { s.addNeed('hunger', 55); g.log(`🍕 ${s.first} eats an entire pizza alone, sharing nothing.`, 'dim'); } },
    { id: 'darkarts', label: 'Research the dark arts', icon: '📜', evil: true, duration: 60, spot: useSpot, available: (s, o) => !o.charred,
      finish(s, o, g) {
        g.doom += s.rosterId === 'seance' ? 2 : 1; s.addNeed('fun', 15);
        g.log(`📜 ${s.name} reads forbidden things online. The sky feels closer. (Doom ${g.doom})`, 'evil');
      } },
  ],
  telescope: [
    practise('studyastro', 'Chart the stars (logic)', '🔭', 'logic', 40),
    { id: 'stargaze', label: 'Stargaze', icon: '🔭', duration: 50, spot: useSpot,
      available: (s, o, g) => g.isNight, whyNot: (s, o, g) => (g.isNight ? null : 'Only at night (20:00–05:00)'),
      tick(s, o, g, a, m) {
        s.addNeed('fun', 1 * m);
        // A quiet sky until somebody has stirred up enough Doom.
        const p = g.doom < 2 ? 0 : 0.0002 * g.doom * (s.has('stargazer') ? 2 : 1);
        if (Math.random() < p * m) g.meteorStrike(s);
      } },
    { id: 'taunt', label: 'Taunt the heavens', icon: '🌠', evil: true, duration: 20, spot: useSpot,
      available: (s, o, g) => g.isNight, whyNot: (s, o, g) => (g.isNight ? null : 'Only at night (20:00–05:00)'),
      finish(s, o, g) {
        if (g.doom >= 2 && Math.random() < 0.1 * g.doom) g.meteorStrike(s);
        else { g.doom += 0.5; g.log(`🌠 ${s.name} shakes a fist at the sky. The sky takes note.`, 'evil'); }
      } },
  ],
  bookshelf: [
    practise('studychem', 'Study chemistry', '⚗️', 'chemistry'),
    practise('studydiy', 'Read DIY manuals', '🔧', 'handiness'),
    { id: 'read', label: 'Read a trashy novel', icon: '📖', duration: 40, spot: useSpot, available: (s, o) => !o.charred && !o.toppled,
      tick(s, o, g, a, m) { s.addNeed('fun', 0.8 * m); } },
  ],
  mailbox: [
    { id: 'mail', label: 'Check the mail', icon: '📬', duration: 8, spot: useSpot,
      finish(s, o, g) { openMail(g, s, o); } },
  ],
  pool: [SWIM],
  ladder: [SWIM,
    // The other roommates' version: wait until you're in the water, then take the ladder away.
    { id: 'hideladder', label: 'Hide the pool ladder', icon: '🪜', evil: true, duration: 5, spot: (s, o) => o.use,
      available: (s, o, g) => s !== g.player && o.present && g.player && g.player.status.swimming,
      finish(s, o, g) { g.toggleLadder(); youSawThat(g, s, o, 'take the pool ladder'); } }],
};

for (const list of Object.values(OBJECT_ACTIONS)) {
  for (const d of list) if (!d.facePos) d.facePos = (s, o) => (o.cells && o.cells.length ? objCenter(o) : null);
}

// ---------- people learn ----------
// Every trick someone pulls on you is remembered (t.wise[by][trick]). It works less well each time, some
// stop working altogether, and anyone who keeps coming back for more starts getting avoided.

export const triedOn = (s, t, id) => (t.wise && t.wise[s.id] && t.wise[s.id][id]) || 0;
const pestered = (s, t) => Object.values((t.wise && t.wise[s.id]) || {}).reduce((a, n) => a + n, 0);
// Each repeat of the same trick on the same person works half as well again.
const fade = (s, t, id) => 1 / (1 + 0.5 * Math.max(0, triedOn(s, t, id) - 1));
const WISE_AT = { apologise: 3, errand: 3, gossip: 3, drink: 1, lovebomb: 1, guilttrip: 2, lure: 2, story: 2, playtest: 2, gaslight: 3, joke: 3, triangulate: 3, smear: 3, breathe: 4 };
const SEEN_THROUGH = {
  drink: 'The last drink you gave me made me sick. I am not having another.', lovebomb: 'I have seen how this ends. No thanks.',
  guilttrip: 'Cook it yourself.', lure: 'Not falling for that wink again.', story: 'Not this story again. I have heard the prequel.',
  playtest: 'There is no save button. I remember.', gaslight: 'Nice try. I KNOW there was a ladder.', joke: 'Heard it. Not funny the third time.',
  apologise: "Sorry doesn't cut it any more.", errand: 'Get your own pizza. I know you just want me out of the house.', gossip: 'You would say anything to start a fight.',
  triangulate: 'You say that about everyone.', smear: 'Nobody believes your rumours any more.', breathe: 'I am holding my breath until you leave.',
};

// Called as someone steps up to do something nasty to `t`. True if `t` won't have it (the action is off).
export function seesThrough(s, t, def, g) {
  if ((!def.evil && WISE_AT[def.id] === undefined) || !t.rel) return false;
  const tried = triedOn(s, t, def.id);
  if (WISE_AT[def.id] !== undefined && tried >= WISE_AT[def.id]) {
    changeRel(s, t, -6);
    g.dialogue.say(t, 'wise', 2, SEEN_THROUGH[def.id]);
    g.log(`🙅 ${t.first} isn't falling for ${s.first}'s tricks again: "${SEEN_THROUGH[def.id]}"`, 'dim');
    return true;
  }
  // Someone who keeps getting pestered starts walking away when they see you coming.
  if (pestered(s, t) >= 4 && !asleep(t) && Math.random() < 0.35) {
    g.log(`🚶 ${t.first} sees ${s.first} coming and finds somewhere else to be.`, 'dim');
    return true;
  }
  const w = (t.wise = t.wise || {}), m = (w[s.id] = w[s.id] || {});
  m[def.id] = tried + 1;
  return false;
}

// Who someone likes best in the house (other than `not`), if anyone.
function favourite(t, g, not) {
  return g.sims.filter(o => o.alive && o !== t && o !== not && o !== g.player && !o.status.away)
    .sort((a, b) => t.relWith(b) - t.relWith(a))[0] || null;
}

// What housemates with a part to play do on their own (see autonomy.js).
export const FIX = { id: 'fixit', label: 'Undo the sabotage', icon: '🧰', duration: 10, spot: (s, o) => o.use || o.cells[0],
  finish(s, o, g) {
    const was = o.sabotaged || o.flour || o.poisoned > 0 || o.fireworks || o.bomb || o.wobbly || o.chili > 0;
    if (!was) return;
    o.sabotaged = false; o.flour = false; o.poisoned = 0; o.fireworks = false; o.bomb = false; o.chili = 0;
    if (!o.toppled) o.wobbly = false;
    g.log(`🧰 ${s.first} puts the ${o.name} right again, and gives you a long look.`, 'warn');
  } };
export const BREAKUP = { id: 'breakup', label: 'Break up the fight', icon: '🕊️', approachSim: true, duration: 2,
  finish(s, t, g) {
    const other = t.action && t.action.def.id === 'fight' ? t.action.target : null;
    for (const x of [t, other]) if (x && x.action && x.action.def.id === 'fight') x.endAction();
    g.log(`🕊️ ${s.first} wades in and breaks up the fight${other ? ` between ${t.first} and ${other.first}` : ''}. "Not in this house."`, 'warn');
  } };
export const PUTBACK = { id: 'putback', label: 'Put the pool ladder back', icon: '🪜', duration: 5, spot: (s, o) => o.use,
  finish(s, o, g) {
    if (g.world.ladder.present) return;
    g.toggleLadder();
    g.log(`🪜 ${s.first} spots someone stuck in the pool and puts the ladder back. Just in time.`, 'warn');
  } };

// Slippers: an auntie has two, and each one thrown takes a while to fetch back (plans.js).
export const slippersLeft = s => 2 - ((s.slippersOut && s.slippersOut.length) || 0);

// ---------- manipulation tactics (only sims with the matching personality can use them) ----------

const say = arr => arr[Math.floor(Math.random() * arr.length)];
const WHISPERS = ['The ladder is watching you.', 'I licked your toothbrush. Twice.', 'The call is coming from inside the house.',
  'Your mother phoned. From the basement.', 'Rent went up. Forever.', 'I know what you did with the yoghurt.'];
const GASLIGHT = ["That never happened. You're remembering it wrong.", "You're being dramatic again.", 'I never said that. Are you feeling okay?', 'Everyone agrees with me, you know.', "You're imagining things. Again."];
const JOKES = [
  "I told my roommate I'd kill for a sandwich. Anyway, the fridge is free now.",
  "What's the difference between you and a smoke alarm? Someone would miss the smoke alarm.",
  "My last roommate said I'd never amount to anything. Beautiful headstone, though.",
  "Why don't graveyards get noisy? Because I keep my voice down when I visit.",
  "You know what they say: laughter is the best medicine. Not in your case. In your case it's the cause of death.",
];
const GAMES = [
  'a 40-hour visual novel about tax law', 'a roguelike where you play a sad printer', 'Goat Accountant Simulator 3',
  'an open-world game with no map, no quests and one very judgemental crow', 'a rhythm game set entirely in a dentist\'s waiting room',
];
const PLAYTEST = {
  id: 'playtesting', label: 'Playtest the game', icon: '🕹️', duration: 120, spot: (s, o) => o.use,
  tick(s, o, g, a, m) {
    s.sanity = Math.max(0, s.sanity - 0.35 * m);
    s.addNeed('fun', -0.3 * m);
    if (s.sanity <= 0 && !a.data.broke) { a.data.broke = true; g.log(`🕹️ ${s.first} has seen the true ending. They are not okay.`, 'evil'); }
  },
};
const SMEARS = ['steals from the fridge', 'talks about everyone behind their back', 'has never once cleaned the bathroom', 'reads other people\'s mail', 'is secretly a terrible person (accurate, but still)'];

function tactics() {
  const blah = (s, t, g, a, m) => { if (Math.random() < 0.25 * m) g.sfx('blah'); };
  const others = (g, ...not) => g.sims.filter(o => o.alive && !not.includes(o));
  return [
    { id: 'gaslight', label: 'Gaslight', icon: '🌀', evil: true, approachSim: true, duration: 15,
      available: s => s.canUse('gaslight'), tick: blah,
      finish(s, t, g) {
        const wasFine = !t.confused;
        t.sanity = Math.max(0, t.sanity - (t.has('genius') ? 12 : 24) * fade(s, t, 'gaslight'));
        g.log(`🌀 ${s.first} to ${t.first}: "${say(GASLIGHT)}"`, 'evil');
        if (wasFine && t.confused) g.log(`🌀 ${t.name} no longer trusts their own memory. Confused sims have far more accidents.`, 'warn');
      } },
    { id: 'triangulate', label: 'Triangulate', icon: '🔺', evil: true, approachSim: true, duration: 15,
      available: (s, t, g) => s.canUse('triangulate') && others(g, s, t).length > 0, tick: blah,
      finish(s, t, g) {
        const third = others(g, s, t).sort((a, b) => t.relWith(b) - t.relWith(a))[0];
        if (!third) return;
        changeRel(t, third, -28 * fade(s, t, 'triangulate'));
        changeRel(s, t, 6);
        g.log(`🔺 ${s.first} to ${t.first}: "I'm only telling you because I care... but ${third.first} said some things about you."`, 'evil');
      } },
    { id: 'lovebomb', label: 'Love-bomb', icon: '💝', evil: true, approachSim: true, duration: 20,
      available: (s, t) => s.canUse('lovebomb') && !t.lovebomb, tick: blah,
      finish(s, t, g) {
        changeRel(s, t, 35);
        t.addNeed('social', 40); t.addNeed('fun', 20);
        t.lovebomb = { by: s.id, at: g.clock + 360 };
        g.log(`💝 ${s.first} showers ${t.first} with compliments and gifts. ${t.first} has never felt so special. For now.`, 'evil');
      } },
    { id: 'smear', label: 'Start a smear campaign', icon: '🗞️', evil: true, approachSim: true, duration: 15,
      available: s => s.canUse('smear'), tick: blah,
      finish(s, t, g) {
        for (const o of others(g, s, t)) changeRel(o, t, -18 * fade(s, t, 'smear'));
        t.addNeed('social', -15);
        g.log(`🗞️ ${s.first} makes sure everyone hears that ${t.first} ${say(SMEARS)}.`, 'evil');
      } },
    { id: 'scene', label: 'Make a scene', icon: '🎭', evil: true, approachSim: true, duration: 15,
      available: s => s.canUse('scene'), tick: blah,
      finish(s, t, g) {
        t.addNeed('fun', -20);
        t.sanity = Math.max(0, t.sanity - 8);
        g.log(`🎭 ${s.name} throws an operatic tantrum at ${t.first}. The whole house hears it.`, 'evil');
        for (const o of others(g, s)) {
          if (Math.hypot(o.x - s.x, o.z - s.z) > 4) continue;
          o.addNeed('fun', -12);
          if (o !== t && o.has('hotheaded') && Math.random() < 0.3) o.queue.unshift(makeAction(FIGHT, s, 'auto'));
        }
      } },
    { id: 'guilttrip', label: 'Guilt-trip into cooking', icon: '😢', evil: true, approachSim: true, duration: 10,
      available: s => s.canUse('guilttrip'), tick: blah,
      finish(s, t, g) {
        const stove = g.world.objects.get('stove'), grill = g.world.objects.get('grill');
        const [def, obj] = !stove.charred ? [OBJECT_ACTIONS.stove[0], stove] : [OBJECT_ACTIONS.grill[0], grill];
        t.addNeed('fun', -10);
        t.sanity = Math.max(0, t.sanity - 5);
        g.log(`😢 ${s.first}: "After everything I've done for you, you can't even make me dinner?" ${t.first} heads for the ${obj.name}, wracked with guilt.`, 'evil');
        if (!obj.charred) { t.endAction(); t.queue.unshift(makeAction(def, obj, 'player')); }
      } },
    { id: 'lure', label: 'Lure with a wink', icon: '😘', evil: true, approachSim: true, duration: 5,
      available: (s, t) => s.canUse('lure') && !t.status.follow,
      finish(s, t, g) {
        // A lured player snaps out of it sooner: you're only human.
        t.status.follow = { leader: s, until: g.clock + (t === g.player ? 45 : 150) };
        g.log(`😘 ${s.first} winks at ${t.first}. ${t.first} would follow ${s.first} anywhere. Literally anywhere.`, 'evil');
      } },
    { id: 'joke', label: 'Tell a killer joke', icon: '😂', evil: true, approachSim: true, duration: 8,
      available: s => s.canUse('joke'),
      finish(s, t, g) {
        g.log(`😂 ${s.first}: "${say(JOKES)}"`, 'evil');
        t.addNeed('fun', 25);
        const dmg = rand(14, 26) * (t.needs.energy < 30 ? 1.5 : 1) * fade(s, t, 'joke');
        t.health -= dmg;
        g.popup(t, 'HA' + 'HA'.repeat(Math.floor(dmg / 10)), '#ffe14a');
        g.sfx('blah');
        if (t.health <= 0) g.kill(t, 'Laughter');
        else g.log(`😂 ${t.first} laughs until they can't breathe. (-${Math.round(dmg)} health)`, 'dim');
      } },
    { id: 'breathe', label: 'Breathe on them. Up close.', icon: '😮‍💨', evil: true, approachSim: true, duration: 6,
      available: s => s.canUse('breathe'),
      finish(s, t, g) {
        g.view.burst(t.x, t.z, 'stink', 1.35);
        changeRel(s, t, -12);
        t.addNeed('hygiene', -20);
        t.addNeed('fun', -15);
        if (!(s.status.breath > 0)) {
          g.log(`😮‍💨 ${s.first} breathes on ${t.first} from two centimetres away. Bad, but survivable. The toilet brush would fix that.`, 'dim');
          return;
        }
        // A "good morning" at close range, straight from the bowl. Sleepers get the full dose.
        const sleeping = asleep(t);
        if (sleeping) t.endAction();
        const dmg = rand(10, 18) * (sleeping ? 1.6 : 1);
        t.health -= dmg;
        g.popup(t, '🤢 -' + Math.round(dmg), '#9acd32');
        g.sfx(sleeping ? 'scream' : 'gulp');
        if (t.health <= 0) { g.kill(t, 'Bad Breath'); return; }
        const how = sleeping ? `leans over ${t.first}'s bed and breathes a toilet-fresh "GOOD MORNING"` : `breathes a toilet-fresh "hello" into ${t.first}'s face`;
        if (Math.random() < 0.2) {
          t.status.passedOut = 15;
          g.log(`🤢 ${s.first} ${how}. ${t.first}'s eyes roll back and they faint on the spot. (-${Math.round(dmg)} health)`, 'evil');
        } else {
          g.log(`🤢 ${s.first} ${how}. ${t.first} gags. (-${Math.round(dmg)} health)`, 'evil');
        }
        if (Math.random() < (t.has('hotheaded') ? 0.5 : 0.1)) t.queue.unshift(makeAction(FIGHT, s, 'auto'));
      } },
    // Thrown from across the room at anyone she's angry with. People learn to duck.
    { id: 'slipper', label: 'Throw a slipper at them', icon: '🩴', evil: true, approachSim: true, range: 4.5, duration: 2,
      available: (s, t) => s.canUse('slipper') && slippersLeft(s) > 0 && s.relWith(t) < (s.role === 'player' ? 0 : -20),
      whyNot: (s, t) => (!s.canUse('slipper') ? null : slippersLeft(s) <= 0 ? 'Both slippers are across the room' : "She isn't angry with them. Yet."),
      start(s, t, g, a) {
        a.data.dodge = Math.random() < Math.min(0.5, 0.12 * Math.max(0, triedOn(s, t, 'slipper') - 1));
        if (g.view) g.view.throwSlipper(s, t, { miss: a.data.dodge, backAt: g.clock + 92 });
      },
      finish(s, t, g, a) {
        (s.slippersOut = s.slippersOut || []).push(g.clock + 90);
        changeRel(s, t, -8);
        if (a.data.dodge) {
          g.log(`🩴 ${s.first} flings a slipper across the room. ${t.first} has learned to duck. It sails past.`, 'dim');
          return;
        }
        const dmg = rand(18, 22);
        t.health -= dmg;
        g.popup(t, '🩴 -' + Math.round(dmg), '#ff7ab0');
        g.sfx('punch');
        g.view.burst(t.x, t.z, 'dust');
        if (t.health <= 0) { g.kill(t, 'Slipper'); return; }
        if (asleep(t)) t.endAction();
        g.log(`🩴 ${s.first} whips off a slipper and flings it. It hits ${t.first} square on the forehead. (-${Math.round(dmg)} health)`, 'evil');
      } },
    { id: 'playtest', label: 'Make them playtest his game', icon: '🕹️', evil: true, approachSim: true, duration: 5,
      available: s => s.canUse('playtest'),
      finish(s, t, g) {
        const pc = g.world.objects.get('computer');
        if (pc.charred) return;
        t.endAction();
        t.queue.unshift(makeAction(PLAYTEST, pc, 'player'));
        g.log(`🕹️ ${s.first} sits ${t.first} down in front of ${say(GAMES)}. There is no save button.`, 'evil');
      } },
    { id: 'silent', label: 'Silent treatment', icon: '🤐', evil: true, approachSim: true, duration: 10,
      available: s => s.canUse('silent'),
      finish(s, t, g) {
        t.addNeed('social', -35); t.addNeed('fun', -15);
        t.sanity = Math.max(0, t.sanity - 10);
        changeRel(s, t, -10);
        s.addNeed('fun', 10);
        g.log(`🤐 ${s.first} stares straight through ${t.first} and refuses to speak. ${t.first} spirals.`, 'evil');
      } },
  ];
}

export const FIGHT = {
  id: 'fight', label: 'Pick a fight', icon: '🥊', evil: true, approachSim: true, duration: 20,
  start(s, t, g) { g.log(`🥊 ${s.name} and ${t.name} brawl in a cloud of dust!`, 'evil'); },
  tick(s, t, g, a, m) {
    if (Math.random() < 0.5 * m) { g.sfx('punch'); g.view.burst((s.x + t.x) / 2, (s.z + t.z) / 2, 'dust'); }
  },
  finish(s, t, g) {
    const power = x => x.evil * 0.4 + x.health * 0.25 + rand(0, 50) + (x.has('hotheaded') ? 15 : 0);
    const [w, l] = power(s) >= power(t) ? [s, t] : [t, s];
    const dl = rand(18, 32) + (w.has('hotheaded') ? 8 : 0), dw = rand(3, 10);
    l.health -= dl; w.health -= dw;
    g.popup(l, '-' + Math.round(dl), '#ff5a5a');
    g.popup(w, '-' + Math.round(dw), '#ff9a5a');
    changeRel(s, t, -30);
    g.log(`${w.first} wins the fight. ${l.first} limps away.`, 'evil');
    if (l.health <= 0) g.kill(l, 'Fight');
    if (w.health <= 0) g.kill(w, 'Fight');
  },
};

export const SIM_ACTIONS = [
  { id: 'note', label: 'Leave a passive-aggressive note', icon: '📝', approachSim: true, duration: 14,
    finish(s, t, g) {
      changeRel(s, t, -8);
      s.addNeed('fun', 12);
      t.addNeed('fun', -5);
      g.sfx('paper');
      g.log(`📝 ${s.first} hands ${t.first} a laminated complaint. The word "kindly" is underlined four times.`, 'evil');
    } },
  { id: 'whisper', label: 'Whisper creepy things while they sleep', icon: '👂', evil: true, approachSim: true, duration: 12,
    available: (s, t) => asleep(t), start: (s, t) => asleep(t),
    finish(s, t, g) {
      t.sanity = Math.max(0, t.sanity - 15);
      t.addNeed('energy', -10);
      g.log(`👂 ${s.first} kneels by ${t.first}'s bed and whispers "${say(WHISPERS)}" until ${t.first} whimpers in their sleep.`, 'evil');
    } },
  { id: 'tickle', label: 'Tickle them awake', icon: '🪶', evil: true, approachSim: true, duration: 8,
    available: (s, t) => asleep(t), start: (s, t) => asleep(t),
    finish(s, t, g) {
      t.endAction();
      const dmg = rand(8, 16) * (t.needs.energy < 30 ? 1.5 : 1);
      t.health -= dmg;
      t.sanity = Math.max(0, t.sanity - 6);
      t.addNeed('fun', -10);
      changeRel(s, t, -20);
      g.popup(t, 'HEHEHE', '#ffe14a');
      if (t.health <= 0) { g.kill(t, 'Laughter'); return; }
      g.log(`🪶 ${s.first} tickles ${t.first} awake. ${t.first} laughs, screams, and laughs again, furiously. (-${Math.round(dmg)} health)`, 'evil');
      if (Math.random() < (t.has('hotheaded') ? 0.6 : 0.1)) t.queue.unshift(makeAction(FIGHT, s, 'auto'));
    } },
  { id: 'airhorn', label: 'Wake them with an air horn', icon: '📯', evil: true, approachSim: true, duration: 3,
    available: (s, t) => asleep(t), start: (s, t) => asleep(t),
    finish(s, t, g) {
      t.endAction();
      g.sfx('airhorn');
      g.view.burst(t.x, t.z, 'fright');
      t.sanity = Math.max(0, t.sanity - 12);
      changeRel(s, t, -25);
      // A weak heart doesn't survive being woken like that.
      if (t.health < 35 && Math.random() < 0.6) {
        g.log(`📯 ${s.first} blasts an air horn next to ${t.first}'s ear. ${t.first}'s heart simply hands in its notice.`, 'evil');
        g.kill(t, 'Fright');
        return;
      }
      g.log(`📯 HOOOONK! ${t.first} levitates out of bed and is now wide awake. Possibly forever.`, 'evil');
      if (Math.random() < (t.has('hotheaded') ? 0.7 : 0.2)) t.queue.unshift(makeAction(FIGHT, s, 'auto'));
    } },
  { id: 'barge', label: 'Barge in on them in the bathroom', icon: '🚪', evil: true, approachSim: true, duration: 4,
    available: (s, t) => doing(t, 'usetoilet', 'bath', 'radio'), start: (s, t) => doing(t, 'usetoilet', 'bath', 'radio'),
    finish(s, t, g) {
      const onLoo = doing(t, 'usetoilet'), radio = doing(t, 'radio');
      g.sfx('scream');
      t.addNeed('fun', -25);
      t.sanity = Math.max(0, t.sanity - 10);
      changeRel(s, t, -25);
      if (radio && Math.random() < 0.6) { shock(t, g, 60, 120, 'jumps so hard at the intrusion that the radio goes into the bathwater.'); return; }
      if (onLoo) {
        for (const o of g.sims) if (o.alive && o !== t && o !== s) changeRel(o, t, -5);
        g.log(`🚪📸 ${s.first} barges in while ${t.first} is on the toilet, takes a photo and posts it to the house group chat.`, 'evil');
      } else {
        g.log(`🚪 ${s.first} walks in on ${t.first} in the bath, sits on the edge and starts a long chat about taxes.`, 'evil');
      }
      t.endAction();
    } },
  { id: 'chewloud', label: 'Chew loudly right next to them', icon: '🍿', evil: true, approachSim: true, duration: 12,
    tick(s, t, g, a, m) { if (Math.random() < 0.3 * m) g.sfx('gulp'); },
    finish(s, t, g) {
      t.sanity = Math.max(0, t.sanity - 10);
      t.addNeed('fun', -12);
      changeRel(s, t, -12);
      s.addNeed('hunger', 10);
      g.log(`🍿 ${s.first} eats crisps with their mouth open, eight centimetres from ${t.first}'s ear. ${t.first}'s eye starts twitching.`, 'evil');
    } },
  { id: 'stinkhug', label: 'Give them a long, sweaty hug', icon: '🦨', evil: true, approachSim: true, duration: 8,
    available: s => s.needs.hygiene < 25,
    finish(s, t, g) {
      t.addNeed('hygiene', -45);
      t.addNeed('fun', -15);
      changeRel(s, t, -15);
      g.view.burst(t.x, t.z, 'stink');
      g.log(`🦨 ${s.first} hasn't washed in days and hugs ${t.first} for a very long time. ${t.first} now smells like ${s.first}.`, 'evil');
    } },
  { id: 'chat', label: 'Chat', icon: '💬', approachSim: true, duration: 20,
    tick(s, t, g, a, m) {
      s.addNeed('social', 1.2 * m); t.addNeed('social', 1 * m); changeRel(s, t, 0.3 * m);
      if (s.status.breath > 0) { t.addNeed('fun', -0.6 * m); t.addNeed('hygiene', -0.3 * m); }
      if (Math.random() < 0.12 * m) g.sfx('blah');
    } },
  { id: 'insult', label: 'Insult', icon: '🗯️', evil: true, approachSim: true, duration: 10,
    tick(s, t, g, a, m) { if (Math.random() < 0.3 * m) g.sfx('blah'); },
    finish(s, t, g) {
      changeRel(s, t, -16);
      t.addNeed('fun', -10);
      t.evil = Math.min(100, t.evil + 5);
      g.log(`🗯️ ${s.name} tells ${t.name} exactly what they think of them.`, 'evil');
      if (t.alive && Math.random() < (t.has('hotheaded') ? 0.6 : 0.1)) {
        t.queue.unshift(makeAction(FIGHT, s, 'auto'));
        g.log(`💢 ${t.first} is NOT letting that slide.`, 'evil');
      }
    } },
  FIGHT,
  // Getting a witness out of the way for a couple of hours. Guardians hate leaving their ward, unless
  // the ward is asleep.
  { id: 'errand', label: 'Send them out for pizza ($10)', icon: '🍕', approachSim: true, duration: 4,
    available: (s, t, g) => s === g.player && !asleep(t) && g.cash >= 10,
    finish(s, t, g) {
      const ward = t.houseRole && t.houseRole.ward !== null ? g.sims.find(x => x.id === t.houseRole.ward) : null;
      const clingy = ward && ward.alive && !asleep(ward) ? 0.5 : 1;
      const chance = Math.min(0.95, Math.max(0.1, (0.35 + (s.skills.charisma || 0) * 0.06 + t.relWith(s) / 200) * clingy));
      if (Math.random() > chance) {
        changeRel(s, t, -4);
        g.log(`🍕 ${t.first}: "${clingy < 1 ? `And leave ${ward.first} alone with you? No.` : 'Get it yourself.'}"`, 'dim');
        return;
      }
      spend(g, 10);
      t.endAction();
      t.queue = [];
      t.status.away = true;
      t.status.errand = 120;
      t.x = 10.5; t.z = -60;
      g.log(`🍕 ${s.first} hands ${t.first} a tenner for pizza. ${t.first} heads out. Back in about two hours.`, 'tool');
    } },
  { id: 'apologise', label: 'Apologise (grovel)', icon: '🙏', approachSim: true, duration: 8,
    available: (s, t) => t.relWith(s) < 20 || !!t.plan,
    finish(s, t, g) {
      changeRel(s, t, 10 * fade(s, t, 'apologise'));
      if (t.plan && t.plan.target === s.id) {
        if (Math.random() < Math.min(0.9, 0.35 + (s.skills.charisma || 0) * 0.06)) {
          g.callOff(t);
          g.log(`🙏 ${s.first} grovels. ${t.first} sighs: "Fine. But I'm watching you." (${t.first} has dropped their plan)`, 'tool');
        } else {
          g.log(`🙏 ${s.first} apologises. ${t.first}: "Sorry? We'll see how sorry you are."`, 'warn');
        }
        return;
      }
      g.log(`🙏 ${s.first} apologises to ${t.first}. It helps. A bit.`, 'dim');
    } },
  // Everyone's version of triangulation: tell them what their favourite housemate "said" about them.
  { id: 'gossip', label: 'Tell them what someone said about them', icon: '🗣️', evil: true, approachSim: true, duration: 8,
    available: (s, t, g) => !s.canUse('triangulate') && !!favourite(t, g, s),
    finish(s, t, g) {
      const fav = favourite(t, g, s);
      if (!fav) return;
      changeRel(t, fav, -18 * fade(s, t, 'gossip'));
      changeRel(s, t, 3);
      g.log(`🗣️ ${s.first} tells ${t.first} what ${fav.first} "said" about them. ${t.first}'s face goes very still.`, 'evil');
    } },
  { id: 'drink', label: 'Offer a "special" drink', icon: '🍹', evil: true, approachSim: true, duration: 10,
    finish(s, t, g) {
      if (s.rosterId === 'asraa' && t !== g.player) {
        // Nobody says no to Dr. Z, and nobody will ever find what was in it. It won't finish anyone off on
        // its own, though: it leaves them sick, dizzy and exhausted, ready for whatever comes next.
        t.status.poisoned += 45;
        t.status.untraceable = true;
        t.addNeed('energy', -25);
        t.sanity = Math.max(0, t.sanity - 10);
        changeRel(s, t, 10);
        g.sfx('gulp');
        g.log(`🍸 Dr. Asraa Z hands ${t.first} a cocktail with a smile. ${t.first} doesn't even think to hesitate. Soon they feel wonderful, then dizzy, then very, very tired.`, 'evil');
        return;
      }
      if (notices(t, g, 0.7)) {
        changeRel(s, t, -10);
        g.log(`👀 ${t.first} eyes the drink, then ${s.first}, and pours it into a plant.`, 'dim');
        g.becomeCareful(t, 'drink', `was offered a very suspicious drink by ${s.first}`);
        return;
      }
      t.status.poisoned += 60;
      changeRel(s, t, 5);
      g.sfx('gulp');
      g.log(`🍹 ${t.name} gulps down ${s.first}'s "special" drink. Delicious. Deadly?`, 'evil');
      // It shows up in their blood (or at the autopsy) if anyone saw it and tells the police.
      witnessCrime(g, s, [[s.cx, s.cz], [t.cx, t.cz]], `Spike ${t.first}'s drink`, { victim: t, proof: () => t.status.poisoned > 0 || (!t.alive && t.cause === 'Poison') });
    } },
  { id: 'sbd', label: 'Let one rip (silent but deadly)', icon: '💨', evil: true, approachSim: true, duration: 6,
    available: s => s.status.gassy > 0,
    finish(s, t, g) { fartCloud(g, s, 2.2); changeRel(s, t, -15); } },
  { id: 'story', label: 'Tell an endless story', icon: '🥱', evil: true, approachSim: true, duration: 120,
    start(s, t, g) {
      const topic = ['their crypto portfolio', 'a dream they had', 'their fantasy football league', 'the plot of a film nobody saw', 'their sourdough starter'][Math.floor(Math.random() * 5)];
      g.log(`🥱 ${s.name} starts telling ${t.name} about ${topic}. In detail. From the beginning.`, 'evil');
    },
    tick(s, t, g, a, m) {
      s.addNeed('social', 0.8 * m); s.addNeed('fun', 0.4 * m);
      t.addNeed('fun', -1.1 * m); t.addNeed('energy', -0.25 * m);
      if (Math.random() < 0.15 * m) g.sfx('blah');
      if (t.needs.fun <= 0) {
        t.health -= 0.8 * m;
        if (t.health <= 0) g.kill(t, 'Boredom');
      }
    } },
  ...tactics(),
  { id: 'race', label: 'Challenge to a pool race', icon: '🏁', approachSim: true, duration: 6,
    available: (s, t, g) => g.world.ladder.present,
    finish(s, t, g) {
      g.log(`🏁 ${s.name} challenges ${t.name} to a pool race. Neither will back down.`, 'dim');
      s.queue.unshift(makeAction(SWIM, g.world.ladder, 'player'));
      if (t.alive && !t.status.swimming) {
        t.endAction();
        t.queue.unshift(makeAction(SWIM, g.world.ladder, 'auto'));
      }
    } },
];

// Answering the front door. The sim stands just inside it; the visitors stay outside.
const atDoor = { spot: () => [10, 10], facePos: () => [10.5, 11.5] };
export const VISITOR_ACTIONS = [
  { id: 'slam', label: 'Slam the door in their faces', icon: '🚪', duration: 4, ...atDoor, kinds: ['witnesses', 'mormons', 'neighbour', 'salesman'],
    finish(s, t, g) { s.addNeed('fun', 12); g.log(`🚪 ${s.first} slams the door so hard a picture falls off the wall.`, 'dim'); visitorOutcome(g, 'slam'); } },
  { id: 'pamphlet', label: 'Accept a pamphlet', icon: '📖', duration: 10, ...atDoor, kinds: ['witnesses', 'mormons'],
    finish(s, t, g) { g.doom += 1; g.dismissVisitors(`📖 ${s.first} accepts a pamphlet titled "The End Is Nigh". Somewhere above, the sky takes it as a suggestion. (Doom ${g.doom})`); } },
  { id: 'doorchat', label: 'Chat on the doorstep', icon: '💬', duration: 25, ...atDoor, kinds: ['witnesses', 'mormons', 'neighbour', 'salesman'],
    tick(s, t, g, a, m) { s.addNeed('social', 1.2 * m); if (Math.random() < 0.15 * m) g.sfx('blah'); },
    finish(s, t, g) { visitorOutcome(g, 'chat'); } },
  { id: 'sellcutlery', label: 'Sell him the old cutlery', icon: '🔪', duration: 10, ...atDoor, kinds: ['salesman'],
    finish(s, t, g) {
      g.cash += 25;
      g.log(`🔪 ${s.first} sells the knife salesman the house's old cutlery. Nobody will be able to eat soup. (💵 +$25)`, 'tool');
      visitorOutcome(g, 'bought');
    } },
  { id: 'rudevisit', label: 'Tell them to get off your lawn', icon: '🗯️', evil: true, duration: 5, ...atDoor, kinds: ['witnesses', 'mormons', 'neighbour', 'salesman', 'cop'],
    finish(s, t, g) { s.addNeed('fun', 10); visitorOutcome(g, 'insult'); } },
  { id: 'gasvisit', label: 'Let one rip on the doorstep', icon: '💨', evil: true, duration: 4, ...atDoor, kinds: ['witnesses', 'mormons', 'neighbour', 'salesman', 'cop'],
    available: s => s.status.gassy > 0,
    finish(s, t, g) { fartCloud(g, s, 1); visitorOutcome(g, 'gassed'); } },
  { id: 'hugvisit', label: 'Greet them with a long, sweaty hug', icon: '🦨', evil: true, duration: 6, ...atDoor, kinds: ['witnesses', 'mormons', 'neighbour', 'salesman', 'cop'],
    available: s => s.needs.hygiene < 25,
    finish(s, t, g) { visitorOutcome(g, 'stench'); } },
  { id: 'charmcop', label: 'Charm the officer', icon: '😘', duration: 15, ...atDoor, kinds: ['cop'], available: s => s.canUse('lure'),
    finish(s, t, g) {
      if (s.rosterId === 'asraa') {
        g.suspicion = Math.max(0, g.suspicion - 40);
        g.dismissVisitors('⚖️ Dr. Asraa Z, the law firm\'s favourite expert witness, explains every death in such dazzling detail that Officer Plod apologises for bothering her. (-40 suspicion)');
        return;
      }
      g.suspicion = Math.max(0, g.suspicion - 25);
      g.dismissVisitors(`😘 ${s.first} flirts with Officer Plod until he forgets why he came. (-25 suspicion)`);
    } },
  { id: 'answercop', label: "Answer the officer's questions", icon: '🗣️', duration: 15, ...atDoor, kinds: ['cop'],
    finish(s, t, g) {
      if (s.has('genius') || s.personality === 'schemer') {
        g.suspicion = Math.max(0, g.suspicion - 10);
        g.dismissVisitors(`🗣️ ${s.first} lies smoothly and convincingly. Officer Plod leaves satisfied. (-10 suspicion)`);
      } else {
        g.addSuspicion(8);
        g.dismissVisitors(`🗣️ ${s.first} answers every question with a question. Officer Plod writes a LOT down. (+8 suspicion)`);
      }
    } },
];

// Talking to the emergency services. Any conversation keeps the responder rooted to the spot.
const nearResponder = { spot: (s, t, g) => responderSpot(g, t), facePos: (s, t) => [t.x, t.z] };
const hold = (s, t) => { t.pause = Math.max(t.pause, 0.5); };
const searching = (s, t, g) => !!g.investigation && g.investigation.detective === t && g.investigation.state === 'searching';
export const RESPONDER_ACTIONS = [
  { id: 'flirtfire', label: 'Flirt with the firefighter', icon: '😍', evil: true, duration: 30, ...nearResponder, kinds: ['firefighter'],
    tick(s, t, g, a, m) { hold(s, t); s.addNeed('social', 1 * m); s.addNeed('fun', 0.6 * m); },
    finish(s, t, g) { g.log(`😍 ${s.first} keeps ${t.title} chatting about his charity calendar while the house burns behind him.`, 'evil'); } },
  { id: 'beer', label: 'Offer them a beer', icon: '🍺', duration: 5, ...nearResponder, kinds: ['biker'],
    available: (s, t) => !t.beaten.has(s.id),
    finish(s, t, g) {
      t.beaten.add(s.id);
      if (t.target === s) t.target = null;
      g.log(`🍺 ${s.first} hands ${t.first} a beer. ${t.first} decides ${s.first} is "alright, actually" and goes to hit someone else.`, 'tool');
    } },
  { id: 'coffee', label: 'Offer him a coffee', icon: '☕', duration: 10, ...nearResponder, kinds: ['detective'], available: searching, tick: hold,
    finish(s, t, g) { t.pause = 45; g.log(`☕ ${s.first} hands ${t.title} a coffee. He stops to enjoy it. That buys about 45 minutes.`, 'tool'); } },
  { id: 'charmdet', label: 'Charm the inspector', icon: '😘', duration: 15, ...nearResponder, kinds: ['detective'], tick: hold,
    available: (s, t, g) => searching(s, t, g) && s.canUse('lure'),
    finish(s, t, g) {
      if (s.rosterId === 'asraa') {
        if (g.contract) g.suspicion = Math.max(0, g.suspicion - 30);
        g.endInvestigation(`⚖️ Dr. Asraa Z reviews the inspector's warrant, finds eleven procedural errors and a typo, and walks him to his car. He apologises twice.${g.contract ? ' (-30 suspicion)' : ''}`);
        return;
      }
      if (g.contract) g.suspicion = Math.max(0, g.suspicion - 10);
      if (g.investigation) g.investigation.plan.shift();
      g.log(`😘 ${s.first} flirts with ${t.title} until he forgets what he was about to check.${g.contract ? ' (-10 suspicion)' : ''}`, 'tool');
    } },
  { id: 'ramble', label: 'Tell him a very long story', icon: '🗣️', duration: 40, ...nearResponder, kinds: ['detective'], tick: hold,
    available: (s, t, g) => searching(s, t, g) && s.rosterId === 'adam',
    finish(s, t, g) { g.endInvestigation(`🗣️ Forty minutes into ${s.first}'s story about a dream he had in 2004, ${t.title} remembers an urgent appointment. Anywhere else.`); } },
  { id: 'spoofradio', label: 'Spoof his police radio', icon: '📻', duration: 8, ...nearResponder, kinds: ['detective'], tick: hold,
    available: (s, t, g) => searching(s, t, g) && s.rosterId === 'daniel',
    finish(s, t, g) { g.endInvestigation(`📻 ${s.first} patches into the police radio: "All units, a cat is stuck up a tree across town." ${t.title} sprints for his car.`); } },
];

// Somebody has to clean up. They'll remember who made the mess.
export const CLEAN = {
  id: 'clean', label: 'Clean up the mess', icon: '🧽', duration: 8, spot: (s, m) => [m.x, m.z], facePos: () => null,
  available: (s, m, g) => g.world.mess.has(m.key),
  finish(s, m, g) {
    if (!g.world.mess.has(m.key)) return;
    g.world.removeMess(m);
    s.addNeed('fun', -4);
    const culprit = g.sims.find(o => o.id === m.by && o !== s);
    if (culprit) changeRel(s, culprit, -6);
  },
};

// Lobbing things over the fence at the neighbours' houses.
const fenceSpot = (s, t) => (t.side === 'west' ? [0, 13] : [GRID_W - 1, 13]);
const home = (s, t, g) => g.neighbours[t.side].state === 'home';
const family = (t, g) => g.neighbours[t.side].family.name;
export const HOUSE_ACTIONS = [
  { id: 'egg', label: 'Egg their house', icon: '🥚', evil: true, duration: 10, spot: fenceSpot, available: home,
    facePos: (s, t) => [t.side === 'west' ? -9 : GRID_W + 9, 9],
    finish(s, t, g) {
      s.addNeed('fun', 20);
      g.annoyNeighbour(t.side, 25, `🥚 ${s.first} lobs a dozen eggs over the fence at the ${family(t, g)}s' house. One goes straight through the kitchen window.`);
    } },
  { id: 'gift', label: 'Toss a fruit basket over the fence', icon: '🧺', duration: 8, spot: fenceSpot, available: home,
    facePos: (s, t) => [t.side === 'west' ? -9 : GRID_W + 9, 9],
    finish(s, t, g) { g.pleaseNeighbour(t.side, 20, `🧺 ${s.first} tosses a fruit basket over the fence. The ${family(t, g)}s are touched, if slightly bruised.`); } },
];

const tombSpot = (s, t, g) => s.adjacentTo({ cx: t.x, cz: t.z }, g.world);
export const TOMB_ACTIONS = [
  { id: 'dance', label: 'Dance on the grave', icon: '💃', evil: true, duration: 30, spot: tombSpot,
    facePos: (s, t) => [t.x + 0.5, t.z + 0.5],
    tick(s, t, g, a, m) { s.addNeed('fun', 1.2 * m); s.evil = Math.min(100, s.evil + 0.05 * m); } },
  { id: 'mourn', label: 'Pretend to mourn', icon: '🥀', duration: 25, spot: tombSpot,
    facePos: (s, t) => [t.x + 0.5, t.z + 0.5],
    tick(s, t, g, a, m) { s.addNeed('social', 0.8 * m); } },
];

// ---------- sabotage: the dirty work, done in person ----------
// Your character walks over and does it. It costs cash (see TOOLS in traps.js), some jobs need a skill,
// and anyone who sees it happen remembers. The other roommates have their own, free, nastier versions.

const doorCells = d => (d.axis === 'x' ? [[d.at - 1, d.pos], [d.at, d.pos]] : [[d.pos, d.at - 1], [d.pos, d.at]]);
const objCells = o => (o.cells.length ? o.cells : [o.use]);
const objSpot = o => o.use || null;

function job(key, label, icon, spot, cells, run, { face = null, time = null, valid = null } = {}) {
  return {
    id: 'sab-' + key, key, label, icon, evil: true, sabotage: true, cells,
    duration: time ?? TOOLS[key].time, spot: (s, t, g) => (typeof spot === 'function' ? spot(g) : spot),
    facePos: () => face,
    finish(s, t, g) {
      if (valid && !valid()) { g.log(`${s.first} can't do that there any more.`, 'dim'); return; }
      const price = toolPrice(g, key);
      if (!spend(g, price)) { g.log(`💸 ${s.first} can't afford that ($${price}).`, 'dim'); return; }
      const before = new Set(evidenceIds(g));
      run(s);
      if (t && t.type) t.rigger = s.id; // so your own free will knows to keep away from it
      g.sfx('power');
      // Anyone watching decides what to do about it (crime.js). Tidying up is only embarrassing.
      if (key === 'cleanup') witnessCleanup(g, s, cells, label);
      else witnessCrime(g, s, cells, label, { ids: evidenceIds(g).filter(id => !before.has(id)), obj: t && t.type ? t : null });
    },
  };
}

// Planting a floor trap: walk to the tile, put it down, remember not to step on it yourself.
export function plantDef(g, id, cell) {
  const t = TRAPS.find(tt => tt.id === id);
  return job(id, `Plant a ${t.name.toLowerCase()}`, t.icon, cell, [cell], s => {
    g.world.addTrap(id, cell[0], cell[1], id === 'wax' ? 3 : 1);
    g.world.trapAt(...cell).owner = s.id;
    g.log({ wax: `🧽 ${s.first} waxes a patch of floor to a mirror shine.`, beartrap: `🪤 ${s.first} hides a bear trap in the grass.`,
      peel: `🍌 ${s.first} places a banana peel with loving precision.` }[id], 'tool');
  }, { valid: () => canPlaceFloorTrap(g, id, ...cell) });
}

export function sabotageFor(pick, g) {
  const out = [], w = g.world;
  const add = d => out.push(d);
  const ladder = w.ladder;
  if (pick.kind === 'object') {
    const o = pick.obj, at = objSpot(o), cells = objCells(o), face = objCenter(o.cells.length ? o : { cells: [o.use] });
    const opt = { face };
    if (at) {
      if ((o.type === 'stove' || o.type === 'grill') && !o.charred && !o.sabotaged) {
        add(job('gas', 'Loosen the gas valve', '🔧', at, cells, s => { o.sabotaged = true; g.log(`🔧 ${s.first} quietly loosens the ${o.name}'s gas valve.`, 'tool'); }, opt));
      }
      if ((o.type === 'tv' || o.type === 'tub') && !o.charred && !o.sabotaged) {
        add(job('wiring', 'Fray the wiring', '⚡', at, cells, s => { o.sabotaged = true; g.log(`⚡ ${s.first} strips the wiring behind the ${o.name}. Very carefully.`, 'tool'); }, opt));
      }
      if (o.type === 'fridge' && !o.charred && !o.poisoned) {
        add(job('spoil', 'Poison the leftovers', '🧪', at, cells, s => { o.poisoned = 2; o.poisonedBy = s.id; g.log(`🧪 ${s.first} laces the leftovers with something foul.`, 'tool'); }, opt));
      }
      if (o.type === 'fridge' && !o.charred && !o.chili) {
        add(job('chili', "Swap in Grandma's chili", '🫘', at, cells, s => { o.chili = 2; g.log(`🫘 ${s.first} puts a suspicious pot of three-bean chili in the fridge.`, 'tool'); }, opt));
      }
      if (o.type === 'mailbox' && !o.bomb) {
        add(job('letterbomb', 'Post a letter bomb', '📬', at, cells, s => { o.bomb = true; o.flagUp = true; g.log(`📬 ${s.first} slips a quietly ticking parcel into the mailbox and raises the flag.`, 'tool'); }, opt));
      }
      if (o.type === 'mailbox' && !(g.oilSlick > g.clock)) {
        add(job('brakes', 'Pour oil on the road', '🛢️', at, cells, s => {
          g.oilSlick = g.clock + 180;
          g.log(`🛢️ ${s.first} pours a can of oil across the road. For the next few hours, passing cars may end up in the front garden.`, 'tool');
        }, opt));
      }
      if (o.type === 'mailbox' && !g.gang) {
        add(job('bikers', "Post a 'FREE BEER' flyer to the biker club", '🏍️', at, [], s => {
          summonGang(g, `${s.first} posts a flyer promising FREE BEER at this address to the local biker club.`);
        }, opt));
      }
      if (o.type === 'bookshelf' && !o.charred && !o.wobbly && !o.toppled) {
        add(job('bookshelf', 'Unscrew the wall brackets', '📚', at, cells, s => { o.wobbly = true; g.log(`📚 ${s.first} unscrews the bookshelf's wall brackets. It leans, ever so slightly.`, 'tool'); }, opt));
      }
      if ((o.type === 'fireplace' || o.type === 'grill') && !o.charred && !o.fireworks && !(o.lit > 0)) {
        add(job('fireworks', 'Hide fireworks inside', '🎆', at, cells, s => { o.fireworks = true; g.log(`🎆 ${s.first} tucks a bundle of fireworks into the ${o.name}.`, 'tool'); }, opt));
      }
      if (o.type === 'candles' && !o.charred && !o.sabotaged) {
        add(job('candles', 'Light them and nudge them under the towels', '🕯️', at, cells, s => {
          o.sabotaged = true; o.lit = Math.max(o.lit || 0, 240);
          g.log(`🕯️ ${s.first} lights the scented candles and nudges them right up against the towels.`, 'tool');
        }, opt));
      }
      if (o.type === 'vanity' && !o.charred && !o.sabotaged) {
        add(job('hairspray', 'Swap in extra-hold hairspray', '💇', at, cells, s => { o.sabotaged = true; g.log(`💇 ${s.first} swaps the hairspray for EXTRA HOLD. Extra flammable.`, 'tool'); }, opt));
      }
      if (o.type === 'stove' && !o.charred && !o.flour) {
        add(job('flour', 'Dust the kitchen with flour', '🍞', at, cells, s => { o.flour = true; g.log(`🍞 ${s.first} shakes a bag of flour into the air. It settles on everything.`, 'tool'); }, opt));
      }
      if (o.type === 'shed' && !o.charred && !o.sabotaged) {
        add(job('torch', "Slit the weed torch's gas hose", '🌿', at, cells, s => { o.sabotaged = true; g.log(`🌿 ${s.first} puts a neat little slit in the weed torch's gas hose.`, 'tool'); }, opt));
      }
      // Tidying up after yourself.
      const fixes = [];
      if (o.sabotaged) fixes.push(() => { o.sabotaged = false; });
      if (o.flour) fixes.push(() => { o.flour = false; });
      if (o.poisoned > 0) fixes.push(() => { o.poisoned = 0; o.untraceable = false; });
      if (o.chili > 0) fixes.push(() => { o.chili = 0; });
      if (o.fireworks) fixes.push(() => { o.fireworks = false; });
      if (o.bomb) fixes.push(() => { o.bomb = false; o.flagUp = false; });
      if (o.wobbly && !o.toppled) fixes.push(() => { o.wobbly = false; });
      if (fixes.length) {
        add(job('cleanup', 'Wipe away the evidence', '🧹', at, cells, s => {
          fixes.forEach(f => f());
          g.log(`🧹 ${s.first} wipes the ${o.name} clean of fingerprints, residue and intent.`, 'tool');
        }, opt));
      }
    }
    if (o.type === 'ladder') pick = { kind: 'pool' };
  }
  if (pick.kind === 'pool') {
    const cells = [ladder.use, ladder.entry], face = [ladder.entry[0] + 0.5, ladder.entry[1] + 0.5];
    if (ladder.present) add(job('ladder', 'Hide the pool ladder', '🪜', ladder.use, cells, () => g.toggleLadder(), { face }));
    else add(job('ladder', 'Put the ladder back', '🪜', ladder.use, [], () => g.toggleLadder(), { face }));
    if (!w.piranhas) {
      add(job('piranhas', 'Release piranhas', '🐟', ladder.use, cells, s => { w.piranhas = true; g.log(`🐟 ${s.first} tips a bucket of something small and toothy into the pool.`, 'tool'); }, { face }));
    } else {
      add(job('cleanup', 'Net the piranhas', '🧹', ladder.use, cells, s => {
        w.piranhas = false; w.piranhasKnown = false;
        g.log(`🧹 ${s.first} nets the piranhas and tips them into the neighbour's koi pond.`, 'tool');
      }, { face, time: 20 }));
    }
  } else if (pick.kind === 'tomb' && !pick.tomb.ghost) {
    const t = pick.tomb, spot = w.nearestWalkable(t.x, Math.min(t.z + 1, 15));
    add(job('ghost', 'Hold a séance at the grave', '👻', spot, [], s => { t.ghost = true; g.log(`👻 ${s.first} holds a séance over ${t.name}'s grave. Something stirs. It will walk at night.`, 'tool'); }, { face: [t.x + 0.5, t.z + 0.5] }));
  } else if (pick.kind === 'door') {
    const d = pick.door, cells = doorCells(d), spot = cells[0], face = [(cells[0][0] + cells[1][0]) / 2 + 0.5, (cells[0][1] + cells[1][1]) / 2 + 0.5];
    if (d.bricked && !d.hackLocked) add(job('cleanup', 'Knock the wall back out', '🚪', spot, cells, () => g.toggleDoor(d.id), { face, time: 20 }));
    else if (!d.bricked) add(job('brick', 'Brick up the doorway', '🧱', spot, cells, () => g.toggleDoor(d.id), { face }));
  } else if (pick.kind === 'floor') {
    const t = w.trapAt(...pick.cell);
    if (t) {
      add(job('cleanup', 'Remove the hidden trap', '🧹', pick.cell, [pick.cell], s => {
        w.removeTrap(t);
        g.log({ wax: `🧹 ${s.first} scuffs the waxed floor back to boring, safe dullness.`, peel: `🧹 ${s.first} puts the banana peel in the bin.`,
          beartrap: `🧹 ${s.first} pulls the bear trap out of the lawn and hides it in the shed.` }[t.type], 'tool');
      }));
    }
  }
  return out;
}

// What doing this to someone is likely to achieve, shown under the menu entry.
const HINTS = {
  chat: 'They like you a bit more', insult: 'They like you less; hotheads may swing', fight: 'Whoever hits harder wins. Could be you.',
  gaslight: 'Confuses them. Confused people have accidents', triangulate: 'Turns them against their favourite housemate',
  lovebomb: 'They adore you, until the discard', smear: 'Everyone else likes them less', scene: 'Ruins their fun; may start fights nearby',
  guilttrip: 'Sends them straight to the stove', lure: 'They follow you anywhere for a while', joke: 'Hurts. They might die laughing',
  playtest: 'Drains their sanity at the computer', silent: 'Drains their fun and social life', story: 'Bores them. Slowly lethal if they are already bored',
  drink: 'Poisons them, unless they notice', note: 'Petty. Lowers their fun', tickle: 'Hurts a little; may start a fight',
  airhorn: 'Could stop a weak heart', whisper: 'Costs them sanity and sleep', barge: 'Humiliates them', chewloud: 'Drives them slowly mad',
  stinkhug: 'Now they smell too', sbd: 'A gas cloud that hurts everyone near but you',
  errand: 'Out of the house for about two hours. Harder if they are guarding someone awake',
  apologise: 'They like you more. May talk them out of a grudge', slipper: '20 damage, from across the room',
  gossip: 'Turns them against their favourite housemate',
  breathe: s => (s.status.breath > 0 ? 'Hurts. Worst when they are asleep' : 'Just gross. Brush with the toilet brush first'),
};

// Builds the pie-menu entries for whatever the player clicked.
export function menuFor(pick, sim, game) {
  const items = [];
  const add = (def, target) => {
    if (!sim || !sim.alive) return;
    const label = typeof def.label === 'function' ? def.label(sim, target) : def.label;
    if (def.available && !def.available(sim, target, game)) {
      const why = def.whyNot && def.whyNot(sim, target, game);
      if (why) items.push({ label, icon: def.icon, evil: def.evil, disabled: true, note: why, run: () => {} });
      return;
    }
    // Doing something nasty to a roommate in front of the others is noted.
    const hint = typeof HINTS[def.id] === 'function' ? HINTS[def.id](sim, target, game) : HINTS[def.id];
    const seen = def.approachSim && def.evil ? game.witnesses([[target.cx, target.cz]]).filter(x => x !== sim && x !== target) : [];
    const note = [hint, seen.length ? `👀 ${[...new Set(seen.map(x => x.first))].join(', ')} can see you` : ''].filter(Boolean).join(' · ');
    items.push({ label, icon: def.icon, evil: def.evil, note, warn: seen.length > 0, run: () => sim.enqueue(def, target, 'player') });
  };

  switch (pick.kind) {
    case 'object':
      (OBJECT_ACTIONS[pick.obj.type] || []).forEach(d => add(d, pick.obj));
      break;
    case 'pool':
      add(SWIM, POOL_OBJ);
      break;
    case 'sim':
      if (sim && pick.sim !== sim && pick.sim.alive) SIM_ACTIONS.forEach(d => add(d, pick.sim));
      break;
    case 'floor':
      add(WALK, { cell: pick.cell });
      break;
    case 'tomb':
      TOMB_ACTIONS.forEach(d => add(d, pick.tomb));
      break;
    case 'visitor':
      if (game.visit && game.visit.state !== 'leave') VISITOR_ACTIONS.filter(d => d.kinds.includes(game.visit.kind)).forEach(d => add(d, game.visit));
      break;
    case 'house':
      HOUSE_ACTIONS.forEach(d => add(d, { side: pick.side }));
      break;
    case 'mess':
      add(CLEAN, pick.mess);
      break;
    case 'responder':
      RESPONDER_ACTIONS.filter(d => d.kinds.includes(pick.person.kind)).forEach(d => add(d, pick.person));
      break;
  }

  // Your own dirty work: priced, skill-gated, and flagged if someone is watching.
  if (sim && sim === game.player && !sim.status.away) {
    for (const d of sabotageFor(pick, game)) {
      if (!game.owns(d.key)) {
        items.push({ label: d.label, icon: d.icon, sabotage: true, note: '🔒 Buy on the black market', disabled: true, run: () => {} });
        continue;
      }
      const price = toolPrice(game, d.key), lock = toolLock(sim, d.key);
      const seen = d.cells.length ? game.witnesses(d.cells).filter(x => x !== sim) : [];
      const cop = seen.find(x => x.kind === 'detective' || x.visitKind === 'cop');
      const note = lock || `${price ? `$${price}` : 'free'}${cop ? ` · 🚔 ${cop.title || cop.first} is watching!` : seen.length ? ` · 👀 ${[...new Set(seen.map(x => x.first))].join(', ')} watching` : ''}`;
      const broke = game.cash < price;
      items.push({ label: d.label, icon: d.icon, evil: true, sabotage: true, note: broke && !lock ? `$${price} · can't afford` : note,
        disabled: !!lock || broke, warn: seen.length > 0, run: () => sim.enqueue(d, pick.obj || pick.door || pick.tomb || null, 'player') });
    }
  }
  return items;
}

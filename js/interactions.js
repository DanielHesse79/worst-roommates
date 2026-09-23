// Every interaction a sim can perform, plus "hand of fate" god actions.
// Def shape: { id, label, icon, evil?, duration (min | fn), spot(sim,target,game) -> [x,z],
//   approachSim?, available?, start?, tick?(s,t,g,a,min), finish?, facePos? }
import { triggerFireworks, openMail, fartCloud, dustExplosion } from './traps.js';
import { responderSpot } from './emergency.js';

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
  return Math.random() < (s.has('paranoid') ? paranoidChance : 0) + (g.wary ? 0.35 : 0);
}
// Sets a few lawn cells around a sim alight (weed torches, mostly).
function lawnFire(g, s, n) {
  const cells = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].sort(() => Math.random() - 0.5);
  for (const [dx, dz] of cells) if (n > 0 && g.world.ignite(s.cx + dx, s.cz + dz, true)) n--;
}
function learn(s, skill) {
  const gain = s.has('genius') ? 2 : s.has('lazy') ? 0.5 : 1;
  s.skills[skill] = Math.min(10, s.skills[skill] + gain);
}
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
      tick(s, o, g, a, m) { s.addNeed('hunger', (s.has('glutton') ? 2 : 1.6) * m); } },
    { id: 'poison', label: 'Poison the leftovers', icon: '🧪', evil: true, duration: 15, spot: useSpot,
      available: (s, o) => !o.charred && !o.poisoned,
      finish(s, o, g) {
        o.poisoned = 3; o.poisonedBy = s.id;
        s.evil = Math.min(100, s.evil + 5);
        g.log(`🧪 ${s.name} laces the leftovers with something foul.`, 'evil');
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
      tick(s, o, g, a) {
        once(a, 'roll', 15, () => {
          if (o.flour) { dustExplosion(g, s, o); return; }
          if (Math.random() < risk(s, 0.3 - 0.04 * s.skills.cooking, o, g)) {
            g.world.ignite(o.cells[0][0], o.cells[0][1]);
            s.status.onFire = 60;
            g.view.burst(s.x, s.z, 'explosion');
            g.log(`🔥 ${s.name}'s cooking bursts into flames, and so does ${s.first}!`, 'evil');
            g.sfx('fire');
            s.endAction();
          }
        });
      },
      finish(s, o, g) { s.addNeed('hunger', 60); learn(s, 'cooking'); g.log(`${s.first} cooks a surprisingly edible meal.`, 'dim'); } },
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
    { id: 'hair', label: 'Do your hair (lots of hairspray)', icon: '💇', duration: 20, spot: useSpot, available: (s, o) => !o.charred,
      tick(s, o, g, a, m) { s.addNeed('hygiene', 1.2 * m); s.addNeed('fun', 0.4 * m); },
      finish(s, o, g) {
        // Hairspray lingers: anywhere near a flame for the next few hours and they go up like a torch.
        const extra = !!o.sabotaged;
        o.sabotaged = false;
        s.status.hairspray = extra ? 240 : 120;
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
          } else if (Math.random() < risk(s, 0.12, null, g)) {
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
      start(s, o, g) { if (triggerFireworks(g, o)) return false; },
      tick(s, o, g, a) {
        once(a, 'roll', 12, () => {
          if (Math.random() < risk(s, 0.22 - 0.03 * s.skills.cooking, o, g)) {
            g.world.ignite(o.cells[0][0], o.cells[0][1]);
            g.log(`🔥 The grill erupts in a fireball right in ${s.first}'s face!`, 'evil');
            g.sfx('fire');
            s.status.onFire = 30;
            s.endAction();
          }
        });
      },
      finish(s, o, g) { s.addNeed('hunger', 55); learn(s, 'cooking'); } },
  ],
  tv: [
    { id: 'watch', label: 'Watch TV', icon: '📺', duration: 60, spot: useSpot, available: (s, o) => !o.charred && !o.broken,
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
        s.addNeed('energy', 0.35 * m); s.health = Math.min(100, s.health + 0.08 * m);
        if (s.needs.hunger < 12 && a.source === 'auto') s.endAction(); // woken by a growling stomach
      } },
    { id: 'nap', label: 'Nap', icon: '💤', duration: 60, spot: useSpot, available: canSleepIn, whyNot: bedWhyNot,
      tick(s, o, g, a, m) { s.addNeed('energy', 0.35 * m); } },
  ],
  computer: [
    { id: 'scheme', label: 'Scheme online', icon: '😈', duration: 45, spot: useSpot, available: (s, o) => !o.charred,
      tick(s, o, g, a, m) { s.addNeed('fun', 0.8 * m); s.addNeed('social', 0.3 * m); s.evil = Math.min(100, s.evil + 0.1 * m); } },
    { id: 'devgame', label: 'Make an obscure indie game', icon: '🕹️', duration: 90, spot: useSpot,
      available: (s, o) => !o.charred && s.rosterId === 'daniel',
      tick(s, o, g, a, m) { s.addNeed('fun', 0.6 * m); },
      finish(s, o, g) {
        if (g.contract) g.malice += 20;
        g.log(`🕹️ ${s.first} releases "${say(GAMES)}". It sells three copies and one refund.${g.contract ? ' (+20 😈)' : ''}`, 'tool');
      } },
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
    { id: 'stargaze', label: 'Stargaze', icon: '🔭', duration: 50, spot: useSpot,
      available: (s, o, g) => g.isNight, whyNot: (s, o, g) => (g.isNight ? null : 'Only at night (20:00–05:00)'),
      tick(s, o, g, a, m) {
        s.addNeed('fun', 1 * m);
        const p = 0.0002 * (1 + g.doom) * (s.has('stargazer') ? 2 : 1);
        if (Math.random() < p * m) g.meteorStrike(s);
      } },
    { id: 'taunt', label: 'Taunt the heavens', icon: '🌠', evil: true, duration: 20, spot: useSpot,
      available: (s, o, g) => g.isNight, whyNot: (s, o, g) => (g.isNight ? null : 'Only at night (20:00–05:00)'),
      finish(s, o, g) {
        if (Math.random() < 0.2 + 0.1 * g.doom) g.meteorStrike(s);
        else { g.doom += 0.5; g.log(`🌠 ${s.name} shakes a fist at the sky. The sky takes note.`, 'evil'); }
      } },
  ],
  bookshelf: [
    { id: 'read', label: 'Read a trashy novel', icon: '📖', duration: 40, spot: useSpot, available: (s, o) => !o.charred && !o.toppled,
      tick(s, o, g, a, m) { s.addNeed('fun', 0.8 * m); } },
  ],
  mailbox: [
    { id: 'mail', label: 'Check the mail', icon: '📬', duration: 8, spot: useSpot,
      finish(s, o, g) { openMail(g, s, o); } },
  ],
  pool: [SWIM],
  ladder: [SWIM],
};

for (const list of Object.values(OBJECT_ACTIONS)) {
  for (const d of list) if (!d.facePos) d.facePos = (s, o) => (o.cells && o.cells.length ? objCenter(o) : null);
}

// ---------- manipulation tactics (only sims with the matching personality can use them) ----------

const say = arr => arr[Math.floor(Math.random() * arr.length)];
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
        t.sanity = Math.max(0, t.sanity - (t.has('genius') ? 12 : 24));
        g.log(`🌀 ${s.first} to ${t.first}: "${say(GASLIGHT)}"`, 'evil');
        if (wasFine && t.confused) g.log(`🌀 ${t.name} no longer trusts their own memory. Confused sims have far more accidents.`, 'warn');
      } },
    { id: 'triangulate', label: 'Triangulate', icon: '🔺', evil: true, approachSim: true, duration: 15,
      available: (s, t, g) => s.canUse('triangulate') && others(g, s, t).length > 0, tick: blah,
      finish(s, t, g) {
        const third = others(g, s, t).sort((a, b) => t.relWith(b) - t.relWith(a))[0];
        if (!third) return;
        changeRel(t, third, -28);
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
        for (const o of others(g, s, t)) changeRel(o, t, -18);
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
        t.status.follow = { leader: s, until: g.clock + 150 };
        g.log(`😘 ${s.first} winks at ${t.first}. ${t.first} would follow ${s.first} anywhere. Literally anywhere.`, 'evil');
      } },
    { id: 'joke', label: 'Tell a killer joke', icon: '😂', evil: true, approachSim: true, duration: 8,
      available: s => s.canUse('joke'),
      finish(s, t, g) {
        g.log(`😂 ${s.first}: "${say(JOKES)}"`, 'evil');
        t.addNeed('fun', 25);
        const dmg = rand(14, 26) * (t.needs.energy < 30 ? 1.5 : 1);
        t.health -= dmg;
        g.popup(t, 'HA' + 'HA'.repeat(Math.floor(dmg / 10)), '#ffe14a');
        g.sfx('blah');
        if (t.health <= 0) g.kill(t, 'Laughter');
        else g.log(`😂 ${t.first} laughs until they can't breathe. (-${Math.round(dmg)} health)`, 'dim');
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
  { id: 'chat', label: 'Chat', icon: '💬', approachSim: true, duration: 20,
    tick(s, t, g, a, m) {
      s.addNeed('social', 1.2 * m); t.addNeed('social', 1 * m); changeRel(s, t, 0.3 * m);
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
  { id: 'drink', label: 'Offer a "special" drink', icon: '🍹', evil: true, approachSim: true, duration: 10,
    finish(s, t, g) {
      if (s.rosterId === 'asraa') {
        // Nobody says no to Dr. Z, and nobody will ever find what was in it.
        t.status.poisoned += 110;
        t.status.untraceable = true;
        changeRel(s, t, 10);
        g.sfx('gulp');
        g.log(`🍸 Dr. Asraa Z hands ${t.first} a cocktail with a smile. ${t.first} doesn't even think to hesitate.`, 'evil');
        return;
      }
      if (notices(t, g, 0.7)) {
        changeRel(s, t, -10);
        g.log(`👀 ${t.first} eyes the drink, then ${s.first}, and pours it into a plant.`, 'dim');
        return;
      }
      t.status.poisoned += 60;
      changeRel(s, t, 5);
      g.sfx('gulp');
      g.log(`🍹 ${t.name} gulps down ${s.first}'s "special" drink. Delicious. Deadly?`, 'evil');
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
  { id: 'slam', label: 'Slam the door in their faces', icon: '🚪', duration: 4, ...atDoor, kinds: ['witnesses', 'mormons', 'neighbour'],
    finish(s, t, g) { s.addNeed('fun', 12); g.dismissVisitors(`🚪 ${s.first} slams the door so hard a picture falls off the wall.`); } },
  { id: 'pamphlet', label: 'Accept a pamphlet', icon: '📖', duration: 10, ...atDoor, kinds: ['witnesses', 'mormons'],
    finish(s, t, g) { g.doom += 1; g.dismissVisitors(`📖 ${s.first} accepts a pamphlet titled "The End Is Nigh". Somewhere above, the sky takes it as a suggestion. (Doom ${g.doom})`); } },
  { id: 'doorchat', label: 'Chat on the doorstep', icon: '💬', duration: 25, ...atDoor, kinds: ['witnesses', 'mormons', 'neighbour'],
    tick(s, t, g, a, m) { s.addNeed('social', 1.2 * m); if (Math.random() < 0.15 * m) g.sfx('blah'); },
    finish(s, t, g) { g.dismissVisitors(`💬 ${s.first} chats until the visitors run out of things to say. They leave, slightly traumatised.`); } },
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
  { id: 'coffee', label: 'Offer him a coffee', icon: '☕', duration: 10, ...nearResponder, kinds: ['detective'], available: searching, tick: hold,
    finish(s, t, g) { t.pause = 45; g.log(`☕ ${s.first} hands Inspector Gumshoe a coffee. He stops to enjoy it. That buys about 45 minutes.`, 'tool'); } },
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
      g.log(`😘 ${s.first} flirts with Inspector Gumshoe until he forgets what he was about to check.${g.contract ? ' (-10 suspicion)' : ''}`, 'tool');
    } },
  { id: 'ramble', label: 'Tell him a very long story', icon: '🗣️', duration: 40, ...nearResponder, kinds: ['detective'], tick: hold,
    available: (s, t, g) => searching(s, t, g) && s.rosterId === 'adam',
    finish(s, t, g) { g.endInvestigation(`🗣️ Forty minutes into ${s.first}'s story about a dream he had in 2004, Inspector Gumshoe remembers an urgent appointment. Anywhere else.`); } },
  { id: 'spoofradio', label: 'Spoof his police radio', icon: '📻', duration: 8, ...nearResponder, kinds: ['detective'], tick: hold,
    available: (s, t, g) => searching(s, t, g) && s.rosterId === 'daniel',
    finish(s, t, g) { g.endInvestigation(`📻 ${s.first} patches into the police radio: "All units, a cat is stuck up a tree across town." Inspector Gumshoe sprints for his car.`); } },
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

// ---------- Hand of Fate: powers that need no sim, paid for with Malice ----------

export const GOD_COST = {
  ladder: 20, brick: 30, gas: 25, wiring: 25, spoil: 30, rumor: 15, omen: 40,
  bookshelf: 25, fireworks: 35, piranhas: 40, ghost: 30, chili: 20, letterbomb: 35, cleanup: 10,
  candles: 20, hairspray: 25, flour: 30, torch: 25, brakes: 40,
};

const doorCells = d => (d.axis === 'x' ? [[d.at - 1, d.pos], [d.at, d.pos]] : [[d.pos, d.at - 1], [d.pos, d.at]]);
const objCells = o => (o.cells.length ? o.cells : [o.use]);

function godPowers(pick, g) {
  const out = [];
  const power = (key, label, icon, cells, run) => out.push({ key, label, icon, cells, run, cost: GOD_COST[key] });
  const restore = (label, icon, run) => out.push({ label, icon, cells: [], run, cost: 0, restore: true });
  const ladder = g.world.ladder;
  const ladderPower = () => {
    if (ladder.present) power('ladder', 'Remove the ladder', '🪜', [ladder.use, ladder.entry], () => g.toggleLadder());
    else restore('Put the ladder back', '🪜', () => g.toggleLadder());
  };
  const piranhaPower = () => {
    if (g.world.piranhas) return;
    power('piranhas', 'Release piranhas', '🐟', [ladder.use, ladder.entry], () => {
      g.world.piranhas = true;
      g.log('🐟 Something small and toothy is now swimming in the pool.', 'tool');
    });
  };

  if (pick.kind === 'object') {
    const o = pick.obj;
    if ((o.type === 'stove' || o.type === 'grill') && !o.charred && !o.sabotaged) {
      power('gas', 'Loosen the gas valve', '🔧', objCells(o), () => { o.sabotaged = true; g.log(`🔧 The ${o.name}'s gas valve is quietly loosened.`, 'tool'); });
    }
    if ((o.type === 'tv' || o.type === 'tub') && !o.charred && !o.sabotaged) {
      power('wiring', 'Fray the wiring', '⚡', objCells(o), () => { o.sabotaged = true; g.log(`⚡ The wiring near the ${o.name} is mysteriously frayed.`, 'tool'); });
    }
    if (o.type === 'fridge' && !o.charred && !o.poisoned) {
      power('spoil', 'Spoil the leftovers', '🦠', objCells(o), () => { o.poisoned = 2; o.poisonedBy = null; g.log('🦠 The leftovers in the fridge turn a funny colour.', 'tool'); });
    }
    if (o.type === 'fridge' && !o.charred && !o.chili) {
      power('chili', "Swap in Grandma's chili", '🫘', objCells(o), () => { o.chili = 2; g.log("🫘 The fridge now contains a suspicious pot of three-bean chili.", 'tool'); });
    }
    if (o.type === 'mailbox' && !o.bomb) {
      power('letterbomb', 'Post a letter bomb', '📬', objCells(o), () => { o.bomb = true; o.flagUp = true; g.log('📬 A parcel arrives. It is ticking, very quietly.', 'tool'); });
    }
    if (o.type === 'telescope') {
      power('omen', 'Summon bad omens', '🌑', [], () => { g.doom += 2; g.log(`🌑 A red comet appears over the neighbourhood. (Doom ${g.doom})`, 'tool'); });
    }
    if (o.type === 'bookshelf' && !o.charred && !o.wobbly && !o.toppled) {
      power('bookshelf', 'Unscrew the wall brackets', '📚', objCells(o), () => { o.wobbly = true; g.log('📚 The bookshelf now leans ever so slightly forward.', 'tool'); });
    }
    if ((o.type === 'fireplace' || o.type === 'grill') && !o.charred && !o.fireworks && !(o.lit > 0)) {
      power('fireworks', 'Hide fireworks inside', '🎆', objCells(o), () => { o.fireworks = true; g.log(`🎆 A bundle of fireworks is tucked into the ${o.name}.`, 'tool'); });
    }
    if (o.type === 'candles' && !o.charred && !o.sabotaged) {
      power('candles', 'Light them and nudge them under the towels', '🕯️', objCells(o), () => {
        o.sabotaged = true; o.lit = Math.max(o.lit || 0, 240);
        g.log('🕯️ The scented candles flicker to life on their own and shuffle up against the fluffy towels.', 'tool');
      });
    }
    if (o.type === 'vanity' && !o.charred && !o.sabotaged) {
      power('hairspray', 'Swap in extra-hold hairspray', '💇', objCells(o), () => { o.sabotaged = true; g.log('💇 The hairspray on the vanity is now EXTRA HOLD. And extra flammable.', 'tool'); });
    }
    if (o.type === 'stove' && !o.charred && !o.flour) {
      power('flour', 'Dust the kitchen with flour', '🍞', objCells(o), () => { o.flour = true; g.log('🍞 A fine haze of flour settles over every surface in the kitchen.', 'tool'); });
    }
    if (o.type === 'shed' && !o.charred && !o.sabotaged) {
      power('torch', "Slit the weed torch's gas hose", '🌿', objCells(o), () => { o.sabotaged = true; g.log("🌿 The weed torch's gas hose now has a neat little slit in it.", 'tool'); });
    }
    if (o.type === 'ladder') { ladderPower(); piranhaPower(); }
  } else if (pick.kind === 'car') {
    // Only cars passing the house can be aimed at the front garden.
    const c = pick.car;
    if (!c.crash && c.mesh.position.x > -6 && c.mesh.position.x < 28) power('brakes', 'Cut the brake lines', '🚗', [], () => g.crashCar(c));
  } else if (pick.kind === 'pool') {
    ladderPower();
    piranhaPower();
  } else if (pick.kind === 'tomb' && !pick.tomb.ghost) {
    const t = pick.tomb;
    power('ghost', 'Wake the restless spirit', '👻', [], () => { t.ghost = true; g.log(`👻 Something stirs beneath ${t.name}'s grave. It will walk at night.`, 'tool'); });
  } else if (pick.kind === 'door') {
    const d = pick.door;
    if (d.bricked) restore('Knock it back open', '🚪', () => g.toggleDoor(d.id));
    else power('brick', 'Brick up the doorway', '🧱', doorCells(d), () => g.toggleDoor(d.id));
  } else if (pick.kind === 'sim' && pick.sim.alive) {
    const t = pick.sim;
    power('rumor', `Whisper a rumour about ${t.first}`, '🗣️', [], () => {
      for (const o of g.sims) if (o.alive && o !== t) changeRel(o, t, -20);
      t.evil = Math.min(100, t.evil + 5);
      g.log(`🗣️ Nasty rumours about ${t.name} spread through the house.`, 'tool');
    });
  }
  return out;
}

// The 🧹 tool: quietly undo your own handiwork before somebody official finds it.
export function cleanupPower(pick, g) {
  const w = g.world;
  const power = (label, cells, run) => ({ key: 'cleanup', label, icon: '🧹', cells, run, cost: GOD_COST.cleanup });
  if (pick.kind === 'floor') {
    const t = w.trapAt(...pick.cell);
    if (t) {
      return power('Remove the hidden trap', [pick.cell], () => {
        w.removeTrap(t);
        g.log(t.type === 'wax' ? '🧹 The waxed floor is scuffed back to boring, safe dullness.' : '🧹 The bear trap is pulled out of the lawn and tossed over the fence.', 'tool');
      });
    }
  }
  if ((pick.kind === 'pool' || (pick.kind === 'object' && pick.obj.type === 'ladder')) && w.piranhas) {
    return power('Net the piranhas', [w.ladder.use], () => {
      w.piranhas = false; w.piranhasKnown = false;
      g.log("🧹 The piranhas are netted and released into the neighbour's koi pond. Not your problem any more.", 'tool');
    });
  }
  if (pick.kind === 'door' && pick.door.bricked && !pick.door.hackLocked) {
    const d = pick.door;
    return power('Knock the wall back out', doorCells(d), () => g.toggleDoor(d.id));
  }
  if (pick.kind !== 'object') return null;
  const o = pick.obj, fixes = [];
  if (o.sabotaged) fixes.push(() => { o.sabotaged = false; });
  if (o.flour) fixes.push(() => { o.flour = false; });
  if (o.poisoned > 0) fixes.push(() => { o.poisoned = 0; o.untraceable = false; });
  if (o.chili > 0) fixes.push(() => { o.chili = 0; });
  if (o.fireworks) fixes.push(() => { o.fireworks = false; });
  if (o.bomb) fixes.push(() => { o.bomb = false; o.flagUp = false; });
  if (o.wobbly && !o.toppled) fixes.push(() => { o.wobbly = false; });
  if (!fixes.length) return null;
  return power(`Wipe down the ${o.name}`, objCells(o), () => {
    fixes.forEach(f => f());
    g.log(`🧹 The ${o.name} is wiped clean of fingerprints, residue and intent.`, 'tool');
  });
}

export function findPower(pick, game, key) {
  return godPowers(pick, game).find(p => p.key === key) || null;
}

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
    items.push({ label, icon: def.icon, evil: def.evil, run: () => sim.enqueue(def, target, 'player') });
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
    case 'responder':
      RESPONDER_ACTIONS.filter(d => d.kinds.includes(pick.person.kind)).forEach(d => add(d, pick.person));
      break;
  }

  for (const p of godPowers(pick, game)) {
    if (p.key && !game.owns(p.key)) {
      items.push({ label: p.label, icon: p.icon, god: true, note: '🔒 Buy on the black market', disabled: true, run: () => {} });
      continue;
    }
    let note = '';
    const cost = game.powerCost(p);
    if (game.contract && !p.restore) {
      const seen = p.cells.length ? game.witnesses(p.cells) : [];
      note = `${cost} 😈` + (seen.length ? ` · 👀 ${seen.map(s => s.first).join(', ')} watching` : '');
    }
    const broke = game.contract && !p.restore && game.malice < cost;
    items.push({ label: p.label, icon: p.icon, god: true, note, disabled: broke, warn: note.includes('👀'), run: () => game.godAction(p) });
  }
  return items;
}

// Roommates with something on their mind. A plan keeps a roommate on one goal over several actions:
// getting even after you humiliate them, or hunting you once they hate you (with a trap that fits
// whatever they've noticed you do most). A close call makes them careful instead. Plans show as clues,
// in their thought bubble and on their person card, and can be headed off: apologise, send them out
// for pizza, or stay out of reach until they cool off.
import { OBJECT_ACTIONS, SIM_ACTIONS, FIGHT, makeAction, slippersLeft } from './interactions.js';

const objAct = (type, id) => OBJECT_ACTIONS[type].find(d => d.id === id);
const simAct = id => SIM_ACTIONS.find(d => d.id === id);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const COOL_OFF = 8 * 60;        // minutes before a grudge (or a hunt) is dropped
const CAREFUL_FOR = 12 * 60;    // minutes of caution after a close call
const HUNT_EVERY = 12 * 60;     // at most one hunt per roommate every twelve hours

export const PLAN_ICON = { revenge: '💢', hunt: '🎯' };

// The trap that goes with what they've seen you do most, and how the person card describes it.
const HABIT_TRAPS = {
  gas: { ids: ['cook', 'grill', 'bake'], tell: 'has noticed you cook' },
  poison: { ids: ['snack'], tell: 'has noticed you raid the fridge' },
  ladder: { ids: ['swim'], tell: 'has noticed you like a swim' },
};
function habitTrap(g) {
  const h = g.playerHabits || {};
  let best = 'drink', most = 0;
  for (const [trap, { ids }] of Object.entries(HABIT_TRAPS)) {
    const n = ids.reduce((a, id) => a + (h[id] || 0), 0);
    if (n > most) { most = n; best = trap; }
  }
  return best;
}

// What each step looks like from the outside, for the person card.
const NEXT = {
  brush: 'next stop: the toilet brush', breathe: 'coming to say "good morning"', slipper: 'the slipper is coming off',
  fight: 'wants a fight', drink: 'mixing you a "special" drink', gas: 'eyeing the stove', poison: 'eyeing the fridge',
  ladder: 'waiting for you to go for a swim',
};

// One step: the action to take now, 'wait' (keep the plan, do something else meanwhile) or 'skip'.
function step(id, s, g, victim) {
  const o = x => g.world.objects.get(x);
  switch (id) {
    case 'brush': return s.status.breath > 0 ? 'skip' : { def: objAct('toilet', 'toiletbrush'), target: o('toilet') };
    case 'breathe': return { def: simAct('breathe'), target: victim };
    case 'slipper': return slippersLeft(s) > 0 ? { def: simAct('slipper'), target: victim } : 'wait';
    case 'fight': return { def: FIGHT, target: victim };
    case 'drink': return { def: simAct('drink'), target: victim };
    case 'gas': { const st = o('stove'); return st.charred || st.sabotaged ? 'skip' : { def: objAct('stove', 'npcgas'), target: st }; }
    case 'poison': { const f = o('fridge'); return f.charred || f.poisoned > 0 ? 'skip' : { def: objAct('fridge', 'poison'), target: f }; }
    case 'ladder': return victim.status.swimming ? { def: objAct('ladder', 'hideladder'), target: g.world.ladder } : 'wait';
  }
  return 'skip';
}

// Getting even plays to their strengths: toilet breath, slippers, fists, or a sneaky trap.
function revengeSteps(s, g) {
  if (s.canUse('breathe')) return ['brush', 'breathe'];
  if (s.canUse('slipper')) return ['slipper', 'slipper'];
  if (s.has('hotheaded')) return ['fight'];
  return [habitTrap(g)];
}
const TELLS = {
  brush: 'heads for the bathroom with a look of pure purpose. Oh no.', slipper: 'reaches slowly for her slipper.',
  fight: 'cracks their knuckles and stares.', drink: 'smiles far too sweetly and wanders off towards the kitchen.',
  gas: 'smiles far too sweetly and wanders off towards the kitchen.', poison: 'smiles far too sweetly and wanders off towards the kitchen.',
  ladder: 'smiles far too sweetly and glances at the pool.',
};

export function startPlan(g, s, kind, victim) {
  if (s.plan || !s.alive || s === g.player || !victim || !victim.alive) return;
  const trap = habitTrap(g);
  const steps = kind === 'revenge' ? revengeSteps(s, g)
    : s.canUse('breathe') ? ['brush', 'breathe'] : s.canUse('slipper') ? ['slipper'] : [trap];
  s.plan = { kind, target: victim.id, steps, i: 0, until: g.clock + COOL_OFF, trap };
  if (kind === 'revenge') g.log(`💢 ${s.first} ${TELLS[steps[0]]} ${s.first} is going to get ${victim.first} back for that.`, 'warn');
  else if (g.witnesses([[s.cx, s.cz]]).includes(victim)) {
    g.log(`🎯 ${s.first} has been watching ${victim.first}, and ${HABIT_TRAPS[trap] ? HABIT_TRAPS[trap].tell.replace('you', victim.first) : 'is waiting for a chance'}. Something is being planned.`, 'warn');
  }
}

export function endPlan(g, s, why) {
  const plan = s.plan;
  if (!plan) return;
  s.plan = null;
  if (plan.kind === 'hunt') s.huntedAt = g.clock;
  if (why === 'cool') g.log(`😮‍💨 ${s.first} has cooled off. For now.`, 'dim');
}

// Called from autonomy: the next thing their plan needs, or null. `viable` checks it can be done now.
export function pickPlan(s, g, viable) {
  const me = g.player;
  // Someone who hates you, with nothing on their mind, decides to do something about you.
  if (!s.plan && me && me.alive && s !== me && s.relWith(me) < -40 && g.clock > (s.huntedAt || -Infinity) + HUNT_EVERY && Math.random() < 0.15) {
    startPlan(g, s, 'hunt', me);
  }
  const plan = s.plan;
  if (!plan) return null;
  const victim = g.sims.find(x => x.id === plan.target);
  if (!victim || !victim.alive || g.clock > plan.until) { endPlan(g, s, victim && victim.alive ? 'cool' : null); return null; }
  if (victim.status.away) return null; // they'll wait
  while (plan.i < plan.steps.length) {
    const next = step(plan.steps[plan.i], s, g, victim);
    if (next === 'skip') { plan.i++; continue; }
    if (next === 'wait' || !viable(s, g, next.def, next.target)) return null;
    plan.i++;
    return next;
  }
  endPlan(g, s);
  return null;
}

// How their plan looks from the outside (person card), or null.
export function planLine(s, g) {
  const plan = s.plan;
  if (!plan) return null;
  const victim = g.sims.find(x => x.id === plan.target);
  const id = plan.steps[Math.min(plan.i, plan.steps.length - 1)];
  const hours = Math.max(1, Math.round((plan.until - g.clock) / 60));
  if (plan.kind === 'revenge') return `💢 Out to get ${victim === g.player ? 'you' : victim.first} back: ${NEXT[id]} (cools off in ~${hours}h)`;
  return `🎯 Hunting you: ${HABIT_TRAPS[plan.trap] ? HABIT_TRAPS[plan.trap].tell : 'waiting for a chance'}, ${NEXT[id]}`;
}

// ---------- being careful ----------

const PLACE = { fridge: 'fridge', stove: 'stove', grill: 'grill', tv: 'TV', tub: 'bath', ladder: 'pool', fireplace: 'fireplace',
  candles: 'candles', bookshelf: 'bookshelf', mailbox: 'mailbox', telescope: 'telescope' };
// What a close call (or seeing someone die) makes them steer clear of.
const AVOID = {
  poison: ['fridge'], drink: ['fridge'], fire: ['stove', 'grill'], wiring: ['tv', 'tub'],
  Fire: ['stove', 'grill', 'fireplace', 'candles'], Drowning: ['ladder'], Piranhas: ['ladder'], Electrocution: ['tv', 'tub'],
  Poison: ['fridge'], Crushed: ['bookshelf'], Explosion: ['fireplace', 'grill', 'mailbox'], 'Letter Bomb': ['mailbox'],
  Meteor: ['telescope'], 'Car Crash': ['mailbox'],
};

export function becomeCareful(g, s, why, what) {
  if (!s.alive || s === g.player || !s.rel) return;
  const avoid = AVOID[why];
  if (!avoid) return;
  const was = s.careful;
  s.careful = { until: g.clock + CAREFUL_FOR, avoid: [...new Set([...(was ? was.avoid : []), ...avoid])], what };
  if (!was) g.log(`👀 ${s.first} ${what}. They'll steer clear of the ${avoid.map(t => PLACE[t]).join(' and ')} for a while.`, 'dim');
}

export const avoids = (s, g, target) => !!(s.careful && target && target.type && s.careful.avoid.includes(target.type));

export function carefulLine(s, g) {
  if (!s.careful) return null;
  const hours = Math.max(1, Math.round((s.careful.until - g.clock) / 60));
  return `👀 Careful: ${s.careful.what}, so no ${s.careful.avoid.map(t => PLACE[t]).join(', ')} for ~${hours}h`;
}

// Careful people stick close to a friend.
export function pickCareful(s, g, viable) {
  if (!s.careful || Math.random() > 0.3) return null;
  const friend = g.sims.filter(o => o.alive && o !== s && !o.status.away && !o.status.swimming && s.relWith(o) > 20)
    .sort((a, b) => s.relWith(b) - s.relWith(a))[0];
  const chat = simAct('chat');
  return friend && viable(s, g, chat, friend) ? { def: chat, target: friend } : null;
}

// ---------- reactions ----------

// Something nasty was just done to `t` by `by`. An auntie doesn't plan: the slipper just comes off.
// Anyone else you humiliate may decide to get even.
export function provoked(g, t, by, def) {
  if (!t || !t.alive || t === by || !t.rel || t === g.player) return;
  if (t.canUse('slipper') && slippersLeft(t) > 0 && t.relWith(by) < 0 && Math.random() < 0.6) {
    t.endAction();
    t.queue.unshift(makeAction(simAct('slipper'), by, 'auto'));
    g.log(`🩴 ${t.first}'s eyes narrow. ${pick(['The slipper is coming off.', 'Her hand drifts towards her foot.', 'Yeter. ENOUGH.'])}`, 'warn');
    return;
  }
  if (by === g.player && !t.plan && t.relWith(by) < -30 && Math.random() < (t.has('hotheaded') ? 0.9 : 0.5)) startPlan(g, t, 'revenge', by);
}

// Grudges fade, caution wears off, thrown slippers get picked up again.
export function updatePlans(g) {
  for (const s of g.sims) {
    if (s.careful && g.clock > s.careful.until) s.careful = null;
    while (s.slippersOut && s.slippersOut.length && g.clock >= s.slippersOut[0]) s.slippersOut.shift();
  }
}

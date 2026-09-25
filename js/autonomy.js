// Free will: what an idle sim decides to do on their own. The other roommates always have it (and use it
// against you); your own character only looks after their needs, and knows better than to use what you rigged.
import { OBJECT_ACTIONS, SIM_ACTIONS, TOMB_ACTIONS, SWIM, FIGHT, WALK, CLEAN, FIX, BREAKUP, PUTBACK } from './interactions.js';
import { PERSONALITIES } from './data.js';
import { pickPlan, pickCareful, avoids } from './plans.js';

const objAct = (type, id) => OBJECT_ACTIONS[type].find(d => d.id === id);
const simAct = id => SIM_ACTIONS.find(d => d.id === id);
const shuffle = arr => arr.sort(() => Math.random() - 0.5);

function reachable(s, def, target, g) {
  let spot;
  if (def.approachSim) spot = s.adjacentTo(target, g.world);
  else spot = def.spot ? def.spot(s, target, g) : [s.cx, s.cz];
  return !!spot && g.world.findPath(s.cx, s.cz, spot[0], spot[1]) !== null;
}

function viable(s, g, def, target) {
  if (!def || !target) return false;
  if (def.available && !def.available(s, target, g)) return false;
  if (rigged(s, target) || avoids(s, g, target)) return false;
  return reachable(s, def, target, g);
}

// Nobody uses what they rigged themselves, or what they watched someone else rig.
function rigged(s, o) {
  if (!o || !o.type || (o.rigger !== s.id && !(o.knownBy && o.knownBy.includes(s.id)))) return false;
  return !!(o.sabotaged || o.flour || o.fireworks || o.bomb || o.wobbly || o.poisoned > 0 || o.chili > 0);
}

// Housemates with a part to play (contracts.js): a guardian looks after their ward, a peacekeeper keeps
// the peace. Haters need no special handling: their loathing does the work.
const riggedState = o => !!(o.sabotaged || o.flour || o.fireworks || o.bomb || (o.wobbly && !o.toppled) || o.poisoned > 0 || o.chili > 0);
function pickRole(s, g) {
  const role = s.houseRole;
  if (!role) return null;
  const can = (def, target) => (!def.available || def.available(s, target, g)) && reachable(s, def, target, g);
  if (role.kind === 'guardian') {
    const ward = g.sims.find(x => x.id === role.ward);
    if (!ward || !ward.alive) return null;
    if (ward.status.stuck && !g.world.ladder.present && can(PUTBACK, g.world.ladder)) return { def: PUTBACK, target: g.world.ladder };
    for (const o of g.world.objects.values()) {
      if (o.knownBy && o.knownBy.includes(s.id) && riggedState(o) && can(FIX, o)) return { def: FIX, target: o };
    }
    const chat = simAct('chat');
    if (!ward.status.away && !ward.status.swimming && Math.random() < 0.35 && can(chat, ward)) return { def: chat, target: ward };
  } else if (role.kind === 'peacekeeper') {
    const fighter = g.sims.find(x => x.alive && x !== s && x.action && x.action.def.id === 'fight' && x.action.stage === 'do');
    if (fighter && can(BREAKUP, fighter)) return { def: BREAKUP, target: fighter };
    const stereo = g.world.objects.get('stereo'), stop = objAct('stereo', 'stopmusic');
    if ((stereo.blasting > 0 || (g.isNight && stereo.playing > 0)) && can(stop, stereo)) return { def: stop, target: stereo };
  }
  return null;
}

function weightedPick(opts) {
  const total = opts.reduce((a, o) => a + o.w, 0);
  let r = Math.random() * total;
  for (const o of opts) { if ((r -= o.w) < 0) return o; }
  return opts[opts.length - 1];
}

function pickEvil(s, g) {
  const chance = (0.1 + (s.evil - 50) / 300 + (s.has('hotheaded') ? 0.08 : 0) + (s.mood() < 35 ? 0.08 : 0)) * (g.diff ? g.diff.hostile : 1);
  if (Math.random() > chance) return null;
  const o = id => g.world.objects.get(id);
  const opts = [];
  for (const other of g.sims) {
    if (!other.alive || other === s || other.status.swimming) continue;
    const r = s.relWith(other);
    if (r < 10) opts.push({ w: 3, def: simAct('insult'), target: other });
    // A hater would rather someone else did it: they sneer at their target, but never throw the first punch.
    const holdsBack = s.houseRole && s.houseRole.kind === 'hater' && s.houseRole.ward === other.id;
    if (r < (s.has('hotheaded') ? -30 : -60) && !holdsBack) opts.push({ w: 1.2, def: FIGHT, target: other });
    // Poisoned drinks are for the new roommate; with each other they settle for fists.
    if (r < -40 && other === g.player) opts.push({ w: 0.6, def: simAct('drink'), target: other });
    // Socially unacceptable: only offered when it applies (asleep, on the loo...), filtered by viable().
    if (r < 0) {
      for (const [id, w] of [['tickle', 0.35], ['airhorn', 0.25], ['whisper', 0.3], ['barge', 0.6], ['chewloud', 0.3], ['stinkhug', 0.4]]) {
        opts.push({ w, def: simAct(id), target: other });
      }
    }
  }

  opts.push({ w: 0.2, def: objAct('computer', 'darkarts'), target: o('computer') });
  if (g.isNight) opts.push({ w: 0.6, def: objAct('stereo', 'blast'), target: o('stereo') });
  // Out to get the new roommate: rig the stove, or take the ladder while they're in the pool.
  const me = g.player;
  if (me && me.alive && s.relWith(me) < -40) {
    opts.push({ w: 0.5, def: objAct('stove', 'npcgas'), target: o('stove') });
    opts.push({ w: 0.5, def: objAct('fridge', 'poison'), target: o('fridge') });
    if (me.status.swimming) opts.push({ w: 3, def: objAct('ladder', 'hideladder'), target: g.world.ladder });
    opts.push({ w: 0.6, def: simAct('drink'), target: me });
    if (s.canUse('breathe') && !(s.status.breath > 0)) opts.push({ w: 0.8, def: objAct('toilet', 'toiletbrush'), target: o('toilet') });
  }
  if (s.has('hotheaded')) opts.push({ w: 0.06, def: objAct('computer', 'insultbikers'), target: o('computer') });
  opts.push({ w: 0.25, def: objAct('fridge', 'fish'), target: o('fridge') });
  opts.push({ w: 0.2, def: objAct('fridge', 'trash'), target: o('fridge') });
  opts.push({ w: 0.2, def: objAct('table', 'toenails'), target: o('table') });
  if (s.has('pyro')) {
    opts.push({ w: 1.5, def: objAct('fireplace', 'light'), target: o('fireplace') });
    opts.push({ w: 0.8, def: objAct('shed', 'weeds'), target: o('shed') });
    opts.push({ w: 0.6, def: objAct('candles', 'lightcandles'), target: o('candles') });
    opts.push({ w: 0.4, def: objAct('fireplace', 'stoke'), target: o('fireplace') });
    opts.push({ w: 0.4, def: objAct('heater', 'crank'), target: o('heater') });
  }
  if (s.has('stargazer')) opts.push({ w: 0.6, def: objAct('telescope', 'taunt'), target: o('telescope') });

  // Personality tactics: manipulation is their favourite hobby.
  const victims = g.sims.filter(x => x.alive && x !== s && !x.status.swimming && !x.status.away);
  for (const id of PERSONALITIES[s.personality].tactics) {
    const def = simAct(id);
    if (!victims.length || !def) continue;
    let target;
    if (id === 'lovebomb') target = victims.filter(v => !v.lovebomb).sort((a, b) => s.relWith(b) - s.relWith(a))[0];
    else if (id === 'story') target = victims.find(v => v.needs.fun < 50);
    // Toilet breath is saved for the new roommate; the rest of the house only gets the everyday kind.
    else if (id === 'breathe' && s.status.breath > 0) target = victims.includes(me) ? me : null;
    else target = victims[Math.floor(Math.random() * victims.length)];
    if (target) opts.push({ w: id === 'story' ? 0.5 : 1.3, def, target });
  }
  for (const t of g.world.tombstones) opts.push({ w: 2, def: TOMB_ACTIONS[0], target: t });

  const ok = opts.filter(x => viable(s, g, x.def, x.target));
  return ok.length ? weightedPick(ok) : null;
}

function pickNeed(s, g) {
  const n = s.needs;
  const o = id => g.world.objects.get(id);
  // Lowest need first, except that a rumbling stomach beats boredom every time.
  const urgency = k => n[k] - (k === 'hunger' && n.hunger < 25 ? 100 : 0);
  const wants = [
    ['hunger', 50], ['energy', 35], ['hygiene', 40], ['social', 45], ['fun', 55],
  ].filter(([k, th]) => n[k] < th).sort((a, b) => urgency(a[0]) - urgency(b[0]));

  for (const [need] of wants) {
    let cands = [];
    if (need === 'hunger') {
      const fridge = o('fridge');
      const selfPoisoned = fridge.poisoned && fridge.poisonedBy === s.id && !s.has('glutton');
      const cook = [[objAct('stove', 'cook'), o('stove')], [objAct('grill', 'grill'), o('grill')], [objAct('stove', 'bake'), o('stove')]];
      const snack = selfPoisoned ? [] : [[objAct('fridge', 'snack'), fridge]];
      // Mostly the safe option; the player has to push them toward the stove.
      cands = Math.random() < 0.8 ? [...snack, ...shuffle(cook)] : [...shuffle(cook), ...snack];
      cands.push([objAct('computer', 'pizza'), o('computer')]);
    } else if (need === 'energy') {
      cands = [...g.world.objects.values()].filter(b => b.type === 'bed')
        .sort((a, b) => (a.id === s.bedId ? -1 : b.id === s.bedId ? 1 : Math.hypot(a.use[0] - s.x, a.use[1] - s.z) - Math.hypot(b.use[0] - s.x, b.use[1] - s.z)))
        .map(b => [objAct('bed', 'sleep'), b]);
    } else if (need === 'hygiene' && s.status.feral > 0) {
      continue; // committed to the bit
    } else if (need === 'hygiene') {
      // The vain ones would rather do their hair than wash.
      const hair = [objAct('vanity', 'hair'), o('vanity')], bath = [objAct('tub', 'bath'), o('tub')];
      cands = ['narcissist', 'charmer', 'drama'].includes(s.personality) ? [hair, bath] : shuffle([bath, hair]);
    } else if (need === 'social') {
      const others = g.sims.filter(x => x.alive && x !== s && !x.status.swimming)
        .sort((a, b) => s.relWith(b) - s.relWith(a));
      for (const x of others) cands.push([s.relWith(x) < -30 && Math.random() < 0.4 ? simAct('insult') : simAct('chat'), x]);
    } else if (need === 'fun') {
      cands = shuffle([
        [objAct('tv', 'watch'), o('tv')],
        [objAct('telescope', 'stargaze'), o('telescope')],
        [objAct('computer', 'scheme'), o('computer')],
        ...(n.energy > 45 && !g.world.piranhasKnown ? [[SWIM, g.world.ladder]] : []),
        [objAct('bookshelf', 'read'), o('bookshelf')],
        [objAct('mailbox', 'mail'), o('mailbox')],
        [objAct('fireplace', 'warm'), o('fireplace')],
        [objAct('heater', 'warmhands'), o('heater')],
        [objAct('candles', 'candlelit'), o('candles')],
        [objAct('stereo', 'dance'), o('stereo')],
        [objAct('toilet', 'usetoilet'), o('toilet')],
        [objAct('shed', 'weeds'), o('shed')],
      ]);
      if (s.has('stargazer')) cands.unshift([objAct('telescope', 'stargaze'), o('telescope')]);
      if (s.rosterId === 'daniel') cands.unshift([objAct('computer', 'devgame'), o('computer')]);
    }
    for (const [def, target] of cands) if (viable(s, g, def, target)) return { def, target };
  }
  return null;
}

// A raised mailbox flag is irresistible.
function pickCurious(s, g) {
  const box = g.world.objects.get('mailbox');
  if (!box.flagUp || Math.random() > 0.3) return null;
  if (s.has('paranoid') && !s.confused) return null; // a raised flag is exactly what a paranoid sim distrusts
  const def = objAct('mailbox', 'mail');
  return viable(s, g, def, box) ? { def, target: box } : null;
}

// Tidy sims clean up after the slobs (and hold a grudge about it).
function pickClean(s, g) {
  if (s.has('lazy') || s.status.feral > 0 || Math.random() > 0.3) return null;
  const mess = [...g.world.mess.values()].filter(m => m.by !== s.id)
    .sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
  return mess && viable(s, g, CLEAN, mess) ? { def: CLEAN, target: mess } : null;
}

function pickWander(s, g) {
  if (s.rosterId === 'daniel') {
    const pc = g.world.objects.get('computer'), def = objAct('computer', 'devgame');
    if (viable(s, g, def, pc)) return { def, target: pc };
  }
  if (Math.random() > 0.3) return null;
  const cell = g.world.randomNear(s.cx, s.cz, 3);
  return cell ? { def: WALK, target: { cell } } : null;
}

const FOOD = new Set(['snack', 'cook', 'grill', 'pizza']);

export function runAutonomy(s, g, min) {
  if (!s.alive || s.status.away) return;
  // A growling stomach interrupts whatever they were doing on their own.
  if (s.action && s.action.source === 'auto' && s.needs.hunger < 12 && !FOOD.has(s.action.def.id) && !s.status.swimming) {
    s.endAction();
    s.idle = 8;
  }
  if (s.action || s.queue.length) return;
  const st = s.status;
  if (st.swimming || st.passedOut > 0 || st.engaged > 0 || st.panic > 0 || st.trapped > 0) return;
  s.idle = (s.idle || 0) + min;
  if (s.idle < 8) return;
  s.idle = 0;
  const starving = s.needs.hunger < 20;
  // Your own free will covers needs and chores; the scheming is up to you.
  const scheming = s !== g.player && !starving;
  const choice = pickRole(s, g) || (scheming && pickPlan(s, g, viable)) || pickCareful(s, g, viable) || (scheming && pickCurious(s, g)) || (scheming && pickEvil(s, g)) || pickNeed(s, g) || pickClean(s, g) || pickWander(s, g);
  if (!choice) return;
  s.enqueue(choice.def, choice.target, 'auto');
  warnPlayer(s, g, choice);
}

// Some plans are obvious enough that you get a moment's warning.
function warnPlayer(s, g, { def, target }) {
  const me = g.player;
  if (!me || !me.alive || me.status.away || s === me) return;
  if (def.id === 'hideladder' && me.status.swimming) g.danger(`🪜 ${s.first} is heading for the pool ladder while ${me.first} is in the pool. Get out, now!`);
  else if (def.id === 'drink' && target === me) g.danger(`🍹 ${s.first} is coming over with a "special" drink for ${me.first}. Walk away, or don't be thirsty.`);
  else if (def.id === 'breathe' && target === me && s.status.breath > 0) g.danger(`🤢 ${s.first} is coming to say good morning. You can smell it from here. Keep moving!`);
  else if (def.id === 'fight' && target === me) g.danger(`🥊 ${s.first} is coming over to settle things with their fists.`);
  else if (def.id === 'slipper' && target === me) g.danger(`🩴 ${s.first} is taking off a slipper and turning towards ${me.first}. Duck!`);
}

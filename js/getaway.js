// The getaway. When the last target dies with loose ends lying around (evidence the police would find, a
// witness whose story would check out), the win waits: the police are on their way, and until they've been
// and gone you can tidy up, talk the witnesses round (crime.js), or make a run for the front gate.
// A clean accident, with nothing at stake, ends at once.
import { evidence, requestInvestigation, talkers, PROOF } from './emergency.js';
import { describeBonus } from './contracts.js';

const MAX_MIN = 8 * 60;   // after this long the police lose interest
const TOP = 5;            // the detective checks the five most damning things (see emergency.js)
const GATE = [10, 15];

const cap = s => s[0].toUpperCase() + s.slice(1);
const list = arr => (arr.length < 2 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);

// What the police would find, in words the player can act on: [icon, what, how to fix it (null: you can't)].
function describe(e, g) {
  const i = e.id.indexOf(':'), kind = i < 0 ? e.id : e.id.slice(0, i), ref = i < 0 ? '' : e.id.slice(i + 1);
  const w = g.world, o = w.objects.get(ref), name = o ? o.name.toLowerCase() : '';
  const wipe = 'click it: Wipe away the evidence';
  switch (kind) {
    case 'trap': {
      const t = w.traps.get(ref);
      const kinds = { wax: ['🧽', 'a lethally waxed patch of floor'], peel: ['🍌', 'a lovingly placed banana peel'], beartrap: ['🪤', 'a bear trap in the lawn'] };
      const [icon, what] = kinds[t && t.type] || ['🪤', 'a hidden trap'];
      return [icon, what, 'click it: Remove the hidden trap'];
    }
    case 'sab': {
      const what = { stove: `the loosened gas valve on the ${name}`, grill: `the loosened gas valve on the ${name}`, candles: 'the candles under the towels',
        vanity: 'the doctored hairspray', shed: "the weed torch's slit hose" }[o && o.type] || `the frayed wiring behind the ${name}`;
      return [o && (o.type === 'tv' || o.type === 'tub') ? '⚡' : '🔧', what, wipe];
    }
    case 'flour': return ['🍞', 'flour all over the kitchen', wipe];
    case 'tox': return ['🧪', `the poisoned leftovers in the ${name}`, wipe];
    case 'chili': return ['🫘', "Grandma's chili", wipe];
    case 'fw': return ['🎆', `the fireworks in the ${name}`, wipe];
    case 'bomb': return ['📬', 'the ticking parcel in the mailbox', wipe];
    case 'shelf': return ['📚', 'the unscrewed bookshelf brackets', wipe];
    case 'door': {
      const d = w.doors.find(x => x.id === ref);
      return ['🧱', `the bricked-up ${d ? d.name.toLowerCase() : 'doorway'}`, 'click the wall: Knock the wall back out'];
    }
    case 'ladder': return ['🪜', 'the missing pool ladder', 'click the pool: Put the ladder back'];
    case 'piranhas': return ['🐟', 'the piranhas in the pool', 'click the pool: Net the piranhas'];
    case 'wreck': return ['🚗', 'the cut brake lines on the wreck out front', null];
    case 'oil': return ['🛢️', 'the oil slick on the road', null];
    default: return ['❓', 'something suspicious', null];
  }
}

// Everything that could still go wrong, as of now.
export function looseEnds(g) {
  const found = evidence(g).filter(e => e.sus > 0 && e.id !== 'graves' && e.still());
  const weight = found.map(e => e.sus).sort((a, b) => b - a).slice(0, TOP).reduce((n, v) => n + v, 0);
  // Statements still on their way, and the ones the detective has already taken and is going to check.
  const inv = g.investigation;
  const heard = inv && inv.state === 'searching' ? [...(inv.plan || []), inv.stop].filter(s => s && s.tip && s.still()).map(s => s.tip) : [];
  const waiting = g.tips.filter(t => !t.witnesses || talkers(t).length);
  // A statement only gets you arrested if something backs it up: a lab test, or the evidence itself.
  const damning = [...new Set([...waiting, ...heard])].filter(t => !t.scapegoat
    && ((t.proof && t.proof()) || found.some(e => t.ids.includes(e.id) && e.sus >= PROOF)));
  return { found, weight, damning };
}

// What finding it all would cost you, or null if nothing is at stake.
export function stakes(g, ends = looseEnds(g)) {
  if (g.suspicion >= 100 || (g.getaway && g.getaway.hunted)) return { kind: 'hunted', icon: '🚔', text: 'Everyone knows. They are coming to arrest you' };
  if (ends.damning.length) return { kind: 'arrest', icon: '🚔', text: "If they find it, you're arrested: a witness's story would check out" };
  if (ends.weight < PROOF) return null;
  const after = Math.round(g.suspicion + ends.weight);
  if (after >= 100) return { kind: 'exposed', icon: '🕵️', text: `If they find it, you're exposed: suspicion would hit 100 (it's ${Math.round(g.suspicion)} now)` };
  const lose = [];
  if (g.peakSuspicion < 30 && after >= 30) lose.push('the clean-job bonus');
  for (const b of g.contract.bonus) if (b.type === 'suspicion' && g.peakSuspicion < b.max && after >= b.max) lose.push(`the ★ for "${describeBonus(b)}"`);
  return lose.length ? { kind: 'bonus', icon: '⭐', text: `If they find it, suspicion rises to ${after} and you lose ${list(lose)}` } : null;
}

// Called when the last target dies. Returns true if there's a getaway to play first.
export function startGetaway(g, victim) {
  if (g.getaway) return true;
  // A promise to a blackmailer falls due the moment the police walk in.
  g.favours = g.favours.filter(f => {
    if (!f.by.alive || !f.victim.alive) return true;
    g.tips.push({ ...f.tip, witnesses: [f.by] });
    g.log(`🤐 ${f.by.first} was promised ${f.victim.first}'s death. With the police on their way, they'll tell them everything instead.`, 'warn');
    return false;
  });
  const ends = looseEnds(g), risk = stakes(g, ends);
  if (!risk) return false;
  const p = g.player;
  g.getaway = { since: g.clock, items: new Map(), searched: false, hunted: g.suspicion >= 100, outcome: null, handled: 0, framed: [] };
  track(g, ends);
  callTheLaw(g, `the death of ${victim.name}`);
  g.holdSkip(8000);
  if (g.speed > 1) g.setSpeed(1);
  g.sfx('alarm');
  const things = [...g.getaway.items.values()].map(it => it.what);
  const said = ends.damning.map(t => t.by);
  g.log(`🚨 ${victim.first} is dead. That was the easy part. The police are on their way${things.length ? `, and they'll find ${list(things)}` : ''}${said.length ? `. ${list(said)} ${said.length > 1 ? 'have' : 'has'} already told them what they saw` : ''}.`, 'warn');
  g.ui.toast('🚨 Getaway! Tie up the loose ends before the police arrive, or run for it.');
  if (!p || !p.alive) return true;
  if (p.status.away) {
    g.log(`💼 ${p.first} is at work. Whatever the police turn up, ${p.first} will hear about it on the way home.`, 'dim');
    return true;
  }
  if (g.ui.choosing) return true;
  const hunted = risk.kind === 'hunted';
  const why = hunted ? 'Suspicion has hit 100. Everyone knows, and the police are coming to arrest you.'
    : `The police are on their way.${things.length ? ` They'll find ${list(things)}.` : ''}${said.length ? ` ${list(said)} already told them what they saw.` : ''} ${risk.text}.`;
  g.ui.choose('🚨 Loose ends', `${victim.first} is dead, but it isn't over. ${why}`, [
    hunted
      ? { label: '🧍 Stay and face them', note: "You'll be arrested, unless you can get rid of the detective first", run() {} }
      : { label: '🧹 Stay and cover your tracks', note: 'Clean up and talk the witnesses round. Once there is nothing left worth finding, you are in the clear', run() {} },
    { label: '🏃 Make a run for it', note: 'Out of the front gate before the police get here: you get away for sure, but at half pay and without the clean-job bonuses', run() { runForIt(g); } },
  ]);
  return true;
}

function callTheLaw(g, why) {
  const inv = g.investigation;
  if (!inv) { g.policeCooldown = 0; requestInvestigation(g, why); } else if (inv.state === 'leaving' || inv.state === 'gone') g.pendingInquiry = g.pendingInquiry || why;
}

// Keeps the checklist: everything found at the start, plus anything new, ticked off once it's gone.
function track(g, ends) {
  const items = g.getaway.items, now = new Set(ends.found.map(e => e.id));
  for (const e of ends.found) {
    if (items.has(e.id)) continue;
    const [icon, what, fix] = describe(e, g);
    items.set(e.id, { id: e.id, icon, what, fix, cell: e.cell, sus: e.sus, gone: false });
  }
  for (const it of items.values()) it.gone = !now.has(it.id);
}

export function updateGetaway(g) {
  const ga = g.getaway;
  if (!ga || g.result || g.over) return;
  const p = g.player, inv = g.investigation;
  if (inv && inv.state === 'searching') ga.searched = true;
  // Once everyone knows, they keep knowing. The detective doesn't bother searching.
  if (g.suspicion >= 100) ga.hunted = true;
  if (ga.hunted && inv && inv.state === 'searching' && inv.detective && p && p.alive) {
    g.arrest(p.status.away ? `🚔 ${inv.detective.title} doesn't bother searching the house. He picks ${p.first} up at work instead.`
      : `🚔 ${inv.detective.title} doesn't bother searching. "${p.first}? You're coming with me."`, inv.detective);
    if (g.result) return;
  }
  const ends = looseEnds(g);
  track(g, ends);
  const busy = !!g.pendingInquiry || (inv && ['pending', 'driving', 'searching'].includes(inv.state));
  if (!stakes(g, ends)) return finish(g, ga.searched ? 'search' : 'clean');
  if (ga.searched && !busy) return finish(g, 'search');
  if (!busy) callTheLaw(g, 'the loose ends');
  if (g.clock - ga.since > MAX_MIN) finish(g, 'timeout');
}

function finish(g, how) {
  const ga = g.getaway, inv = g.investigation;
  ga.outcome = how;
  // Whoever you pinned it on is led away before the curtain falls.
  const framed = [...g.tips, ...(inv && inv.plan ? inv.plan.map(s => s.tip) : [])].filter(t => t && t.scapegoat && t.scapegoat.alive);
  for (const t of new Set(framed)) g.arrestScapegoat(t.scapegoat, `🚔 The police take ${t.by}'s statement: ${t.by} saw ${t.who} ${t.what}. ${t.who} is under arrest.`);
  const who = inv && inv.detective ? inv.detective.title : 'The police';
  g.log({
    clean: '🧽 By the time the police pull up there is nothing left worth finding, and every story matches. "Tragic accident," they write. You got away with it.',
    search: `🚓 ${who} leaves with nothing he can use. You got away with it.`,
    timeout: '🚓 The police have bigger fish to fry. You got away with it.',
  }[how], 'tool');
  g.endContract(true);
}

// Out of the front gate before the police get here. Once the squad car is parked, it's too late.
export function cantRun(g) {
  const inv = g.investigation, p = g.player;
  if (!g.getaway || g.result) return 'Nothing to run from';
  if (!p || !p.alive || p.status.away) return `${p ? p.first : 'You'} can't run right now`;
  if (inv && inv.state === 'searching') return '🚓 The squad car is parked across the gate. Too late to run';
  return null;
}

export const RUN = {
  id: 'getaway', label: 'Make a run for it', icon: '🏃', duration: 1, spot: () => GATE, facePos: () => [10.5, 17],
  finish(s, t, g) { flee(g, s); },
};

export function runForIt(g) {
  const why = cantRun(g), p = g.player;
  if (why) { g.ui.toast(why); return; }
  p.endAction();
  p.queue = [];
  p.enqueue(RUN, null, 'player');
  g.log(`🏃 ${p.first} grabs a bag and heads for the front gate.`, 'warn');
}

function flee(g, p) {
  const why = cantRun(g);
  if (why) { g.log(why + '.', 'warn'); return; }
  g.getaway.outcome = 'fled';
  p.endAction();
  p.queue = [];
  p.status.away = true;
  p.x = 10.5; p.z = -60;
  g.log(`🏃 ${p.first} slips out of the front gate with a packed bag and never looks back. Somewhere behind them, a police car pulls up to an empty house.`, 'tool');
  g.endContract(true);
}

// For the HUD: where the police are, what's left to find, who's talking, and what it would cost you.
export function getawayStatus(g) {
  const ga = g.getaway, inv = g.investigation;
  if (!ga || g.result) return null;
  const police = inv && inv.state === 'pending' ? `🚓 Police arrive in about ${Math.max(5, Math.round(inv.t / 5) * 5)} min`
    : inv && inv.state === 'driving' ? '🚓 The police are pulling up!'
    : inv && inv.state === 'searching' ? `🕵️ ${inv.detective.title} is searching the house`
    : g.pendingInquiry ? '🚓 Another squad car is on its way' : '🚓 The police are on their way';
  const ends = looseEnds(g);
  const witnesses = ends.damning.map(t => {
    const home = talkers(t).filter(x => x.rel);
    const lab = t.proof && t.proof();
    const fix = !g.tips.includes(t) ? 'he has their statement: get to the evidence before he does (not while he watches)'
      : home.length ? `talk to ${list(home.map(x => x.first))}: Get your stories straight`
      : lab ? 'the lab backs them up: nothing to clean' : 'a stranger: clear away what they saw';
    return { who: t.by, what: t.what, fix };
  });
  const items = [...ga.items.values()].map(it => ({ ...it, label: `${it.icon} ${cap(it.what)}` }));
  return { police, items, witnesses, risk: stakes(g, ends), run: cantRun(g) };
}

// Getting caught. When someone sees you at your dirty work, what they do depends on how they feel about
// whoever it's meant for, and about you: they cover for you, sell you their silence, or call the police.
// The police check the witness's story against the evidence (emergency.js); if it's still there, you're
// arrested. A police officer who catches you red-handed doesn't need to check anything.
import { spend } from './career.js';
import { reportCrime } from './emergency.js';

export const HATE = -40;                 // the relationship at which someone would happily see you (or them) dead
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rel = (a, b) => (a.rel && a.rel[b.id]) || 0;
function bond(a, b, d) {
  a.rel[b.id] = clamp(rel(a, b) + d, -100, 100);
  b.rel[a.id] = clamp(rel(b, a) + d, -100, 100);
}

const COVER_LINES = ["I didn't see a thing.", 'Need a lookout?', 'Finally, someone with initiative.', "My lips are sealed. Make it hurt.", "I'll say I was with you."];
const BLACKMAIL_LINES = ['Shame if someone called the police...', "Silence isn't free, roomie.", 'I saw everything. Pay up.'];
const REPORT_LINES = ['Hello, police? My roommate is up to something.', "I'm calling the cops!", 'Police! Now!'];
const SELF_LINES = ["That's meant for ME?!", "You're trying to KILL me?!", 'Police! My roommate is trying to kill me!'];

const isPolice = x => x.kind === 'detective' || (x.kind === 'visitor' && x.visitKind === 'cop');
const say = (g, x, lines) => { if (x.rel) g.dialogue.say(x, 'witness', 2, pick(lines)); };

// Who a roommate thinks it's meant for: the named victim, or else the housemate they like least.
// If there's nobody else it could be for, it's for them.
function meantFor(g, x, victim) {
  if (victim) return victim;
  const others = g.sims.filter(s => s.alive && s !== g.player && s !== x);
  if (!others.length) return x;
  return others.reduce((a, b) => (rel(x, b) < rel(x, a) ? b : a));
}

// How one witness reacts: 'arrest' | 'cover' | 'blackmail' | 'talk' | 'report'.
function reaction(g, me, x, victim) {
  if (isPolice(x)) return { kind: 'arrest' };
  if (x.kind === 'biker') return { kind: 'cheer' };
  // Neighbours who have had it with this house don't much care what happens in it.
  if (x.kind === 'visitor' && x.visitKind === 'neighbour' && g.visit && g.visit.side && g.neighbours[g.visit.side].patience < 30) return { kind: 'cover', fedUp: true };
  const smooth = (me.skills.charisma || 0) * 0.07;   // "It's not what it looks like!"
  if (!x.rel) return { kind: Math.random() < smooth / 2 ? 'talk' : 'report' };
  const v = meantFor(g, x, victim);
  if (v === x) return { kind: Math.random() < smooth / 2 ? 'talk' : 'report', mine: true };
  const hateThem = rel(x, v), hateYou = rel(x, me);
  if (hateThem <= HATE && hateYou > HATE) return { kind: 'cover', v };
  // They hate you both: whoever they hate more decides it.
  if (hateThem <= HATE) return hateThem < hateYou ? { kind: 'blackmail', v, price: 30 + Math.round((-hateYou - 40) / 2) } : { kind: 'report', v, spite: true };
  return { kind: Math.random() < smooth ? 'talk' : 'report', v };
}

// Your character (`me`) was just seen doing `what` near `cells`. `ids` is the evidence it left behind
// (see emergency.js); `victim` is the sim it was done to, if there was one; `proof` checks for evidence
// that isn't lying around the house (a poisoned drink shows up in the victim's blood).
export function witnessCrime(g, me, cells, what, { ids = [], victim = null, proof = null, obj = null } = {}) {
  if (me !== g.player || g.over) return;
  // Two missionaries see the same thing: one of them does the talking.
  const seen = g.witnesses(cells).filter((x, i, all) => x !== me && x !== victim && (x.rel || all.findIndex(o => o.first === x.first) === i));
  if (!seen.length) return;
  g.seenSabotage = true;
  const act = what[0].toLowerCase() + what.slice(1);
  const reports = [];
  // Whoever saw you rig something knows better than to use it.
  if (obj) obj.knownBy = [...(obj.knownBy || []), ...seen.filter(x => x.rel).map(x => x.id)];
  for (const x of seen) {
    const r = reaction(g, me, x, victim);
    const saw = `${x.first} saw ${me.first} ${act}`;
    if (r.kind === 'arrest') {
      g.arrest(`🚔 ${x.title || x.first} saw ${me.first} ${act}. Caught red-handed: ${me.first} is cuffed on the spot.`);
      return;
    }
    if (r.kind === 'cheer') {
      g.log(`🏍️ ${saw} and whoops. Respect.`, 'dim');
    } else if (r.kind === 'cover') {
      if (x.rel) bond(x, me, 10);
      g.log(r.fedUp ? `🤫 ${saw}. After everything this house has put them through, they decide they saw nothing.`
        : `🤝 ${saw}, and gives a slow nod. ${x.first} has never liked ${r.v.first}. Your secret is safe.`, 'tool');
      say(g, x, [...COVER_LINES, `Make sure it's ${r.v.first}.`]);
    } else if (r.kind === 'blackmail' && spend(g, r.price)) {
      bond(x, me, -5);
      g.log(`🤐 ${saw}. ${x.first} hates ${r.v.first} even more than ${me.first}, so the silence only costs $${r.price}. (paid)`, 'warn');
      say(g, x, BLACKMAIL_LINES);
    } else if (r.kind === 'talk') {
      if (x.rel) bond(x, me, -10);
      g.log(`🗣️ ${saw}. "It's not what it looks like!" ${me.first} talks fast, and ${x.first} half-believes it.${g.contract ? ' (+5 suspicion)' : ''}`, 'warn');
      g.addSuspicion(5);
    } else {
      if (x.rel) bond(x, me, -30);
      const why = r.kind === 'blackmail' ? `${me.first} can't pay their price of $${r.price}, so they call the police.`
        : r.spite ? `${x.first} can't stand ${r.v.first}, but they hate ${me.first} even more. They call the police.`
        : r.mine ? `${x.first} realises it's meant for them, and calls the police.` : null;
      g.log(why ? `📞 ${saw}. ${why}` : `📞 ${saw} and calls the police!`, 'warn');
      say(g, x, r.mine ? SELF_LINES : REPORT_LINES);
      reports.push(x);
    }
  }
  if (!reports.length) return;
  const sus = g.upgrade('silent') ? 8 : 15;
  g.addSuspicion(sus, `🚨 A witness statement is on its way to the station. (+${sus} suspicion)`);
  reportCrime(g, { by: reports.map(x => x.first).join(' and '), who: me.first, what: act, ids, proof });
}

// Being seen tidying up isn't a crime, but it doesn't look great either.
export function witnessCleanup(g, me, cells, what) {
  if (me !== g.player) return;
  const seen = g.witnesses(cells).filter(x => x !== me);
  if (!seen.length) return;
  g.log(`👀 ${seen.map(x => x.first).join(' and ')} watched ${me.first} ${what[0].toLowerCase() + what.slice(1)}. Very thoroughly.${g.contract ? ' (+5 suspicion)' : ''}`, 'warn');
  g.addSuspicion(5);
}

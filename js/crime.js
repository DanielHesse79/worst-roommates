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
  const ward = x.houseRole && x.houseRole.ward !== null ? g.sims.find(s => s.id === x.houseRole.ward) : null;
  if (ward && ward.alive) return ward;
  const others = g.sims.filter(s => s.alive && s !== g.player && s !== x);
  if (!others.length) return x;
  // Everyone knows who the house's problem is: they assume it's meant for one of the targets.
  const pool = others.filter(s => s.role === 'target').length ? others.filter(s => s.role === 'target') : others;
  return pool.reduce((a, b) => (rel(x, b) < rel(x, a) ? b : a));
}

// How one witness reacts: 'arrest' | 'cover' | 'blackmail' | 'talk' | 'report'.
function reaction(g, me, x, victim) {
  if (isPolice(x)) return { kind: 'arrest' };
  if (x.kind === 'biker') return { kind: 'cheer' };
  // Neighbours who have had it with this house don't much care what happens in it.
  if (x.kind === 'visitor' && x.visitKind === 'neighbour' && g.visit && g.visit.side && g.neighbours[g.visit.side].patience < 30) return { kind: 'cover', fedUp: true };
  const smooth = Math.max(0, (me.skills.charisma || 0) * 0.07 + (g.diff ? g.diff.talk : 0));   // "It's not what it looks like!"
  if (!x.rel) return { kind: Math.random() < smooth / 2 ? 'talk' : 'report' };
  const v = meantFor(g, x, victim);
  if (v === x) return { kind: Math.random() < smooth / 2 ? 'talk' : 'report', mine: true };
  const hateThem = rel(x, v), hateYou = rel(x, me);
  if (hateThem <= HATE && hateYou > HATE) return { kind: 'cover', v };
  // Win someone's trust (and cool their feelings for the victim) and they'll look the other way.
  if (hateYou >= 50 && hateYou > hateThem + 20) return { kind: 'cover', v, trust: true };
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
      g.arrest(`🚔 ${x.title || x.first} saw ${me.first} ${act}. Caught red-handed: ${me.first} is cuffed on the spot.`, x);
      return;
    }
    if (r.kind === 'cheer') {
      g.log(`🏍️ ${saw} and whoops. Respect.`, 'dim');
    } else if (r.kind === 'cover') {
      if (x.rel) bond(x, me, 10);
      g.log(r.fedUp ? `🤫 ${saw}. After everything this house has put them through, they decide they saw nothing.`
        : r.trust ? `🤝 ${saw}, and decides ${me.first} must have a good reason. Trust is a wonderful thing.`
        : `🤝 ${saw}, and gives a slow nod. ${x.first} has never liked ${r.v.first}. Your secret is safe.`, 'tool');
      say(g, x, [...COVER_LINES, `Make sure it's ${r.v.first}.`]);
    } else if (r.kind === 'blackmail' && !g.ui.choosing) {
      g.log(`🤐 ${saw}. ${x.first} hates ${r.v.first} even more than ${me.first}, and wants to talk terms.`, 'warn');
      say(g, x, BLACKMAIL_LINES);
      blackmail(g, me, x, r, { who: me.first, what: act, ids, proof });
    } else if (r.kind === 'talk') {
      if (x.rel) bond(x, me, -10);
      g.log(`🗣️ ${saw}. "It's not what it looks like!" ${me.first} talks fast, and ${x.first} half-believes it.${g.contract ? ' (+5 suspicion)' : ''}`, 'warn');
      g.addSuspicion(5);
    } else {
      if (x.rel) bond(x, me, -30);
      const why = r.spite ? `${x.first} can't stand ${r.v.first}, but they hate ${me.first} even more. They call the police.`
        : r.mine ? `${x.first} realises it's meant for them, and calls the police.` : null;
      g.log(why ? `📞 ${saw}. ${why}` : `📞 ${saw} and calls the police!`, 'warn');
      say(g, x, r.mine ? SELF_LINES : REPORT_LINES);
      reports.push(x);
    }
  }
  if (reports.length) callPolice(g, { by: reports.map(x => x.first).join(' and '), who: me.first, what: act, ids, proof });
}

function callPolice(g, tip) {
  const sus = g.upgrade('silent') ? 8 : 15;
  g.addSuspicion(sus, `🚨 A witness statement is on its way to the station. (+${sus} suspicion)`);
  reportCrime(g, tip);
}

// A witness who'll keep quiet for a price. The game waits while you decide: pay, haggle, promise them
// the death they want, or call their bluff.
function blackmail(g, me, x, r, tip) {
  const v = r.v, price = r.price, half = Math.ceil(price / 2);
  const haggle = Math.min(0.9, 0.25 + (me.skills.charisma || 0) * 0.06);
  const bluff = Math.min(0.85, 0.35 + Math.max(0, -rel(x, me) - 40) / 150);
  const talk = () => callPolice(g, { ...tip, by: x.first });
  g.ui.choose(`🤐 ${x.first} wants hush money`,
    `${x.first} saw ${me.first} ${tip.what}. They hate ${v.first} even more than they hate ${me.first}, so they're open to a deal. You have $${Math.max(0, Math.floor(g.cash))}.`, [
      { label: `💵 Pay $${price}`, note: g.cash < price ? "You can't afford it" : 'Silence, guaranteed', disabled: g.cash < price, run() {
        spend(g, price);
        bond(x, me, -5);
        g.log(`🤐 ${me.first} pays ${x.first} $${price}. Their lips are sealed.`, 'tool');
      } },
      { label: '🗣️ Haggle', note: `${Math.round(haggle * 100)}% chance they settle for $${half}. If not, they call the police`, run() {
        if (Math.random() < haggle && spend(g, half)) {
          g.log(`🗣️ ${me.first} talks ${x.first} down to $${half}. A bargain, for silence.`, 'tool');
          return;
        }
        g.log(`🗣️ ${x.first} is insulted by ${me.first}'s offer and reaches for the phone.`, 'warn');
        bond(x, me, -15);
        talk();
      } },
      { label: `🤝 Promise ${v.first} will be dead by tomorrow night`, note: "They keep quiet if you deliver. If not, they talk", run() {
        g.favours.push({ by: x, victim: v, until: g.clock + 1440, tip: { ...tip, by: x.first } });
        bond(x, me, 10);
        g.log(`🤝 ${me.first} and ${x.first} shake on it: ${v.first} is dead within a day, and ${x.first} never saw a thing.`, 'tool');
      } },
      { label: '🎲 Call their bluff', note: `${Math.round(bluff * 100)}% chance they really call the police`, run() {
        bond(x, me, -10);
        if (Math.random() < bluff) { g.log(`🎲 ${x.first} was not bluffing.`, 'warn'); talk(); return; }
        g.log(`🎲 ${x.first} grumbles, glares, and keeps quiet. For now.`, 'tool');
      } },
    ]);
}

// Promises made to blackmailers: keep them, or they talk.
export function updateFavours(g) {
  if (!g.favours.length || g.over) return;
  g.favours = g.favours.filter(f => {
    if (!f.by.alive) return false;
    if (!f.victim.alive) {
      g.log(`🤝 ${f.by.first}, looking at ${f.victim.first}'s grave: "Pleasure doing business."`, 'tool');
      if (g.player) bond(f.by, g.player, 15);
      return false;
    }
    if (g.clock < f.until) return true;
    g.log(`📞 ${f.by.first} got tired of waiting for ${f.victim.first} to drop dead, and calls the police.`, 'warn');
    callPolice(g, f.tip);
    return false;
  });
}

// Being seen tidying up isn't a crime, but it doesn't look great either.
export function witnessCleanup(g, me, cells, what) {
  if (me !== g.player) return;
  const seen = g.witnesses(cells).filter(x => x !== me);
  if (!seen.length) return;
  g.log(`👀 ${seen.map(x => x.first).join(' and ')} watched ${me.first} ${what[0].toLowerCase() + what.slice(1)}. Very thoroughly.${g.contract ? ' (+5 suspicion)' : ''}`, 'warn');
  g.addSuspicion(5);
}

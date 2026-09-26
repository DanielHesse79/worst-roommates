import { ROSTER } from './data.js';

// The campaign: each contract names one or more fixed targets 🎯 and the player picks who they'll be.
// Every target has to die before the deadline without you getting caught; any death counts. The client's
// preferred way of dying, and finishing early, are worth the other two stars.

export const CAUSE_VERB = {
  Fire: 'die in a fire', Drowning: 'drown', Electrocution: 'be electrocuted', Starvation: 'starve',
  Poison: 'die of poison', Fight: 'die in a fight', Meteor: 'be hit by a meteor',
  Slip: 'slip to their death', Crushed: 'be crushed', Explosion: 'be blown up', Piranhas: 'be eaten by piranhas',
  Fright: 'be scared to death', 'Bear Trap': 'die in a bear trap', Fart: 'die from a silent-but-deadly one',
  'Letter Bomb': 'open a letter bomb', Boredom: 'be bored to death', Laughter: 'die laughing', 'Car Crash': 'be hit by a car', 'Biker Gang': 'be beaten up by bikers', 'Bad Breath': 'die of bad breath', Slipper: 'be taken out by a flying slipper',
};

const CAUSE_PAST = {
  Fire: 'burned to death', Drowning: 'drowned', Electrocution: 'was electrocuted', Starvation: 'starved',
  Poison: 'was poisoned', Fight: 'was killed in a fight', Meteor: 'was flattened by a meteor',
  Slip: 'slipped and died', Crushed: 'was crushed', Explosion: 'was blown up', Piranhas: 'was eaten by piranhas',
  Fright: 'was scared to death', 'Bear Trap': 'died in a bear trap', Fart: 'was gassed',
  'Letter Bomb': 'was killed by a letter bomb', Boredom: 'was bored to death', Laughter: 'died laughing', 'Car Crash': 'was hit by a car', 'Biker Gang': 'was beaten up by a biker gang', 'Bad Breath': 'died of bad breath', Slipper: 'was taken out by a flying slipper',
};

export const CONTRACTS = [
  {
    id: 'pool', title: 'Housewarming Gift', client: 'A neighbour who hates splashing',
    brief: "Chad Malwood can't swim and never admits he's tired. The neighbour wants him gone. Quietly.",
    hint: "Wait until Chad is tired and swimming, then hide the pool ladder when nobody is watching. Working a shift first gives you an alibi, but only for what happens while you're gone.",
    days: 3, cash: 80, pay: 100,
    targets: [{ name: 'Chad Malwood', traits: ['noswim', 'lazy'], personality: 'drama', needs: { energy: 45 } }],
    objectives: [{ type: 'die', who: 0, cause: 'Drowning' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 3 }],
  },
  {
    id: 'kitchen', title: 'Kitchen Nightmare', client: "Gordon's food critic",
    brief: 'Gordon Rot has never cooked a meal in his life. The critic would like him to start. Tonight.',
    hint: "Clumsy sims with no cooking skill are a hazard at the stove. His mum Agatha hovers over him and undoes any sabotage she catches you at: send her out for pizza, or turn her against him, before you loosen that gas valve.",
    days: 3, cash: 100, pay: 150,
    targets: [{ name: 'Gordon Rot', traits: ['clumsy', 'glutton'], personality: 'vampire', skills: { cooking: 0 } }],
    housemates: [{ name: 'Agatha Rot', traits: ['paranoid', 'lazy'], personality: 'drama', role: 'guardian', ward: 0, about: "Gordon's doting mum. She moved in to keep an eye on her boy." }],
    objectives: [{ type: 'die', who: 0, cause: 'Fire' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 3 }],
  },
  {
    id: 'wiring', title: 'Bad Reception', client: 'The cable company',
    brief: "Doyle Vane owes three years of cable fees and swears he'll fix the TV himself.",
    hint: "The TV is already broken, and Doyle is clumsy with no handiness at all. Fraying the wiring needs Handiness 3: study the DIY manuals on the bookshelf first. Wanda would love to see Doyle fried and looks the other way; Cornelius just wants peace and quiet.",
    days: 3, cash: 100, pay: 150,
    targets: [{ name: 'Doyle Vane', traits: ['clumsy', 'lazy'], personality: 'schemer', skills: { handiness: 0 } }],
    housemates: [
      { name: 'Wanda Vipers', traits: ['hotheaded', 'glutton'], personality: 'narcissist', role: 'hater', ward: 0, about: 'Doyle owes her money too. Lots.' },
      { name: 'Cornelius Cruze', traits: ['paranoid', 'stargazer'], personality: 'vampire', role: 'peacekeeper', about: 'A light sleeper with a heavy sigh.' },
    ],
    setup(g) { g.world.objects.get('tv').broken = true; },
    objectives: [{ type: 'die', who: 0, cause: 'Electrocution' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 3 }],
  },
  {
    id: 'locked', title: 'Locked In', client: "Mortimer's landlord",
    brief: 'Mortimer Scowle refuses to leave the bedroom, or pay rent. The landlord says: fine, never leave then.',
    hint: 'Brick up both bedroom doors while Mortimer is inside and you are not. Bricks cost money and Handiness 2, and bricking is slow work: do it unseen.',
    days: 4, cash: 160, pay: 200,
    targets: [{ name: 'Mortimer Scowle', traits: ['glutton', 'lazy'], personality: 'vampire', needs: { hunger: 40, energy: 30 } }],
    objectives: [{ type: 'die', who: 0, cause: 'Starvation' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 4 }],
  },
  {
    id: 'talked', title: 'Talked to Death', client: 'Everyone who has ever met Ophelia',
    brief: "Ophelia Blight is already bored of everything. The client would like to see how much further that can go.",
    hint: "Anyone can tell an endless story, but Adam is a professional. Drain her Fun first — his silent treatment helps — and nobody suspects boredom.",
    days: 3, cash: 60, pay: 200,
    targets: [{ name: 'Ophelia Blight', traits: ['clumsy', 'stargazer'], personality: 'drama', needs: { fun: 45 } }],
    objectives: [{ type: 'die', who: 0, cause: 'Boredom' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 3 }],
  },
  {
    id: 'siblings', title: 'Sibling Rivalry', client: 'Their tired mother',
    brief: "Reginald and Bartholomew Thorne have been at each other's throats for forty years. Mother wants it settled — both ways.",
    hint: "Bartholomew hits far harder: stir Reginald up until they brawl. But Granny breaks up every fight, so send her out for pizza first. Then poison the leftovers (Chemistry 2): Bartholomew eats anything, Reginald is too paranoid to.",
    days: 4, cash: 120, pay: 250,
    targets: [
      { name: 'Reginald Thorne', traits: ['paranoid', 'lazy'], personality: 'vampire' },
      { name: 'Bartholomew Thorne', traits: ['hotheaded', 'glutton'], personality: 'narcissist' },
    ],
    rels: [[0, 1, -70]],
    housemates: [{ name: 'Granny Thorne', traits: ['paranoid', 'genius'], personality: 'drama', role: 'peacekeeper', about: 'Has broken up their fights for forty years. Undefeated.' }],
    objectives: [{ type: 'die', who: 0, cause: 'Fight' }, { type: 'die', who: 1, cause: 'Poison' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 4 }],
  },
  {
    id: 'stars', title: 'Written in the Stars', client: 'An astrologer with a grudge',
    brief: 'Ophelia Nightshade keeps publishing better horoscopes. The astrologer says the heavens should intervene.',
    hint: "Meteors come to those who taunt the sky once Doom is 2 or more, and the telescope only works at night. Research the dark arts at the computer by day to raise Doom (Sister Séance does it twice as fast). Her assistant Beatrix never leaves her side, so a meteor could take them both: get her out of the way first.",
    days: 4, cash: 100, pay: 250,
    targets: [{ name: 'Ophelia Nightshade', traits: ['stargazer', 'pyro'], personality: 'narcissist' }],
    housemates: [{ name: 'Beatrix Cinder', traits: ['stargazer', 'clumsy'], personality: 'vampire', role: 'guardian', ward: 0, about: "Ophelia's devoted assistant. Carries the telescope." }],
    objectives: [{ type: 'die', who: 0, cause: 'Meteor' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 3 }],
  },
  {
    id: 'chili', title: 'Silent but Deadly', client: 'The roommate with the good nose',
    brief: 'Gordon Bleu hogs the bathroom every morning for an hour. The house has decided it will be his last hour.',
    hint: "Eat Grandma's chili yourself (you're immune to your own farts; Gassy Gus was born for this), then corner Gordon in the bathroom. Small rooms concentrate the problem.",
    days: 3, cash: 100, pay: 300, requires: ['chili'],
    targets: [{ name: 'Gordon Bleu', traits: ['lazy', 'clumsy'], personality: 'drama' }],
    objectives: [{ type: 'die', who: 0, cause: 'Fart' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 3 }],
  },
  {
    id: 'water', title: 'Something in the Water', client: 'An aquarium with a grudge',
    brief: 'Mildred Vane stole three prize piranhas from the city aquarium. The aquarium would like them fed.',
    hint: 'Piranhas are expensive: work a few shifts first. Stock the pool, wait for Mildred to swim, and hide the ladder. Stay out of the water yourself.',
    days: 4, cash: 180, pay: 350, requires: ['piranhas'],
    targets: [{ name: 'Mildred Vane', traits: ['glutton', 'stargazer'], personality: 'narcissist' }],
    objectives: [{ type: 'die', who: 0, cause: 'Piranhas' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 3 }],
  },
  {
    id: 'delivery', title: 'Special Delivery', client: 'The local postman',
    brief: 'Reginald Gall has reported the postman to head office eleven times. The postman has one last parcel for him.',
    hint: "A letter bomb needs Handiness 4 and $80. Reginald is paranoid and won't touch a suspicious parcel: keep him awake or gaslight him until he's confused, and stay away from the mailbox.",
    days: 4, cash: 150, pay: 400, requires: ['letterbomb'],
    targets: [{ name: 'Reginald Gall', traits: ['paranoid', 'hotheaded'], personality: 'narcissist' }],
    objectives: [{ type: 'die', who: 0, cause: 'Letter Bomb' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 3 }],
  },
  {
    id: 'reckoning', title: 'The Reckoning', client: 'The entire neighbourhood',
    brief: 'The Doom family. Four of them. Nobody on the street will miss a single one — but it has to look like a string of tragic accidents.',
    hint: 'All four must die, and all four will be after you. The client would love three different ways of dying: earn, plan, and spread it out.',
    days: 6, cash: 200, pay: 600,
    targets: [
      { name: 'Lucius Doom', traits: ['hotheaded', 'clumsy'], personality: 'schemer' },
      { name: 'Griselda Doom', traits: ['glutton', 'noswim'], personality: 'vampire' },
      { name: 'Ambrose Doom', traits: ['pyro', 'lazy'], personality: 'drama' },
      { name: 'Ursula Doom', traits: ['stargazer', 'paranoid'], personality: 'narcissist' },
    ],
    objectives: [{ type: 'allDie' }, { type: 'distinct', n: 3 }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 5 }],
  },
];

// Sim vs Sim: pick who you are and who you'd most like to see dead. Your nemesis moves in with all their
// own talents, hates you from day one and is out to get you too. Poetic justice (the death that suits
// them) is worth a star. The immortals (Asraa and Daniel) are never on anyone's list.
export const canBeNemesis = r => !r.immortal;
export const POETIC = {
  gloria: ['Electrocution', 'a ring light too close to the bath'], silas: ['Car Crash', 'hit by a car with no brakes, just like the ones he sells'],
  dolly: ['Fright', 'one last dramatic scream'], adam: ['Crushed', 'buried under a shelf of books he would have summarised for you'],
  pete: ['Explosion', 'out with a bang'], bertha: ['Slip', 'the bigger they are'], gus: ['Fire', 'his chili meets an open flame'],
  seance: ['Meteor', 'she never saw it coming'], nermin: ['Slip', 'tripped over her own slipper'], vincent: ['Drowning', 'he gargles with pool water, so let him gargle the lot'],
};

export function versusContract(meId, foeId) {
  const me = ROSTER.find(r => r.id === meId), foe = ROSTER.find(r => r.id === foeId);
  const [cause, why] = POETIC[foeId] || ['Fire', 'it seemed fitting'];
  const first = foe.first || foe.name.split(' ')[0];
  return {
    id: `vs-${meId}-${foeId}`, versus: true, title: `${me.name} vs ${foe.name}`, client: me.name,
    brief: `${me.name} has had enough of ${foe.name}. One of you is leaving this house in a hearse.`,
    hint: `${first} knows you're coming and is out to get you too. Poetic justice earns a star: ideally ${first} should ${CAUSE_VERB[cause]} (${why}).`,
    days: 4, cash: 150, pay: 200,
    targets: [{ ...foe, nemesis: true }],
    rels: [[0, 1, -70]],
    objectives: [{ type: 'die', who: 0, cause }],
    bonus: [{ type: 'wish', text: `Poetic justice: ${first} should ${CAUSE_VERB[cause]}` }, { type: 'before', day: 3 }],
  };
}

const targets = g => g.sims.filter(s => s.role === 'target');

// The job is to kill every target without getting caught; *how* they die is the client's wish, worth a star.
export function describeObjective(o, sims) {
  const who = o.who !== undefined ? sims[o.who].first : '';
  if (o.type === 'die') return o.cause ? `${who} must die (ideally: ${CAUSE_VERB[o.cause]})` : `${who} must die`;
  if (o.type === 'allDie') return 'Every target must die';
  if (o.type === 'distinct') return `Ideally: at least ${o.n} different causes of death`;
  return '?';
}

// Did this objective go the way the client wanted? null while it can still happen.
export function wishState(o, g) {
  if (o.type === 'die') {
    const sim = g.sims[o.who];
    if (sim.alive) return null;
    return !o.cause || sim.cause === o.cause;
  }
  if (o.type === 'distinct') {
    const causes = new Set(targets(g).filter(s => !s.alive).map(s => s.cause)).size;
    if (causes >= o.n) return true;
    return causes + targets(g).filter(s => s.alive).length < o.n ? false : null;
  }
  return true;
}
export const wishMet = g => g.contract.objectives.every(o => wishState(o, g) === true);

export function describeBonus(b) {
  if (b.type === 'suspicion') return `Keep suspicion under ${b.max}`;
  if (b.type === 'before') return b.day === 2 ? 'Finish on Day 1' : `Finish before Day ${b.day}`;
  if (b.type === 'wish') return b.text || "Kill them the way the client asked";
  return '?';
}

// 'done' | 'pending' for a single objective. `who` indexes the targets (sims[0..n)). Any death counts.
export function objectiveState(o, g) {
  if (o.type === 'die') return g.sims[o.who].alive ? 'pending' : 'done';
  if (o.type === 'allDie') return targets(g).every(s => !s.alive) ? 'done' : 'pending';
  const w = wishState(o, g);
  return w === null ? 'pending' : w ? 'done' : 'missed';
}

// Won once every target is dead and you're still standing. Getting exposed, dying, eviction and the
// deadline are the ways to lose (see main.js).
export function evaluate(g) {
  const them = g.contract.versus ? targets(g)[0].first : 'Your roommates';
  if (g.player && !g.player.alive) return { state: 'failed', reason: `${g.player.name} ${CAUSE_PAST[g.player.cause] || 'died'}. ${them} got you first.` };
  return { state: targets(g).every(s => !s.alive) ? 'won' : 'active' };
}

export const causeDone = sim => CAUSE_PAST[sim.cause] || 'died';

export function bonusMet(b, g) {
  if (b.type === 'suspicion') return g.peakSuspicion < b.max;
  if (b.type === 'before') return (g.getaway ? g.getaway.since : g.clock) < (b.day - 1) * 1440; // the job was done when the getaway began
  if (b.type === 'wish') return wishMet(g);
  return false;
}

export function starsFor(g) {
  const bonuses = g.contract.bonus.map(b => ({ text: describeBonus(b), met: bonusMet(b, g) }));
  return { count: 1 + bonuses.filter(b => b.met).length, bonuses };
}

// Player profile: best stars per contract, crypto, black-market purchases, the last character played,
// lifetime score, every way of dying discovered so far, and personal bests per contract and character.
const KEY = 'worst-roommates-progress';
export function loadProgress() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { p = {}; }
  return { stars: p.stars || {}, money: p.money || 0, owned: p.owned || [], character: p.character || (p.crew || [])[0] || null,
    score: p.score || 0, causes: p.causes || [], best: p.best || {}, difficulty: p.difficulty || 'normal' };
}

// How hard the house fights back. The same information and controls at every level: the difference is
// money, time, how quickly the police move, how easily witnesses are talked round, how fast suspicion
// fades and how often the others strike first.
export const DIFFICULTIES = {
  easy: { name: 'Brat', icon: '😈', desc: 'For learning and messing about: more money, cheaper rent, an extra day, slow police, forgiving witnesses, and roommates who rarely strike back.',
    cash: 1.5, rent: 25, days: 1, police: 1.6, fade: 1.6, talk: 0.15, hostile: 0.5, pay: 0.75 },
  normal: { name: 'Plotter', icon: '🗡️', desc: 'The game as intended: plan ahead, and improvise when it goes wrong.',
    cash: 1, rent: 40, days: 0, police: 1, fade: 1, talk: 0, hostile: 1, pay: 1 },
  hard: { name: 'Total Chaos', icon: '💀', desc: 'For masters of the house: tight money, a day less, fast police, sharp witnesses, and roommates who strike first.',
    cash: 0.7, rent: 55, days: -1, police: 0.6, fade: 0.6, talk: -0.1, hostile: 1.6, pay: 1.5 },
};

// A contract as played at a difficulty: the deadline (and the "finish early" star with it) moves.
export function atDifficulty(contract, diff) {
  const d = DIFFICULTIES[diff], shift = n => Math.max(2, n + d.days);
  return { ...contract, days: shift(contract.days), bonus: contract.bonus.map(b => (b.type === 'before' ? { ...b, day: shift(b.day) } : b)) };
}

// Stars and personal bests are kept per difficulty. Plotter (normal) keeps the original keys.
export const starKey = (contractId, diff) => (diff === 'normal' ? contractId : `${contractId}@${diff}`);
export const bestKey = (contractId, charId, diff = 'normal') => `${contractId}|${charId}${diff === 'normal' ? '' : '|' + diff}`;
export function bestFor(profile, contractId, diff = 'normal') {
  let top = null;
  for (const [key, points] of Object.entries(profile.best || {})) {
    const [id, who, level = 'normal'] = key.split('|');
    if (id === contractId && level === diff && (!top || points > top.points)) top = { points, who };
  }
  return top;
}
export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable: progress lasts this session */ }
}
// Beating the previous contract at any difficulty opens the next one.
export function isUnlocked(i, profile) {
  return i === 0 || Object.keys(DIFFICULTIES).some(d => (profile.stars[starKey(CONTRACTS[i - 1].id, d)] || 0) > 0);
}

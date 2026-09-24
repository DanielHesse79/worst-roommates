// The campaign: each contract names one or more fixed targets 🎯 and the player picks who they'll be.
// Every target has to die before the deadline without you getting caught; any death counts. The client's
// preferred way of dying, and finishing early, are worth the other two stars.

export const CAUSE_VERB = {
  Fire: 'die in a fire', Drowning: 'drown', Electrocution: 'be electrocuted', Starvation: 'starve',
  Poison: 'die of poison', Fight: 'die in a fight', Meteor: 'be hit by a meteor',
  Slip: 'slip to their death', Crushed: 'be crushed', Explosion: 'be blown up', Piranhas: 'be eaten by piranhas',
  Fright: 'be scared to death', 'Bear Trap': 'die in a bear trap', Fart: 'die from a silent-but-deadly one',
  'Letter Bomb': 'open a letter bomb', Boredom: 'be bored to death', Laughter: 'die laughing', 'Car Crash': 'be hit by a car', 'Biker Gang': 'be beaten up by bikers', 'Bad Breath': 'die of bad breath',
};

const CAUSE_PAST = {
  Fire: 'burned to death', Drowning: 'drowned', Electrocution: 'was electrocuted', Starvation: 'starved',
  Poison: 'was poisoned', Fight: 'was killed in a fight', Meteor: 'was flattened by a meteor',
  Slip: 'slipped and died', Crushed: 'was crushed', Explosion: 'was blown up', Piranhas: 'was eaten by piranhas',
  Fright: 'was scared to death', 'Bear Trap': 'died in a bear trap', Fart: 'was gassed',
  'Letter Bomb': 'was killed by a letter bomb', Boredom: 'was bored to death', Laughter: 'died laughing', 'Car Crash': 'was hit by a car', 'Biker Gang': 'was beaten up by a biker gang', 'Bad Breath': 'died of bad breath',
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
    hint: 'Clumsy sims with no cooking skill are a hazard at the stove. Loosen the gas valve (you need a little handiness), or guilt-trip him into cooking as Dolly. Stay away from the flames yourself.',
    days: 3, cash: 100, pay: 150,
    targets: [{ name: 'Gordon Rot', traits: ['clumsy', 'glutton'], personality: 'vampire', skills: { cooking: 0 } }],
    objectives: [{ type: 'die', who: 0, cause: 'Fire' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 3 }],
  },
  {
    id: 'wiring', title: 'Bad Reception', client: 'The cable company',
    brief: "Doyle Vane owes three years of cable fees and swears he'll fix the TV himself.",
    hint: 'The TV is already broken, and Doyle is clumsy with no handiness at all. Fraying the wiring needs Handiness 3: study the DIY manuals on the bookshelf first.',
    days: 3, cash: 100, pay: 150,
    targets: [{ name: 'Doyle Vane', traits: ['clumsy', 'lazy'], personality: 'schemer', skills: { handiness: 0 } }],
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
    hint: 'Bartholomew hits far harder: smear Reginald until they brawl. Then poison the leftovers (Chemistry 2): Bartholomew eats anything, Reginald is too paranoid to.',
    days: 4, cash: 120, pay: 250,
    targets: [
      { name: 'Reginald Thorne', traits: ['paranoid', 'lazy'], personality: 'vampire' },
      { name: 'Bartholomew Thorne', traits: ['hotheaded', 'glutton'], personality: 'narcissist' },
    ],
    rels: [[0, 1, -70]],
    objectives: [{ type: 'die', who: 0, cause: 'Fight' }, { type: 'die', who: 1, cause: 'Poison' }],
    bonus: [{ type: 'wish' }, { type: 'before', day: 4 }],
  },
  {
    id: 'stars', title: 'Written in the Stars', client: 'An astrologer with a grudge',
    brief: 'Ophelia Nightshade keeps publishing better horoscopes. The astrologer says the heavens should intervene.',
    hint: 'Meteors come to those who taunt the sky once Doom is 2 or more, and the telescope only works at night. Research the dark arts at the computer by day to raise Doom (Sister Séance does it twice as fast).',
    days: 4, cash: 100, pay: 250,
    targets: [{ name: 'Ophelia Nightshade', traits: ['stargazer', 'pyro'], personality: 'narcissist' }],
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
  if (b.type === 'wish') return "Kill them the way the client asked";
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
  if (g.player && !g.player.alive) return { state: 'failed', reason: `${g.player.name} ${CAUSE_PAST[g.player.cause] || 'died'}. Your roommates got you first.` };
  return { state: targets(g).every(s => !s.alive) ? 'won' : 'active' };
}

export const causeDone = sim => CAUSE_PAST[sim.cause] || 'died';

export function bonusMet(b, g) {
  if (b.type === 'suspicion') return g.peakSuspicion < b.max;
  if (b.type === 'before') return g.clock < (b.day - 1) * 1440;
  if (b.type === 'wish') return wishMet(g);
  return false;
}

export function starsFor(g) {
  const bonuses = g.contract.bonus.map(b => ({ text: describeBonus(b), met: bonusMet(b, g) }));
  return { count: 1 + bonuses.filter(b => b.met).length, bonuses };
}

// Player profile: best stars per contract, blood money, black-market purchases and the last character played.
const KEY = 'worst-roommates-progress';
export function loadProgress() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { p = {}; }
  return { stars: p.stars || {}, money: p.money || 0, owned: p.owned || [], character: p.character || (p.crew || [])[0] || null };
}
export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable: progress lasts this session */ }
}
export function isUnlocked(i, profile) {
  return i === 0 || (profile.stars[CONTRACTS[i - 1].id] || 0) > 0;
}

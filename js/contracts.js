// The campaign: each contract names one or more fixed targets 🎯. The player picks which of their own
// crew 🤝 moves in alongside them. Targets must die the specified way; the crew must all survive.

export const CAUSE_VERB = {
  Fire: 'die in a fire', Drowning: 'drown', Electrocution: 'be electrocuted', Starvation: 'starve',
  Poison: 'die of poison', Fight: 'die in a fight', Meteor: 'be hit by a meteor',
  Slip: 'slip to their death', Crushed: 'be crushed', Explosion: 'be blown up', Piranhas: 'be eaten by piranhas',
  Fright: 'be scared to death', 'Bear Trap': 'die in a bear trap', Fart: 'die from a silent-but-deadly one',
  'Letter Bomb': 'open a letter bomb', Boredom: 'be bored to death', Laughter: 'die laughing', 'Car Crash': 'be hit by a car',
};

const CAUSE_PAST = {
  Fire: 'burned to death', Drowning: 'drowned', Electrocution: 'was electrocuted', Starvation: 'starved',
  Poison: 'was poisoned', Fight: 'was killed in a fight', Meteor: 'was flattened by a meteor',
  Slip: 'slipped and died', Crushed: 'was crushed', Explosion: 'was blown up', Piranhas: 'was eaten by piranhas',
  Fright: 'was scared to death', 'Bear Trap': 'died in a bear trap', Fart: 'was gassed',
  'Letter Bomb': 'was killed by a letter bomb', Boredom: 'was bored to death', Laughter: 'died laughing', 'Car Crash': 'was hit by a car',
};

export const CONTRACTS = [
  {
    id: 'pool', title: 'Housewarming Gift', client: 'A neighbour who hates splashing',
    brief: "Chad Malwood can't swim and never admits he's tired. The neighbour wants him gone. Quietly.",
    hint: "Send Chad for a swim when his energy is low. Once he's in, make the ladder disappear — when nobody is watching.",
    days: 2, malice: 40, pay: 100, slots: 1,
    targets: [{ name: 'Chad Malwood', traits: ['noswim', 'lazy'], personality: 'drama', needs: { energy: 45 } }],
    objectives: [{ type: 'die', who: 0, cause: 'Drowning' }],
    bonus: [{ type: 'suspicion', max: 30 }, { type: 'before', day: 2 }],
  },
  {
    id: 'kitchen', title: 'Kitchen Nightmare', client: "Gordon's food critic",
    brief: 'Gordon Rot has never cooked a meal in his life. The critic would like him to start. Tonight.',
    hint: 'Clumsy sims with no cooking skill are a hazard at the stove — Dolly can guilt-trip him into cooking. Keep your own people away from the flames.',
    days: 2, malice: 50, pay: 150, slots: 1,
    targets: [{ name: 'Gordon Rot', traits: ['clumsy', 'glutton'], personality: 'vampire', skills: { cooking: 0 } }],
    objectives: [{ type: 'die', who: 0, cause: 'Fire' }],
    bonus: [{ type: 'noGod' }, { type: 'suspicion', max: 25 }],
  },
  {
    id: 'wiring', title: 'Bad Reception', client: 'The cable company',
    brief: "Doyle Vane owes three years of cable fees and swears he'll fix the TV himself.",
    hint: 'The TV is already broken, Doyle is clumsy and has no handiness at all. Gaslighting him first makes it even likelier.',
    days: 2, malice: 50, pay: 150, slots: 1,
    targets: [{ name: 'Doyle Vane', traits: ['clumsy', 'lazy'], personality: 'schemer', skills: { handiness: 0 } }],
    setup(g) { g.world.objects.get('tv').broken = true; },
    objectives: [{ type: 'die', who: 0, cause: 'Electrocution' }],
    bonus: [{ type: 'suspicion', max: 20 }, { type: 'before', day: 2 }],
  },
  {
    id: 'locked', title: 'Locked In', client: "Mortimer's landlord",
    brief: 'Mortimer Scowle refuses to leave the bedroom, or pay rent. The landlord says: fine, never leave then.',
    hint: 'Brick up both bedroom doors while Mortimer is inside and your crew is not. Bricking is loud work — do it unseen.',
    days: 3, malice: 90, pay: 200, slots: 1,
    targets: [{ name: 'Mortimer Scowle', traits: ['glutton', 'lazy'], personality: 'vampire', needs: { hunger: 40, energy: 30 } }],
    objectives: [{ type: 'die', who: 0, cause: 'Starvation' }],
    bonus: [{ type: 'suspicion', max: 60 }, { type: 'before', day: 3 }],
  },
  {
    id: 'talked', title: 'Talked to Death', client: 'Everyone who has ever met Ophelia',
    brief: "Ophelia Blight is already bored of everything. The client would like to see how much further that can go.",
    hint: "Anyone can tell an endless story, but Adam is a professional. Drain her Fun first — his silent treatment helps — and nobody suspects boredom.",
    days: 2, malice: 40, pay: 200, slots: 1,
    targets: [{ name: 'Ophelia Blight', traits: ['clumsy', 'stargazer'], personality: 'drama', needs: { fun: 45 } }],
    objectives: [{ type: 'die', who: 0, cause: 'Boredom' }],
    bonus: [{ type: 'noGod' }, { type: 'suspicion', max: 10 }],
  },
  {
    id: 'siblings', title: 'Sibling Rivalry', client: 'Their tired mother',
    brief: "Reginald and Bartholomew Thorne have been at each other's throats for forty years. Mother wants it settled — both ways.",
    hint: 'Bartholomew hits far harder — have Reginald provoke him and let the brawls begin. Then spoil the leftovers: Bartholomew eats anything, Reginald is too paranoid to.',
    days: 3, malice: 70, pay: 250, slots: 1,
    targets: [
      { name: 'Reginald Thorne', traits: ['paranoid', 'lazy'], personality: 'vampire' },
      { name: 'Bartholomew Thorne', traits: ['hotheaded', 'glutton'], personality: 'narcissist' },
    ],
    rels: [[0, 1, -70]],
    objectives: [{ type: 'die', who: 0, cause: 'Fight' }, { type: 'die', who: 1, cause: 'Poison' }],
    bonus: [{ type: 'suspicion', max: 50 }, { type: 'before', day: 3 }],
  },
  {
    id: 'stars', title: 'Written in the Stars', client: 'An astrologer with a grudge',
    brief: 'Ophelia Nightshade keeps publishing better horoscopes. The astrologer says the heavens should intervene.',
    hint: 'Meteors come to those who taunt the sky — but the telescope only works at night. Research the dark arts by day to raise Doom (Sister Séance does it twice as fast).',
    days: 3, malice: 60, pay: 250, slots: 2,
    targets: [{ name: 'Ophelia Nightshade', traits: ['stargazer', 'pyro'], personality: 'narcissist' }],
    objectives: [{ type: 'die', who: 0, cause: 'Meteor' }],
    bonus: [{ type: 'noGod' }, { type: 'before', day: 2 }],
  },
  {
    id: 'chili', title: 'Silent but Deadly', client: 'The roommate with the good nose',
    brief: 'Gordon Bleu hogs the bathroom every morning for an hour. The house has decided it will be his last hour.',
    hint: "Feed Grandma's chili to one of your own (Gassy Gus was born for this), then trap them in the bathroom with Gordon. Small rooms concentrate the problem.",
    days: 2, malice: 70, pay: 300, slots: 1, requires: ['chili'],
    targets: [{ name: 'Gordon Bleu', traits: ['lazy', 'clumsy'], personality: 'drama' }],
    objectives: [{ type: 'die', who: 0, cause: 'Fart' }],
    bonus: [{ type: 'suspicion', max: 25 }, { type: 'before', day: 2 }],
  },
  {
    id: 'water', title: 'Something in the Water', client: 'An aquarium with a grudge',
    brief: 'Mildred Vane stole three prize piranhas from the city aquarium. The aquarium would like them fed.',
    hint: 'Stock the pool, get Mildred swimming, and make sure the ladder is gone when she tries to leave. Keep your crew out of the water.',
    days: 3, malice: 80, pay: 350, slots: 2, requires: ['piranhas'],
    targets: [{ name: 'Mildred Vane', traits: ['glutton', 'stargazer'], personality: 'narcissist' }],
    objectives: [{ type: 'die', who: 0, cause: 'Piranhas' }],
    bonus: [{ type: 'suspicion', max: 60 }, { type: 'before', day: 2 }],
  },
  {
    id: 'delivery', title: 'Special Delivery', client: 'The local postman',
    brief: 'Reginald Gall has reported the postman to head office eleven times. The postman has one last parcel for him.',
    hint: "Reginald is paranoid and won't touch a suspicious parcel — gaslight him until he's confused, and keep your crew away from the mailbox.",
    days: 3, malice: 80, pay: 400, slots: 2, requires: ['letterbomb'],
    targets: [{ name: 'Reginald Gall', traits: ['paranoid', 'hotheaded'], personality: 'narcissist' }],
    objectives: [{ type: 'die', who: 0, cause: 'Letter Bomb' }],
    bonus: [{ type: 'suspicion', max: 70 }, { type: 'before', day: 2 }],
  },
  {
    id: 'reckoning', title: 'The Reckoning', client: 'The entire neighbourhood',
    brief: 'The Doom family. Four of them. Nobody on the street will miss a single one — but it has to look like a string of tragic accidents.',
    hint: 'All four must die, in at least three different ways. Spread it out — a pile of identical deaths looks planned.',
    days: 4, malice: 120, pay: 600, slots: 2,
    targets: [
      { name: 'Lucius Doom', traits: ['hotheaded', 'clumsy'], personality: 'schemer' },
      { name: 'Griselda Doom', traits: ['glutton', 'noswim'], personality: 'vampire' },
      { name: 'Ambrose Doom', traits: ['pyro', 'lazy'], personality: 'drama' },
      { name: 'Ursula Doom', traits: ['stargazer', 'paranoid'], personality: 'narcissist' },
    ],
    objectives: [{ type: 'allDie' }, { type: 'distinct', n: 3 }],
    bonus: [{ type: 'suspicion', max: 60 }, { type: 'before', day: 3 }],
  },
];

const targets = g => g.sims.filter(s => s.role === 'target');

export function describeObjective(o, sims) {
  const who = o.who !== undefined ? sims[o.who].first : '';
  if (o.type === 'die') return o.cause ? `${who} must ${CAUSE_VERB[o.cause]}` : `${who} must die`;
  if (o.type === 'allDie') return 'Every target must die';
  if (o.type === 'distinct') return `At least ${o.n} different causes of death`;
  return '?';
}

export function describeBonus(b) {
  if (b.type === 'suspicion') return `Keep suspicion under ${b.max}`;
  if (b.type === 'before') return b.day === 2 ? 'Finish on Day 1' : `Finish before Day ${b.day}`;
  if (b.type === 'noGod') return 'Use no Hand of Fate powers';
  return '?';
}

// 'done' | 'failed' | 'pending' for a single objective. `who` indexes the targets (sims[0..n)).
export function objectiveState(o, g) {
  const sim = o.who !== undefined ? g.sims[o.who] : null;
  if (o.type === 'die') {
    if (sim.alive) return 'pending';
    return !o.cause || sim.cause === o.cause ? 'done' : 'failed';
  }
  if (o.type === 'allDie') return targets(g).every(s => !s.alive) ? 'done' : 'pending';
  if (o.type === 'distinct') {
    const causes = new Set(targets(g).filter(s => !s.alive).map(s => s.cause)).size;
    if (causes >= o.n) return 'done';
    return causes + targets(g).filter(s => s.alive).length < o.n ? 'failed' : 'pending';
  }
  return 'pending';
}

export function evaluate(g) {
  const lost = g.sims.find(s => s.role === 'crew' && !s.alive);
  if (lost) return { state: 'failed', reason: `You lost ${lost.name}. Your own people are supposed to walk out alive.` };
  for (const o of g.contract.objectives) {
    if (objectiveState(o, g) !== 'failed') continue;
    const sim = o.who !== undefined ? g.sims[o.who] : null;
    if (o.type === 'die') return { state: 'failed', reason: `${sim.name} ${CAUSE_PAST[sim.cause]}. The client specifically wanted them to ${CAUSE_VERB[o.cause]}.` };
    return { state: 'failed', reason: 'Too many of them died the same way. It looks planned.' };
  }
  return { state: g.contract.objectives.every(o => objectiveState(o, g) === 'done') ? 'won' : 'active' };
}

export function bonusMet(b, g) {
  if (b.type === 'suspicion') return g.peakSuspicion < b.max;
  if (b.type === 'before') return g.clock < (b.day - 1) * 1440;
  if (b.type === 'noGod') return !g.godUsed;
  return false;
}

export function starsFor(g) {
  const bonuses = g.contract.bonus.map(b => ({ text: describeBonus(b), met: bonusMet(b, g) }));
  return { count: 1 + bonuses.filter(b => b.met).length, bonuses };
}

// Player profile: best stars per contract, blood money, black-market purchases and last crew picks.
const KEY = 'worst-roommates-progress';
export function loadProgress() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { p = {}; }
  return { stars: p.stars || {}, money: p.money || 0, owned: p.owned || [], crew: p.crew || [] };
}
export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable: progress lasts this session */ }
}
export function isUnlocked(i, profile) {
  return i === 0 || (profile.stars[CONTRACTS[i - 1].id] || 0) > 0;
}

// Your character's working life: a job that pays by the shift, rent due every midnight, and the cash
// that pays for every "accident". Being at work is also the best alibi money can buy.
const rand = (a, b) => a + Math.random() * (b - a);

export const SKILLS = [['cooking', '🍳', 'Cooking'], ['handiness', '🔧', 'Handiness'], ['charisma', '💋', 'Charisma'], ['chemistry', '⚗️', 'Chemistry'], ['logic', '💻', 'Logic']];
export const RENT = 40;
const MAX_MISSED = 3;

// One job per character. `skill` drives promotions; `home` jobs are done at the computer.
export const JOBS = {
  gloria: { place: 'a photo shoot', titles: ['Aspiring Influencer', 'Micro-Influencer', 'Brand Ambassador'], skill: 'charisma', pay: [70, 130, 250], start: 11, hours: 6 },
  silas: { place: 'the used-car lot', titles: ['Used-Car Salesman', 'Sales Manager', 'Dealership Owner'], skill: 'charisma', pay: [90, 140, 210], start: 9, hours: 8 },
  dolly: { place: 'the TV studio', titles: ['Soap Opera Extra', 'Soap Opera Villain', 'Soap Opera Legend'], skill: 'charisma', pay: [70, 120, 200], start: 8, hours: 8 },
  adam: { place: 'the call centre', titles: ['Telemarketer', 'Senior Telemarketer', 'Call Centre Manager'], skill: 'charisma', pay: [80, 120, 180], start: 9, hours: 8 },
  asraa: { place: 'the law firm', titles: ['Junior Expert Witness', 'Expert Witness', 'Senior Partner'], skill: 'chemistry', pay: [140, 220, 340], start: 9, hours: 7 },
  daniel: { place: 'his desk', home: true, titles: ['Obscure Indie Dev', 'Cult Indie Dev', 'Actual Game Developer'], skill: 'logic', pay: [60, 120, 220], start: 10, hours: 6 },
  pete: { place: 'the fireworks shop', titles: ['Fireworks Clerk', 'Pyrotechnician', 'Fireworks Tycoon'], skill: 'handiness', pay: [80, 130, 200], start: 12, hours: 8 },
  bertha: { place: 'the nightclub door', titles: ['Bouncer', 'Head Bouncer', 'Club Owner'], skill: 'charisma', pay: [90, 140, 220], start: 21, hours: 7 },
  gus: { place: 'the chili shack', titles: ['Line Cook', 'Chili Chef', 'Chili Cook-off Champion'], skill: 'cooking', pay: [80, 130, 210], start: 11, hours: 8 },
  seance: { place: 'the psychic hotline', home: true, titles: ['Hotline Psychic', 'Medium', 'Medium to the Stars'], skill: 'charisma', pay: [70, 130, 240], start: 20, hours: 5 },
};

const clock = h => `${String(Math.floor(h) % 24).padStart(2, '0')}:00`;

export function initCareer(g, charId, startCash) {
  g.cash = startCash;
  g.billDay = 0;
  g.debtDays = 0;
  g.job = { def: JOBS[charId], level: 0, perf: 30, missed: 0, fired: false, state: 'home', shiftDay: -1, shiftStart: 0 };
}

export const jobTitle = j => j.def.titles[j.level];
export const shiftPay = j => j.def.pay[j.level];
export const shiftTime = j => `${clock(j.def.start)}–${clock(j.def.start + j.def.hours)}`;

export function spend(g, amount) {
  if (g.cash < amount) return false;
  g.cash -= amount;
  return true;
}

// Performance after a shift: good mood and the job's skill push it up; turning up exhausted drags it down.
function review(g, p) {
  const j = g.job, def = j.def;
  const skill = p.skills[def.skill] || 0;
  j.perf += (p.mood() - 50) / 3 + skill * 3 + rand(-5, 5) - (p.needs.energy < 15 ? 15 : 0);
  if (j.perf >= 100 && j.level < def.titles.length - 1) {
    j.level++;
    j.perf = 30;
    g.log(`📈 Promotion! ${p.first} is now ${jobTitle(j)}. Pay per shift: $${shiftPay(j)}.`, 'tool');
    g.sfx('win');
  }
  j.perf = Math.max(-50, Math.min(100, j.perf));
}

function payday(g, p, share = 1) {
  const j = g.job;
  const amount = Math.round(shiftPay(j) * share * (0.85 + p.mood() / 330));
  g.cash += amount;
  return amount;
}

// The bus to work: walk to the front gate and you're gone for the shift.
export const GO_TO_WORK = {
  id: 'gowork', label: 'Go to work', icon: '💼', duration: 1, spot: () => [10, 15], facePos: () => [10.5, 17],
  finish(s, t, g) { leaveForWork(g, s); },
};

// Home jobs (Daniel's games, the psychic hotline) are worked at the computer; they pay as you go.
export const WORK_AT_HOME = {
  id: 'workhome', label: 'Work from home', icon: '💻', spot: (s, t, g) => g.world.objects.get('computer').use,
  duration: (s, t, g) => g.job.def.hours * 60,
  available: (s, t, g) => !g.world.objects.get('computer').charred,
  tick(s, t, g, a, m) {
    g.cash += shiftPay(g.job) * (0.85 + s.mood() / 330) * m / (g.job.def.hours * 60);
    s.addNeed('fun', -0.05 * m);
  },
  finish(s, t, g) {
    review(g, s);
    g.log(`💻 ${s.first} logs off after a shift as ${jobTitle(g.job)}. The money is in.`, 'dim');
  },
};

function leaveForWork(g, p) {
  const j = g.job;
  if (j.state !== 'going') return;
  j.state = 'away';
  j.returnAt = j.shiftStart + j.def.hours * 60;
  p.endAction();
  p.queue = [];
  p.status.away = true;
  p.home = [p.x, p.z];
  p.x = 10.5; p.z = -60; // off the map: nobody can see, hurt or blame you here
  g.log(`🚌 ${p.first} catches the bus to ${j.def.place}. Back at ${clock(j.def.start + j.def.hours)}. Whatever happens at home now, ${p.first} was at work.`, 'tool');
}

function comeHome(g, p) {
  const j = g.job;
  j.state = 'home';
  p.status.away = false;
  p.place(10, 15);
  p.lastCell = null;
  review(g, p);
  const amount = payday(g, p);
  p.addNeed('social', 20);
  g.log(`🏠 ${p.first} gets home from ${j.def.place}. 💵 +$${amount}. (${jobTitle(j)}, performance ${Math.round(j.perf)}%)`, 'tool');
}

function missShift(g, p) {
  const j = g.job;
  j.state = 'home';
  j.missed++;
  j.perf -= 30;
  p.queue = p.queue.filter(a => a.def !== GO_TO_WORK);
  if (p.action && p.action.def === GO_TO_WORK) p.endAction();
  if (j.missed >= MAX_MISSED) {
    j.fired = true;
    g.log(`📉 ${p.first} missed one shift too many and is fired from ${j.def.place}. No more pay cheques. (Look for a new job at the computer.)`, 'warn');
  } else {
    g.log(`🚌 The bus leaves without ${p.first}. That's a missed shift (${j.missed}/${MAX_MISSED}) and no pay today.`, 'warn');
  }
}

// Called by the computer's "look for a new job" action.
export function rehire(g) {
  const j = g.job;
  Object.assign(j, { level: 0, perf: 20, missed: 0, fired: false, state: 'home' });
}

export function updateCareer(g, min) {
  const p = g.player;
  if (!p || g.result) return;
  // Midnight: rent and bills. Two nights in the red and the landlord changes the locks.
  const day = Math.floor(g.clock / 1440);
  if (day > g.billDay) {
    g.billDay = day;
    g.cash -= RENT;
    if (g.cash >= 0) {
      g.debtDays = 0;
      g.log(`🧾 Rent and bills: -$${RENT}. 💵 $${Math.floor(g.cash)} left.`, 'dim');
    } else if (++g.debtDays >= 2) {
      g.log(`🧾 Rent bounces again. The landlord changes the locks.`, 'warn');
      if (g.contract) g.endContract(false, `Evicted. ${p.first} couldn't pay the rent two nights running.`);
      else { g.cash = 0; g.debtDays = 0; g.log('🧾 (Free play: the landlord takes pity. This once.)', 'dim'); }
      return;
    } else {
      g.log(`🧾 Rent is due and ${p.first} is $${Math.ceil(-g.cash)} short. Pay it off by tomorrow night or get evicted.`, 'warn');
      g.ui.toast('🧾 You can\'t make rent! Work a shift before midnight.');
    }
  }
  if (!p.alive) return;
  const j = g.job;
  if (!j || j.fired) return;
  const hour = (g.clock / 60) % 24;
  if (j.state === 'home' && j.shiftDay !== day && hour >= j.def.start && hour < j.def.start + 1) {
    j.shiftDay = day;
    j.shiftStart = day * 1440 + j.def.start * 60;
    if (j.def.home) {
      p.queue.unshift({ def: WORK_AT_HOME, target: j, source: 'work', stage: 'go', t: 0, duration: 0, data: {} });
      g.log(`💻 Shift time: ${p.first} has ${j.def.hours} hours of work at the computer.`, 'dim');
      return;
    }
    j.state = 'going';
    if (p.action && p.action.source === 'auto') p.endAction();
    p.queue.unshift({ def: GO_TO_WORK, target: j, source: 'work', stage: 'go', t: 0, duration: 0, data: {} });
    g.log(`💼 Time for work at ${j.def.place}. The bus leaves at ${clock(j.def.start + 1)}; walk to the front gate to catch it.`, 'dim');
    g.sfx('knock');
  } else if (j.state === 'going' && g.clock > j.shiftStart + 60) {
    missShift(g, p);
  } else if (j.state === 'away' && g.clock >= j.returnAt) {
    comeHome(g, p);
  }
}

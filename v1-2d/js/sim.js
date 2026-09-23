// sim.js — evil sims: their needs, autonomous wickedness, and how they die

const FIRST_NAMES = ['Chad', 'Mildred', 'Reginald', 'Delilah', 'Bartholomew', 'Ivy', 'Gordon',
  'Petunia', 'Cornelius', 'Wanda', 'Malcolm', 'Griselda', 'Ambrose', 'Ophelia', 'Doyle', 'Ursula'];
const LAST_NAMES = ['Malwood', 'Grimshaw', 'Vipers', 'Cruze', 'Fang', 'Nightshade', 'Rot',
  'Wicked', 'Vane', 'Blight', 'Scowle', 'Thorne', 'Ashgrave', 'Cinder', 'Gall', 'Doom'];

function randomName(usedNames) {
  let name;
  let guard = 0;
  do {
    name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)] + ' ' +
      LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    guard++;
  } while (usedNames.has(name) && guard < 50);
  usedNames.add(name);
  return name;
}

const SIM_COLORS = ['#e0574a', '#4a90e0', '#e0c04a', '#7ae06a', '#c26ae0', '#e08a4a', '#4ae0c0', '#e04a9a'];

const CAUSE_LINES = {
  Fire: [
    'burned to a crisp, having started the fire themselves.',
    'went up in flames while insisting they had it under control.',
    'was reduced to ash mid-monologue about their evil plans.',
  ],
  Drowning: [
    'drowned after someone thoughtfully removed the pool ladder.',
    'discovered too late that treading water is not a long-term plan.',
    'sank while cursing whoever took the ladder.',
  ],
  Poison: [
    'ate the leftovers. The leftovers won.',
    'should have checked the fridge before eating out of spite.',
    'died clutching their stomach and a half-eaten sandwich.',
  ],
  Electrocution: [
    'turned on the appliance and never turned off again.',
    'got a shocking surprise mid-channel-surf.',
    'became a cautionary tale about frayed wiring.',
  ],
  Starvation: [
    'was too busy scheming to remember to eat.',
    'starved while plotting everyone else\'s downfall.',
    'wasted away, evil to the very last breath.',
  ],
  'Meteor Strike': [
    'was struck from orbit. Statistically unlikely. Poetically perfect.',
    'looked up at exactly the wrong moment.',
    'never saw it coming. Neither did anyone else.',
  ],
  'Beaten in a Fight': [
    'lost a fight they absolutely started.',
    'talked a big game and then got flattened.',
    'discovered their rival hit harder than their insults.',
  ],
};

function pickLine(cause) {
  const lines = CAUSE_LINES[cause] || ['met an unremarkable, if thoroughly deserved, end.'];
  return lines[Math.floor(Math.random() * lines.length)];
}

class Sim {
  constructor(name, color, tier) {
    this.name = name;
    this.color = color;
    this.tier = tier;
    this.x = 2 + Math.random() * 10;
    this.y = 2 + Math.random() * 6;
    this.targetX = this.x;
    this.targetY = this.y;

    const baseHealth = 100 + tier * 15;
    this.maxHealth = baseHealth;
    this.health = baseHealth;
    this.hunger = 60 + Math.random() * 30;
    this.energy = 60 + Math.random() * 30;
    this.hygiene = 60 + Math.random() * 30;
    this.fun = 60 + Math.random() * 30;
    this.social = 60 + Math.random() * 30;
    this.evil = 40 + Math.random() * 40;

    this.alive = true;
    this.poisoned = false;
    this.inPool = false;
    this.busyTicks = 0;
    this.currentAction = null; // {type, objectId, targetId}
    this.mood = '🙂';
    this.deathCause = null;
    this.deathLine = null;
  }

  mostUrgentNeed() {
    const needs = { hunger: this.hunger, energy: this.energy, hygiene: this.hygiene, fun: this.fun, social: this.social };
    let worst = 'hunger';
    let worstVal = Infinity;
    for (const k in needs) {
      if (needs[k] < worstVal) { worstVal = needs[k]; worst = k; }
    }
    return worst;
  }

  averageMood() {
    return (this.hunger + this.energy + this.hygiene + this.fun + this.social) / 5;
  }

  updateMoodFace() {
    if (!this.alive) { this.mood = '💀'; return; }
    if (this.poisoned) { this.mood = '🤢'; return; }
    const m = this.averageMood();
    if (m > 70) this.mood = '😊';
    else if (m > 45) this.mood = '😐';
    else if (m > 20) this.mood = '😠';
    else this.mood = '😡';
  }

  distanceTo(x, y) {
    return Math.hypot(this.x - x, this.y - y);
  }

  moveToward(x, y, speed) {
    const dx = x - this.x, dy = y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.15) { this.x = x; this.y = y; return true; }
    this.x += (dx / dist) * speed;
    this.y += (dy / dist) * speed;
    return false;
  }

  die(cause, game) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.deathCause = cause;
    this.deathLine = pickLine(cause);
    this.inPool = false;
    this.currentAction = null;
    this.updateMoodFace();
    game.onSimDied(this, cause);
  }
}

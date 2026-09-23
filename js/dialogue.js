// Sitcom timing uses real seconds, so fast-forward never turns dialogue into a strobe.
const PICK = items => items[Math.floor(Math.random() * items.length)];
const KEY = 'worst-roommates-dialogue';

export const LINES = {
  arrival: ['Lovely place. Weird number of waivers.', 'I give this household three business days.', 'The rent is low. Suspiciously low.', 'Finally. A fresh start with worse people.'],
  fire: ['Is the smoke alarm being sarcastic?', 'This is NOT what I meant by a housewarming.', 'The deposit is absolutely gone.'],
  trapped: ['I would like to unsubscribe from this floor.', 'Is this covered by the cleaning rota?'],
  stuck: ['Who put the exit behind a paywall?', 'The ladder has left the group chat.'],
  poison: ['The leftovers have a very long finish.', 'Was the expiry date a threat?', 'My stomach has filed a formal complaint.'],
  gassy: ['That was the floorboards. All of them.', 'I have become the open-plan problem.'],
  hunger: ['Whose name is on the emergency cheese?', 'I could eat a horse. Is that what is in the fridge?'],
  energy: ['My personality is running on 2%.', 'Wake me when the lease expires.'],
  suspicious: ['I am starting a group chat without you.', 'Why does the insurance agent know our names?', 'That is the third extremely normal accident.'],
  death: ['So... is their shelf in the fridge available?', 'Do we split their share of the Wi-Fi bill?', 'I am not telling the landlord.', 'This is going to ruin our inspection score.'],
  immortal: ['Cute. Anyway, where were we?', 'Death and I have a scheduling conflict.', 'My plot armour is dry-clean only.'],
  meteor: ['That is a very aggressive shooting star.', 'I wished for SPACE. Personal space.'],
  chat: ['We should really have a house meeting.', 'Which one of us is the red flag?', 'The walls are thin. So is my patience.'],
  insult: ['You have the energy of a damp receipt.', 'Even the mould wants a different roommate.', 'Your vibe has a cancellation fee.'],
  fight: ['We are settling the thermostat debate.', 'Consider this constructive feedback.'],
  cook: ['The recipe says medium. I feel extreme.', 'Smoke is just seasoning with ambition.'],
  grill: ['Rare, medium, or legally complicated?'],
  snack: ['If it glows, it counts as a vegetable.', 'Someone wrote DO NOT EAT. A serving suggestion.'],
  swim: ['Finally, a room without opinions.', 'I checked the water. It is definitely wet.'],
  bath: ['A little self-care. What could possibly happen?'],
  repair: ['I watched half a tutorial. We are fine.'],
  read: ['Chapter one: recognising warning signs.'],
  watch: ['Reality TV makes our house seem healthy.'],
  darkarts: ['The terms and conditions want my soul. Standard.'],
  devgame: ['It is not a bug. It is psychological horror.'],
  playtesting: ['Where is the save button? WHERE IS IT?'],
  gaslight: ['We never had a ladder. You imagined stairs.', 'That is not a red flag. That is mood lighting.'],
  triangulate: ['I should not say this. Anyway, listen.'],
  smear: ['It is not gossip if I made a slideshow.'],
  lovebomb: ['We are soulmates. What is your PIN?'],
  lure: ['Come with me. Ignore the ominous music.'],
  guilttrip: ['After everything I have almost done for you.'],
  scene: ['I am being VERY reasonable, dramatically.'],
  silent: ['...'],
  story: ['To understand my dream, we start in 2004.', 'Anyway, that was just the prequel.', 'Long story short: chapter seventeen.'],
  joke: ['Our lease has a survival clause. Fine print.'],
  note: ['Per my last extremely passive-aggressive note.', 'The dishes are not soaking. They are evolving.'],
  narcissist: ['The lighting here does not respect my journey.', 'I am the main character. You are overheads.'],
  schemer: ['My alibi has an alibi.', 'I call it conflict optimisation.'],
  drama: ['I need privacy. And an audience.', 'Nobody panic until I have changed outfits.'],
  vampire: ['Quick question. Do you have six hours?', 'I am an empath. Your energy is now mine.'],
  charmer: ['I am a catch. Read that as a warning.', 'Trust me. Terrible idea, but do it.'],
  hacker: ['Have you tried turning the household off?', 'I put the smart fridge on probation.'],
};

const REPLIES = {
  chat: ['Can this meeting be an email?', 'I miss living alone. With my problems.'],
  insult: ['I am putting that in the group chat.', 'Bold words from someone who owns that towel.'],
  story: ['I have aged during this sentence.', 'Blink twice if the story has an ending.'],
  gaslight: ['I am fairly sure I remember a ladder.', 'I need a second opinion. From a plant.'],
  lovebomb: ['This feels like a subscription trap.'],
  note: ['Your handwriting also needs a rota.', 'I left a note about your note.'],
};

export function situation(sim, game) {
  if (sim.status.onFire > 0 || sim.status.panic > 0) return 'fire';
  if (sim.status.trapped > 0) return 'trapped';
  if (sim.status.stuck) return 'stuck';
  if (sim.status.poisoned > 0) return 'poison';
  if (sim.status.gassy > 0) return 'gassy';
  if (game.wary) return 'suspicious';
  if (sim.needs.hunger < 18) return 'hunger';
  if (sim.needs.energy < 15) return 'energy';
  return null;
}

export class Dialogue {
  constructor(game) {
    this.game = game;
    try { this.enabled = localStorage.getItem(KEY) !== '0'; } catch { this.enabled = true; }
    this.reset();
  }

  reset() {
    this.time = 0;
    this.next = 1;
    this.probe = 0;
    this.active = new Map();
    this.cooldowns = new Map();
    this.recent = new Map();
    this.pending = [];
  }

  toggle() {
    this.enabled = !this.enabled;
    this.active.clear();
    this.pending = [];
    try { localStorage.setItem(KEY, this.enabled ? '1' : '0'); } catch { /* session preference */ }
    return this.enabled;
  }

  say(sim, topic, priority = 0, exact = null) {
    if (!this.enabled || !sim?.alive || sim.status.passedOut > 0) return false;
    const current = this.active.get(sim.id);
    if (current && current.priority >= priority) return false;
    if (priority === 0 && this.time < this.next) return false;
    if (priority < 2 && this.time < (this.cooldowns.get(sim.id) || 0)) return false;
    if (this.active.size >= 2 && !current) {
      const victim = [...this.active.values()].find(b => b.priority < priority);
      if (!victim) return false;
      this.active.delete(victim.sim.id);
    }
    const lines = LINES[topic] || LINES[sim.personality] || LINES.chat;
    const history = this.recent.get(sim.id) || [];
    const fresh = lines.filter(line => !history.includes(line));
    const text = exact || PICK(fresh.length ? fresh : lines);
    this.recent.set(sim.id, [...history, text].slice(-6));
    this.active.set(sim.id, { sim, text, priority, topic, left: 5.5, duration: 5.5 });
    this.cooldowns.set(sim.id, this.time + (priority >= 2 ? 12 : 16));
    this.next = this.time + 3.5;
    this.game.audio.voice(sim.id, priority >= 2 ? 'alarm' : sim.personality, text.length);
    return true;
  }

  action(sim, action) {
    const id = action.def.id;
    if (!LINES[id] || !this.say(sim, id)) return;
    if (action.def.approachSim && REPLIES[id]) {
      this.pending.push({ at: this.time + 3, speaker: sim, sim: action.target, text: PICK(REPLIES[id]), topic: id });
    }
  }

  update(dt, running) {
    if (!running || !this.enabled) return;
    this.time += dt;
    for (const [id, bubble] of this.active) {
      bubble.left -= dt;
      if (bubble.left <= 0 || !bubble.sim.alive) this.active.delete(id);
    }
    this.pending = this.pending.filter(reply => {
      if (reply.at > this.time) return true;
      // No reply after a death, interruption, or walking away from the conversation.
      if (reply.speaker.alive && reply.sim.alive && Math.hypot(reply.sim.x - reply.speaker.x, reply.sim.z - reply.speaker.z) < 3.5) {
        this.say(reply.sim, reply.topic, 1, reply.text);
      }
      return false;
    });
    this.probe -= dt;
    if (this.probe > 0) return;
    this.probe = 0.5;
    for (const sim of this.game.sims) {
      if (!sim.alive || sim.status.passedOut > 0) continue;
      const topic = situation(sim, this.game);
      if (topic && this.time >= (this.cooldowns.get(sim.id) || 0)) {
        if (this.say(sim, topic, ['fire', 'trapped', 'stuck', 'poison'].includes(topic) ? 2 : 0)) return;
      }
    }
    if (this.time < this.next || this.active.size) return;
    const awake = this.game.sims.filter(s => s.alive && s.status.passedOut <= 0 &&
      !['sleep', 'nap'].includes(s.action?.def.id) && this.time >= (this.cooldowns.get(s.id) || 0));
    if (awake.length) {
      const sim = PICK(awake);
      this.say(sim, this.time < 5 ? 'arrival' : sim.action?.stage === 'do' && LINES[sim.action.def.id] ? sim.action.def.id : sim.personality);
      this.next = this.time + 8;
    }
  }
}

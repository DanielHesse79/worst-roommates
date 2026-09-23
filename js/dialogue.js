// Sitcom timing uses real seconds, so fast-forward never turns dialogue into a strobe.
import { LINES, REPLIES } from './lines.js';

export { LINES };

const PICK = items => items[Math.floor(Math.random() * items.length)];
const KEY = 'worst-roommates-dialogue';
const RECENT_GLOBAL = 80; // lines said recently anywhere in the house, oldest first

// Idle chatter rotates between a sim's own material, their personality and general house grumbling.
function idleTopic(sim) {
  const own = sim.rosterId && LINES[sim.rosterId] ? [sim.rosterId, sim.rosterId] : [];
  return PICK([...own, sim.personality, 'idle', 'idle']);
}

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
    this.said = [];
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
    const text = exact || this.freshest(lines);
    this.said = [...this.said, text].slice(-RECENT_GLOBAL);
    this.active.set(sim.id, { sim, text, priority, topic, left: 5.5, duration: 5.5 });
    this.cooldowns.set(sim.id, this.time + (priority >= 2 ? 12 : 16));
    this.next = this.time + 3.5;
    this.game.audio.voice(sim.id, priority >= 2 ? 'alarm' : sim.personality, text.length);
    return true;
  }

  // A line nobody in the house said recently; if every line was, the one said longest ago.
  freshest(lines) {
    const unheard = lines.filter(line => !this.said.includes(line));
    if (unheard.length) return PICK(unheard);
    return [...lines].sort((a, b) => this.said.lastIndexOf(a) - this.said.lastIndexOf(b))[0];
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
      this.say(sim, this.time < 5 ? 'arrival' : sim.action?.stage === 'do' && LINES[sim.action.def.id] && Math.random() < 0.5 ? sim.action.def.id : idleTopic(sim));
      this.next = this.time + 11;
    }
  }
}

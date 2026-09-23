import test from 'node:test';
import assert from 'node:assert/strict';
import { Dialogue, situation } from '../js/dialogue.js';
import { SIM_ACTIONS } from '../js/interactions.js';
import { CAUSES, DEATH_SUSPICION } from '../js/data.js';

function fixture() {
  const sims = Array.from({ length: 3 }, (_, i) => ({
    id: i + 1, first: `Roommate ${i}`, personality: 'schemer', alive: true, x: i, z: 0,
    status: { passedOut: 0, engaged: 10 }, needs: { hunger: 60, energy: 60 },
  }));
  const voices = [];
  const game = { sims, wary: false, audio: { voice: (...args) => voices.push(args) } };
  const dialogue = new Dialogue(game);
  dialogue.time = 2;
  return { sims, dialogue, voices, game };
}

test('pause freezes dialogue lifetime and fast-forward does not alter real-second cooldowns', () => {
  const { sims, dialogue } = fixture();
  assert.equal(dialogue.say(sims[0], 'chat'), true);
  dialogue.update(20, false);
  assert.equal(dialogue.active.get(1).left, 5.5);
  dialogue.game.speed = 3;
  dialogue.update(1, true);
  assert.equal(dialogue.active.get(1).left, 4.5);
  assert.equal(dialogue.say(sims[0], 'insult'), false);
});

test('at most two speakers; emergencies replace casual dialogue', () => {
  const { sims, dialogue } = fixture();
  dialogue.say(sims[0], 'chat', 1);
  dialogue.say(sims[1], 'chat', 1);
  assert.equal(dialogue.say(sims[2], 'chat', 1), false);
  assert.equal(dialogue.say(sims[2], 'fire', 2), true);
  assert.equal(dialogue.active.size, 2);
  assert.equal(dialogue.active.get(3).topic, 'fire');
});

test('all death causes, including Laughter, preserve a finite suspicion meter', () => {
  for (const cause of Object.keys(CAUSES)) {
    assert.ok(Number.isFinite(DEATH_SUSPICION[cause]), `Missing suspicion for ${cause}`);
    assert.ok(DEATH_SUSPICION[cause] >= 0);
  }
});

test('conversation gets a delayed reply while both roommates remain nearby', () => {
  const { sims, dialogue } = fixture();
  dialogue.action(sims[0], { def: { id: 'note', approachSim: true }, target: sims[1] });
  dialogue.update(3.1, true);
  assert.equal(dialogue.active.get(2).topic, 'note');
  assert.match(dialogue.active.get(2).text, /handwriting|note/);
});

test('death or walking away cancels a pending response', () => {
  for (const change of [s => { s.alive = false; }, s => { s.x = 20; }]) {
    const { sims, dialogue } = fixture();
    dialogue.action(sims[0], { def: { id: 'chat', approachSim: true }, target: sims[1] });
    change(sims[1]);
    dialogue.update(3.1, true);
    assert.equal(dialogue.active.has(2), false);
    assert.equal(dialogue.pending.length, 0);
  }
});

test('turning bubbles off clears conversation, persists preference, and suppresses voices', () => {
  const values = new Map();
  globalThis.localStorage = { setItem: (k, v) => values.set(k, v), getItem: k => values.get(k) ?? null };
  try {
    const { sims, dialogue, voices, game } = fixture();
    dialogue.say(sims[0], 'chat');
    dialogue.toggle();
    assert.equal(dialogue.active.size, 0);
    assert.equal(dialogue.say(sims[1], 'fire', 3), false);
    assert.equal(voices.length, 1);
    assert.equal(new Dialogue(game).enabled, false);
    dialogue.reset();
    assert.equal(dialogue.enabled, false);
  } finally { delete globalThis.localStorage; }
});

test('hazards outrank low needs and a reset removes all stale speakers', () => {
  const { sims, dialogue, game } = fixture();
  sims[0].needs.hunger = 0;
  sims[0].status.onFire = 2;
  assert.equal(situation(sims[0], game), 'fire');
  dialogue.say(sims[0], 'fire', 2);
  dialogue.reset();
  assert.equal(dialogue.active.size, 0);
  assert.equal(dialogue.pending.length, 0);
  assert.equal(dialogue.cooldowns.size, 0);
});

test('sleepers do not start incidental monologues', () => {
  const { sims, dialogue } = fixture();
  sims.forEach(s => { s.action = { def: { id: 'sleep' }, stage: 'do' }; });
  dialogue.update(1, true);
  assert.equal(dialogue.active.size, 0);
});

test('passive-aggressive note changes fun and relationships without dealing damage', () => {
  const note = SIM_ACTIONS.find(a => a.id === 'note');
  const sim = id => ({ id, first: `Sim ${id}`, health: 100, rel: {}, needs: { fun: 50 },
    addNeed(key, value) { this.needs[key] += value; } });
  const a = sim(1), b = sim(2), events = [];
  note.finish(a, b, { sfx: s => events.push(s), log() {} });
  assert.equal(a.rel[b.id], -8);
  assert.equal(b.rel[a.id], -8);
  assert.equal(a.needs.fun, 62);
  assert.equal(b.needs.fun, 45);
  assert.equal(b.health, 100);
  assert.deepEqual(events, ['paper']);
});

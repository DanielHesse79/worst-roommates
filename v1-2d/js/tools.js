// tools.js — the player's godly tools of intervention

const TOOL_DEFS = {
  ladder: {
    cost: 10,
    cooldown: 6,
    needsTarget: null,
    message: () => 'You pulled the pool ladder out from under everyone.',
    apply(game) {
      const pool = game.world.pool;
      if (!pool.ladderPresent) return false;
      pool.ladderPresent = false;
      pool.ladderTimer = 15; // ticks until it magically reappears
      return true;
    },
  },
  fire: {
    cost: 20,
    cooldown: 10,
    needsTarget: 'tile',
    message: () => 'Flames erupt where you pointed. The house will regret this.',
    apply(game, tile) {
      if (!tile) return false;
      return igniteTile(game.world, tile.x, tile.y);
    },
  },
  poison: {
    cost: 15,
    cooldown: 14,
    needsTarget: null,
    message: () => 'You slipped something nasty into the fridge.',
    apply(game) {
      const fridge = getObject(game.world, 'fridge');
      if (!fridge || fridge.poisoned) return false;
      fridge.poisoned = true;
      fridge.poisonTimer = 45;
      return true;
    },
  },
  rig: {
    cost: 15,
    cooldown: 14,
    needsTarget: 'object',
    message: obj => `You cross a few wires in the ${obj.type}. The next person to use it is in for a shock.`,
    apply(game, obj) {
      if (!obj || obj.rigged) return false;
      if (!['tv', 'fridge', 'stove'].includes(obj.type)) return false;
      obj.rigged = true;
      return true;
    },
  },
  rumor: {
    cost: 10,
    cooldown: 8,
    needsTarget: 'sim',
    message: sim => `You whisper something vicious about ${sim.name} to anyone who'll listen.`,
    apply(game, sim) {
      if (!sim || !sim.alive) return false;
      sim.evil = Math.min(100, sim.evil + 20);
      sim.social = Math.max(0, sim.social - 25);
      return true;
    },
  },
  meteor: {
    cost: 60,
    cooldown: 45,
    needsTarget: 'sim',
    message: () => null, // apply() already logs the strike itself
    apply(game, sim) {
      if (!sim || !sim.alive) return false;
      const dmg = 90 + Math.random() * 60;
      sim.health -= dmg;
      game.log(`A meteor screams out of the sky and obliterates ${sim.name}'s afternoon.`, 'tool');
      if (sim.health <= 0) sim.die('Meteor Strike', game);
      return true;
    },
  },
};

function createToolState() {
  const cooldowns = {};
  for (const id in TOOL_DEFS) cooldowns[id] = 0;
  return { cooldowns, armed: null };
}

import { TRAITS, PERSONALITIES, FIRST_NAMES, LAST_NAMES, SIM_COLORS, SKIN_TONES, POOL } from './data.js';

const NEED_DECAY = { hunger: 0.1, energy: 0.07, hygiene: 0.08, fun: 0.1, social: 0.07 }; // per game minute
const WALK_SPEED = 3.0; // cells per (real second x speed)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);

let nextId = 1;

export class Sim {
  // `spec` (optional, from a contract) pins name, traits, skills and needs.
  constructor(usedNames, index, spec) {
    this.id = nextId++;
    let name = spec && spec.name, guard = 0;
    while (!name || (usedNames.has(name) && !spec && ++guard < 50)) {
      name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)] + ' ' +
        LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    }
    usedNames.add(name);
    this.name = name;
    this.first = name.split(' ')[0];
    this.color = (spec && spec.color) || SIM_COLORS[index % SIM_COLORS.length];
    this.skin = (spec && spec.skin) || SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    this.look = (spec && spec.look) || null;
    const traitIds = Object.keys(TRAITS).sort(() => Math.random() - 0.5);
    this.traits = spec && spec.traits ? spec.traits : traitIds.slice(0, 2);
    const kinds = Object.keys(PERSONALITIES);
    this.personality = (spec && spec.personality) || kinds[Math.floor(Math.random() * kinds.length)];
    this.sanity = 100;
    this.immortal = !!(spec && spec.immortal);
    this.needs = { hunger: rand(50, 85), energy: rand(55, 90), hygiene: rand(40, 90), fun: rand(40, 85), social: rand(40, 85), ...(spec && spec.needs) };
    this.health = 100;
    const some = () => Math.floor(rand(0, 3));
    this.skills = { cooking: some(), handiness: some(), charisma: some(), chemistry: some(), logic: some(), ...(spec && spec.skills) };
    this.evil = rand(50, 90);
    this.rel = {};
    this.x = 0; this.z = 0;
    this.path = null; this.pathGoal = null; this.pathVersion = -1;
    this.queue = [];
    this.action = null;
    this.status = { poisoned: 0, panic: 0, onFire: 0, trapped: 0, gassy: 0, hairspray: 0, extraHold: false, soak: 0, swimming: false, stuck: false, passedOut: 0, engaged: 0, engagedWith: null };
    this.alive = true;
    this.facing = 0;
    this.moving = false;
    this.thought = null;
    this.swimGoal = null;
  }

  has(t) { return this.traits.includes(t); }
  // Gaslit, or awake for so long they're hallucinating: either way, accidents happen.
  get confused() { return this.sanity < 35 || this.needs.energy < 10; }
  canUse(tactic) { return PERSONALITIES[this.personality].tactics.includes(tactic); }
  get cx() { return Math.floor(this.x); }
  get cz() { return Math.floor(this.z); }
  mood() { const n = this.needs; return (n.hunger + n.energy + n.hygiene + n.fun + n.social) / 5; }
  relWith(o) { return this.rel[o.id] || 0; }

  place(cx, cz) { this.x = cx + 0.5; this.z = cz + 0.5; }

  addNeed(k, v) { this.needs[k] = clamp(this.needs[k] + v, 0, 100); }

  enqueue(def, target, source = 'player') {
    if (source === 'player') {
      // New orders replace free-will plans, but never the shift you're due at.
      this.queue = this.queue.filter(q => q.source === 'player' || q.source === 'work');
      if (this.action && this.action.source === 'auto') this.endAction();
    }
    if (this.queue.length >= 6) this.queue.pop();
    this.queue.push({ def, target, source, stage: 'go', t: 0, duration: 0, data: {} });
  }

  cancel(index, game) {
    if (index === 0 && this.action) {
      if (this.action.stage === 'do' && this.action.def.cancel) this.action.def.cancel(this, this.action.target, game, this.action);
      this.endAction();
    } else {
      this.queue.splice(index - (this.action ? 1 : 0), 1);
    }
  }

  endAction() {
    const a = this.action;
    if (a && a.data.partner) {
      a.data.partner.status.engaged = 0;
      a.data.partner.status.engagedWith = null;
    }
    this.action = null;
    this.path = null;
  }

  // ---------- per-frame update ----------

  update(dt, min, game) {
    this.decay(min, game);
    if (!this.alive) return;
    // At work: off the lot, out of harm's way, and nobody can say you did it.
    if (this.status.away) {
      this.moving = false;
      if (this.needs.hunger < 40) this.addNeed('hunger', 0.25 * min); // lunch at work
      return;
    }

    if (this.status.passedOut > 0) {
      this.status.passedOut -= min;
      this.addNeed('energy', 0.25 * min);
      this.thought = '💤';
      return;
    }

    if (this.status.trapped > 0) {
      this.status.trapped -= min;
      this.moving = false;
      this.thought = '🪤😫';
      return;
    }

    if (this.status.onFire > 0 && !this.status.swimming) {
      this.runForWater(dt, game);
      if (!this.alive) return;
      this.checkCell(game);
      this.updateThought();
      return;
    }
    this.status.sprinting = false;

    if (this.status.swimming) {
      this.swimAround(dt, game);
      if (this.status.soak > 0) this.status.soak -= min;
      const inSwimAction = (this.action && this.action.def.id === 'swim' && this.action.stage === 'do') || this.status.soak > 0;
      if (!inSwimAction) {
        if (game.world.ladder.present) {
          this.exitPool(game);
        } else {
          if (!this.status.stuck) game.log(`🪜 ${this.name} swims to the edge... and finds no ladder. Uh oh.`, 'evil');
          this.status.stuck = true;
          this.thought = '🪜❓';
          return;
        }
      }
    }

    if (this.status.engaged > 0) {
      this.status.engaged -= min;
      const w = this.status.engagedWith;
      if (w) this.facing = Math.atan2(w.x - this.x, w.z - this.z);
      this.separate(dt, game);
      return;
    }

    // Lured: trail after the charmer wherever they go. Love is blind (and fireproof, apparently).
    const f = this.status.follow;
    if (f) {
      if (!f.leader.alive || game.clock > f.until || this.status.swimming) {
        this.status.follow = null;
        game.log(`😶 ${this.first} snaps out of it and wonders why they're standing here.`, 'dim');
      } else {
        if (this.action) this.endAction();
        this.queue = [];
        const leader = f.leader;
        if (Math.hypot(leader.x - this.x, leader.z - this.z) > 1.3 && !leader.status.swimming) {
          const goal = this.adjacentTo(leader, game.world);
          if (goal) this.walkTowards(goal, dt * 1.1, game.world);
        } else {
          this.moving = false;
          this.facing = Math.atan2(leader.x - this.x, leader.z - this.z);
        }
        this.thought = '😍';
        this.checkCell(game);
        return;
      }
    }

    if (!this.action && this.queue.length) this.action = this.queue.shift();
    if (this.action) {
      this.aside = null;
      this.runAction(dt, min, game);
    } else if (this.status.panic > 0) {
      this.panicMove(dt, game);
    } else {
      this.moving = false;
      this.stepAside(dt, game);
    }
    if (!this.alive) return;
    const a = this.action;
    if (!this.moving && (!a || a.stage !== 'do' || a.def.approachSim)) this.separate(dt, game);
    this.checkCell(game);
    if (!this.alive) return;
    this.updateThought();
  }

  // Standing sims (idle or mid-conversation) gently shuffle apart instead of overlapping.
  // Sims using an object stay put; nobody gets nudged off a bed or out of the bath.
  separate(dt, game) {
    const w = game.world;
    for (const o of game.sims) {
      if (o === this || !o.alive || o.status.swimming || this.status.swimming) continue;
      const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz);
      if (d >= 0.55) continue;
      const ux = d > 0.01 ? dx / d : Math.cos(this.id), uz = d > 0.01 ? dz / d : Math.sin(this.id);
      const step = Math.min(0.55 - d, 1.2 * dt);
      const nx = this.x + ux * step, nz = this.z + uz * step, cx = Math.floor(nx), cz = Math.floor(nz);
      if ((cx !== this.cx || cz !== this.cz) && !w.canStep(this.cx, this.cz, cx, cz)) continue;
      this.x = nx; this.z = nz;
    }
  }

  // Fire floor traps etc. when stepping onto a new cell.
  checkCell(game) {
    const cellId = this.cx * 1000 + this.cz;
    if (cellId !== this.lastCell && !this.status.swimming) {
      this.lastCell = cellId;
      game.onEnterCell(this);
    }
  }

  decay(min, game) {
    const n = this.needs;
    for (const k in NEED_DECAY) {
      let d = NEED_DECAY[k];
      if (k === 'hunger' && this.has('glutton')) d *= 1.6;
      if (k === 'energy' && this.has('lazy')) d *= 1.4;
      n[k] = clamp(n[k] - d * min, 0, 100);
    }
    const st = this.status;

    if (st.swimming) {
      let drain = 0.25 + (this.has('noswim') ? 0.25 : 0) + (st.stuck ? 0.4 : 0);
      n.energy = clamp(n.energy - drain * min, 0, 100);
      if (game.world.piranhas && game.piranhaBite(this, min)) return;
      if (n.energy <= 0) return game.kill(this, 'Drowning');
    } else if (n.energy <= 0 && st.passedOut <= 0) {
      st.passedOut = 120;
      this.endAction();
      game.log(`${this.name} collapses from exhaustion right where they stand.`, 'evil');
    }

    const sleeping = this.action && this.action.stage === 'do' && (this.action.def.id === 'sleep' || this.action.def.id === 'nap');
    this.sanity = Math.min(100, this.sanity + (sleeping ? 0.1 : 0.025) * min);
    if (this.confused && this.action && this.action.source === 'auto' && Math.random() < 0.01 * min) {
      this.endAction();
      game.log(`🌀 ${this.first} forgets what they were doing and just... stands there.`, 'dim');
    }
    if (this.lovebomb && game.clock > this.lovebomb.at) {
      const by = game.sims.find(o => o.id === this.lovebomb.by);
      this.lovebomb = null;
      if (by && by.alive) {
        by.rel[this.id] = -40; this.rel[by.id] = -40;
        this.addNeed('fun', -40); this.addNeed('social', -40);
        this.sanity = Math.max(0, this.sanity - 15);
        game.log(`💔 ${by.first} suddenly treats ${this.first} like they don't exist. The discard phase has begun.`, 'evil');
      }
    }

    if (st.gassy > 0) {
      st.gassy -= min;
      if (!st.swimming && Math.random() < 0.02 * min) game.fartCloud(this);
      if (!this.alive) return;
    }

    if (st.breath > 0) st.breath -= min;

    if (st.poisoned > 0) {
      st.poisoned -= min;
      this.health -= 1.0 * min;
      if (this.health <= 0) return game.kill(this, 'Poison');
    }

    if (n.hunger <= 0) {
      this.health -= 0.12 * min;
      if (this.health <= 0) return game.kill(this, 'Starvation');
    } else if (n.hunger > 30 && n.energy > 20 && st.poisoned <= 0) {
      this.health = Math.min(100, this.health + 0.04 * min);
    }

    const world = game.world;
    // Extra-hold hairspray goes up the instant it meets any flame, even your own stove. The normal
    // stuff only catches if you linger next to someone else's.
    if (st.hairspray > 0) {
      st.hairspray -= min;
      const lit = st.extraHold ? game.nearFlame(this, 2.5) : game.nearFlame(this, 1.1, false) && Math.random() < 0.02 * min;
      if (!st.swimming && st.onFire <= 0 && lit) {
        st.hairspray = 0;
        st.onFire = 60;
        this.health -= 15;
        game.view.burst(this.x, this.z, 'explosion');
        game.sfx('fire');
        game.log(`💇🔥 ${this.name}'s hairspray meets an open flame. They go up like a birthday cake.`, 'evil');
        if (this.health <= 0) return game.kill(this, 'Fire');
      }
    }
    const inFlames = !st.swimming && world.isBurning(this.cx, this.cz);
    if (inFlames) {
      this.health -= 2.5 * min;
      if (this.health <= 0) return game.kill(this, 'Fire');
      // Walking into the flames sets your clothes alight, and they keep burning after you leave.
      if (st.onFire <= 0) game.log(`🔥 ${this.name} runs straight through the flames. Their clothes catch fire!`, 'evil');
      st.onFire = Math.max(st.onFire, 45);
    }
    if (!st.swimming) {
      if (st.onFire > 0) {
        // Burning clothes don't go out on their own: only water (the pool or a fire hose) saves you.
        this.health -= 5 * min;
        if (this.health <= 0) return game.kill(this, 'Fire');
        // A burning, panicking roommate spreads the fire wherever they run.
        if (Math.random() < 0.04 * min && world.ignite(this.cx, this.cz)) game.log(`🔥 ${this.first} sets the ${world.roomAt(this.cx, this.cz)?.name || 'floor'} alight while running around on fire.`, 'evil');
      } else if (world.fire.size && world.fireDistance(this.cx, this.cz) <= 1 && Math.random() < 0.012 * min) {
        st.onFire = 30;
        game.log(`${this.name} catches fire!`, 'evil');
      }
    }
    if (!st.swimming && world.fire.size && world.fireDistance(this.cx, this.cz) <= (st.panic > 0 ? 4 : 2)) {
      if (st.panic <= 0) {
        st.fleeing = Math.random() < 0.5;
        this.panicGoal = null;
        game.log(st.fleeing ? `${this.name} runs screaming out of the house.` : `${this.name} panics and flails around the flames.`, 'evil');
      }
      st.panic = 25;
      if (this.action && this.action.source === 'auto') this.endAction();
    } else if (st.panic > 0) {
      st.panic -= min;
    }
  }

  updateThought() {
    const st = this.status;
    if (st.onFire > 0) this.thought = '🔥😱';
    else if (st.panic > 0 && !this.action) this.thought = '😱';
    else if (this.action && this.action.stage === 'do') this.thought = this.action.def.icon;
    else if (st.poisoned > 0) this.thought = '🤢';
    else if (st.gassy > 0) this.thought = '💨';
    else if (st.breath > 0) this.thought = '🪥';
    else if (this.needs.hygiene < 15) this.thought = '🦨';
    else if (this.confused && !this.action) this.thought = '🌀';
    else if (this.needs.hunger < 15) this.thought = '🍗❗';
    else if (this.needs.energy < 12) this.thought = '🛏️❗';
    else this.thought = null;
  }

  // ---------- actions ----------

  runAction(dt, min, game) {
    const a = this.action;
    const def = a.def;
    if (a.stage === 'go') {
      if (a.target && a.target.alive === false) return this.fail(game, 'is dead');
      // Close enough to talk, but not standing on top of them (then step to a neighbouring cell first).
      const gap = def.approachSim ? Math.hypot(a.target.x - this.x, a.target.z - this.z) : 0;
      const closeEnough = def.approachSim && gap < 1.6 && gap > 0.6;
      if (!closeEnough) {
        const spot = def.approachSim ? this.adjacentTo(a.target, game.world, game)
          : def.spot ? def.spot(this, a.target, game) : [this.cx, this.cz];
        const goal = spot && !def.approachSim && def.id !== 'swim' ? this.freeSpot(spot, game, a) : spot;
        if (!goal) return this.fail(game, "can't find a way to do that");
        const arrived = this.walkTowards(goal, dt, game.world);
        if (arrived === null) return this.fail(game, "can't reach it");
        if (!arrived) return;
      }
      a.stage = 'do';
      a.t = 0;
      a.duration = typeof def.duration === 'function' ? def.duration(this, a.target, game) : (def.duration || 1);
      if (def.approachSim) {
        const t = a.target;
        if (!t.alive || t.status.swimming || t.status.passedOut > 0) return this.fail(game, 'got no reaction');
        t.status.engaged = a.duration;
        t.status.engagedWith = this;
        a.data.partner = t;
      }
      if (def.start && def.start(this, a.target, game, a) === false) { this.endAction(); return; }
      if (this.alive && this.action === a) game.dialogue.action(this, a);
      this.moving = false;
    } else {
      const fp = def.facePos ? def.facePos(this, a.target, game) : (a.target && a.target.x !== undefined ? [a.target.x, a.target.z] : null);
      if (fp) this.facing = Math.atan2(fp[0] - this.x, fp[1] - this.z);
      a.t += min;
      if (def.tick) def.tick(this, a.target, game, a, min);
      if (!this.alive || this.action !== a) return;
      if (a.t >= a.duration) {
        if (def.finish) def.finish(this, a.target, game, a);
        if (this.action === a) this.endAction();
      }
    }
  }

  fail(game, why) {
    if (this.action && this.action.source === 'player') game.log(`${this.first} ${why}.`, 'dim');
    this.endAction();
  }

  // True if someone other than this sim is standing still on the cell (walking past doesn't count).
  occupied(x, z, game) {
    return game.sims.some(o => o !== this && o.alive && !o.status.swimming && !o.moving && o.cx === x && o.cz === z)
      || (game.responders || []).some(p => !p.moving && Math.floor(p.x) === x && Math.floor(p.z) === z);
  }

  // Someone else is already on their way to stand on this cell.
  claimed(x, z, game) {
    return game.sims.some(o => o !== this && o.alive && o.action && o.action.stage === 'go' && o.pathGoal && o.pathGoal[0] === x && o.pathGoal[1] === z);
  }

  // The goal cell, or the nearest free neighbour in the same room if someone is already standing there.
  freeSpot(goal, game, a) {
    const key = goal[0] + ',' + goal[1];
    if (a && a.data.altFor === key) return a.data.alt;
    if (!this.occupied(goal[0], goal[1], game)) return goal;
    const w = game.world;
    let best = null, bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const nx = goal[0] + dx, nz = goal[1] + dz;
        if ((!dx && !dz) || !w.canStep(goal[0], goal[1], nx, nz) || this.occupied(nx, nz, game) || this.claimed(nx, nz, game)) continue;
        const d = Math.hypot(dx, dz) + 0.1 * Math.hypot(nx + 0.5 - this.x, nz + 0.5 - this.z);
        if (d < bestD) { bestD = d; best = [nx, nz]; }
      }
    }
    if (!best) return goal;
    if (a) { a.data.altFor = key; a.data.alt = best; }
    return best;
  }

  // Idle and standing on top of another roommate: shuffle over to a free cell.
  stepAside(dt, game) {
    if (this.aside) {
      if (this.walkTowards(this.aside, dt, game.world) !== false) this.aside = null;
      return;
    }
    const other = game.sims.find(o => o !== this && o.alive && !o.status.swimming && !o.moving && Math.hypot(o.x - this.x, o.z - this.z) < 0.45);
    // When two idle sims overlap, only one of them moves.
    if (!other || (!other.action && other.id > this.id)) return;
    const w = game.world;
    const free = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
      .map(([dx, dz]) => [this.cx + dx, this.cz + dz])
      .find(([nx, nz]) => w.canStep(this.cx, this.cz, nx, nz) && !this.occupied(nx, nz, game) && !w.isBurning(nx, nz));
    if (free) this.aside = free;
  }

  adjacentTo(t, world, game) {
    let best = null, bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nx = t.cx + dx, nz = t.cz + dz;
        if (world.isBlocked(nx, nz)) continue;
        // Another roommate standing there counts as a long walk around.
        const d = Math.hypot(nx + 0.5 - this.x, nz + 0.5 - this.z) + (game && this.occupied(nx, nz, game) ? 5 : 0);
        if (d < bestD) { bestD = d; best = [nx, nz]; }
      }
    }
    return best;
  }

  // Returns true when standing on goal, false while walking, null if unreachable.
  walkTowards(goal, dt, world) {
    const [gx, gz] = goal;
    const needNew = !this.path || !this.pathGoal || this.pathGoal[0] !== gx || this.pathGoal[1] !== gz || this.pathVersion !== world.version;
    if (needNew) {
      this.path = world.findPath(this.cx, this.cz, gx, gz);
      this.pathGoal = [gx, gz];
      this.pathVersion = world.version;
      if (!this.path) return null;
    }
    let budget = WALK_SPEED * dt;
    while (budget > 0) {
      if (!this.path.length) {
        const dx = gx + 0.5 - this.x, dz = gz + 0.5 - this.z;
        const d = Math.hypot(dx, dz);
        if (d <= budget || d < 0.02) { this.x = gx + 0.5; this.z = gz + 0.5; this.moving = false; return true; }
        this.x += dx / d * budget; this.z += dz / d * budget;
        this.facing = Math.atan2(dx, dz);
        this.moving = true;
        return false;
      }
      const [nx, nz] = this.path[0];
      const tx = nx + 0.5, tz = nz + 0.5;
      const dx = tx - this.x, dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      this.facing = Math.atan2(dx, dz);
      if (d <= budget) {
        this.x = tx; this.z = tz;
        budget -= d;
        this.path.shift();
      } else {
        this.x += dx / d * budget; this.z += dz / d * budget;
        budget = 0;
      }
    }
    this.moving = true;
    return false;
  }

  // Like the classics: panicking sims mill around the fire instead of leaving.
  panicMove(dt, game) {
    const w = game.world;
    if (this.status.fleeing) {
      if (!this.panicGoal) {
        const f = w.nearestFire(this.cx, this.cz) || { x: this.cx, z: this.cz };
        const spots = [[5, 14], [19, 13], [0, 0], [21, 1]].sort((a, b) =>
          Math.hypot(b[0] - f.x, b[1] - f.z) - Math.hypot(a[0] - f.x, a[1] - f.z));
        const spot = spots.find(s => w.findPath(this.cx, this.cz, s[0], s[1]));
        this.panicGoal = spot ? this.freeSpot(spot, game) : null;
        if (!this.panicGoal) this.status.fleeing = false;
      }
      if (this.panicGoal && this.walkTowards(this.panicGoal, dt * 1.3, w) === null) this.panicGoal = null;
      return;
    }
    if (!this.panicGoal || (this.cx === this.panicGoal[0] && this.cz === this.panicGoal[1])) {
      const f = w.nearestFire(this.cx, this.cz);
      this.panicGoal = f ? w.randomNear(f.x, f.z, 2) : null;
      this.path = null;
      if (!this.panicGoal) return;
    }
    if (this.walkTowards(this.panicGoal, dt * 1.3, game.world) === null) this.panicGoal = null;
  }

  // ---------- pool ----------

  // Burning: find the nearest bit of pool edge that can actually be reached, and run.
  waterSpot(game) {
    const w = game.world, edges = [];
    for (let x = POOL.x0; x < POOL.x1; x++) edges.push([x, POOL.z0 - 1, x, POOL.z0], [x, POOL.z1, x, POOL.z1 - 1]);
    for (let z = POOL.z0; z < POOL.z1; z++) edges.push([POOL.x0 - 1, z, POOL.x0, z], [POOL.x1, z, POOL.x1 - 1, z]);
    let best = null, bestLen = Infinity;
    for (const [ex, ez, px, pz] of edges) {
      if (w.isBlocked(ex, ez)) continue;
      const path = w.findPath(this.cx, this.cz, ex, ez);
      if (path && path.length < bestLen) { bestLen = path.length; best = { edge: [ex, ez], into: [px, pz], version: w.version }; }
    }
    return best;
  }

  runForWater(dt, game) {
    if (this.action) this.endAction();
    this.queue = [];
    this.status.follow = null;
    const st = this.status, w = game.world;
    if (!st.sprinting || !this.water || this.water.version !== w.version) {
      this.water = this.waterSpot(game) || { none: true, version: w.version };
      if (!st.sprinting && !this.water.none) game.log(`🔥🏊 ${this.name} is on fire and sprinting for the pool!`, 'evil');
      st.sprinting = true;
    }
    if (this.water.none) { this.panicMove(dt, game); return; } // walled in: run around screaming instead
    const r = this.walkTowards(this.water.edge, dt * 1.3, w);
    if (r === null) { this.water = null; return; }
    if (!r) return;
    // Cannonball. No ladder needed to get in; getting out is another matter.
    this.enterPool(game, this.water.into);
    this.status.soak = 12;
    this.water = null;
    game.sfx('splash');
    game.view.burst(this.x, this.z, 'splash');
    game.view.burst(this.x, this.z, 'steam');
    game.log(`💦 ${this.name} hurls themselves into the pool with a loud hiss. Extinguished!${w.ladder.present ? '' : ' Now, about that missing ladder...'}`, 'dim');
  }

  enterPool(game, into) {
    const e = into || game.world.ladder.entry;
    this.place(e[0], e[1]);
    this.status.swimming = true;
    this.status.stuck = false;
    this.status.onFire = 0;
    this.swimGoal = null;
  }

  exitPool(game) {
    const u = game.world.ladder.use;
    this.place(u[0], u[1]);
    this.status.swimming = false;
    this.status.stuck = false;
    this.path = null;
  }

  swimAround(dt, game) {
    if (!this.swimGoal || Math.hypot(this.swimGoal[0] - this.x, this.swimGoal[1] - this.z) < 0.1) {
      this.swimGoal = [rand(POOL.x0 + 0.4, POOL.x1 - 0.4), rand(POOL.z0 + 0.4, POOL.z1 - 0.4)];
    }
    const dx = this.swimGoal[0] - this.x, dz = this.swimGoal[1] - this.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, 1.1 * dt * (this.status.stuck ? 0.6 : 1));
    if (d > 0) { this.x += dx / d * step; this.z += dz / d * step; this.facing = Math.atan2(dx, dz); }
  }
}

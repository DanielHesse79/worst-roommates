// game.js — simulation loop, evil AI, rendering, and UI wiring

const TICK_MS = 300;
const MOVE_SPEED = 0.55; // tiles per simTick
const SAFE_SPOT = { x: 11, y: 8 }; // backyard grass, away from fire zone

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function weightedPick(list) {
  const total = list.reduce((s, item) => s + item.weight, 0);
  let r = Math.random() * total;
  for (const item of list) {
    if (r < item.weight) return item;
    r -= item.weight;
  }
  return list[list.length - 1];
}

class Game {
  constructor() {
    this.canvas = document.getElementById('stage');
    this.ctx = this.canvas.getContext('2d');
    this.world = makeWorld();
    this.sims = [];
    this.graveyard = [];
    this.usedNames = new Set();
    this.toolState = createToolState();
    this.score = 0;
    this.malice = 50;
    this.householdNum = 1;
    this.householdStartGraveIndex = 0;
    this.causesUsedThisHousehold = new Set();
    this.chaosMultiplier = 1;
    this.lastDeathTick = null;
    this.simTickCount = 0;
    this.speed = 0;
    this.accumulator = 0;
    this.lastFrame = null;
    this.householdOver = false;
    this.animTime = 0;

    this.spawnHousehold(4);
    this.bindUI();
    this.updateUI();
    requestAnimationFrame(t => this.frame(t));
  }

  spawnHousehold(count) {
    this.world = makeWorld();
    this.sims = [];
    this.householdStartGraveIndex = this.graveyard.length;
    this.causesUsedThisHousehold = new Set();
    this.chaosMultiplier = 1;
    this.lastDeathTick = null;
    this.householdOver = false;
    for (let i = 0; i < count; i++) {
      const name = randomName(this.usedNames);
      const color = SIM_COLORS[i % SIM_COLORS.length];
      this.sims.push(new Sim(name, color, this.householdNum));
    }
    document.getElementById('householdLabel').textContent = `Household #${this.householdNum}`;
  }

  log(msg, cls) {
    const el = document.getElementById('log');
    const line = document.createElement('div');
    line.className = 'logLine' + (cls ? ' ' + cls : '');
    line.textContent = msg;
    el.appendChild(line);
    while (el.children.length > 80) el.removeChild(el.firstChild);
  }

  addMalice(n) {
    this.malice += n;
    this.updateHeaderStats();
  }

  onSimDied(sim, cause) {
    let pts = 100;
    if (!this.causesUsedThisHousehold.has(cause)) {
      pts += 50;
      this.causesUsedThisHousehold.add(cause);
    }
    if (this.lastDeathTick !== null && (this.simTickCount - this.lastDeathTick) <= 20) {
      this.chaosMultiplier = Math.min(4, this.chaosMultiplier + 1);
    } else {
      this.chaosMultiplier = 1;
    }
    pts = Math.round(pts * this.chaosMultiplier);
    this.lastDeathTick = this.simTickCount;
    this.score += pts;
    this.addMalice(20);
    this.graveyard.push({ name: sim.name, cause, line: sim.deathLine, household: this.householdNum });
    const chaosNote = this.chaosMultiplier > 1 ? ` [x${this.chaosMultiplier} chaos!]` : '';
    this.log(`☠ ${sim.name} ${sim.deathLine} (${cause}) +${pts}${chaosNote}`, 'death');
    this.updateUI();
    if (!this.householdOver && this.sims.every(s => !s.alive)) {
      this.householdOver = true;
      this.finishHousehold();
    }
  }

  finishHousehold() {
    this.speed = 0;
    this.syncSpeedButtons();
    const list = document.getElementById('recapList');
    list.innerHTML = '';
    for (const g of this.graveyard.slice(this.householdStartGraveIndex)) {
      const div = document.createElement('div');
      div.innerHTML = `<b>${g.name}</b> &mdash; ${g.line} <i>(${g.cause})</i>`;
      list.appendChild(div);
    }
    document.getElementById('recapTitle').textContent = `Household #${this.householdNum} Eliminated`;
    document.getElementById('recapScore').textContent = `Total Score: ${this.score}`;
    document.getElementById('recapModal').classList.remove('hidden');
  }

  nextHousehold() {
    document.getElementById('recapModal').classList.add('hidden');
    this.householdNum++;
    this.spawnHousehold(Math.min(8, 3 + this.householdNum));
    this.speed = 1;
    this.syncSpeedButtons();
    this.updateUI();
    this.log(`A fresh batch of wicked sims moves in. Household #${this.householdNum} begins.`, 'tool');
  }

  // ---------- UI ----------

  bindUI() {
    document.getElementById('startBtn').addEventListener('click', () => {
      document.getElementById('introModal').classList.add('hidden');
      this.speed = 1;
      this.syncSpeedButtons();
    });
    document.getElementById('nextBtn').addEventListener('click', () => this.nextHousehold());

    document.querySelectorAll('.speedBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.speed = Number(btn.dataset.speed);
        this.syncSpeedButtons();
      });
    });

    document.querySelectorAll('.toolBtn').forEach(btn => {
      btn.addEventListener('click', () => this.onToolClick(btn.dataset.tool));
    });

    this.canvas.addEventListener('click', e => this.onCanvasClick(e));
    this.canvas.addEventListener('contextmenu', e => { e.preventDefault(); this.disarm(); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape') this.disarm(); });
  }

  syncSpeedButtons() {
    document.querySelectorAll('.speedBtn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.speed) === this.speed);
    });
  }

  disarm() {
    this.toolState.armed = null;
    this.updateToolbar();
  }

  onToolClick(id) {
    const def = TOOL_DEFS[id];
    if (this.toolState.cooldowns[id] > 0) return;
    if (this.malice < def.cost) {
      this.log('Not enough malice for that... yet.', 'tool');
      return;
    }
    if (def.needsTarget === null) {
      const ok = def.apply(this);
      if (ok) {
        this.malice -= def.cost;
        this.toolState.cooldowns[id] = def.cooldown;
        const msg = def.message();
        if (msg) this.log(msg, 'tool');
        this.updateUI();
      } else {
        this.log('Nothing to do there right now.', 'tool');
      }
      return;
    }
    // toggle arm state
    this.toolState.armed = (this.toolState.armed === id) ? null : id;
    if (this.toolState.armed) {
      const hints = {
        fire: 'Armed: Start Fire — click a kitchen or living-room tile.',
        rig: 'Armed: Rig Appliance — click the stove, fridge, or TV.',
        rumor: 'Armed: Whisper Rumor — click a sim.',
        meteor: 'Armed: Meteor Strike — click a sim to end their day.',
      };
      this.log(hints[id] || 'Tool armed. Click a target.', 'tool');
    }
    this.updateToolbar();
  }

  onCanvasClick(e) {
    const id = this.toolState.armed;
    if (!id) return;
    const def = TOOL_DEFS[id];
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let target = null;

    if (def.needsTarget === 'tile') {
      target = { x: Math.floor(mx / TILE), y: Math.floor(my / TILE) };
    } else if (def.needsTarget === 'object') {
      const gx = Math.floor(mx / TILE), gy = Math.floor(my / TILE);
      target = objectAt(this.world, gx, gy);
    } else if (def.needsTarget === 'sim') {
      let best = null, bestDist = 26;
      for (const s of this.sims) {
        if (!s.alive) continue;
        const d = Math.hypot(s.x * TILE - mx, s.y * TILE - my);
        if (d < bestDist) { bestDist = d; best = s; }
      }
      target = best;
    }

    const ok = def.apply(this, target);
    if (ok) {
      this.malice -= def.cost;
      this.toolState.cooldowns[id] = def.cooldown;
      this.toolState.armed = null;
      const msg = def.message(target);
      if (msg) this.log(msg, 'tool');
      this.updateUI();
    } else {
      this.log("That won't work there.", 'tool');
    }
  }

  updateHeaderStats() {
    document.getElementById('scoreLabel').textContent = `Score: ${this.score}`;
    document.getElementById('maliceLabel').textContent = `\u{1F608} Malice: ${Math.floor(this.malice)}`;
  }

  updateToolbar() {
    document.querySelectorAll('.toolBtn').forEach(btn => {
      const id = btn.dataset.tool;
      const def = TOOL_DEFS[id];
      const cd = this.toolState.cooldowns[id];
      btn.classList.toggle('armed', this.toolState.armed === id);
      btn.disabled = cd > 0 || this.malice < def.cost;
      let overlay = btn.querySelector('.cooldownOverlay');
      if (cd > 0) {
        if (!overlay) {
          overlay = document.createElement('span');
          overlay.className = 'cooldownOverlay';
          btn.appendChild(overlay);
        }
        overlay.textContent = Math.ceil(cd);
      } else if (overlay) {
        overlay.remove();
      }
    });
  }

  updateSidebar() {
    const list = document.getElementById('simList');
    list.innerHTML = '';
    for (const s of this.sims) {
      if (!s.alive) continue;
      const card = document.createElement('div');
      card.className = 'simCard';
      card.innerHTML = `
        <div class="simName"><span>${s.name}</span><span class="mood">${s.mood}</span></div>
        ${bar('health', s.health, s.maxHealth)}
        ${bar('hunger', s.hunger)} ${bar('energy', s.energy)} ${bar('hygiene', s.hygiene)}
        ${bar('fun', s.fun)} ${bar('social', s.social)} ${bar('evil', s.evil)}
      `;
      list.appendChild(card);
    }
    const grave = document.getElementById('graveList');
    grave.innerHTML = '';
    for (const g of [...this.graveyard].reverse().slice(0, 25)) {
      const div = document.createElement('div');
      div.className = 'graveCard';
      div.innerHTML = `<b>${g.name}</b> — ${g.cause}`;
      grave.appendChild(div);
    }
    function bar(label, val, max) {
      max = max || 100;
      const pct = clamp((val / max) * 100, 0, 100);
      return `<div class="barRow"><span>${label[0].toUpperCase()}</span>
        <div class="barTrack"><div class="barFill fill-${label}" style="width:${pct}%"></div></div></div>`;
    }
  }

  updateUI() {
    this.updateHeaderStats();
    this.updateToolbar();
    this.updateSidebar();
  }

  // ---------- simulation ----------

  frame(now) {
    if (this.lastFrame === null) this.lastFrame = now;
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    this.animTime += dt;

    if (this.speed > 0) {
      this.accumulator += dt * this.speed;
      while (this.accumulator >= TICK_MS) {
        this.simTick();
        this.accumulator -= TICK_MS;
      }
    }

    this.render();
    requestAnimationFrame(t => this.frame(t));
  }

  simTick() {
    this.simTickCount++;
    tickFire(this.world);

    // tool cooldowns & timers tick down once per simTick
    for (const id in this.toolState.cooldowns) {
      if (this.toolState.cooldowns[id] > 0) this.toolState.cooldowns[id]--;
    }
    const pool = this.world.pool;
    if (!pool.ladderPresent) {
      pool.ladderTimer--;
      if (pool.ladderTimer <= 0) pool.ladderPresent = true;
    }
    const fridge = getObject(this.world, 'fridge');
    if (fridge && fridge.poisoned) {
      fridge.poisonTimer--;
      if (fridge.poisonTimer <= 0) fridge.poisoned = false;
    }

    for (const sim of this.sims) {
      if (!sim.alive) continue;
      this.tickSim(sim);
    }
    this.updateUI();
  }

  tickSim(sim) {
    const world = this.world;
    const rx = Math.round(sim.x), ry = Math.round(sim.y);

    if (isBurning(world, rx, ry)) {
      sim.health -= 18;
      if (sim.health <= 0) { sim.die('Fire', this); return; }
    }

    if (sim.poisoned) {
      sim.health -= 8;
      if (sim.health <= 0) { sim.die('Poison', this); return; }
    }

    if (sim.inPool) {
      if (!world.pool.ladderPresent) {
        sim.energy -= 15;
        if (sim.energy <= 0) { sim.die('Drowning', this); return; }
      }
    }

    sim.hunger = clamp(sim.hunger - 2, 0, 100);
    sim.energy = clamp(sim.energy - 1.3, 0, 100);
    sim.hygiene = clamp(sim.hygiene - 1, 0, 100);
    sim.fun = clamp(sim.fun - 1.4, 0, 100);
    sim.social = clamp(sim.social - 1.1, 0, 100);

    if (sim.hunger <= 0) {
      sim.hungerZeroTicks = (sim.hungerZeroTicks || 0) + 1;
      if (sim.hungerZeroTicks >= 16) { sim.die('Starvation', this); return; }
    } else {
      sim.hungerZeroTicks = 0;
    }

    sim.updateMoodFace();

    // fire self-preservation
    if (!sim.inPool && nearestFireDistance(world, rx, ry) <= 1) {
      const recklessChance = sim.evil / 300;
      if (Math.random() >= recklessChance) {
        sim.currentAction = { type: 'flee', phase: 'moveTo', tx: SAFE_SPOT.x, ty: SAFE_SPOT.y, duration: 0 };
        this.stepAction(sim);
        return;
      } else {
        this.log(`${sim.name} couldn't be bothered to move away from the flames.`, 'evil');
      }
    }

    if (sim.currentAction) {
      this.stepAction(sim);
    } else {
      this.decideAction(sim);
    }
  }

  stepAction(sim) {
    const act = sim.currentAction;
    if (!act) return;
    if (act.phase === 'moveTo') {
      const arrived = sim.moveToward(act.tx, act.ty, MOVE_SPEED);
      if (arrived) {
        this.onActionArrive(sim, act);
      }
    } else if (act.phase === 'use') {
      this.applyActionTick(sim, act);
      if (act.duration > 0) act.duration--;
      if (act.duration <= 0) {
        if (act.type === 'swim') {
          if (this.world.pool.ladderPresent) {
            sim.inPool = false;
            sim.currentAction = null;
            sim.x = this.world.pool.ladder.x;
            sim.y = this.world.pool.ladder.y;
          }
          // else: stuck treading water until the ladder returns
        } else {
          sim.currentAction = null;
        }
      }
    }
  }

  onActionArrive(sim, act) {
    const world = this.world;
    switch (act.type) {
      case 'flee':
        sim.currentAction = null;
        break;
      case 'swim':
        sim.inPool = true;
        act.phase = 'use';
        break;
      case 'need': {
        const obj = getObject(world, act.objectId);
        if (obj && obj.rigged) {
          this.resolveElectrocution(sim, obj);
          obj.rigged = false;
        }
        if (obj && act.needKey === 'hunger' && obj.poisoned) {
          sim.poisoned = true;
          obj.poisoned = false;
          this.log(`${sim.name} eats the leftovers without checking them first. Bold. Fatal.`, 'death');
        }
        act.phase = 'use';
        break;
      }
      case 'arson':
        igniteTile(world, act.tx, act.ty);
        sim.evil = clamp(sim.evil + 10, 0, 100);
        this.addMalice(5);
        this.log(`${sim.name} sets the ${act.label} ablaze out of pure spite.`, 'evil');
        sim.currentAction = null;
        break;
      case 'poisonFridge': {
        const fridge = getObject(world, 'fridge');
        fridge.poisoned = true;
        fridge.poisonTimer = 45;
        this.addMalice(5);
        this.log(`${sim.name} slips something foul into the fridge.`, 'evil');
        sim.currentAction = null;
        break;
      }
    }
  }

  applyActionTick(sim, act) {
    if (act.type === 'need') {
      sim[act.needKey] = clamp(sim[act.needKey] + 16, 0, 100);
      if (act.needKey === 'energy') sim.health = clamp(sim.health + 2, 0, sim.maxHealth);
    } else if (act.type === 'swim') {
      sim.fun = clamp(sim.fun + 14, 0, 100);
    }
  }

  resolveElectrocution(sim, obj) {
    if (Math.random() < 0.5) {
      const dmg = 70 + Math.random() * 50;
      sim.health -= dmg;
      this.log(`${sim.name} flips on the ${obj.type} and gets the shock of their life.`, 'death');
      if (sim.health <= 0) sim.die('Electrocution', this);
    } else {
      this.log(`${sim.name} narrowly avoids a jolt from the rigged ${obj.type}. Lucky idiot.`, 'tool');
    }
  }

  decideAction(sim) {
    const world = this.world;
    const others = this.sims.filter(s => s.alive && s !== sim);
    const nearby = others.filter(o => sim.distanceTo(o.x, o.y) < 2.5);

    // even the wicked have some survival instinct once hunger gets critical
    if (sim.hunger < 18) {
      const fridge = getObject(world, 'fridge');
      sim.currentAction = { type: 'need', needKey: 'hunger', objectId: fridge.id, phase: 'moveTo', tx: fridge.x, ty: fridge.y, duration: 6 };
      return;
    }

    const moodPenalty = (100 - sim.averageMood()) / 260;
    const evilChance = clamp(sim.evil / 160 + moodPenalty, 0, 0.6);

    if (Math.random() < evilChance) {
      const impulse = this.pickEvilImpulse(sim, nearby, world);
      if (impulse) {
        this.startImpulse(sim, impulse);
        return;
      }
    }
    this.startNeedAction(sim, others);
  }

  pickEvilImpulse(sim, nearby, world) {
    const options = [];
    if (nearby.length > 0) options.push({ type: 'insult', target: nearby[Math.floor(Math.random() * nearby.length)], weight: 5 });

    const fightCandidates = nearby.filter(o => o.evil > 55 && sim.evil > 55);
    if (fightCandidates.length > 0) options.push({ type: 'fight', target: fightCandidates[Math.floor(Math.random() * fightCandidates.length)], weight: 3 });

    for (const obj of [getObject(world, 'stove'), getObject(world, 'fireplace')]) {
      if (obj && sim.distanceTo(obj.x, obj.y) < 3.5 && !world.fire.has(obj.x + ',' + obj.y) && !world.ash.has(obj.x + ',' + obj.y)) {
        options.push({ type: 'arson', target: obj, weight: 2 });
      }
    }

    const fridge = getObject(world, 'fridge');
    if (fridge && !fridge.poisoned && sim.distanceTo(fridge.x, fridge.y) < 3.5) {
      options.push({ type: 'poisonFridge', target: fridge, weight: 2 });
    }

    if (nearby.length > 0) options.push({ type: 'pushPool', target: nearby[Math.floor(Math.random() * nearby.length)], weight: 1 });

    if (options.length === 0) return null;
    return weightedPick(options);
  }

  startImpulse(sim, impulse) {
    const world = this.world;
    switch (impulse.type) {
      case 'insult':
        this.resolveInsult(sim, impulse.target);
        break;
      case 'fight':
        this.resolveFight(sim, impulse.target);
        break;
      case 'pushPool':
        this.resolvePush(sim, impulse.target);
        break;
      case 'arson':
        sim.currentAction = { type: 'arson', phase: 'moveTo', tx: impulse.target.x, ty: impulse.target.y, label: impulse.target.type, duration: 0 };
        break;
      case 'poisonFridge':
        sim.currentAction = { type: 'poisonFridge', phase: 'moveTo', tx: impulse.target.x, ty: impulse.target.y, duration: 0 };
        break;
    }
  }

  resolveInsult(sim, target) {
    target.social = clamp(target.social - 20, 0, 100);
    target.evil = clamp(target.evil + 5, 0, 100);
    this.log(`${sim.name} tells ${target.name} exactly what they think of them. It is not kind.`, 'evil');
    this.addMalice(5);
    this.settle(sim, 3);
    if (target.evil > 70 && Math.random() < 0.3) {
      this.resolveFight(target, sim);
    }
  }

  resolvePush(sim, target) {
    if (target.inPool) return;
    const tile = this.world.pool.tiles[Math.floor(Math.random() * this.world.pool.tiles.length)];
    target.x = tile.x;
    target.y = tile.y;
    target.inPool = true;
    target.currentAction = { type: 'swim', phase: 'use', duration: 999 };
    this.log(`${sim.name} shoves ${target.name} straight into the pool.`, 'evil');
    this.addMalice(5);
    this.settle(sim, 3);
  }

  resolveFight(a, b) {
    const scoreA = a.evil + Math.random() * 40;
    const scoreB = b.evil + Math.random() * 40;
    const winner = scoreA >= scoreB ? a : b;
    const loser = winner === a ? b : a;
    const dmg = 18 + Math.random() * 28;
    this.log(`${a.name} and ${b.name} come to blows. ${winner.name} comes out on top.`, 'evil');
    this.addMalice(10);
    winner.energy = clamp(winner.energy - 15, 0, 100);
    loser.energy = clamp(loser.energy - 15, 0, 100);
    this.settle(winner, 4);
    if (Math.random() < 0.1) {
      loser.die('Beaten in a Fight', this);
      return;
    }
    loser.health -= dmg;
    if (loser.health <= 0) loser.die('Beaten in a Fight', this);
    else this.settle(loser, 4);
  }

  // gives a sim a short breather after an instant action so evil impulses
  // can't chain every single tick with no downtime
  settle(sim, ticks) {
    if (sim.alive) sim.currentAction = { type: 'idle', phase: 'use', duration: ticks };
  }

  startNeedAction(sim, others) {
    const need = sim.mostUrgentNeed();
    const world = this.world;

    if (need === 'social') {
      const alive = others;
      if (alive.length > 0) {
        sim.social = clamp(sim.social + 30, 0, 100);
        return;
      }
    }

    if (need === 'fun' && Math.random() < 0.4) {
      const ladder = world.pool.ladder;
      sim.currentAction = { type: 'swim', phase: 'moveTo', tx: ladder.x, ty: ladder.y, duration: 8 };
      return;
    }

    let obj, needKey = need, duration = 6;
    if (need === 'hunger' || need === 'social') { obj = getObject(world, 'fridge'); needKey = 'hunger'; }
    else if (need === 'energy') {
      const bedA = getObject(world, 'bedA'), bedB = getObject(world, 'bedB');
      obj = sim.distanceTo(bedA.x, bedA.y) <= sim.distanceTo(bedB.x, bedB.y) ? bedA : bedB;
    }
    else if (need === 'hygiene') obj = getObject(world, 'tub');
    else obj = getObject(world, 'tv');

    sim.currentAction = { type: 'need', needKey, objectId: obj.id, phase: 'moveTo', tx: obj.x, ty: obj.y, duration };
  }

  // ---------- rendering ----------

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const room of ROOMS) {
      ctx.fillStyle = room.color;
      ctx.fillRect(room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.strokeRect(room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '11px Georgia';
      ctx.fillText(room.label, room.x * TILE + 4, room.y * TILE + 12);
    }

    // pool
    for (const t of this.world.pool.tiles) {
      const danger = !this.world.pool.ladderPresent;
      ctx.fillStyle = danger ? '#5a2a2a' : '#2a5a7a';
      ctx.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
    }
    const ladderPx = tileToPixel(this.world.pool.ladder.x, this.world.pool.ladder.y);
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.world.pool.ladderPresent ? '\u{1FA9C}' : '❌', ladderPx.px, ladderPx.py);

    // ash
    for (const k of this.world.ash) {
      const [x, y] = k.split(',').map(Number);
      ctx.fillStyle = '#221c1c';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    // fire
    for (const k of this.world.fire.keys()) {
      const [x, y] = k.split(',').map(Number);
      const flicker = 0.6 + 0.4 * Math.sin(this.animTime / 90 + x + y);
      ctx.fillStyle = `rgba(255,${Math.floor(90 * flicker)},30,0.85)`;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.font = '20px sans-serif';
      ctx.fillText('\u{1F525}', x * TILE + TILE / 2, y * TILE + TILE / 2);
    }

    // grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, ROWS * TILE); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * TILE); ctx.lineTo(COLS * TILE, y * TILE); ctx.stroke(); }

    // objects
    for (const obj of this.world.objects) {
      const px = tileToPixel(obj.x, obj.y);
      ctx.font = '24px sans-serif';
      ctx.fillText(obj.emoji, px.px, px.py);
      if (obj.rigged) {
        ctx.font = '14px sans-serif';
        ctx.fillText('⚡', px.px + 14, px.py - 14);
      }
      if (obj.poisoned) {
        ctx.font = '14px sans-serif';
        ctx.fillText('☠', px.px + 14, px.py - 14);
      }
    }

    // sims
    for (const sim of this.sims) {
      if (!sim.alive) continue;
      const px = sim.x * TILE + TILE / 2, py = sim.y * TILE + TILE / 2;
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fillStyle = sim.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.stroke();
      ctx.font = '14px sans-serif';
      ctx.fillText(sim.mood, px, py - 1);
      ctx.font = '10px Georgia';
      ctx.fillStyle = '#fff';
      ctx.fillText(sim.name.split(' ')[0], px, py + 20);
      // health sliver
      ctx.fillStyle = '#100c0c';
      ctx.fillRect(px - 14, py - 22, 28, 4);
      ctx.fillStyle = sim.health / sim.maxHealth > 0.4 ? '#5cb85c' : '#d94f4f';
      ctx.fillRect(px - 14, py - 22, 28 * clamp(sim.health / sim.maxHealth, 0, 1), 4);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});

import { World } from './world.js';
import { Sim } from './sim.js';
import { View } from './view.js';
import { UI } from './ui.js';
import { runAutonomy } from './autonomy.js';
import { CAUSES, DEATH_SUSPICION, MIN_PER_SEC, ROSTER, IMMORTAL_LINES, HEADLINES, EPITAPHS, REAPER_QUIPS } from './data.js';
import { CONTRACTS, evaluate, starsFor, loadProgress, saveProgress } from './contracts.js';
import { onEnterCell, piranhaBite, updateGhosts, canPlaceFloorTrap, floorTrapPower, fartCloud, carCrash, FLOOR_TRAPS } from './traps.js';
import { findPower, cleanupPower } from './interactions.js';
import { Sfx } from './audio.js';
import { Dialogue } from './dialogue.js';
import { SHOP, LOCKED_TRAPS, contractReward } from './shop.js';
import { updateVisitors, scheduleNextVisit, visitorsNear, dismissVisitors } from './visitors.js';
import { initNeighbours, updateNeighbours, annoyNeighbour, pleaseNeighbour, SIDES } from './neighbours.js';
import { updateEmergency, resetEmergency, requestInvestigation, endInvestigation, respondersNear } from './emergency.js';

const SPEEDS = [0, 1, 3, 8];
const START_SPOTS = [[9, 8], [11, 8], [10, 7], [12, 8], [8, 7], [13, 7]];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
// Actions that put an open flame in a sim's hands.
const FLAME_ACTIONS = new Set(['cook', 'bake', 'grill', 'weeds', 'light', 'stoke']);

class Game {
  constructor() {
    this.usedNames = new Set();
    this.profile = loadProgress();
    this.score = 0;
    this.careerCauses = new Set();
    this.freeLevel = 0;
    this.speed = 0;
    this.lastSpeed = 1;
    this.freeWill = true;
    this.started = false;
    this.audio = new Sfx();
    this.dialogue = new Dialogue(this);
    this.ui = new UI(this);
    this.setup(null);
    this.view = new View(document.getElementById('view'), this);
    this.ui.refresh();
    this.ui.showBoard();
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  // contract === null means free play (random household of targets, no suspicion or budget).
  // In a contract the sims are the fixed targets first, then the player's chosen crew.
  setup(contract, crewIds = []) {
    this.contract = contract;
    this.sims = [];
    const specs = contract
      ? [...contract.targets.map(t => ({ ...t, role: 'target' })), ...crewIds.map(id => ({ ...ROSTER.find(r => r.id === id), role: 'crew' }))]
      : null;
    const n = specs ? specs.length : Math.min(6, 2 + this.freeLevel);
    this.world = new World(n);
    for (let i = 0; i < n; i++) {
      const spec = specs && specs[i];
      const s = new Sim(this.usedNames, i, spec);
      s.role = spec ? spec.role : 'target';
      s.rosterId = spec && spec.role === 'crew' ? spec.id : null;
      s.place(...START_SPOTS[i]);
      this.sims.push(s);
    }
    for (const a of this.sims) {
      for (const b of this.sims) {
        if (a.id >= b.id) continue;
        const r = a.role === 'crew' && b.role === 'crew' ? 40 : Math.round(-30 + Math.random() * 60);
        a.rel[b.id] = r; b.rel[a.id] = r;
      }
    }
    for (const [i, j, v] of (contract && contract.rels) || []) {
      this.sims[i].rel[this.sims[j].id] = v;
      this.sims[j].rel[this.sims[i].id] = v;
    }
    // Best friends, always.
    const asraa = this.sims.find(s => s.rosterId === 'asraa'), daniel = this.sims.find(s => s.rosterId === 'daniel');
    if (asraa && daniel) { asraa.rel[daniel.id] = 90; daniel.rel[asraa.id] = 90; }
    // Everyone gets their own bed.
    const beds = [...this.world.objects.values()].filter(o => o.type === 'bed').sort((a, b) => a.bedIndex - b.bedIndex);
    this.sims.forEach((s, i) => { beds[i].owner = s.id; beds[i].name = `${s.first}'s bed`; s.bedId = beds[i].id; });
    this.selected = this.sims.find(s => s.role === 'crew') || this.sims[0];
    this.clock = 8 * 60;
    this.doom = 0;
    this.hackLockUntil = 0;
    this.visit = null;
    this.visitBans = new Set();
    scheduleNextVisit(this);
    initNeighbours(this);
    resetEmergency(this);
    this.meteors = [];
    this.ghosts = [];
    this.armedTrap = null;
    this.deaths = [];
    this.causes = new Set();
    this.lastDeathClock = -9999;
    this.combo = 1;
    this.over = false;
    this.result = null;
    this.suspicion = 0;
    this.peakSuspicion = 0;
    this.warned = false;
    this.malice = contract ? contract.malice + (this.upgrade('pockets') ? 30 : 0) : 0;
    this.godUsed = false;
    if (contract && contract.setup) contract.setup(this);
  }

  startContract(index, crewIds = this.crewIds || []) {
    this.contractIndex = index;
    this.crewIds = crewIds;
    this.profile.crew = crewIds;
    saveProgress(this.profile);
    this.setup(CONTRACTS[index], crewIds);
    this.begin();
    const c = this.contract;
    this.log(`📋 CONTRACT: ${c.title} — ${c.brief}`, 'tool');
    this.log(`💡 ${c.hint}`, 'dim');
  }

  startFreePlay() {
    this.contractIndex = null;
    this.freeLevel++;
    this.setup(null);
    this.begin();
    this.log(`Free play: ${this.sims.length} wicked sims move in. Kill them all.`, 'tool');
  }

  retry() {
    if (this.contractIndex !== null && this.contractIndex !== undefined) this.startContract(this.contractIndex, this.crewIds);
    else { this.freeLevel--; this.startFreePlay(); }
  }

  begin() {
    this.session = (this.session || 0) + 1;
    this.dialogue.reset();
    this.view.reset();
    this.ui.clearLog();
    this.started = true;
    this.ui.armTrap(null);
    this.setSpeed(1);
    this.ui.refresh();
  }

  get wary() { return !!this.contract && this.suspicion >= 50; }

  // ---------- black market ----------

  owns(key) { return !this.contract || !LOCKED_TRAPS.has(key) || this.profile.owned.includes(key); }
  upgrade(id) { return !!this.contract && this.profile.owned.includes(id); }
  powerCost(p) { return p.restore ? 0 : Math.round(p.cost * (this.upgrade('discount') ? 0.8 : 1)); }

  buy(id) {
    const item = SHOP.find(i => i.id === id);
    if (!item || this.profile.owned.includes(id) || this.profile.money < item.price) return false;
    this.profile.money -= item.price;
    this.profile.owned.push(id);
    saveProgress(this.profile);
    this.sfx('power');
    return true;
  }
  get isNight() { const h = (this.clock / 60) % 24; return h >= 20 || h < 5; }

  setSpeed(i) {
    if (i > 0) this.lastSpeed = i;
    this.speed = i;
    this.ui.refresh();
  }

  log(msg, cls) { this.ui.log(msg, cls); }
  sfx(name) { this.audio.play(name); }
  popup(sim, text, color) { this.view.addPopup(sim, text, color); }
  flash(sim) { this.view.flash(sim); }

  // ---------- Hand of Fate ----------

  // Awake, non-swimming sims in the same room (or both outdoors) within 7 cells of any of the cells,
  // plus any visitors at the door (they peer through every window) and emergency responders on the lot.
  witnesses(cells) {
    const w = this.world;
    const seen = this.sims.filter(s => {
      if (!s.alive || s.status.passedOut > 0 || s.status.swimming) return false;
      const a = s.action;
      if (a && a.stage === 'do' && (a.def.id === 'sleep' || a.def.id === 'nap')) return false;
      const room = w.roomAt(s.cx, s.cz);
      return cells.some(([x, z]) => Math.max(Math.abs(x - s.cx), Math.abs(z - s.cz)) <= 7 && w.roomAt(x, z) === room);
    });
    for (const [x, z] of cells) {
      for (const p of [...visitorsNear(this, x + 0.5, z + 0.5, 7), ...respondersNear(this, x + 0.5, z + 0.5, 7)]) if (!seen.includes(p)) seen.push(p);
    }
    return seen;
  }

  dismissVisitors(why) { dismissVisitors(this, why); }
  annoyNeighbour(side, amount, msg) { annoyNeighbour(this, side, amount, msg); }
  annoyNeighbours(amount) { for (const side of SIDES) annoyNeighbour(this, side, amount); }
  pleaseNeighbour(side, amount, msg) { pleaseNeighbour(this, side, amount, msg); }
  endInvestigation(msg) { return endInvestigation(this, msg); }

  godAction(p) {
    if (this.result) return;
    if (p.restore) { p.run(); return; }
    if (p.key && !this.owns(p.key)) {
      this.log('🔒 That trap has to be bought on the black market first.', 'dim');
      return;
    }
    const cost = this.powerCost(p);
    if (this.contract && this.malice < cost) {
      this.log(`Not enough malice (${cost} needed). Deaths and patience earn more.`, 'dim');
      return;
    }
    const seen = p.cells.length ? this.witnesses(p.cells) : [];
    p.run();
    this.sfx('power');
    if (!this.contract) return;
    this.malice -= cost;
    this.godUsed = true;
    if (seen.length) this.addSuspicion(this.upgrade('silent') ? 10 : 18, `👀 ${seen.map(s => s.first).join(' and ')} saw something that can't be explained.`);
    else this.addSuspicion(this.upgrade('silent') ? 1 : 3);
  }

  // deferFail: let the caller decide whether hitting 100 ends the contract (a finishing kill still counts).
  addSuspicion(v, msg, deferFail) {
    if (!this.contract || v <= 0 || this.result) return;
    this.suspicion = Math.min(100, this.suspicion + v);
    this.peakSuspicion = Math.max(this.peakSuspicion, this.suspicion);
    if (msg) this.log(msg, 'warn');
    if (this.suspicion >= 60) requestInvestigation(this, 'all the rumours about this house');
    if (!this.warned && this.suspicion >= 50) {
      this.warned = true;
      this.ui.toast('🚨 The neighbours are talking. Everyone is on their guard.');
      this.sfx('alarm');
      this.log('🚨 Suspicion is high: sims are now careful around food, wiring and stoves.', 'warn');
    }
    if (!deferFail) this.checkExposed();
  }

  checkExposed() {
    if (this.suspicion >= 100) this.endContract(false, 'An insurance investigator arrives with a notebook full of questions. You have been exposed.');
  }

  onEnterCell(sim) { onEnterCell(this, sim); }
  piranhaBite(sim, min) { return piranhaBite(this, sim, min); }
  fartCloud(sim) { fartCloud(this, sim); }

  // Place the trap armed in the palette on whatever was clicked. Returns false if it doesn't fit there.
  placeTrap(id, pick) {
    if (!pick) return false;
    if (id === 'cleanup') {
      const p = cleanupPower(pick, this);
      if (!p) return false;
      this.godAction(p);
      return true;
    }
    if (FLOOR_TRAPS.has(id)) {
      if (pick.kind !== 'floor' || !canPlaceFloorTrap(this, id, pick.cell[0], pick.cell[1])) return false;
      this.godAction(floorTrapPower(this, id, pick.cell[0], pick.cell[1]));
      return true;
    }
    const p = findPower(pick, this, id);
    if (!p) return false;
    this.godAction(p);
    return true;
  }

  toggleDoor(id) {
    const d = this.world.toggleDoor(id);
    this.log(d.bricked ? `🧱 The ${d.name} vanishes behind a fresh brick wall.` : `🚪 The ${d.name} is knocked back open.`, 'tool');
  }

  toggleLadder() {
    const l = this.world.ladder;
    l.present = !l.present;
    if (l.present) { this.log('🪜 The pool ladder mysteriously reappears.', 'tool'); return; }
    const swimmers = this.sims.filter(s => s.alive && s.status.swimming).map(s => s.first);
    this.log(`🪜 The pool ladder has been removed.${swimmers.length ? ` ${swimmers.join(' and ')} ${swimmers.length > 1 ? "haven't" : "hasn't"} noticed yet.` : ''}`, 'tool');
  }

  crashCar(car) { this.view.street.crash(car); }
  carCrash(x, z) { carCrash(this, x, z); }

  // Any open flame within r cells of the sim: fire, lit candles or fireplace, a glowing heater,
  // someone cooking, grilling or weeding, or a roommate who is already on fire.
  nearFlame(s, r, own = true) {
    const w = this.world;
    if (w.fire.size && w.fireDistance(s.cx, s.cz) <= Math.floor(r)) return true;
    const near = (x, z) => Math.hypot(x - s.x, z - s.z) <= r;
    const at = o => near(o.cells[0][0] + 0.5, o.cells[0][1] + 0.5);
    for (const id of ['candles', 'fireplace']) {
      const o = w.objects.get(id);
      if (o && o.lit > 0 && !o.charred && at(o)) return true;
    }
    const heater = w.objects.get('heater');
    if (heater.cranked > 0 && !heater.charred && at(heater)) return true;
    return this.sims.some(o => o.alive && near(o.x, o.z) && ((o !== s && o.status.onFire > 0)
      || ((own || o !== s) && o.action && o.action.stage === 'do' && FLAME_ACTIONS.has(o.action.def.id))));
  }

  // How loud the stereo is where this sim is: full blast shakes the whole house.
  noiseAt(s) {
    const st = this.world.objects.get('stereo');
    if (!st || st.charred) return 0;
    if (st.blasting > 0) return 1;
    if (!(st.playing > 0)) return 0;
    return Math.hypot(s.x - st.cells[0][0] - 0.5, s.z - st.cells[0][1] - 0.5) < 6 ? 0.5 : 0.2;
  }

  musicLevel() {
    const st = this.world.objects.get('stereo');
    return !st || st.charred ? 0 : st.blasting > 0 ? 1 : st.playing > 0 ? 0.5 : 0;
  }

  // Loud music, stench and rubbish: the slow, social ways a house wears people down.
  updateNuisance(min) {
    const w = this.world;
    const st = w.objects.get('stereo');
    if (st.blasting > 0) {
      st.blasting -= min;
      st.blastedFor = (st.blastedFor || 0) + min;
      // Night-time bass wears the neighbours down, half an hour at a time.
      if (this.isNight && st.blastedFor > 30) {
        st.blastedFor = 0;
        const n = this.neighbours.west.state === 'home' ? this.neighbours.west : this.neighbours.east;
        if (!st.complained && n.state === 'home') this.log(`📞 ${n.family.visitor} bangs on the wall and threatens to call the police. Nobody can hear them over the bass.`, 'dim');
        st.complained = true;
        this.annoyNeighbours(6);
      }
      if (st.blasting <= 0) { st.blastedFor = 0; st.complained = false; }
    }
    if (st.playing > 0) st.playing -= min;
    if (w.stink && this.clock > w.stink.until) w.stink = null;
    const messy = new Map();
    for (const m of w.mess.values()) {
      const r = w.roomAt(m.x, m.z);
      if (r) messy.set(r, (messy.get(r) || 0) + 1);
    }
    const stinkers = this.sims.filter(s => s.alive && !s.status.swimming && s.needs.hygiene < 15);
    for (const s of this.sims) {
      if (!s.alive || s.status.swimming) continue;
      if (s.status.feral > 0) s.status.feral -= min;
      const room = w.roomAt(s.cx, s.cz);
      let gross = 0;
      if (room && (messy.get(room) || 0) >= 3) gross += 0.5;
      if (w.stink && room && room.name === w.stink.room && s.id !== w.stink.by) gross += 1;
      if (this.noiseAt(s) >= 1 && !(s.action && s.action.def.id === 'dance')) gross += 0.3;
      for (const o of stinkers) {
        if (o === s) continue;
        const d = Math.hypot(o.x - s.x, o.z - s.z);
        if (d > 2) continue;
        gross += 1;
        s.rel[o.id] = Math.max(-100, (s.rel[o.id] || 0) - 0.3 * min);
        // Up close, the smell wins. Fainting next to the pool or the stove is its own problem.
        if (d < 1.3 && s.status.passedOut <= 0 && s.needs.hygiene >= 15 && Math.random() < 0.004 * min) {
          s.endAction();
          s.status.passedOut = 15;
          this.log(`🤢 ${s.first} gets one proper whiff of ${o.first} and faints.`, 'evil');
        }
      }
      if (gross > 0) {
        s.addNeed('fun', -0.3 * gross * min);
        s.sanity = Math.max(0, s.sanity - 0.02 * gross * min);
      }
    }
  }

  meteorStrike(sim) {
    if (this.meteors.some(m => m.sim === sim)) return;
    sim.endAction();
    sim.queue = [];
    sim.status.engaged = 9999;
    sim.thought = '😨';
    this.meteors.push({ sim, x: sim.x, z: sim.z, t: 0, dur: 1.6 });
    this.dialogue.say(sim, 'meteor', 3);
    this.sfx('meteor');
    this.log(`☄️ Something bright is falling from the sky... straight at ${sim.name}.`, 'evil');
  }

  // ---------- death & scoring ----------

  kill(sim, cause) {
    if (!sim.alive) return;
    if (sim.immortal) {
      sim.health = 100;
      Object.assign(sim.status, { onFire: 0, poisoned: 0, trapped: 0, passedOut: 0, panic: 0 });
      this.view.burst(sim.x, sim.z, 'fright');
      this.dialogue.say(sim, 'immortal', 3);
      this.log(`♾️ ${sim.name} ${pick(IMMORTAL_LINES)} (${cause} didn't take.)`, 'tool');
      return;
    }
    sim.alive = false;
    sim.health = 0;
    sim.cause = cause;
    this.dialogue.active.delete(sim.id);
    const witness = this.sims.find(s => s !== sim && s.alive && Math.hypot(s.x - sim.x, s.z - sim.z) < 7);
    if (witness) this.dialogue.say(witness, 'death', 3);
    sim.endAction();
    sim.queue = [];
    for (const o of this.sims) {
      if (o.status.engagedWith === sim) { o.status.engaged = 0; o.status.engagedWith = null; }
      if (o.action && o.action.target === sim) o.endAction();
      o.queue = o.queue.filter(q => q.target !== sim);
    }
    const tomb = this.world.addTombstone(sim.cx, sim.cz, sim, cause);
    tomb.epitaph = pick(EPITAPHS);
    this.view.spawnReaper(sim);
    this.sfx('death');
    const session = this.session;
    setTimeout(() => { if (this.session === session) this.log(`💀 The Grim Reaper: ${pick(REAPER_QUIPS)}`, 'dim'); }, 1200);

    const info = CAUSES[cause];
    const line = pick(info.lines);
    let pts = 100;
    if (!this.causes.has(cause)) pts += 75;
    const discovered = !this.careerCauses.has(cause);
    if (discovered) pts += 100;
    this.combo = this.clock - this.lastDeathClock < 180 ? this.combo + 1 : 1;
    pts *= this.combo;
    this.lastDeathClock = this.clock;
    this.score += pts;
    this.causes.add(cause);
    this.careerCauses.add(cause);
    const day = Math.floor(this.clock / 1440) + 1;
    this.deaths.push({ name: sim.name, cause, line, pts, day, role: sim.role, headline: pick(HEADLINES[cause]) });
    this.log(`${info.icon} ${sim.name} ${line} +${pts}${this.combo > 1 ? ` (x${this.combo} combo!)` : ''}`, 'death');
    this.ui.toast(`${info.icon} ${sim.name} died: ${cause}${discovered ? ' — NEW death discovered!' : ''}`);
    if (this.selected === sim) this.selected = this.sims.find(s => s.alive) || null;

    let sus = DEATH_SUSPICION[cause];
    if (cause === 'Drowning' && !this.world.ladder.present) sus = 25;
    if (cause === 'Starvation' && this.world.doors.some(d => d.bricked && !d.hackLocked)) sus = 30;
    if (cause === 'Poison' && sim.status.untraceable) sus = 0;
    // Anything that looks like murder, and every fatal fire, gets a detective sent round.
    if (sus >= 10 || cause === 'Fire') requestInvestigation(this, `the death of ${sim.name}`);
    if (this.contract) {
      this.malice += 25;
      if (cause === 'Poison' && sim.status.untraceable) {
        this.log(`⚗️ The coroner consults an expert witness: Dr. Asraa Z. Her report says "natural causes". Case closed.`, 'tool');
      }
      this.addSuspicion(sus, sus >= 20 ? `🕵️ ${sim.first}'s death looks... suspicious. (+${sus} suspicion)` : null, true);
      const onlookers = [...visitorsNear(this, sim.x, sim.z, 8), ...respondersNear(this, sim.x, sim.z, 8)];
      if (onlookers.length) this.addSuspicion(15, `👀 ${onlookers.length > 1 ? 'The onlookers' : onlookers[0].first} saw the whole thing. (+15 suspicion)`, true);
      this.checkContract();
      this.checkExposed();
    } else {
      this.profile.money += 10;
      saveProgress(this.profile);
    }
    if (!this.contract && !this.over && this.sims.every(s => !s.alive)) {
      this.over = true;
      this.lastBonus = Math.max(0, Math.round((3 - this.clock / 1440) * 400));
      this.score += this.lastBonus;
      const session = this.session;
      setTimeout(() => { if (this.session === session) this.ui.showFreeRecap(); }, 4200);
    }
    this.ui.refresh();
  }

  checkContract() {
    if (!this.contract || this.result) return;
    const r = evaluate(this);
    if (r.state === 'won') this.endContract(true);
    else if (r.state === 'failed') this.endContract(false, r.reason);
  }

  endContract(won, reason) {
    if (this.result) return;
    const stars = won ? starsFor(this) : null;
    this.result = { won, reason, stars, reward: 0 };
    this.over = true;
    if (won) {
      const id = this.contract.id;
      const prev = this.profile.stars[id] || 0;
      this.result.reward = contractReward(this.contract, stars.count, prev);
      this.profile.stars[id] = Math.max(prev, stars.count);
      this.profile.money += this.result.reward;
      saveProgress(this.profile);
    }
    this.log(won ? '✅ Contract complete. The client is... satisfied.' : `❌ Contract failed: ${reason}`, won ? 'death' : 'warn');
    this.sfx(won ? 'win' : 'fail');
    const session = this.session;
    setTimeout(() => { if (this.session === session) { this.setSpeed(0); this.ui.showResult(); } }, won ? 3800 : 1500);
  }

  // ---------- simulation ----------

  updateHazards(min) {
    const w = this.world;
    const fp = w.objects.get('fireplace');
    if (fp.lit > 0) {
      fp.lit -= min;
      if (!fp.charred && Math.random() < (fp.stoked ? 0.01 : 0.0006) * min) {
        const [x, z] = pick([[11, 1], [11, 3], [12, 1], [12, 3], [12, 2], [10, 2]]);
        if (w.ignite(x, z)) { this.log('🔥 An ember leaps out of the fireplace and catches the rug!', 'evil'); this.sfx('fire'); }
      }
      if (fp.lit <= 0) fp.stoked = false;
    }
    // Candles burn down on their own. Nudged under the towels, they take the bathroom with them.
    const c = w.objects.get('candles');
    if (c.lit > 0) {
      c.lit -= min;
      if (!c.charred && Math.random() < (c.sabotaged ? 0.02 : 0.0001) * min) {
        const [x, z] = pick([[13, 1], [13, 2], [14, 2]]);
        if (w.ignite(x, z)) {
          c.sabotaged = false;
          this.log('🕯️🔥 The candles topple into the towels. The bathroom is now a feature fireplace.', 'evil');
          this.sfx('fire');
        }
      }
    }
    const h = w.objects.get('heater');
    if (h.cranked > 0) {
      h.cranked -= min;
      if (!h.charred && Math.random() < 0.003 * min && w.ignite(h.cells[0][0], h.cells[0][1])) {
        this.log('🔥 The space heater finally gives up and bursts into flames!', 'evil');
        this.sfx('fire');
        h.cranked = 0;
      }
    }
    w.updateFire(min);
    this.updateNuisance(min);
  }

  step(gdt) {
    const min = gdt * MIN_PER_SEC;
    this.clock += min;
    this.updateHazards(min);
    for (const s of this.sims) if (s.alive) s.update(gdt, min, this);
    if (this.freeWill) for (const s of this.sims) runAutonomy(s, this, min);
    for (const m of this.meteors) {
      m.t += gdt;
      if (m.t >= m.dur) {
        this.kill(m.sim, 'Meteor');
        m.sim.status.engaged = 0;
        this.world.ignite(Math.floor(m.x), Math.floor(m.z));
        this.view.shake = 0.6;
        this.view.burst(m.x, m.z, 'explosion');
        this.sfx('explosion');
      }
    }
    this.meteors = this.meteors.filter(m => m.t < m.dur);
    updateGhosts(this, gdt, min);
    updateVisitors(this, gdt, min);
    updateNeighbours(this, gdt, min);
    updateEmergency(this, gdt, min);
    if (this.hackLockUntil && this.clock > this.hackLockUntil) {
      this.hackLockUntil = 0;
      for (const d of this.world.doors) if (d.hackLocked) { d.bricked = false; d.hackLocked = false; }
      this.world.rebuildEdges();
      this.log('🔓 The smart locks click open again. Nobody can explain it.', 'dim');
    }
    if (this.contract && !this.result) {
      this.malice += 2 * min / 60;
      // Airtight alibi and a resident legal expert (Asraa Z) each double how fast suspicion fades.
      const lawyer = this.sims.some(s => s.rosterId === 'asraa' && s.alive);
      const fade = 0.5 * (this.upgrade('alibi') ? 2 : 1) * (lawyer ? 2 : 1);
      this.suspicion = Math.max(0, this.suspicion - fade * min / 60);
      if (this.clock >= this.contract.days * 1440) this.endContract(false, `Time ran out. The deadline was the end of Day ${this.contract.days}.`);
    }
  }

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const gdt = dt * SPEEDS[this.speed];
    if (gdt > 0) {
      const steps = Math.ceil(gdt / 0.05);
      for (let i = 0; i < steps; i++) this.step(gdt / steps);
    }
    const running = gdt > 0 && this.started && !document.hidden;
    this.dialogue.update(dt, running);
    this.audio.update(dt, running, this.isNight, this.world.fire.size > 0, this.musicLevel());
    this.view.render(dt, now / 1000);
    this.ui.update(dt);
    requestAnimationFrame(t => this.loop(t));
  }
}

window.game = new Game();

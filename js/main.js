import { World } from './world.js';
import { Sim } from './sim.js';
import { View } from './view.js';
import { UI } from './ui.js';
import { runAutonomy } from './autonomy.js';
import { CAUSES, DEATH_SUSPICION, MIN_PER_SEC, ROSTER, IMMORTAL_LINES, HEADLINES, EPITAPHS, REAPER_QUIPS, GRID_W, GRID_H, HABITS, HOUSE_ROLES } from './data.js';
import { CONTRACTS, evaluate, starsFor, loadProgress, saveProgress, wishMet, versusContract, bestKey, starKey, DIFFICULTIES, atDifficulty } from './contracts.js';
import { onEnterCell, piranhaBite, updateGhosts, canPlaceFloorTrap, fartCloud, carCrash, FLOOR_TRAPS, explode, toppleShelf, toolPrice, toolLock } from './traps.js';
import { sabotageFor, plantDef, seesThrough } from './interactions.js';
import { updateFavours } from './crime.js';
import { becomeCareful, provoked, endPlan, updatePlans } from './plans.js';
import { initCareer, updateCareer } from './career.js';
import { Sfx } from './audio.js';
import { Dialogue } from './dialogue.js';
import { SHOP, LOCKED_TRAPS, contractReward } from './shop.js';
import { updateVisitors, scheduleNextVisit, visitorsNear, dismissVisitors, visitorDied } from './visitors.js';
import { updateOutsiders, hurtOutsider } from './outsiders.js';
import { updateGang } from './gang.js';
import { initNeighbours, updateNeighbours, annoyNeighbour, pleaseNeighbour, SIDES } from './neighbours.js';
import { updateEmergency, resetEmergency, requestInvestigation, endInvestigation, respondersNear, responderDown } from './emergency.js';

const SPEEDS = [0, 1, 3, 8];
const SKIP_SPEED = 40;          // time-lapse while you're at work or asleep
const SKIP_KEY = 'worst-roommates-autoskip';
const START_SPOTS = [[9, 8], [11, 8], [10, 7], [12, 8], [8, 7], [13, 7]];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
// How the people who weren't on the list go.
const OUTSIDER_DEATHS = {
  Fire: 'burned to death on your property.', 'Bear Trap': 'bled out in a bear trap on your garden path.',
  Slip: 'slipped, cracked their head and never got up.', Crushed: 'was flattened by a bookshelf full of true crime.',
  Explosion: 'was blown clean across the garden.', 'Letter Bomb': 'opened the parcel. The parcel won.',
  'Car Crash': 'was hit by a car that had no business being in the garden.', Electrocution: 'poked the wrong wire.',
  Poison: 'tasted the evidence.', Fart: 'was gassed to death on the doorstep.', 'Biker Gang': 'was beaten to death by a biker gang.',
  Fight: 'lost a fight with one of your roommates.',
};
// Actions that put an open flame in a sim's hands.
const FLAME_ACTIONS = new Set(['cook', 'bake', 'grill', 'weeds', 'light', 'stoke']);

class Game {
  constructor() {
    this.usedNames = new Set();
    this.profile = loadProgress();
    this.score = this.profile.score;
    this.careerCauses = new Set(this.profile.causes);
    this.freeLevel = 0;
    this.speed = 0;
    this.lastSpeed = 1;
    this.freeWill = true;
    this.started = false;
    try { this.autoSkip = localStorage.getItem(SKIP_KEY) !== '0'; } catch { this.autoSkip = true; }
    this.skipHoldUntil = 0;
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

  // contract === null means free play (a random household, no suspicion). You play one character
  // (charId); everyone else is a target who lives, schemes and fights back on their own.
  setup(contract, charId = null) {
    this.difficulty = DIFFICULTIES[this.profile.difficulty] ? this.profile.difficulty : 'normal';
    this.diff = DIFFICULTIES[this.difficulty];
    if (contract) contract = atDifficulty(contract, this.difficulty);
    this.rent = this.diff.rent;
    this.contract = contract;
    this.sims = [];
    const me = charId ? [{ ...ROSTER.find(r => r.id === charId), role: 'player' }] : [];
    const targets = contract ? contract.targets.map(t => ({ ...t, role: 'target' }))
      : Array.from({ length: Math.min(6 - me.length, 1 + this.freeLevel) }, () => ({ role: 'target' }));
    // Housemates who aren't on the list: they live here too, each with a part to play.
    const housemates = ((contract && contract.housemates) || []).map(h => ({ ...h, houseRole: h.role, role: 'bystander' }));
    const specs = [...targets, ...housemates, ...me];
    const n = specs.length;
    this.world = new World(n);
    for (let i = 0; i < n; i++) {
      const spec = specs[i];
      const s = new Sim(this.usedNames, i, spec.name ? spec : null);
      s.role = spec.role;
      s.rosterId = spec.role === 'player' || spec.nemesis ? spec.id : null;
      s.place(...START_SPOTS[i]);
      this.sims.push(s);
    }
    this.player = this.sims.find(s => s.role === 'player') || null;
    // They're a nasty bunch, and they don't much like the new roommate either.
    for (const a of this.sims) {
      for (const b of this.sims) {
        if (a.id >= b.id) continue;
        const r = a === this.player || b === this.player ? Math.round(-25 + Math.random() * 30) : Math.round(-30 + Math.random() * 60);
        a.rel[b.id] = r; b.rel[a.id] = r;
      }
    }
    // Best friends, always.
    const asraa = this.sims.find(s => s.rosterId === 'asraa'), daniel = this.sims.find(s => s.rosterId === 'daniel');
    if (asraa && daniel) { asraa.rel[daniel.id] = 90; daniel.rel[asraa.id] = 90; }
    for (const [i, j, v] of (contract && contract.rels) || []) {
      this.sims[i].rel[this.sims[j].id] = v;
      this.sims[j].rel[this.sims[i].id] = v;
    }
    // A guardian loves the one they look after, a hater loathes them (and the target has no idea quite how
    // much), a peacekeeper gets on with everyone.
    specs.forEach((spec, i) => {
      if (!spec.houseRole) return;
      const s = this.sims[i], ward = spec.ward !== undefined ? this.sims[spec.ward] : null;
      s.houseRole = { kind: spec.houseRole, ward: ward ? ward.id : null, about: spec.about };
      const set = (o, mine, theirs = mine) => { s.rel[o.id] = mine; o.rel[s.id] = theirs; };
      if (spec.houseRole === 'guardian') set(ward, 70, 40);
      else if (spec.houseRole === 'hater') set(ward, -70, -20);
      else for (const o of this.sims) if (o !== s) set(o, 15);
    });
    // Everyone gets their own bed.
    const beds = [...this.world.objects.values()].filter(o => o.type === 'bed').sort((a, b) => a.bedIndex - b.bedIndex);
    this.sims.forEach((s, i) => { beds[i].owner = s.id; beds[i].name = `${s.first}'s bed`; s.bedId = beds[i].id; });
    this.selected = this.player || this.sims[0];
    this.clock = 17.5 * 60;
    this.doom = 0;
    this.hackLockUntil = 0;
    this.visit = null;
    this.visitBans = new Set();
    scheduleNextVisit(this);
    initNeighbours(this);
    resetEmergency(this);
    this.gang = null;
    this.collateral = 0;
    this.inspectorsLost = 0;
    this.pendingInquiry = null;
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
    this.scoreAtStart = this.score;
    this.arrested = false;
    this.warned = false;
    this.seenSabotage = false;
    this.oilSlick = 0;
    this.favours = [];
    this.playerHabits = {};
    initCareer(this, charId, Math.round((contract ? contract.cash : 200) * this.diff.cash) + (this.upgrade('pockets') ? 100 : 0));
    if (contract && contract.setup) contract.setup(this);
  }

  startContract(index, charId = this.charId) {
    this.versus = null;
    this.contractIndex = index;
    this.charId = charId;
    this.profile.character = charId;
    saveProgress(this.profile);
    this.setup(CONTRACTS[index], charId);
    this.begin();
    const c = this.contract;
    this.log(`📋 CONTRACT: ${c.title} — ${c.brief}`, 'tool');
    this.introduceJob();
    this.log(`💡 ${c.hint}`, 'dim');
  }

  // Sim vs Sim: you against the one roommate you'd most like to see dead.
  startVersus(meId, foeId) {
    this.versus = [meId, foeId];
    this.contractIndex = null;
    this.charId = meId;
    this.profile.character = meId;
    saveProgress(this.profile);
    this.setup(versusContract(meId, foeId), meId);
    this.begin();
    const c = this.contract, foe = this.sims[0];
    this.log(`⚔️ SIM VS SIM: ${c.title}. ${c.brief}`, 'tool');
    this.log(`😠 ${foe.first} knows exactly why you're here, and the feeling is mutual.`, 'warn');
    this.introduceJob();
    this.log(`💡 ${c.hint}`, 'dim');
  }

  startFreePlay(charId = this.charId) {
    this.versus = null;
    this.contractIndex = null;
    this.charId = charId;
    this.freeLevel++;
    this.setup(null, charId);
    this.begin();
    this.log(`Free play: you move in with ${this.sims.length - 1} wicked roommates. Kill them all, and don't let them get you first.`, 'tool');
    this.introduceJob();
  }

  introduceJob() {
    const j = this.job, p = this.player;
    if (!j || !j.def || !p) return;
    this.log(`💼 You are ${p.name}, ${j.def.titles[0]}. Shifts ${String(j.def.start).padStart(2, '0')}:00 for ${j.def.hours}h pay $${j.def.pay[0]}. Rent is $${this.rent} a night. 💵 You start with $${this.cash}.`, 'tool');
    this.log(`🌆 It's your first evening in the house. Look around, get to know your roommates, plan something nasty and get some sleep. Work and sleep fly by in time-lapse (⏩).`, 'dim');
  }

  retry() {
    if (this.versus) this.startVersus(...this.versus);
    else if (this.contractIndex !== null && this.contractIndex !== undefined) this.startContract(this.contractIndex, this.charId);
    else { this.freeLevel--; this.startFreePlay(this.charId); }
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

  setDifficulty(diff) {
    if (!DIFFICULTIES[diff]) return;
    this.profile.difficulty = diff;
    saveProgress(this.profile);
  }

  setSpeed(i) {
    if (i > 0) this.lastSpeed = i;
    this.speed = i;
    this.ui.refresh();
  }

  // Why the clock is racing, or null: your character is at work, working from home, or asleep.
  // Something dramatic at home (a death, a fire, the police) drops back to normal speed for a moment.
  skipReason() {
    const p = this.player;
    if (!this.autoSkip || !this.started || this.over || this.speed === 0 || !p || !p.alive) return null;
    if (performance.now() < this.skipHoldUntil) return null;
    if (p.status.away) return 'work';
    const a = p.action;
    if (a && a.stage === 'do' && a.def.id === 'workhome') return 'homework';
    if (a && a.stage === 'do' && (a.def.id === 'sleep' || a.def.id === 'nap')) return 'sleep';
    return null;
  }

  holdSkip(ms = 4000) {
    if (this.skipReason()) this.skipHoldUntil = performance.now() + ms;
  }

  toggleAutoSkip() {
    this.autoSkip = !this.autoSkip;
    try { localStorage.setItem(SKIP_KEY, this.autoSkip ? '1' : '0'); } catch { /* this session only */ }
    this.ui.refresh();
  }

  log(msg, cls) { this.ui.log(msg, cls); }
  sfx(name) { this.audio.play(name); }
  popup(sim, text, color) { this.view.addPopup(sim, text, color); }
  flash(sim) { this.view.flash(sim); }

  // ---------- Hand of Fate ----------

  // Awake, non-swimming sims (not at work) in the same room (or both outdoors) within 7 cells of any of the cells,
  // plus any visitors at the door (they peer through every window) and emergency responders on the lot.
  witnesses(cells) {
    const w = this.world;
    const seen = this.sims.filter(s => {
      if (!s.alive || s.status.passedOut > 0 || s.status.swimming || s.status.away) return false;
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

  // What you've watched a roommate do, and at what time of day: their habits go on their person card.
  noticeHabit(sim, a) {
    const me = this.player;
    if (!me || !me.alive || !HABITS[a.def.id]) return;
    if (sim === me) {
      if (this.witnesses([[me.cx, me.cz]]).some(x => x !== me && x.rel)) this.playerHabits[a.def.id] = (this.playerHabits[a.def.id] || 0) + 1;
      return;
    }
    if (!this.witnesses([[sim.cx, sim.cz]]).includes(me)) return;
    const h = (this.clock / 60) % 24;
    const when = h < 5 ? 'at night' : h < 12 ? 'in the morning' : h < 18 ? 'in the afternoon' : h < 22 ? 'in the evening' : 'at night';
    const key = `${a.def.id}|${when}`;
    sim.habits = sim.habits || {};
    sim.habits[key] = (sim.habits[key] || 0) + 1;
  }

  seesThrough(s, t, def) { return seesThrough(s, t, def, this); }
  becomeCareful(s, why, what) { becomeCareful(this, s, why, what); }
  provoked(t, by, def) { provoked(this, t, by, def); }
  callOff(s) { endPlan(this, s); }

  // Back from an errand (see the "errand" action), none the wiser.
  returnFromErrand(s) {
    s.status.away = false;
    s.status.errand = 0;
    s.place(10, 15);
    s.lastCell = null;
    this.log(`🍕 ${s.first} comes back with a pizza. Nobody asks what happened while they were out.`, 'dim');
  }

  // The score, like the collection, is kept between sessions.
  addScore(pts) {
    if (!pts) return;
    this.score += pts;
    this.profile.score = this.score;
    saveProgress(this.profile);
  }

  // Something is about to go badly for you: drop out of fast-forward and time-lapse so you can react.
  danger(msg) {
    if (this.over || !this.player || !this.player.alive) return;
    this.log(msg, 'warn');
    this.ui.toast(msg);
    this.sfx('alarm');
    this.skipHoldUntil = performance.now() + 8000;
    if (this.speed > 1) this.setSpeed(1);
  }

  // Caught and led away in handcuffs: the contract, or the free-play run, is over.
  arrest(msg, officer = null) {
    const p = this.player;
    if (!p || !p.alive || this.over) return;
    if (p.canUse('slipper')) { this.slipperTheLaw(officer); return; }
    this.arrested = true;
    p.endAction();
    p.queue = [];
    this.popup(p, '🚔 ARRESTED', '#7ab8ff');
    this.sfx('police');
    this.log(msg, 'warn');
    if (this.contract) { this.endContract(false, msg); return; }
    this.over = true;
    this.lastBonus = 0;
    const session = this.session;
    setTimeout(() => { if (this.session === session) { this.setSpeed(0); this.ui.showFreeRecap(); } }, 3000);
    this.ui.refresh();
  }

  // Nobody takes an auntie in. The handcuffs come out, the slipper comes off, and the officer decides
  // it's a matter for another day.
  slipperTheLaw(officer) {
    const p = this.player, who = officer ? officer.title || officer.first : 'The officer';
    p.endAction();
    this.sfx('punch');
    this.popup(p, '🩴 YETER!', '#ff7ab0');
    this.dialogue.say(p, 'slipper', 3);
    this.log(`🩴 ${who} reaches for the handcuffs. ${p.first} reaches for her slipper. THWACK. ${who} decides this is a matter for another day.`, 'warn');
    if (!officer || hurtOutsider(this, officer, 20, 'Slipper')) return;
    if (officer.kind === 'detective') this.endInvestigation(`🚓 ${who} retreats to the car, rubbing his forehead, and drives off.`);
    else this.dismissVisitors(`👮 ${who} backs down the garden path, rubbing his forehead.`);
  }

  checkExposed() {
    if (this.suspicion >= 100) this.endContract(false, 'An insurance investigator arrives with a notebook full of questions. You have been exposed.');
  }

  onEnterCell(sim) { onEnterCell(this, sim); }
  piranhaBite(sim, min) { return piranhaBite(this, sim, min); }
  fartCloud(sim) { fartCloud(this, sim); }

  // The tool armed in the toolkit bar, used on whatever was clicked: your character walks over and does
  // it. Returns false if that tool doesn't fit there.
  placeTrap(id, pick) {
    const p = this.player;
    if (!pick || !p || !p.alive || p.status.away) return false;
    let def = null, target = null;
    if (FLOOR_TRAPS.has(id)) {
      if (pick.kind !== 'floor' || !canPlaceFloorTrap(this, id, pick.cell[0], pick.cell[1])) return false;
      def = plantDef(this, id, pick.cell);
      target = { cell: pick.cell };
    } else {
      def = sabotageFor(pick, this).find(d => d.key === id);
      target = pick.obj || pick.door || pick.tomb || null;
    }
    if (!def) return false;
    const lock = toolLock(p, id), price = toolPrice(this, id);
    if (lock) this.ui.toast(`${def.icon} ${lock}`);
    else if (this.cash < price) this.ui.toast(`💸 Not enough cash: $${price} needed`);
    else p.enqueue(def, target, 'player');
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
  explodeAt(x, z, opts) { explode(this, x, z, opts); }
  toppleShelf(msg) { toppleShelf(this, msg); }

  // Someone who wasn't on the list died here: a visitor, a neighbour, a firefighter, an inspector, a biker.
  // They get a grave in the garden too, and the authorities take a much closer interest.
  outsiderDied(p, cause) {
    this.holdSkip(5000);
    const name = p.title || p.first;
    const kind = p.kind === 'visitor' ? p.visitKind : p.kind;
    const cx = Math.max(0, Math.min(GRID_W - 1, Math.floor(p.x))), cz = Math.max(0, Math.min(GRID_H - 1, Math.floor(p.z)));
    const tomb = this.world.addTombstone(cx, cz, { id: p.id, name }, cause);
    tomb.epitaph = kind === 'biker' ? 'Rode hard. Died harder. Nobody came.' : kind === 'detective' ? 'Case closed.' : pick(EPITAPHS);
    this.view.spawnReaper(p);
    this.sfx('murder');
    this.collateral++;
    const info = CAUSES[cause] || CAUSES.Fight;
    this.log(`💀 ${name} ${OUTSIDER_DEATHS[cause] || pick(info.lines)} (Collateral damage: ${name} was never on the list.)`, 'death');
    if (kind === 'biker') {
      const session = this.session;
      setTimeout(() => { if (this.session === session) this.log('💀 The Grim Reaper, collecting a biker: "Ugh. The leather. The smell. Every single time."', 'dim'); }, 1000);
    }
    this.ui.toast(`${info.icon} ${name} died: ${cause}. Collateral damage!`);
    if (p.kind === 'visitor') visitorDied(this, p);
    else responderDown(this, p);
    const sus = { detective: 35, cop: 35, firefighter: 15, neighbour: 25, biker: 0 }[kind] ?? 20;
    if (this.contract) this.addSuspicion(sus, sus ? `🕵️ ${name} is dead, on your property. People will ask questions. (+${sus} suspicion)` : null);
    else this.addScore(50);
    if (kind !== 'biker' && kind !== 'detective') requestInvestigation(this, `the death of ${name}`);
    this.ui.refresh();
  }
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
    this.holdSkip(5000);
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
    for (const s of this.sims) {
      if (s !== sim && s.alive && Math.hypot(s.x - sim.x, s.z - sim.z) < 7) this.becomeCareful(s, cause, `saw what happened to ${sim.first}`);
    }
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
    this.sfx('murder');
    const session = this.session;
    setTimeout(() => { if (this.session === session) this.log(`💀 The Grim Reaper: ${pick(REAPER_QUIPS)}`, 'dim'); }, 1200);

    const info = CAUSES[cause];
    const line = pick(info.lines);
    const discovered = !this.careerCauses.has(cause);
    let pts = 0, wished = false;
    if (sim.role === 'bystander') {
      this.collateral++;
      this.addSuspicion(20, `💔 ${sim.first} was never on the list. People will ask why they had to die. (+20 suspicion)`, true);
    } else if (sim !== this.player) {
      // Every kill scores; a new way of dying scores more, and so does exactly what the client ordered.
      pts = 100;
      if (!this.causes.has(cause)) pts += 75;
      if (discovered) pts += 100;
      const want = this.contract && this.contract.objectives.find(o => o.type === 'die' && this.sims[o.who] === sim);
      wished = !!(want && want.cause === cause);
      if (wished) pts += 200;
      this.combo = this.clock - this.lastDeathClock < 180 ? this.combo + 1 : 1;
      pts *= this.combo;
    }
    this.lastDeathClock = this.clock;
    this.causes.add(cause);
    this.careerCauses.add(cause);
    if (discovered) this.profile.causes.push(cause);
    this.addScore(pts);
    const day = Math.floor(this.clock / 1440) + 1;
    this.deaths.push({ name: sim.name, cause, line, pts, day, role: sim.role, headline: pick(HEADLINES[cause]) });
    this.log(`${info.icon} ${sim.name} ${line}${pts ? ` +${pts}` : ''}${pts && this.combo > 1 ? ` (x${this.combo} combo!)` : ''}`, 'death');
    if (wished) this.log(`✨ Exactly the way the client asked for. (+200 before combo)`, 'tool');
    this.ui.toast(`${info.icon} ${sim.name} died: ${cause}${discovered ? ' — NEW death discovered!' : ''}`);
    if (this.selected === sim) this.selected = null;

    let sus = DEATH_SUSPICION[cause];
    if (cause === 'Drowning' && !this.world.ladder.present) sus = 25;
    if (cause === 'Starvation' && this.world.doors.some(d => d.bricked && !d.hackLocked)) sus = 30;
    if (cause === 'Poison' && sim.status.untraceable) sus = 0;
    // Anything that looks like murder, and every fatal fire, gets a detective sent round.
    if (sus >= 10 || cause === 'Fire') requestInvestigation(this, `the death of ${sim.name}`);
    // Whatever happens while you're at work, you were at work.
    const alibi = this.player && this.player !== sim && this.player.status.away;
    if (alibi && sus > 0) {
      sus = Math.round(sus * 0.3);
      this.log(`🧾 ${this.player.first} was at ${this.job.def.place} at the time. Watertight alibi.`, 'tool');
    }
    if (this.contract) {
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
    // Free play ends when the household is gone, or when they get you first.
    const survivors = this.sims.filter(s => s !== this.player && s.alive);
    if (!this.contract && !this.over && (!survivors.length || sim === this.player)) {
      this.over = true;
      this.lastBonus = sim === this.player ? 0 : Math.max(0, Math.round((3 - this.clock / 1440) * 400));
      this.addScore(this.lastBonus);
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
    this.result = { won, reason, stars, reward: 0, extras: [] };
    if (won) {
      // Bonus points on top of the kills: the client's way, time to spare, and a clean job.
      const extras = this.result.extras;
      if (wishMet(this)) extras.push([this.contract.versus ? '✨ Poetic justice' : '✨ The client\'s way', 300]);
      const hoursLeft = Math.floor((this.contract.days * 1440 - this.clock) / 60);
      if (hoursLeft > 0) extras.push([`⏱️ ${hoursLeft}h to spare`, hoursLeft * 10]);
      if (this.peakSuspicion < 30) extras.push(['🧼 Clean job (suspicion stayed under 30)', 300]);
      if (!this.seenSabotage) extras.push(['🥷 Nobody ever saw you do it', 200]);
      const others = this.sims.filter(s => s.role === 'bystander');
      if (others.length && others.every(s => s.alive)) extras.push(['🕊️ Nobody else in the house got hurt', 200]);
      for (const [, pts] of extras) this.addScore(pts);
      // Personal best for this contract with this character.
      const key = bestKey(this.contract.id, this.charId, this.difficulty), points = this.score - this.scoreAtStart;
      this.result.points = points;
      this.result.prevBest = this.profile.best[key] || 0;
      if (points > this.result.prevBest) this.profile.best[key] = points;
    }
    this.over = true;
    if (won) {
      const id = starKey(this.contract.id, this.difficulty);
      const prev = this.profile.stars[id] || 0;
      this.result.reward = Math.round(contractReward(this.contract, stars.count, prev) * this.diff.pay);
      this.profile.stars[id] = Math.max(prev, stars.count);
      this.profile.money += this.result.reward;
      saveProgress(this.profile);
    }
    const done = this.contract.versus ? `✅ ${this.player.first} wins. The house is theirs. For now.` : '✅ Contract complete. The client is... satisfied.';
    this.log(won ? done : `❌ Contract failed: ${reason}`, won ? 'death' : 'warn');
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
      if (!fp.charred && Math.random() < (fp.stoked ? 0.004 : 0.0006) * min) {
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
    // The others always do as they please; free will only decides whether you look after yourself.
    for (const s of this.sims) if (s !== this.player || this.freeWill) runAutonomy(s, this, min);
    updateCareer(this, min);
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
    updateFavours(this);
    updatePlans(this);
    updateGang(this, gdt, min);
    updateOutsiders(this, gdt, min);
    if (this.hackLockUntil && this.clock > this.hackLockUntil) {
      this.hackLockUntil = 0;
      for (const d of this.world.doors) if (d.hackLocked) { d.bricked = false; d.hackLocked = false; }
      this.world.rebuildEdges();
      this.log('🔓 The smart locks click open again. Nobody can explain it.', 'dim');
    }
    if (this.contract && !this.result) {
      // Airtight alibi and a resident legal expert (Asraa Z) each double how fast suspicion fades.
      const lawyer = !!this.player && this.player.rosterId === 'asraa' && this.player.alive;
      const fade = 0.5 * (this.upgrade('alibi') ? 2 : 1) * (lawyer ? 2 : 1) * this.diff.fade;
      this.suspicion = Math.max(0, this.suspicion - fade * min / 60);
      if (this.clock >= this.contract.days * 1440) this.endContract(false, `Time ran out. The deadline was the end of Day ${this.contract.days}.`);
    }
  }

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const fires = this.world.fire.size, police = !!this.investigation && this.investigation.state === 'driving';
    const gdt = dt * (this.skipReason() ? SKIP_SPEED : SPEEDS[this.speed]);
    if (gdt > 0) {
      const steps = Math.ceil(gdt / 0.05);
      for (let i = 0; i < steps; i++) this.step(gdt / steps);
    }
    // A fire breaking out or the police turning up is worth watching at normal speed.
    if ((!fires && this.world.fire.size) || (!police && this.investigation && this.investigation.state === 'driving')) this.holdSkip();
    const running = gdt > 0 && this.started && !document.hidden;
    this.dialogue.update(dt, running);
    this.audio.update(dt, running, this.isNight, this.world.fire.size > 0, this.musicLevel());
    this.view.render(dt, now / 1000);
    this.ui.update(dt);
    requestAnimationFrame(t => this.loop(t));
  }
}

window.game = new Game();

import { TRAITS, CAUSES, PERSONALITIES, ROSTER } from './data.js';
import { menuFor } from './interactions.js';
import { TRAPS, toolPrice, toolLock } from './traps.js';
import { JOBS, SKILLS, RENT, jobTitle, shiftPay, shiftTime } from './career.js';
import { CONTRACTS, CAUSE_VERB, describeBonus, bonusMet, isUnlocked, wishState, causeDone } from './contracts.js';
import { SHOP } from './shop.js';

const NEEDS = [['hunger', '🍗', 'Hunger'], ['energy', '⚡', 'Energy'], ['hygiene', '🧼', 'Hygiene'], ['fun', '🎲', 'Fun'], ['social', '💬', 'Social']];
const hex = c => '#' + c.toString(16).padStart(6, '0');
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

export class UI {
  constructor(game) {
    this.game = game;
    this.$ = id => document.getElementById(id);
    this.pie = this.$('pie');
    this.acc = 0;
    this.bind();
  }

  bind() {
    const g = this.game;
    document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => g.setSpeed(Number(b.dataset.speed))));
    this.$('freeWillBtn').addEventListener('click', () => { g.freeWill = !g.freeWill; this.refresh(); });
    this.$('skipBtn').addEventListener('click', () => g.toggleAutoSkip());
    // Watching instead: normal speed until the stretch of work or sleep is over.
    this.$('skipBanner').addEventListener('click', () => { g.skipHoldUntil = performance.now() + 60 * 60 * 1000; this.watching = true; this.refresh(); });
    this.$('wallsBtn').addEventListener('click', () => { g.view.wallsUp = !g.view.wallsUp; this.refresh(); });
    this.$('roofBtn').addEventListener('click', () => { g.view.roofOn = !g.view.roofOn; this.refresh(); });
    this.$('rotL').addEventListener('click', () => { g.view.cam.goal += Math.PI / 2; });
    this.$('rotR').addEventListener('click', () => { g.view.cam.goal -= Math.PI / 2; });
    this.$('boardBtn').addEventListener('click', () => { g.setSpeed(0); this.showBoard(); });
    this.$('muteBtn').addEventListener('click', () => { g.audio.ensure(); g.audio.toggleMute(); this.refresh(); });
    this.$('volume').value = String(g.audio.volume * 100);
    this.$('volumeValue').textContent = `${Math.round(g.audio.volume * 100)}%`;
    this.$('ambience').checked = g.audio.ambience;
    this.$('dialogue').checked = g.dialogue.enabled;
    this.$('volume').addEventListener('input', e => {
      g.audio.ensure(); g.audio.setVolume(Number(e.target.value) / 100);
      this.$('volumeValue').textContent = `${e.target.value}%`;
    });
    this.$('ambience').addEventListener('change', () => g.audio.toggleAmbience());
    this.$('dialogue').addEventListener('change', () => g.dialogue.toggle());
    this.$('journalBtn').addEventListener('click', () => {
      const narrow = window.innerWidth <= 900;
      document.body.classList.toggle(narrow ? 'journal-open' : 'journal-closed');
      this.refresh();
    });
    this.$('retryBtn').addEventListener('click', () => { this.hide('result'); g.retry(); });
    this.$('toBoardBtn').addEventListener('click', () => { this.hide('result'); this.showBoard(); });
    this.$('nextBtn').addEventListener('click', () => {
      this.hide('result');
      const next = g.contractIndex === null || g.contractIndex === undefined ? null : g.contractIndex + 1;
      if (next === null || next >= CONTRACTS.length) g.startFreePlay(g.charId); else this.showCrewPicker(next);
    });
    this.$('contractList').addEventListener('click', e => {
      const buy = e.target.closest('button[data-buy]');
      if (buy) { if (g.buy(buy.dataset.buy)) this.showBoard(); return; }
      const b = e.target.closest('button[data-play]');
      if (!b) return;
      const v = b.dataset.play;
      if (v === 'resume') { this.hide('board'); g.setSpeed(g.lastSpeed || 1); }
      else if (v === 'free') this.showCrewPicker('free');
      else this.showCrewPicker(Number(v));
    });
    this.$('crewBody').addEventListener('click', e => {
      const card = e.target.closest('.recruit');
      if (!card || card.classList.contains('locked')) return;
      this.pick.chosen = card.dataset.recruit;
      g.sfx('click');
      this.updateCrewPicker();
    });
    this.$('crewGo').addEventListener('click', () => {
      this.hide('crew');
      if (this.pick.index === 'free') g.startFreePlay(this.pick.chosen);
      else g.startContract(this.pick.index, this.pick.chosen);
    });
    this.$('crewBack').addEventListener('click', () => { this.hide('crew'); this.showBoard(); });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closePie();
      if (e.target.matches('input, textarea, select, summary') || e.target.isContentEditable || document.querySelector('.modal:not(.hidden)')) return;
      if (!g.started) return;
      if (e.key === ' ') { e.preventDefault(); g.setSpeed(g.speed === 0 ? (g.lastSpeed || 1) : 0); }
      if (['1', '2', '3'].includes(e.key)) g.setSpeed(Number(e.key));
      if (e.key === 'r' || e.key === 'R') { g.view.roofOn = !g.view.roofOn; this.refresh(); }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (g.player && !g.player.status.away) this.select(g.player, true);
      }
    });
    window.addEventListener('pointerdown', e => { if (!this.pie.contains(e.target) && e.target.id !== 'view') this.closePie(); });

    const simById = id => g.sims.find(s => s.id === Number(id));
    this.$('portraits').addEventListener('click', e => {
      const el = e.target.closest('[data-id]');
      const s = el && simById(el.dataset.id);
      if (s && s.alive && !s.status.away) g.view.cam.target.set(s.x, 0, s.z);
    });
    this.$('trapBar').addEventListener('click', e => {
      const b = e.target.closest('button[data-trap]');
      if (b) this.armTrap(g.armedTrap === b.dataset.trap ? null : b.dataset.trap);
    });
    window.addEventListener('keydown', e => { if (e.key === 'Escape') this.armTrap(null); });
    this.$('view').addEventListener('contextmenu', () => this.armTrap(null));
    this.$('queue').addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (b && g.selected) { g.selected.cancel(Number(b.dataset.i), g); this.refresh(); }
    });
  }

  // Only touch the DOM when the markup actually changed, so hovers and clicks survive refreshes.
  setHTML(el, html) {
    if (el._html !== html) { el._html = html; el.innerHTML = html; }
  }

  // You only ever control your own character.
  select(sim, center) {
    const g = this.game;
    if (sim !== g.player) return;
    g.selected = sim;
    if (center && sim) g.view.cam.target.set(sim.x, 0, sim.z);
    this.refresh();
  }

  // ---------- pie menu ----------

  // ---------- trap palette ----------

  armTrap(id) {
    const g = this.game;
    g.armedTrap = id;
    const hint = this.$('trapHint');
    if (id) {
      const t = TRAPS.find(tt => tt.id === id);
      const objectTarget = { fireworks: 'the fireplace or grill', gas: 'the stove or grill', wiring: 'the TV or bathtub', spoil: 'the fridge', chili: 'the fridge', letterbomb: 'the mailbox', bookshelf: 'the bookshelf',
        candles: 'the bathroom candles', hairspray: 'the vanity mirror', flour: 'the stove', torch: 'the garden shed', brakes: 'the mailbox, by the road' };
      const where = { indoor: 'an indoor floor tile', outdoor: 'a patch of lawn', pool: 'the pool', tomb: 'a gravestone', object: objectTarget[t.id],
        floor: 'any floor tile or patch of lawn' }[t.target];
      const who = g.player ? g.player.first : 'You';
      hint.textContent = `${t.icon} ${t.name} ($${toolPrice(g, t.id)}): click ${where} and ${who} will go and do it. Right-click or Esc to cancel.`;
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
    this.closePie();
    this.renderTrapBar();
  }

  renderTrapBar() {
    const g = this.game, p = g.player;
    if (!g.started || !p) { this.setHTML(this.$('trapBar'), ''); return; }
    this.setHTML(this.$('trapBar'), '<span class="barLabel">Toolkit</span>' + TRAPS.map(t => {
      if (!g.owns(t.id)) {
        return `<button class="locked" disabled title="${esc(t.name)} — 🔒 buy it on the black market"><span class="ti">${t.icon}</span><span class="tc">🔒</span></button>`;
      }
      const price = toolPrice(g, t.id), lock = toolLock(p, t.id);
      const broke = g.cash < price;
      return `<button data-trap="${t.id}" class="${g.armedTrap === t.id ? 'armed' : ''} ${broke || lock ? 'broke' : ''}" title="${esc(t.name)} — ${esc(t.desc)}${lock ? ` (${esc(lock)})` : ''}">
        <span class="ti">${t.icon}</span><span class="tc">${lock ? '🔒' + esc(lock.split(' ')[1] + lock.split(' ')[3]) : price ? '$' + price : 'free'}</span></button>`;
    }).join(''));
  }

  onWorldClick(pick, x, y) {
    const g = this.game;
    if (!this.pie.classList.contains('hidden')) { this.closePie(); return; }
    if (!pick || !g.started) return;
    const me = g.player;
    if (me && me.status.away) { this.toast(`💼 ${me.first} is at work until ${String((g.job.def.start + g.job.def.hours) % 24).padStart(2, '0')}:00.`); return; }
    if (g.armedTrap) {
      if (g.placeTrap(g.armedTrap, pick)) this.armTrap(null);
      else this.toast("That can't go there");
      this.refresh();
      return;
    }
    if (pick.kind === 'sim' && pick.sim === me) return;
    const items = menuFor(pick, me, g);
    // Plain floor: just walk there. If there's something to do on it (your own trap), ask.
    if (pick.kind === 'floor' && items.length <= 1) { items.forEach(i => i.run()); this.refresh(); return; }
    let title = pick.kind === 'object' ? pick.obj.name : pick.kind === 'sim' ? pick.sim.name : pick.kind === 'tomb' ? `R.I.P. ${pick.tomb.name} — "${pick.tomb.epitaph || 'Gone.'}"`
      : pick.kind === 'door' ? pick.door.name : pick.kind === 'visitor' ? `${g.visit.type.icon} ${g.visit.type.name} at the door`
      : pick.kind === 'responder' ? `${pick.person.kind === 'detective' ? '🕵️' : '🧯'} ${pick.person.title}`
      : pick.kind === 'car' ? '🚗 A car passing the house' : pick.kind === 'mess' ? '🗑️ A disgusting mess'
      : pick.kind === 'house' ? this.houseTitle(pick.side) : 'Swimming Pool';
    if (pick.kind === 'floor') title = 'Here';
    if (!items.length) items.push({ label: me ? `${me.first} can't do anything here` : 'Start a game first', icon: '🤷', run: () => {} });
    this.showPie(items, x, y, title);
  }

  // "⏩ Adam is at work until 17:00", shown while the clock races.
  renderSkipBanner() {
    const g = this.game, el = this.$('skipBanner'), why = g.skipReason(), p = g.player;
    // Once the stretch you chose to watch is over, time-lapse comes back on its own.
    const busy = p && p.alive && (p.status.away || (p.action && p.action.stage === 'do' && ['workhome', 'sleep', 'nap'].includes(p.action.def.id)));
    if (this.watching && !busy) { this.watching = false; g.skipHoldUntil = 0; }
    if (!why) { el.classList.add('hidden'); return; }
    const until = h => `${String(Math.floor(h) % 24).padStart(2, '0')}:00`;
    const j = g.job;
    const text = why === 'work' ? `⏩ ${p.first} is at ${j.def.place} until ${until(j.def.start + j.def.hours)}`
      : why === 'homework' ? `⏩ ${p.first} is working at the computer` : `⏩ ${p.first} is asleep`;
    this.setHTML(el, `${esc(text)} <small>· time-lapse · click to watch at normal speed</small>`);
    el.classList.remove('hidden');
  }

  houseTitle(side) {
    const n = this.game.neighbours[side];
    if (n.state !== 'home') return '🏚️ Next door: FOR SALE';
    return `🏠 The ${n.family.name}s (${n.family.trait}) · patience ${Math.max(0, Math.round(n.patience))}%${n.banned ? ' · never visiting again' : ''}`;
  }

  showPie(items, x, y, title) {
    const p = this.pie;
    p.innerHTML = `<div class="pieTitle">${esc(title)}</div>`;
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'pieItem' + (it.evil ? ' evil' : '') + (it.sabotage ? ' god' : '') + (it.warn ? ' warn' : '');
      b.innerHTML = `<span>${it.icon}</span> ${esc(it.label)}${it.note ? `<small>${esc(it.note)}</small>` : ''}`;
      b.disabled = !!it.disabled;
      if (it.disabled) b.title = it.note || '';
      b.addEventListener('click', e => { e.stopPropagation(); if (it.disabled) return; this.game.sfx('click'); it.run(); this.closePie(); this.refresh(); });
      p.appendChild(b);
    });
    p.classList.remove('hidden');
    const rect = p.getBoundingClientRect();
    const top = this.$('topbar').getBoundingClientRect().bottom + 8;
    p.style.left = `${Math.max(12, Math.min(window.innerWidth - rect.width - 12, x - rect.width / 2))}px`;
    p.style.top = `${Math.max(top, Math.min(window.innerHeight - rect.height - 90, y - 30))}px`;
    this.game.sfx('pop');
  }

  closePie() { this.pie.classList.add('hidden'); }

  // ---------- log / toast ----------

  log(msg, cls = '') {
    const el = this.$('log');
    const line = document.createElement('div');
    line.className = 'logLine ' + cls;
    const h = Math.floor((this.game.clock / 60) % 24), m = Math.floor(this.game.clock % 60);
    line.innerHTML = `<span class="ts">${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}</span> ${esc(msg)}`;
    el.prepend(line);
    while (el.children.length > 80) el.lastChild.remove();
  }

  toast(msg) {
    const t = this.$('toast');
    t.textContent = msg;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  // ---------- panels ----------

  update(dt) {
    this.acc += dt;
    if (this.acc < 0.2) return;
    this.acc = 0;
    this.refresh();
  }

  refresh() {
    const g = this.game;
    const day = Math.floor(g.clock / 1440) + 1, h = Math.floor((g.clock / 60) % 24), m = Math.floor(g.clock % 60);
    this.$('clock').textContent = `Day ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    this.$('score').textContent = `☠ ${g.score}`;
    this.$('cash').textContent = g.player ? `💵 $${Math.floor(g.cash)}` : '';
    this.$('cash').classList.toggle('broke', g.player && g.cash < 0);
    this.$('money').textContent = `💰 ${g.profile.money}`;
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', Number(b.dataset.speed) === g.speed));
    this.$('freeWillBtn').textContent = `Free will: ${g.freeWill ? 'ON' : 'OFF'}`;
    this.$('skipBtn').classList.toggle('active', g.autoSkip);
    this.$('skipBtn').title = g.autoSkip ? 'Time-lapse is ON while you work or sleep (click to turn off)' : 'Time-lapse is OFF (click to fast-forward work and sleep)';
    this.renderSkipBanner();
    this.$('freeWillBtn').classList.toggle('active', g.freeWill);
    this.$('wallsBtn').textContent = g.view.wallsUp ? 'Walls: Up' : 'Walls: Cut';
    this.$('roofBtn').classList.toggle('active', g.view.roofOn);
    this.$('muteBtn').textContent = g.audio.muted ? '🔇' : '🔊';
    this.$('muteBtn').setAttribute('aria-label', g.audio.muted ? 'Unmute sound' : 'Mute sound');
    this.$('muteBtn').setAttribute('aria-pressed', String(g.audio.muted));
    this.$('journalBtn').setAttribute('aria-expanded', String(window.innerWidth <= 900 ? document.body.classList.contains('journal-open') : !document.body.classList.contains('journal-closed')));
    document.body.classList.toggle('playing', g.started);
    this.renderPortraits();
    this.renderSimPanel();
    this.renderQueue();
    this.renderDeaths();
    this.renderContract();
    this.renderTrapBar();
  }

  show(id) { this.$(id).classList.remove('hidden'); }
  hide(id) { this.$(id).classList.add('hidden'); }

  clearLog() { this.$('log').innerHTML = ''; }

  // ---------- contracts ----------

  showBoard() {
    const g = this.game, p = g.profile;
    const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
    const resume = g.started && !g.over
      ? `<div class="resumeRow"><button data-play="resume">▶ Resume current game</button></div>` : '';
    const cards = CONTRACTS.map((c, i) => {
      const open = isUnlocked(i, p);
      const got = p.stars[c.id] || 0;
      const missing = (c.requires || []).filter(r => !p.owned.includes(r));
      const req = missing.length ? `<div class="req">Requires from the black market: ${missing.map(r => SHOP.find(s => s.id === r).icon + ' ' + esc(SHOP.find(s => s.id === r).name)).join(', ')}</div>` : '';
      return `<div class="card ${open ? '' : 'locked'} ${got ? 'done' : ''}">
        <div class="cardHead"><b>${i + 1}. ${esc(c.title)}</b><span class="stars">${stars(got)}</span></div>
        <div class="client">Client: ${esc(c.client)}</div>
        <div class="brief">${open ? esc(c.brief) : 'Complete the previous contract to unlock.'}</div>${open ? req : ''}
        <div class="cardFoot"><span>⏳ ${c.days}d · 💵 $${c.cash} · 💰 ${c.pay}</span>
          ${open ? `<button data-play="${i}">${got ? 'Replay' : 'Take the job'}</button>` : '<span>🔒</span>'}</div>
      </div>`;
    }).join('');
    const free = `<div class="card free"><div class="cardHead"><b>∞ Free Play</b></div>
      <div class="brief">Endless random households, every tool unlocked, no suspicion. You still need a job. Pays 💰10 per kill.</div>
      <div class="cardFoot"><span></span><button data-play="free">Play</button></div></div>`;
    const market = SHOP.map(item => {
      const owned = p.owned.includes(item.id);
      const afford = p.money >= item.price;
      return `<div class="shopItem ${owned ? 'owned' : ''}" title="${esc(item.desc)}">
        <span class="si">${item.icon}</span><div class="sn"><b>${esc(item.name)}</b><small>${esc(item.desc)}</small></div>
        ${owned ? '<span class="got">Owned</span>' : `<button data-buy="${item.id}" ${afford ? '' : 'disabled'}>💰 ${item.price}</button>`}</div>`;
    }).join('');
    this.$('contractList').innerHTML = resume + `<h2 class="sectionLabel">Choose your arrangement <span>11 ways to be a terrible roommate</span></h2><div class="cards">${cards}${free}</div>
      <h2 class="marketTitle">🕶️ Black Market <span class="wallet">💰 ${p.money} blood money</span></h2>
      <div class="market">${market}</div>`;
    this.$('howTo').open = false;
    this.show('board');
  }

  // Before a contract (or free play): show the targets' intel and let the player pick who they'll be.
  showCrewPicker(index) {
    const g = this.game, c = index === 'free' ? null : CONTRACTS[index];
    const owned = r => !r.locked || g.profile.owned.includes('recruit:' + r.id);
    const last = ROSTER.find(r => r.id === g.profile.character && owned(r));
    this.pick = { index, chosen: last ? last.id : null };
    const chips = (traits, persona) => `<span class="trait persona">${PERSONALITIES[persona].icon} ${esc(PERSONALITIES[persona].name)}</span>` +
      traits.map(t => `<span class="trait" title="${esc(TRAITS[t].desc)}">${TRAITS[t].icon} ${esc(TRAITS[t].name)}</span>`).join('');
    const intel = c ? c.targets.map((t, i) => {
      const obj = c.objectives.find(o => o.who === i);
      return `<div class="intel"><b>🎯 ${esc(t.name)}</b>${obj && obj.cause ? ` <span class="must">✨ ideally: ${esc(CAUSE_VERB[obj.cause])}</span>` : ''}<div class="traits">${chips(t.traits, t.personality)}</div></div>`;
    }).join('') : '<div class="intel"><b>🎯 A random household of wicked roommates</b></div>';
    const roster = ROSTER.map(r => {
      const job = JOBS[r.id];
      const skills = SKILLS.filter(([k]) => (r.skills || {})[k]).map(([k, icon]) => `${icon}${r.skills[k]}`).join(' ');
      return `<div class="recruit ${owned(r) ? '' : 'locked'}" data-recruit="${r.id}">
        <div class="rHead"><b>${esc(r.name)}</b>${owned(r) ? '<span class="tick">✔</span>' : '<span>🔒 black market</span>'}</div>
        <div class="traits">${chips(r.traits, r.personality)}${r.immortal ? '<span class="trait immortal">♾️ Immortal</span>' : ''}</div>
        <div class="jobLine">💼 ${esc(job.titles[0])} · ${job.home ? 'from home' : esc(job.place)} · ${String(job.start).padStart(2, '0')}:00, ${job.hours}h · 💵 $${job.pay[0]}/shift · ${skills}</div>
        <small>${esc(r.pitch)}</small></div>`;
    }).join('');
    this.$('crewBody').innerHTML = `
      <h1>${c ? `📋 ${esc(c.title)}` : '∞ Free Play'}</h1><p class="sub">${c ? esc(c.brief) : 'Move into a house full of terrible people. Kill them all before they get you.'}</p>
      <div class="intelRow">${intel}</div>
      <h2 class="marketTitle">Who are you? <span class="wallet" id="crewCount"></span></h2>
      <p class="sub">You play one roommate. You have a job, rent to pay and skills to learn, and everyone else in the house is out to get you too.${c ? ` You start with 💵 $${c.cash}.` : ''}</p>
      <div class="rosterGrid">${roster}</div>`;
    this.updateCrewPicker();
    this.hide('board');
    this.show('crew');
  }

  updateCrewPicker() {
    document.querySelectorAll('#crewBody .recruit').forEach(el => el.classList.toggle('chosen', this.pick.chosen === el.dataset.recruit));
    const who = ROSTER.find(r => r.id === this.pick.chosen);
    this.$('crewCount').textContent = who ? `You are ${who.name}` : 'Pick one';
    this.$('crewGo').disabled = !who;
  }

  renderContract() {
    const g = this.game, el = this.$('contractHud');
    const c = g.contract;
    const work = this.careerHtml();
    if (!c) { this.setHTML(el, g.started ? `<div class="hudTitle">∞ Free Play</div>${work}` : ''); return; }
    // Each target: alive, dead the client's way (✨), or dead some other way (still counts).
    const objs = c.objectives.map(o => {
      if (o.type === 'die') {
        const sim = g.sims[o.who], wish = wishState(o, g);
        if (sim.alive) return `<li class="pending">🎯 ${esc(sim.first)} <small>✨ ideally: ${esc(CAUSE_VERB[o.cause])}</small></li>`;
        return `<li class="done">✅ ${esc(sim.first)} ${esc(causeDone(sim))}${wish ? ' ✨' : ''}</li>`;
      }
      const targets = g.sims.filter(s => s.role === 'target');
      if (o.type === 'allDie') return `<li class="${targets.every(s => !s.alive) ? 'done' : 'pending'}">🎯 Every target must die (${targets.filter(s => !s.alive).length}/${targets.length})</li>`;
      const w = wishState(o, g);
      const n = new Set(targets.filter(s => !s.alive).map(s => s.cause)).size;
      return `<li class="${w === true ? 'done' : w === false ? 'missed' : 'pending'}">✨ Ideally ${o.n} different ways to die (${n}/${o.n})</li>`;
    }).join('') + `<li>🛡️ ${g.player ? esc(g.player.first) : 'You'} must survive, pay the rent and not get caught</li>`;
    const bonus = c.bonus.map(b => `<li class="bonus ${bonusMet(b, g) ? '' : 'missed'}">★ ${esc(describeBonus(b))}</li>`).join('')
      + `<li class="bonus extra">💯 ${g.score - g.scoreAtStart} points so far · extra for a clean job and never being seen</li>`;
    const left = Math.max(0, c.days * 1440 - g.clock);
    const hrs = Math.floor(left / 60);
    const sus = Math.round(g.suspicion);
    const susCls = sus >= 75 ? 'hot' : sus >= 50 ? 'warm' : '';
    this.setHTML(el, `
      <div class="hudTitle">📋 ${esc(c.title)}</div>
      <div class="deadline ${hrs < 6 ? 'urgent' : ''}">⏳ ${hrs}h ${Math.floor(left % 60)}m left (end of Day ${c.days})</div>
      <ul class="objs">${objs}${bonus}</ul>
      <div class="susRow"><span>🕵️ Suspicion</span><div class="susTrack"><div class="susFill ${susCls}" style="width:${sus}%"></div><i style="left:50%"></i></div><em>${sus}</em></div>${work}`);
  }

  // Job, pay, performance and what's due: the money side of the murder business.
  careerHtml() {
    const g = this.game, j = g.job, p = g.player;
    if (!j || !j.def || !p) return '';
    const state = j.fired ? '📉 Fired: look for a job at the computer'
      : j.state === 'away' ? `🚌 At ${esc(j.def.place)} (alibi) until ${String((j.def.start + j.def.hours) % 24).padStart(2, '0')}:00`
      : j.state === 'going' ? '💼 Catch the bus at the front gate!'
      : `Next shift ${shiftTime(j)}${j.def.home ? ' (at the computer)' : ''}`;
    const perf = Math.max(0, Math.round(j.perf));
    return `<div class="career">
      <div class="jobRow"><b>💼 ${esc(jobTitle(j))}</b><span>$${shiftPay(j)}/shift</span></div>
      <div class="perfRow"><span>Performance</span><div class="susTrack"><div class="susFill perf" style="width:${perf}%"></div></div><em>${perf}</em></div>
      <div class="jobState ${j.state === 'going' ? 'urgent' : ''}">${state}${j.missed ? ` · missed ${j.missed}/3` : ''}</div>
      <div class="rentRow ${g.cash < RENT ? 'urgent' : ''}">🧾 Rent $${RENT} at midnight${g.cash < 0 ? ` · $${Math.ceil(-g.cash)} in debt!` : ''}</div>
    </div>`;
  }

  showResult() {
    const g = this.game, r = g.result;
    if (!r) return;
    this.$('resultTitle').textContent = r.won ? `✅ ${g.contract.title}: Complete` : `❌ ${g.contract.title}: Failed`;
    let body;
    if (r.won) {
      const s = r.stars;
      body = `<div class="bigStars">${'★'.repeat(s.count)}${'☆'.repeat(3 - s.count)}</div>
        <ul class="objs"><li class="done">★ Every target dead, and you got away with it</li>${s.bonuses.map(b => `<li class="${b.met ? 'done' : 'missed'}">${b.met ? '★' : '☆'} ${esc(b.text)}</li>`).join('')}</ul>
        <ul class="objs extras">${r.extras.map(([label, pts]) => `<li class="done">${esc(label)} <b>+${pts}</b></li>`).join('')}</ul>
        <p class="payout">💯 ${g.score - g.scoreAtStart} points <small>(total: ${g.score})</small></p>
        <p class="payout">💰 +${r.reward} blood money <small>(wallet: ${g.profile.money})</small></p>`;
    } else {
      body = `<p class="failReason">${esc(r.reason)}</p><p class="hintLine">💡 ${esc(g.contract.hint)}</p>`;
    }
    body = this.newspaper(g.deaths) + body;
    this.$('resultBody').innerHTML = body;
    const hasNext = r.won;
    this.$('nextBtn').style.display = hasNext ? '' : 'none';
    this.$('nextBtn').textContent = g.contractIndex + 1 < CONTRACTS.length ? 'Next contract →' : 'Free play →';
    this.$('retryBtn').style.display = '';
    this.show('result');
  }

  // The local paper's take on the household's demise.
  newspaper(deaths) {
    if (!deaths.length) return '';
    const lead = deaths.find(d => d.role === 'target') || deaths[0];
    const rest = deaths.filter(d => d !== lead);
    return `<div class="paper"><div class="masthead">THE DAILY GRAVE</div>
      <div class="headline">${esc(lead.headline)}</div>
      <div class="story">${CAUSES[lead.cause].icon} ${esc(lead.name)} ${esc(lead.line)}</div>
      ${rest.map(d => `<div class="brief2"><b>ALSO:</b> ${esc(d.headline)} <i>(${esc(d.name)})</i></div>`).join('')}</div>`;
  }

  showFreeRecap() {
    const g = this.game;
    const dead = g.player && !g.player.alive;
    this.$('resultTitle').textContent = g.arrested ? `🚔 ${g.player.first} was arrested` : dead ? `💀 They got ${g.player.first} first` : 'Household eliminated';
    this.$('resultBody').innerHTML = `${this.newspaper(g.deaths)}
      <p>${dead || g.arrested ? '' : `Speed bonus: +${g.lastBonus} · `}Total score: <b>${g.score}</b></p>`;
    this.$('nextBtn').style.display = '';
    this.$('nextBtn').textContent = 'Next household →';
    this.$('retryBtn').style.display = 'none';
    this.show('result');
  }

  renderPortraits() {
    const g = this.game;
    this.setHTML(this.$('portraits'), g.sims.map(s => {
      const hue = Math.round(s.mood() * 1.2);
      const cls = 'portrait' + (s === g.player ? ' sel' : '') + (s.alive ? '' : ' dead') + (s.status.away ? ' away' : '');
      const title = !s.alive ? `${s.name} (${s.cause})` : s === g.player ? `${s.name} (you)` : `${s.name} — click to look at them`;
      const badge = `<u>${s === g.player ? '★' : '🎯'}</u>`;
      const inner = (s.alive ? `<b>${esc(s.first[0])}</b><i style="width:${Math.round(Math.max(0, s.health))}%"></i>` : '<b>💀</b>') + badge;
      return `<div class="${cls}" data-id="${s.id}" title="${esc(title)}" style="background:${hex(s.color)};border-color:${s.alive ? `hsl(${hue},80%,50%)` : '#444'}">${inner}</div>`;
    }).join(''));
  }

  renderSimPanel() {
    const s = this.game.player, el = this.$('simPanel');
    if (!s || !s.alive) { this.setHTML(el, s ? '<div class="empty">💀 You are dead.</div>' : ''); return; }
    const bar = (label, icon, v, cls) => `<div class="bar"><span class="bl">${icon} ${label}</span><div class="track"><div class="fill ${cls}" style="width:${Math.round(Math.max(0, Math.min(100, v)))}%"></div></div></div>`;
    const st = s.status;
    const flags = [];
    if (st.onFire > 0) flags.push('🔥 ON FIRE');
    if (st.poisoned > 0) flags.push('🤢 Poisoned');
    if (st.panic > 0) flags.push('😱 Panicking');
    if (st.stuck) flags.push('🪜 Stuck in pool!');
    else if (st.swimming) flags.push('🏊 Swimming');
    if (st.passedOut > 0) flags.push('💤 Passed out');
    if (s.needs.hunger <= 0) flags.push('💀 Starving');
    if (st.trapped > 0) flags.push('🪤 Caught in a bear trap');
    if (st.gassy > 0) flags.push('💨 Dangerously gassy');
    if (s.needs.hygiene < 15) flags.push(st.feral > 0 ? '🦨 Gone feral (stinks on purpose)' : '🦨 Stinks');
    if (s.needs.energy < 10) flags.push('😵 Sleep-deprived');
    if (st.hairspray > 0) flags.push(st.extraHold ? '💇 Extra-hold hair (highly flammable)' : '💇 Hairsprayed (flammable)');
    if (s.confused) flags.push('🌀 Confused');
    if (s.lovebomb) flags.push('💝 Being love-bombed');
    const rels = this.game.sims.filter(o => o !== s && o.alive).map(o => {
      const r = s.relWith(o);
      const w = Math.round(Math.abs(r) / 2);
      return `<div class="rel"><span>${esc(o.first)}</span><div class="rtrack"><div class="rfill ${r < 0 ? 'neg' : 'pos'}" style="width:${w}%;${r < 0 ? 'right:50%' : 'left:50%'}"></div></div><em>${Math.round(r)}</em></div>`;
    }).join('');
    this.setHTML(el, `
      <div class="spHead"><span class="dot" style="background:${hex(s.color)}"></span><b>${esc(s.name)}</b></div>
      <div class="traits"><span class="trait persona" title="${esc(PERSONALITIES[s.personality].desc)}">${PERSONALITIES[s.personality].icon} ${esc(PERSONALITIES[s.personality].name)}</span>${s.immortal ? '<span class="trait immortal" title="Cannot die. Death just bounces off.">♾️ Immortal</span>' : ''}${s.traits.map(t => `<span class="trait" title="${esc(TRAITS[t].desc)}">${TRAITS[t].icon} ${esc(TRAITS[t].name)}</span>`).join('')}</div>
      <div class="flags">${flags.join(' · ') || '&nbsp;'}</div>
      <div class="cols">
        <div class="col">
          ${bar('Health', '❤️', s.health, 'health')}
          ${NEEDS.map(([k, i, l]) => bar(l, i, s.needs[k], s.needs[k] < 25 ? 'low' : 'ok')).join('')}
          ${bar('Sanity', '🧠', s.sanity, s.confused ? 'low' : 'sanity')}
          ${bar('Evil', '😈', s.evil, 'evil')}
        </div>
        <div class="col">
          <div class="skills">${SKILLS.map(([k, icon, name]) => `<span title="${name}">${icon} ${name} ${Math.floor(s.skills[k] || 0)}</span>`).join('')}</div>
          <div class="relTitle">Relationships</div>${rels || '<div class="empty">Nobody left to hate.</div>'}
        </div>
      </div>`);
  }

  renderQueue() {
    const s = this.game.player;
    if (!s || !s.alive || s.status.away) { this.setHTML(this.$('queue'), ''); return; }
    const all = (s.action ? [s.action] : []).concat(s.queue);
    this.setHTML(this.$('queue'), all.map((a, i) => {
      const cls = 'qItem' + (i === 0 && s.action ? ' current' : '') + (a.source === 'auto' ? ' auto' : '');
      const label = typeof a.def.label === 'function' ? a.def.label(s, a.target) : a.def.label;
      const prog = i === 0 && s.action && a.stage === 'do' ? Math.round(Math.min(100, (a.t / a.duration) * 100)) : 0;
      return `<div class="${cls}"><span class="qi">${a.def.icon}</span><span class="ql">${esc(label)}</span><i style="width:${prog}%"></i><button data-i="${i}" title="Cancel">✕</button></div>`;
    }).join(''));
  }

  renderDeaths() {
    const g = this.game;
    this.setHTML(this.$('deaths'), Object.entries(CAUSES).map(([c, info]) => {
      const now = g.causes.has(c), ever = g.careerCauses.has(c);
      return `<span class="cause ${now ? 'now' : ever ? 'ever' : ''}" title="${c}${now ? ' — done this household' : ever ? ' — discovered' : ' — undiscovered'}">${info.icon}</span>`;
    }).join(''));
  }
}

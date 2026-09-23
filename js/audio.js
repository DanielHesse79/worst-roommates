// Procedural sound effects with Web Audio: no audio files needed.

const MUTE_KEY = 'worst-roommates-muted';
const VOLUME_KEY = 'worst-roommates-volume';
const AMBIENT_KEY = 'worst-roommates-ambience';
const MIN_GAP = { blah: 1.1, punch: 0.22, click: 0.06, fire: 0.6, splash: 0.4, fart: 1, death: 0.3, explosion: 0.3, knock: 1.2, siren: 2.4, police: 2.0 };

export class Sfx {
  constructor() {
    this.ctx = null;
    this.last = {};
    this.volume = 0.55;
    this.ambience = true;
    this.ambientTime = 4;
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { this.muted = false; }
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      if (saved !== null && Number.isFinite(Number(saved))) this.volume = Math.max(0, Math.min(1, Number(saved)));
      this.ambience = localStorage.getItem(AMBIENT_KEY) !== '0';
    } catch { /* defaults work without storage */ }
    // Browsers only allow audio after a user gesture.
    const unlock = () => { this.ensure(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.createGraph(new AC());
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // Also accepts OfflineAudioContext for silent signal and clipping checks.
  createGraph(context) {
      this.ctx = context;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      // Tame stacked impacts and high-frequency buzz before the user's volume control.
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -20;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.18;
      this.compressor.connect(this.master);
      this.bus = this.ctx.createBiquadFilter();
      this.bus.type = 'lowpass'; this.bus.frequency.value = 5800;
      this.bus.connect(this.compressor);
      this.echo = this.ctx.createDelay(0.5); this.echo.delayTime.value = 0.09;
      const wet = this.ctx.createGain(); wet.gain.value = 0.09;
      this.echo.connect(wet); wet.connect(this.bus);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* per-session only */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    try { localStorage.setItem(VOLUME_KEY, String(this.volume)); } catch { /* session preference */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  toggleAmbience() {
    this.ambience = !this.ambience;
    try { localStorage.setItem(AMBIENT_KEY, this.ambience ? '1' : '0'); } catch { /* session preference */ }
    return this.ambience;
  }

  update(dt, running, night, burning) {
    if (!running || !this.ambience || this.muted || !this.ctx || this.ctx.state !== 'running') return;
    this.ambientTime -= dt;
    if (this.ambientTime > 0) return;
    this.ambientTime = burning ? 2.5 : 7 + Math.random() * 5;
    const t = this.ctx.currentTime;
    if (burning) {
      this.noise(t, 0.5, 0.035, 'bandpass', 600, 1800, 0.6);
      this.noise(t + 0.15, 0.025, 0.06, 'highpass', 1700);
    } else if (night) {
      for (let i = 0; i < 3; i++) this.tone('sine', 3100, 2950, t + i * 0.18, 0.07, 0.015);
    } else {
      for (let i = 0; i < 2; i++) this.tone('sine', 1500 + i * 300, 2600, t + i * 0.18, 0.11, 0.022);
    }
  }

  voice(id = 0, mood = 'chat', length = 28) {
    if (this.muted || document.hidden || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (t - (this.last.voice ?? -10) < 0.8) return;
    this.last.voice = t;
    this.syllables(id, mood, length, t);
  }

  syllables(id, mood, length, t) {
    const base = 115 + (id % 5) * 32;
    const n = Math.min(6, Math.max(3, Math.ceil(length / 12)));
    for (let i = 0; i < n; i++) {
      const start = t + i * 0.11;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      const pitch = base * (mood === 'alarm' ? 1.6 : 1) * [1, 1.22, 0.92, 1.12, 0.8, 1][i];
      o.frequency.setValueAtTime(pitch, start);
      o.frequency.exponentialRampToValueAtTime(pitch * 0.85, start + 0.085);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = [750, 1150, 900][i % 3]; f.Q.value = 1.6;
      o.connect(f);
      const e = this.env(f, start, 0.018, 0.09, 0.075, ((id % 3) - 1) * 0.25);
      o.onended = () => { o.disconnect(); f.disconnect(); e.cleanup(); };
      o.start(start); o.stop(start + 0.13);
    }
  }

  play(name) {
    if (this.muted || document.hidden || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (MIN_GAP[name] && now - (this.last[name] ?? -10) < MIN_GAP[name]) return;
    this.last[name] = now;
    const fn = SOUNDS[name];
    if (fn) fn(this, now);
  }

  // ---- building blocks ----

  env(node, t, attack, peak, decay, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g);
    const stereo = this.ctx.createStereoPanner(); stereo.pan.value = pan;
    g.connect(stereo); stereo.connect(this.bus); stereo.connect(this.echo);
    g.cleanup = () => { g.disconnect(); stereo.disconnect(); };
    return g;
  }

  tone(type, f0, f1, t, dur, vol = 0.3, attack = 0.01) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const e = this.env(o, t, attack, vol, dur);
    o.onended = () => { o.disconnect(); e.cleanup(); };
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  noise(t, dur, vol, filterType, f0, f1 = f0, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    src.connect(f);
    const e = this.env(f, t, 0.005, vol, dur);
    src.onended = () => { src.disconnect(); f.disconnect(); e.cleanup(); };
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  vibrato(osc, t, rate, depth, dur) {
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = rate;
    lg.gain.value = depth;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    lfo.onended = () => { lfo.disconnect(); lg.disconnect(); };
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
  }
}

export const SOUNDS = {
  click(a, t) { a.tone('sine', 740, 540, t, 0.035, 0.09); a.noise(t, 0.02, 0.035, 'highpass', 2200); },
  pop(a, t) { a.tone('sine', 500, 900, t, 0.08, 0.15); },
  power(a, t) {
    for (const f of [110, 131, 155]) a.tone('sawtooth', f, f * 0.98, t, 0.9, 0.05, 0.15);
    a.tone('sine', 1760, 880, t + 0.05, 0.5, 0.05);
  },
  explosion(a, t) {
    a.noise(t, 1.4, 0.9, 'lowpass', 2400, 90);
    a.tone('sine', 90, 35, t, 0.9, 0.7, 0.005);
  },
  fart(a, t) {
    const dur = 0.5 + Math.random() * 0.6;
    const o = a.tone('sawtooth', 85 + Math.random() * 30, 55, t, dur, 0.35, 0.02);
    a.vibrato(o, t, 22 + Math.random() * 10, 18, dur);
    a.noise(t, dur * 0.8, 0.12, 'lowpass', 300, 150);
  },
  splash(a, t) {
    a.noise(t, 0.45, 0.3, 'bandpass', 1800, 700, 0.8);
    for (let i = 0; i < 4; i++) a.tone('sine', 450 + i * 140, 180 + i * 70, t + 0.12 + i * 0.065, 0.08, 0.055);
  },
  zap(a, t) {
    const o = a.tone('square', 110, 90, t, 0.6, 0.18);
    a.vibrato(o, t, 55, 60, 0.6);
    a.noise(t, 0.55, 0.25, 'highpass', 3000);
  },
  snap(a, t) {
    a.noise(t, 0.06, 0.8, 'highpass', 1500);
    a.tone('triangle', 1400, 1200, t, 0.35, 0.2, 0.002);
  },
  crash(a, t) {
    a.noise(t, 0.9, 0.7, 'lowpass', 900, 150);
    for (let i = 0; i < 4; i++) a.tone('sine', 120 - i * 15, 60, t + i * 0.09, 0.2, 0.3, 0.003);
  },
  slip(a, t) {
    const o = a.tone('sine', 350, 1300, t, 0.22, 0.2);
    a.vibrato(o, t, 20, 55, 0.22);
    a.tone('sine', 90, 45, t + 0.3, 0.3, 0.5, 0.003);
    a.noise(t + 0.3, 0.12, 0.15, 'lowpass', 850, 200);
  },
  scream(a, t) {
    const o = a.tone('sawtooth', 650, 900, t, 0.7, 0.14, 0.03);
    a.vibrato(o, t, 9, 40, 0.7);
  },
  ghost(a, t) {
    const o = a.tone('sine', 300, 520, t, 1.6, 0.22, 0.3);
    a.vibrato(o, t, 5, 25, 1.6);
  },
  death(a, t) {
    [440, 415.3, 329.6, 220].forEach((f, i) => a.tone('triangle', f, f * 0.99, t + i * 0.2, 0.4, 0.11));
    a.tone('sine', 110, 55, t + 0.6, 0.9, 0.16, 0.1);
  },
  meteor(a, t) { a.tone('sine', 2200, 280, t, 1.5, 0.18, 0.05); },
  fire(a, t) { a.noise(t, 0.7, 0.35, 'bandpass', 400, 1600, 0.7); },
  knock(a, t) {
    for (let i = 0; i < 3; i++) { a.tone('sine', 180, 120, t + i * 0.18, 0.08, 0.35, 0.002); a.noise(t + i * 0.18, 0.05, 0.15, 'lowpass', 900); }
  },
  punch(a, t) {
    a.tone('sine', 140, 50, t, 0.12, 0.45, 0.002);
    a.noise(t, 0.08, 0.2, 'lowpass', 1200);
  },
  blah(a) { a.voice(2, 'chat', 18); },
  paper(a, t) { a.noise(t, 0.17, 0.14, 'highpass', 1800); a.tone('triangle', 760, 420, t + 0.12, 0.07, 0.1); },
  siren(a, t) {
    a.tone('triangle', 620, 1180, t, 1.1, 0.12, 0.08);
    a.tone('sawtooth', 620, 1180, t, 1.1, 0.025, 0.08);
    a.tone('triangle', 1180, 620, t + 1.2, 1.1, 0.12, 0.08);
  },
  police(a, t) {
    for (let i = 0; i < 4; i++) {
      a.tone('square', 960, 960, t + i * 0.5, 0.22, 0.04);
      a.tone('square', 740, 740, t + i * 0.5 + 0.25, 0.22, 0.04);
    }
  },
  alarm(a, t) { for (let i = 0; i < 3; i++) { a.tone('square', 880, 880, t + i * 0.25, 0.1, 0.08); a.tone('square', 660, 660, t + i * 0.25 + 0.12, 0.1, 0.08); } },
  win(a, t) { [523, 659, 784, 1046].forEach((f, i) => a.tone('triangle', f, f, t + i * 0.12, 0.35, 0.18)); },
  fail(a, t) { [392, 370, 349, 262].forEach((f, i) => { const o = a.tone('sawtooth', f, f * 0.97, t + i * 0.35, 0.4, 0.1); a.vibrato(o, t + i * 0.35, 6, i === 3 ? 12 : 0, 0.4); }); },
};

// Visual effects: particles, ghosts, player-only trap decals and piranha fins.
import * as THREE from 'three';
import { POOL } from './data.js';
import { mat } from './models.js';

const MAX_PARTICLES = 450;
const rand = (a, b) => a + Math.random() * (b - a);

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Particle recipes: count, colours, speed, gravity, lifetime, size growth.
const RECIPES = {
  explosion: [
    { n: 45, colors: [0xffd24a, 0xff8a1a, 0xff4a1a], speed: [2.5, 6], up: [1.5, 5], g: -6, life: [0.5, 1.1], size: [0.25, 0.5], grow: 0.4, additive: true },
    { n: 18, colors: [0x555555, 0x777777, 0x333333], speed: [0.3, 1.2], up: [0.8, 1.8], g: 0.3, life: [1.6, 2.8], size: [0.5, 0.9], grow: 1.2 },
  ],
  dust: [{ n: 16, colors: [0xc9b28a, 0xa8906a], speed: [0.6, 1.6], up: [0.2, 0.9], g: -0.5, life: [0.6, 1.1], size: [0.25, 0.45], grow: 0.8 }],
  sparks: [{ n: 22, colors: [0xfff27a, 0xffffff, 0x9ad8ff], speed: [1.5, 3.5], up: [1, 3], g: -8, life: [0.3, 0.7], size: [0.06, 0.12], grow: 0, additive: true }],
  splash: [{ n: 14, colors: [0xbfe8ff, 0xffffff], speed: [0.5, 1.4], up: [1.5, 2.8], g: -7, life: [0.5, 0.9], size: [0.1, 0.2], grow: 0 }],
  fright: [{ n: 8, colors: [0xc9b8ff, 0xffffff], speed: [0.2, 0.6], up: [0.8, 1.5], g: 0.2, life: [0.8, 1.4], size: [0.2, 0.35], grow: 0.6, additive: true }],
  smoke: [{ n: 1, colors: [0x3a3a3a, 0x555555], speed: [0.05, 0.25], up: [0.6, 1.1], g: 0.1, life: [1.8, 3], size: [0.35, 0.6], grow: 1.1 }],
  gas: [{ n: 16, colors: [0x9ad84a, 0xb8e05a, 0x7ab83a], speed: [0.3, 1.0], up: [0.1, 0.5], g: 0.05, life: [1.4, 2.4], size: [0.4, 0.7], grow: 1.3 }],
  bubbles: [{ n: 1, colors: [0x6aff6a, 0xaaff55], speed: [0.05, 0.2], up: [0.4, 0.8], g: 0, life: [0.8, 1.3], size: [0.06, 0.12], grow: 0.1 }],
};

export class Effects {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.tex = softDot();
    this.particles = [];
    this.ghostMeshes = new Map();
    this.trapMeshes = new Map();
    this.fins = null;
    this.smokeAcc = 0;
  }

  burst(x, z, kind, y = 0.6) {
    for (const r of RECIPES[kind] || []) {
      for (let i = 0; i < r.n; i++) {
        if (this.particles.length >= MAX_PARTICLES) this.kill(this.particles.shift());
        const m = new THREE.SpriteMaterial({
          map: this.tex, color: r.colors[Math.floor(Math.random() * r.colors.length)], transparent: true, depthWrite: false,
          blending: r.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        const s = new THREE.Sprite(m);
        const size = rand(...r.size);
        s.scale.setScalar(size);
        s.position.set(x + rand(-0.15, 0.15), y + rand(-0.1, 0.2), z + rand(-0.15, 0.15));
        const a = Math.random() * Math.PI * 2, sp = rand(...r.speed);
        this.scene.add(s);
        const life = rand(...r.life);
        this.particles.push({ s, vx: Math.cos(a) * sp, vy: rand(...r.up), vz: Math.sin(a) * sp, g: r.g, life, max: life, size, grow: r.grow });
      }
    }
  }

  kill(p) { this.scene.remove(p.s); p.s.material.dispose(); }

  update(dt, time) {
    this.particles = this.particles.filter(p => {
      p.life -= dt;
      if (p.life <= 0) { this.kill(p); return false; }
      p.vy += p.g * dt;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      if (p.s.position.y < 0.05) { p.s.position.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      const k = p.life / p.max;
      p.s.material.opacity = Math.min(1, k * 1.6);
      p.s.scale.setScalar(p.size * (1 + p.grow * (1 - k)));
      return true;
    });

    const g = this.game, w = g.world;
    // Ambient emitters: smoke over flames, bubbles over poisoned sims.
    this.smokeAcc += dt;
    if (this.smokeAcc > 0.12) {
      this.smokeAcc = 0;
      for (const f of w.fire.values()) if (Math.random() < 0.5) this.burst(f.x + 0.5, f.z + 0.5, 'smoke', 0.9);
      for (const s of g.sims) if (s.alive && s.status.poisoned > 0 && Math.random() < 0.4) this.burst(s.x, s.z, 'bubbles', 1.5);
    }

    this.syncGhosts(dt, time);
    this.syncTraps(time);
    this.syncFins(time);
    this.syncFireflies(time);
  }

  // Drifting fireflies over the lawn at night.
  syncFireflies(time) {
    const night = this.game.view ? this.game.view.night || 0 : 0;
    if (!this.flies) {
      this.flies = [];
      for (let i = 0; i < 26; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: 0xd8ff6a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.scale.setScalar(0.12);
        s.userData = { x: rand(-3, 25), z: rand(-3, 19), p: Math.random() * 10 };
        this.flies.push(s);
      }
    }
    for (const s of this.flies) {
      if (!s.parent) this.scene.add(s);
      const d = s.userData;
      s.position.set(d.x + Math.sin(time * 0.4 + d.p) * 1.2, 0.5 + Math.sin(time * 0.9 + d.p * 2) * 0.3, d.z + Math.cos(time * 0.35 + d.p) * 1.2);
      s.material.opacity = night * (0.4 + 0.6 * Math.max(0, Math.sin(time * 2 + d.p * 3)));
      s.visible = night > 0.05;
    }
  }

  syncGhosts(dt, time) {
    const live = new Set();
    for (const gh of this.game.ghosts) {
      live.add(gh);
      let m = this.ghostMeshes.get(gh);
      if (!m) { m = ghostMesh(); this.scene.add(m); this.ghostMeshes.set(gh, m); }
      const nx = gh.x, nz = gh.z;
      if (m.userData.px !== undefined) {
        const dx = nx - m.userData.px, dz = nz - m.userData.pz;
        if (Math.abs(dx) + Math.abs(dz) > 1e-4) m.rotation.y = Math.atan2(dx, dz);
      }
      m.userData.px = nx; m.userData.pz = nz;
      m.position.set(nx, 0.35 + Math.sin(time * 2 + nx) * 0.12, nz);
      m.userData.body.material.opacity = 0.45 + Math.sin(time * 5) * 0.1;
    }
    for (const [gh, m] of this.ghostMeshes) if (!live.has(gh)) { this.scene.remove(m); this.ghostMeshes.delete(gh); }
  }

  syncTraps(time) {
    const traps = this.game.world.traps;
    for (const [k, t] of traps) {
      if (this.trapMeshes.has(k)) continue;
      const m = t.type === 'wax' ? waxMesh() : bearTrapMesh();
      m.position.set(t.x + 0.5, 0, t.z + 0.5);
      this.scene.add(m);
      this.trapMeshes.set(k, m);
    }
    for (const [k, m] of this.trapMeshes) {
      if (!traps.has(k)) { this.scene.remove(m); this.trapMeshes.delete(k); continue; }
      if (m.userData.shine) m.userData.shine.material.opacity = 0.35 + 0.2 * Math.sin(time * 3 + m.position.x);
    }
  }

  syncFins(time) {
    const on = this.game.world.piranhas;
    if (on && !this.fins) {
      this.fins = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), mat(0x2a3a44));
        fin.scale.z = 0.3;
        fin.userData.phase = i * 1.3;
        this.fins.add(fin);
      }
      this.scene.add(this.fins);
    }
    if (!on && this.fins) { this.scene.remove(this.fins); this.fins = null; }
    if (!this.fins) return;
    const cx = (POOL.x0 + POOL.x1) / 2, cz = (POOL.z0 + POOL.z1) / 2;
    this.fins.children.forEach((f, i) => {
      const a = time * (0.6 + i * 0.13) + f.userData.phase;
      f.position.set(cx + Math.cos(a) * (1.1 + (i % 3) * 0.3), 0.1, cz + Math.sin(a * 1.3) * (1.8 + (i % 2) * 0.4));
      f.rotation.y = -a;
    });
  }

  clear() {
    for (const p of this.particles) this.kill(p);
    this.particles = [];
    this.flies = null;
    this.ghostMeshes.clear();
    this.trapMeshes.clear();
    this.fins = null;
  }
}

function ghostMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xdfe8ff, emissive: 0x7a8aff, emissiveIntensity: 0.6, transparent: true, opacity: 0.5, depthWrite: false });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), m);
  head.position.y = 1.2;
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.0, 16, 1, true), m);
  body.position.y = 0.7;
  body.rotation.x = Math.PI;
  g.add(head, body);
  for (const x of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0x111122 }));
    eye.position.set(x, 1.24, 0.24);
    g.add(eye);
  }
  const light = new THREE.PointLight(0x8a9aff, 1.5, 3, 1.5);
  light.position.y = 1;
  g.add(light);
  g.userData.body = head;
  head.material = m;
  return g;
}

function waxMesh() {
  const g = new THREE.Group();
  const shine = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xcff4ff, emissive: 0x6fc8ff, emissiveIntensity: 0.4, metalness: 0.8, roughness: 0.05, transparent: true, opacity: 0.45, depthWrite: false }));
  shine.rotation.x = -Math.PI / 2;
  shine.position.y = 0.065;
  g.add(shine);
  g.userData.shine = shine;
  return g;
}

function bearTrapMesh() {
  const g = new THREE.Group();
  const metal = mat(0x6a6a70, { metalness: 0.7, roughness: 0.35 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 20), metal);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 4), metal);
    tooth.position.set(Math.cos(a) * 0.2, 0.08, Math.sin(a) * 0.2);
    g.add(tooth);
  }
  return g;
}

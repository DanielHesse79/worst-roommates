// Visual effects: particles, ghosts, player-only trap decals and piranha fins.
import * as THREE from 'three';
import { POOL } from './data.js';
import { mat, box, disposeTree } from './models.js';

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
  plume: [{ n: 1, colors: [0x262626, 0x3d3d3d, 0x505050], speed: [0.05, 0.3], up: [0.9, 1.5], g: 0.15, life: [2.5, 4], size: [0.6, 1.0], grow: 1.6 }],
  stink: [{ n: 1, colors: [0x8a9a3a, 0x6a7a2a, 0xa0b048], speed: [0.05, 0.2], up: [0.3, 0.6], g: 0.05, life: [1.2, 2], size: [0.12, 0.22], grow: 0.8 }],
  notes: [{ n: 1, colors: [0xff5ab4, 0x5ad8ff, 0xffe14a, 0x9a6aff], speed: [0.2, 0.6], up: [0.6, 1.2], g: 0, life: [0.9, 1.5], size: [0.12, 0.2], grow: 0.2, additive: true }],
  steam: [{ n: 7, colors: [0xf2f2f2, 0xd6dde2], speed: [0.1, 0.5], up: [0.7, 1.4], g: 0.2, life: [0.9, 1.6], size: [0.3, 0.55], grow: 1.3 }],
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
    this.messMeshes = new Map();
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

  // One droplet of a hose jet, lobbed from the nozzle so it lands on the target cell.
  jet(x0, y0, z0, x1, z1) {
    if (this.particles.length >= MAX_PARTICLES) this.kill(this.particles.shift());
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: Math.random() < 0.5 ? 0xbfe8ff : 0xffffff, transparent: true, depthWrite: false }));
    const size = rand(0.13, 0.22), t = 0.4, g = -7;
    s.scale.setScalar(size);
    s.position.set(x0, y0, z0);
    this.scene.add(s);
    const vx = (x1 - x0) / t + rand(-0.4, 0.4), vz = (z1 - z0) / t + rand(-0.4, 0.4);
    this.particles.push({ s, vx, vy: (0.3 - y0) / t - 0.5 * g * t, vz, g, life: t, max: t, size, grow: 0 });
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
      // With the roof on, the smoke pours out of the roof (and the chimney, when the fire's lit).
      const roof = g.view && g.view.roofOn ? g.view.lot.roof.userData : null;
      for (const f of w.fire.values()) {
        const under = roof && !f.outdoor;
        if (Math.random() < 0.5) this.burst(f.x + 0.5, f.z + 0.5, under ? 'plume' : 'smoke', under ? roof.heightAt(f.z + 0.5) : 0.9);
      }
      const fp = w.objects.get('fireplace');
      if (roof && fp.lit > 0 && Math.random() < 0.4) this.burst(roof.chimney[0], roof.chimney[2], 'smoke', roof.chimney[1]);
      for (const s of g.sims) if (s.alive && s.status.poisoned > 0 && Math.random() < 0.4) this.burst(s.x, s.z, 'bubbles', 1.5);
      for (const s of g.sims) if (s.alive && !s.status.swimming && s.needs.hygiene < 15 && Math.random() < 0.35) this.burst(s.x, s.z, 'stink', 1.2);
      for (const s of g.sims) if (s.alive && s.status.breath > 0 && !s.status.away && Math.random() < 0.25) this.burst(s.x, s.z, 'stink', 1.35);
      const stereo = w.objects.get('stereo');
      const music = stereo.charred ? 0 : stereo.blasting > 0 ? 0.8 : stereo.playing > 0 ? 0.35 : 0;
      if (Math.random() < music) this.burst(stereo.cells[0][0] + 0.5, stereo.cells[0][1] + 0.5, 'notes', 1.3);
      if (w.stink && Math.random() < 0.5) {
        const r = w.stink.room === 'Kitchen' ? { x0: 1, z0: 1, x1: 7, z1: 6 } : null;
        if (r) this.burst(rand(r.x0 + 0.5, r.x1 - 0.5), rand(r.z0 + 0.5, r.z1 - 0.5), 'stink', 0.8);
      }
    }

    this.syncGhosts(dt, time);
    this.syncTraps(time);
    this.syncMess(time);
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
    for (const [gh, m] of this.ghostMeshes) if (!live.has(gh)) { this.scene.remove(m); disposeTree(m); this.ghostMeshes.delete(gh); }
  }

  syncTraps(time) {
    const traps = this.game.world.traps;
    for (const [k, t] of traps) {
      if (this.trapMeshes.has(k)) continue;
      const m = t.type === 'wax' ? waxMesh() : t.type === 'peel' ? peelMesh() : bearTrapMesh();
      m.position.set(t.x + 0.5, 0, t.z + 0.5);
      this.scene.add(m);
      this.trapMeshes.set(k, m);
    }
    for (const [k, m] of this.trapMeshes) {
      if (!traps.has(k)) { this.scene.remove(m); disposeTree(m); this.trapMeshes.delete(k); continue; }
      if (m.userData.shine) m.userData.shine.material.opacity = 0.35 + 0.2 * Math.sin(time * 3 + m.position.x);
    }
  }

  // Rubbish on the floor: everyone can see this one (and click it to clean it up).
  syncMess(time) {
    const mess = this.game.world.mess;
    for (const [k, m] of mess) {
      if (this.messMeshes.has(k)) continue;
      const mesh = messMesh(m.kind);
      mesh.position.set(m.x + 0.5, 0, m.z + 0.5);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      mesh.traverse(o => { o.userData.pick = { kind: 'mess', key: k }; });
      this.scene.add(mesh);
      this.messMeshes.set(k, mesh);
    }
    for (const [k, mesh] of this.messMeshes) {
      if (mess.has(k)) {
        mesh.userData.flies.forEach((f, i) => {
          const a = time * (5 + i * 2) + i * 3 + mesh.position.x;
          f.position.set(Math.cos(a) * 0.25, 0.35 + Math.sin(a * 1.7) * 0.08, Math.sin(a) * 0.2);
        });
        continue;
      }
      this.scene.remove(mesh);
      disposeTree(mesh);
      this.messMeshes.delete(k);
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
    if (!on && this.fins) { this.scene.remove(this.fins); disposeTree(this.fins); this.fins = null; }
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
    this.messMeshes.clear();
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

function peelMesh() {
  const g = new THREE.Group();
  const yellow = mat(0xf2d23a);
  for (let i = 0; i < 3; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.24), yellow);
    strip.position.set(Math.cos(i * 2.1) * 0.08, 0.03, Math.sin(i * 2.1) * 0.08);
    strip.rotation.y = i * 2.1;
    g.add(strip);
  }
  g.add(box(0.06, 0.05, 0.06, 0x6a4a1a, 0, 0.04, 0));
  return g;
}

// 0: a heap of rubbish, 1: a greasy pizza box, 2: a brown puddle of something.
function messMesh(kind) {
  const g = new THREE.Group();
  if (kind === 0) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0x1c1c22, { roughness: 0.3 }));
    bag.scale.set(1, 0.8, 0.9);
    bag.position.y = 0.16;
    g.add(bag, box(0.16, 0.03, 0.12, 0xf4f0e6, 0.2, 0.015, 0.14));
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), mat(0xd23a2a));
    can.rotation.z = Math.PI / 2;
    can.position.set(-0.2, 0.04, 0.12);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 8), mat(0x2e8a3a, { roughness: 0.2 }));
    bottle.rotation.x = Math.PI / 2;
    bottle.position.set(0.1, 0.045, -0.2);
    g.add(can, bottle);
  } else if (kind === 1) {
    g.add(box(0.48, 0.05, 0.48, 0xf0e2c0, 0, 0.025, 0), box(0.26, 0.012, 0.18, 0xc0392b, 0, 0.056, 0));
    const lid = box(0.48, 0.02, 0.48, 0xf0e2c0, 0, 0.2, -0.3);
    lid.rotation.x = -1.1;
    g.add(lid);
  } else {
    const puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.014, 16), mat(0x7a8a22, { roughness: 0.15 }));
    puddle.scale.set(1, 1, 0.7);
    puddle.position.y = 0.014;
    g.add(puddle, box(0.1, 0.06, 0.08, 0x6a4a2a, 0.18, 0.03, 0.05));
  }
  // A couple of flies, because of course.
  const flies = [];
  for (let i = 0; i < 2; i++) {
    const fly = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), mat(0x111111));
    flies.push(fly);
    g.add(fly);
  }
  g.userData.flies = flies;
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

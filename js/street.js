// Life outside the lot: traffic, pedestrians, and visitors at the front door.
import * as THREE from 'three';
import { GRID_H, SKIN_TONES } from './data.js';
import { mat, box, simModel, disposeTree } from './models.js';

const rand = (a, b) => a + Math.random() * (b - a);
const LANES = [{ z: GRID_H + 3.0, dir: 1 }, { z: GRID_H + 5.4, dir: -1 }];
const X_MIN = -45, X_MAX = 67;
const CAR_COLORS = [0xd9442b, 0x2d6ad9, 0xe0c04a, 0xf2f2f2, 0x2a2a2a, 0x3a9a5a, 0x8a3ab0];
const TRAFFIC_TIME = [0, 1, 1.6, 2.2]; // traffic speed per game-speed setting (capped so it doesn't blur)

function wheel(x, z) {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 12), mat(0x151515));
  w.rotation.x = Math.PI / 2;
  w.position.set(x, 0.2, z);
  return w;
}

function carMesh(bus) {
  const g = new THREE.Group();
  const lights = [];
  if (bus) {
    const col = Math.random() < 0.5 ? 0xe0b030 : 0xc03a2a;
    g.add(box(4.4, 1.35, 1.15, col, 0, 0.9, 0));
    g.add(box(4.2, 0.4, 1.17, 0x223344, 0, 1.25, 0));
    for (const x of [-1.5, 1.5]) for (const z of [-0.5, 0.5]) g.add(wheel(x, z));
  } else {
    const col = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    g.add(box(1.9, 0.45, 0.9, col, 0, 0.45, 0));
    g.add(box(1.0, 0.38, 0.8, 0x223344, -0.1, 0.85, 0));
    for (const x of [-0.6, 0.6]) for (const z of [-0.42, 0.42]) g.add(wheel(x, z));
  }
  const len = bus ? 2.2 : 0.95;
  for (const z of [-0.3, 0.3]) {
    const head = box(0.05, 0.1, 0.16, 0xfff6d0, len, bus ? 0.55 : 0.48, z, { emissive: 0xfff2c0, emissiveIntensity: 0.3, unique: true });
    const tail = box(0.05, 0.1, 0.16, 0x991111, -len, bus ? 0.55 : 0.48, z, { emissive: 0xff2222, emissiveIntensity: 0.3, unique: true });
    g.add(head, tail);
    lights.push(head, tail);
  }
  g.userData.lights = lights;
  return g;
}

// A person model driven directly (no Sim behind it).
function person(color, id) {
  const m = simModel({ id, color, skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)] });
  m.plumbob.visible = false;
  m.ring.visible = false;
  return m;
}

export class Street {
  constructor(scene, game, view) {
    this.scene = scene;
    this.game = game;
    this.view = view;
    this.cars = [];
    this.walkers = [];
    this.visitorMeshes = new Map();
    this.labels = new Map();
    this.carTimer = 1;
    this.walkTimer = 2;
    this.pid = 5000;
  }

  update(dt, time) {
    const tdt = dt * TRAFFIC_TIME[this.game.speed];
    this.updateTraffic(tdt);
    this.updateWalkers(tdt, time);
    this.syncVisitors(time);
  }

  updateTraffic(tdt) {
    this.carTimer -= tdt;
    if (this.carTimer <= 0) {
      this.carTimer = rand(2.5, 7);
      const lane = LANES[Math.floor(Math.random() * 2)];
      const bus = Math.random() < 0.15;
      const mesh = carMesh(bus);
      mesh.rotation.y = lane.dir > 0 ? 0 : Math.PI;
      mesh.position.set(lane.dir > 0 ? X_MIN : X_MAX, 0, lane.z);
      this.scene.add(mesh);
      this.cars.push({ mesh, dir: lane.dir, speed: bus ? rand(3, 4) : rand(4.5, 7) });
    }
    const night = this.view.night || 0;
    this.cars = this.cars.filter(c => {
      c.mesh.position.x += c.dir * c.speed * tdt;
      for (const l of c.mesh.userData.lights) l.material.emissiveIntensity = 0.3 + 2.5 * night;
      const gone = c.mesh.position.x > X_MAX + 5 || c.mesh.position.x < X_MIN - 5;
      if (gone) { this.scene.remove(c.mesh); disposeTree(c.mesh); }
      return !gone;
    });
  }

  updateWalkers(tdt, time) {
    this.walkTimer -= tdt;
    if (this.walkTimer <= 0) {
      this.walkTimer = rand(3, 9);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const m = person(CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], this.pid++);
      m.root.position.set(dir > 0 ? X_MIN + 15 : X_MAX - 15, 0, GRID_H + 0.7 + rand(-0.2, 0.3));
      m.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.scene.add(m.root);
      this.walkers.push({ m, dir, speed: rand(0.9, 1.4), phase: Math.random() * 10 });
    }
    this.walkers = this.walkers.filter(w => {
      w.m.root.position.x += w.dir * w.speed * tdt;
      const s = Math.sin(time * 8 + w.phase) * (tdt > 0 ? 1 : 0);
      w.m.legL.rotation.x = s * 0.6; w.m.legR.rotation.x = -s * 0.6;
      w.m.armL.rotation.x = -s * 0.5; w.m.armR.rotation.x = s * 0.5;
      const gone = w.m.root.position.x > X_MAX || w.m.root.position.x < X_MIN;
      if (gone) { this.scene.remove(w.m.root); disposeTree(w.m.root); }
      return !gone;
    });
  }

  syncVisitors(time) {
    const v = this.game.visit;
    const live = new Set();
    for (const p of v ? v.people : []) {
      live.add(p.id);
      let m = this.visitorMeshes.get(p.id);
      if (!m) {
        m = person(v.type.shirt, this.pid++);
        m.root.traverse(o => { o.userData.pick = { kind: 'visitor' }; });
        this.scene.add(m.root);
        this.visitorMeshes.set(p.id, m);
      }
      m.root.position.set(p.x, 0, p.z);
      m.root.rotation.y = p.facing;
      const s = p.moving ? Math.sin(time * 9) : 0;
      m.legL.rotation.x = s * 0.6; m.legR.rotation.x = -s * 0.6;
      m.armR.rotation.x = v.state === 'wait' && !p.moving ? -1.2 + Math.max(0, Math.sin(time * 10)) * 0.4 : s * 0.5;

      let el = this.labels.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'simLabel visitor';
        el.innerHTML = `<div class="thought">${v.type.icon}</div><div class="nm">${p.first}</div>`;
        this.view.overlay.appendChild(el);
        this.labels.set(p.id, el);
      }
      const [sx, sy] = this.view.project(p.x, 2.05, p.z);
      el.style.transform = `translate(${sx}px, ${sy}px)`;
    }
    for (const [id, m] of this.visitorMeshes) {
      if (live.has(id)) continue;
      this.scene.remove(m.root);
      disposeTree(m.root);
      this.visitorMeshes.delete(id);
      const el = this.labels.get(id);
      if (el) { el.remove(); this.labels.delete(id); }
    }
  }

  clear() {
    this.cars = [];
    this.walkers = [];
    this.visitorMeshes.clear();
    for (const el of this.labels.values()) el.remove();
    this.labels.clear();
  }
}

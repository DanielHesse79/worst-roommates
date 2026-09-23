// Life outside the lot: traffic, pedestrians, visitors at the front door and the emergency services.
import * as THREE from 'three';
import { GRID_W, GRID_H, SKIN_TONES } from './data.js';
import { mat, box, cyl, simModel, disposeTree } from './models.js';

const rand = (a, b) => a + Math.random() * (b - a);
const LANES = [{ z: GRID_H + 3.2, dir: 1 }, { z: GRID_H + 5.4, dir: -1 }];
const X_MIN = -45, X_MAX = 67;
const CAR_COLORS = [0xd9442b, 0x2d6ad9, 0xe0c04a, 0xf2f2f2, 0x2a2a2a, 0x3a9a5a, 0x8a3ab0];
const TRAFFIC_TIME = [0, 1, 1.6, 2.2]; // traffic speed per game-speed setting (capped so it doesn't blur)
const CAR_GAP = 0.9;                     // bumper-to-bumper distance drivers try to keep
const CRASH_TIME = 0.9;                  // seconds from cut brakes to the front garden
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

const WRECK = mat(0x201c1a, { roughness: 1 });

function beacon(color, x, y, z, w = 0.22) {
  return box(w, 0.1, 0.18, color, x, y, z, { emissive: color, emissiveIntensity: 0.2, unique: true });
}

function fireTruckMesh() {
  const g = new THREE.Group();
  g.add(box(2.7, 0.95, 1.05, 0xc81e1e, -0.55, 0.78, 0));
  g.add(box(1.0, 1.05, 1.05, 0xc81e1e, 1.3, 0.83, 0));
  g.add(box(0.05, 0.45, 0.9, 0x223344, 1.82, 1.05, 0));
  for (const z of [-0.53, 0.53]) g.add(box(3.6, 0.1, 0.02, 0xf2f2f2, -0.1, 0.55, z));
  // The ladder on the roof.
  for (const z of [-0.2, 0.2]) g.add(box(2.6, 0.06, 0.06, 0xd8d8d8, -0.6, 1.33, z));
  for (let x = -1.8; x <= 0.6; x += 0.3) g.add(box(0.05, 0.05, 0.4, 0xd8d8d8, x, 1.33, 0));
  g.add(cyl(0.18, 0.18, 0.5, 0xe8e0c0, -1.2, 0.78, 0.55, 12));
  for (const x of [-1.45, -0.6, 1.3]) for (const z of [-0.5, 0.5]) g.add(wheel(x, z));
  const a = beacon(0xff2020, 1.3, 1.42, -0.25), b = beacon(0xff2020, 1.3, 1.42, 0.25);
  g.add(a, b);
  g.userData.beacons = [a, b];
  return g;
}

function vanMesh() {
  const g = new THREE.Group();
  g.add(box(2.5, 1.35, 1.1, 0xf2f2ee, -0.45, 0.95, 0));
  g.add(box(2.52, 0.18, 1.12, 0x2d6ad9, -0.45, 0.75, 0));
  g.add(box(0.9, 0.9, 1.05, 0x2d6ad9, 1.25, 0.72, 0));
  g.add(box(0.05, 0.4, 0.9, 0x223344, 1.71, 0.95, 0));
  for (const x of [-1.3, 0.2, 1.3]) for (const z of [-0.5, 0.5]) g.add(wheel(x, z));
  return g;
}

function bikeMesh() {
  const g = new THREE.Group();
  for (const x of [-0.45, 0.45]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12), mat(0x151515));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.22, 0);
    g.add(w);
  }
  g.add(box(0.8, 0.22, 0.2, 0x1a1a1a, 0, 0.45, 0), box(0.35, 0.2, 0.24, 0xb0b0b8, -0.05, 0.36, 0));
  g.add(box(0.3, 0.08, 0.22, 0x2a2a2a, -0.2, 0.6, 0), box(0.05, 0.05, 0.5, 0xc8c8d0, 0.38, 0.72, 0));
  g.add(box(0.06, 0.08, 0.1, 0xfff2c0, 0.46, 0.55, 0, { emissive: 0xfff2c0, emissiveIntensity: 0.6 }));
  return g;
}

function policeCarMesh() {
  const g = new THREE.Group();
  g.add(box(1.9, 0.45, 0.9, 0xf4f4f4, 0, 0.45, 0));
  g.add(box(0.9, 0.46, 0.92, 0x1a1d2e, 0.05, 0.45, 0));
  g.add(box(1.0, 0.38, 0.8, 0x223344, -0.1, 0.85, 0));
  for (const x of [-0.6, 0.6]) for (const z of [-0.42, 0.42]) g.add(wheel(x, z));
  const a = beacon(0xff2020, -0.1, 1.09, -0.2), b = beacon(0x2050ff, -0.1, 1.09, 0.2);
  g.add(a, b);
  g.userData.beacons = [a, b];
  return g;
}

// Hats say who's who from the isometric distance: fire helmet or detective's fedora.
function hat(kind) {
  const h = new THREE.Group();
  if (kind === 'firefighter') {
    h.add(cyl(0.28, 0.3, 0.03, 0xc81e1e, 0, 0.08, 0, 16));
    h.add(cyl(0.16, 0.2, 0.17, 0xc81e1e, 0, 0.17, 0, 16));
    h.add(box(0.07, 0.09, 0.03, 0xffd24a, 0, 0.19, 0.19));
  } else if (kind === 'biker') {
    h.add(cyl(0.18, 0.19, 0.12, 0x1a1a1a, 0, 0.12, 0, 16));
    h.add(cyl(0.185, 0.185, 0.05, 0xb0201a, 0, 0.09, 0, 16));
  } else {
    h.add(cyl(0.27, 0.27, 0.025, 0x3d2f22, 0, 0.1, 0, 16));
    h.add(cyl(0.15, 0.17, 0.16, 0x3d2f22, 0, 0.19, 0, 16));
    h.add(cyl(0.172, 0.172, 0.04, 0x15100b, 0, 0.13, 0, 16));
  }
  return h;
}

const RESPONDER_LOOK = {
  firefighter: { shirt: 0xd9a21b, icon: '🧯', busy: { spray: '💦' } },
  detective: { shirt: 0x9a7b4f, icon: '🕵️', busy: { search: '🔍', idle: '☕' } },
  biker: { shirt: 0x1c1c1c, icon: '🏍️', busy: { punch: '💢' } },
};

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
    this.wrecks = [];
    this.walkers = [];
    this.visitorMeshes = new Map();
    this.vehicleMeshes = new Map();
    this.labels = new Map();
    this.carTimer = 1;
    this.walkTimer = 2;
    this.pid = 5000;
  }

  update(dt, time) {
    const tdt = dt * TRAFFIC_TIME[this.game.speed];
    this.updateTraffic(tdt);
    this.updateWalkers(tdt, time);
    this.syncPeople(time);
    this.syncVehicles(time);
  }

  updateTraffic(tdt) {
    this.carTimer -= tdt;
    if (this.carTimer <= 0) {
      const lane = Math.floor(Math.random() * 2), { z, dir } = LANES[lane];
      const startX = dir > 0 ? X_MIN : X_MAX;
      // Never spawn a car on top of one that's still pulling away.
      if (this.cars.some(c => c.lane === lane && Math.abs(c.mesh.position.x - startX) < 7)) this.carTimer = 0.5;
      else {
        this.carTimer = rand(2.5, 7);
        const bus = Math.random() < 0.15;
        const mesh = carMesh(bus);
        const car = { id: this.pid++, mesh, lane, dir, half: bus ? 2.2 : 0.95, cruise: bus ? rand(3, 4) : rand(4.5, 7) };
        car.speed = car.cruise;
        mesh.rotation.y = dir > 0 ? 0 : Math.PI;
        mesh.position.set(startX, 0, z);
        mesh.traverse(o => { o.userData.pick = { kind: 'car', id: car.id }; });
        this.scene.add(mesh);
        this.cars.push(car);
      }
    }
    // Drivers brake for whatever is ahead of them in their lane, so cars queue instead of overlapping.
    for (const c of this.cars) {
      if (c.crash) continue;
      let gap = Infinity, ahead = null;
      for (const o of this.cars) {
        if (o === c || o.crash || o.lane !== c.lane) continue;
        const along = (o.mesh.position.x - c.mesh.position.x) * c.dir;
        if (along <= 0) continue;
        const d = along - c.half - o.half;
        if (d < gap) { gap = d; ahead = o; }
      }
      for (const v of this.game.vehicles) {
        if (Math.abs(v.z - LANES[c.lane].z) > 0.6) continue;
        const along = (v.x - c.mesh.position.x) * c.dir;
        const d = along - c.half - ({ police: 0.95, van: 1.6 }[v.kind] || 1.9);
        if (along > 0 && d < gap) { gap = d; ahead = { speed: 0 }; }
      }
      const want = !ahead || gap > 4 ? c.cruise : gap < CAR_GAP ? 0 : Math.min(c.cruise, ahead.speed + (gap - CAR_GAP) * 0.8);
      c.speed += (want - c.speed) * Math.min(1, tdt * 4);
      const step = Math.max(0, Math.min(c.speed * tdt, gap - CAR_GAP * 0.5));
      c.mesh.position.x += c.dir * step;
    }
    const night = this.view.night || 0;
    this.cars = this.cars.filter(c => {
      if (c.crash) return this.updateCrash(c, tdt);
      for (const l of c.mesh.userData.lights) l.material.emissiveIntensity = 0.3 + 2.5 * night;
      const gone = c.mesh.position.x > X_MAX + 5 || c.mesh.position.x < X_MIN - 5;
      if (gone) { this.scene.remove(c.mesh); disposeTree(c.mesh); }
      return !gone;
    });
    this.wrecks = this.wrecks.filter(w => {
      if (this.game.clock < w.until) return true;
      this.scene.remove(w.mesh);
      disposeTree(w.mesh);
      return false;
    });
  }

  // Cut brakes: the car swerves off the road, over the kerb and into the front garden.
  crash(car) {
    if (car.crash) return;
    const { x, z } = car.mesh.position;
    car.crash = { t: 0, x0: x, z0: z, xm: x + car.dir * 2.5, x1: clamp(x + car.dir * 4, 1.5, GRID_W - 1.5), z1: GRID_H - 1.4 };
    for (const w of this.walkers) {
      if (Math.abs(w.m.root.position.x - car.crash.x1) < 5) { w.dir = w.m.root.position.x < car.crash.x1 ? -1 : 1; w.speed = 4; w.panic = true; }
    }
  }

  updateCrash(c, tdt) {
    const k = c.crash, m = c.mesh;
    k.t = Math.min(1, k.t + tdt / CRASH_TIME);
    const e = k.t * k.t, u = 1 - e;
    // Quadratic curve: carry on down the road for a moment, then veer hard into the garden.
    m.position.x = u * u * k.x0 + 2 * u * e * k.xm + e * e * k.x1;
    m.position.z = u * u * k.z0 + 2 * u * e * k.z0 + e * e * k.z1;
    m.position.y = Math.sin(Math.PI * Math.min(1, e * 1.4)) * 0.6;
    const dx = 2 * u * (k.xm - k.x0) + 2 * e * (k.x1 - k.xm), dz = 2 * e * (k.z1 - k.z0);
    m.rotation.y = -Math.atan2(dz, dx);
    m.rotation.z = Math.sin(k.t * 9) * 0.15;
    if (k.t < 1) return true;
    this.game.carCrash(k.x1, k.z1);
    // What's left: a charred shell on its side, until the tow truck gets round to it.
    for (const l of m.userData.lights) l.material.dispose();
    m.traverse(o => { if (o.isMesh) { o.material = WRECK; o.userData.pick = null; } });
    m.position.y = 0.15;
    m.rotation.z = 0.5;
    this.wrecks.push({ mesh: m, until: this.game.clock + 720 });
    return false;
  }

  updateWalkers(tdt, time) {
    this.walkTimer -= tdt;
    if (this.walkTimer <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const startX = dir > 0 ? X_MIN + 15 : X_MAX - 15;
      if (this.walkers.some(w => w.dir === dir && Math.abs(w.m.root.position.x - startX) < 2)) this.walkTimer = 1;
      else {
        this.walkTimer = rand(3, 9);
        const m = person(CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], this.pid++);
        // Keep right: each direction has its own side of the pavement.
        m.root.position.set(startX, 0, GRID_H + (dir > 0 ? 1.0 : 0.5));
        m.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.scene.add(m.root);
        this.walkers.push({ m, dir, speed: rand(0.9, 1.4), cruise: 0, phase: Math.random() * 10 });
      }
    }
    // People crossing the pavement (visitors, responders) make walkers wait instead of passing through them.
    const g = this.game;
    const crossing = [...(g.visit ? g.visit.people : []), ...g.responders];
    for (const w of this.walkers) {
      const p = w.m.root.position;
      let gap = Infinity;
      for (const o of this.walkers) {
        if (o === w || o.dir !== w.dir || o.panic) continue;
        const d = (o.m.root.position.x - p.x) * w.dir;
        if (d > 0 && d < gap) gap = d;
      }
      for (const o of crossing) {
        const d = (o.x - p.x) * w.dir;
        if (d > 0 && Math.abs(o.z - p.z) < 0.6) gap = Math.min(gap, d);
      }
      const walking = w.panic || gap > 0.8;
      if (walking) p.x += w.dir * w.speed * tdt;
      w.m.root.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const sw = walking && tdt > 0 ? Math.sin(time * (w.panic ? 16 : 8) + w.phase) : 0;
      w.m.legL.rotation.x = sw * 0.6; w.m.legR.rotation.x = -sw * 0.6;
      w.m.armL.rotation.x = w.panic ? -2.6 : -sw * 0.5; w.m.armR.rotation.x = w.panic ? -2.6 : sw * 0.5;
    }
    this.walkers = this.walkers.filter(w => {
      const gone = w.m.root.position.x > X_MAX || w.m.root.position.x < X_MIN;
      if (gone) { this.scene.remove(w.m.root); disposeTree(w.m.root); }
      return !gone;
    });
  }

  // Visitors at the door and responders on the lot share the same puppet rig and name labels.
  syncPeople(time) {
    const g = this.game, v = g.visit;
    const live = new Set();
    const people = [
      ...(v ? v.people.map(p => ({ p, shirt: v.type.shirt, icon: v.type.icon, pick: { kind: 'visitor' } })) : []),
      ...g.responders.map(p => {
        const look = RESPONDER_LOOK[p.kind];
        return { p, shirt: look.shirt, hat: p.kind, icon: (!p.moving && look.busy[p.pose]) || look.icon, pick: { kind: 'responder', id: p.id } };
      }),
    ];
    for (const { p, shirt, hat: hatKind, icon: baseIcon, pick } of people) {
      // Whatever is currently happening to them trumps their job.
      const icon = p.onFire ? '🔥' : p.trapped > 0 ? '🤕' : p.poisoned > 0 ? '🤢' : p.immortal ? '♾️' : baseIcon;
      live.add(p.id);
      let m = this.visitorMeshes.get(p.id);
      if (!m) {
        m = person(shirt, this.pid++);
        if (hatKind) m.head.add(hat(hatKind));
        m.root.traverse(o => { o.userData.pick = pick; });
        this.scene.add(m.root);
        this.visitorMeshes.set(p.id, m);
      }
      m.root.position.set(p.x, 0, p.z);
      m.root.rotation.y = p.facing;
      if (m.fire) m.fire.visible = !!p.onFire;
      const s = p.moving ? Math.sin(time * 9) : 0;
      m.legL.rotation.x = s * 0.6; m.legR.rotation.x = -s * 0.6;
      m.head.rotation.x = 0;
      if (p.pose === 'spray' && !p.moving) {
        m.armL.rotation.x = m.armR.rotation.x = -1.35 + Math.sin(time * 20) * 0.04;
        if (p.aim && g.speed > 0) {
          const f = p.facing;
          for (let i = 0; i < 2; i++) this.view.fx.jet(p.x + Math.sin(f) * 0.45, 0.85, p.z + Math.cos(f) * 0.45, p.aim[0], p.aim[1]);
        }
      } else if (p.pose === 'punch' && !p.moving) {
        m.armR.rotation.x = -1.5 + Math.max(0, Math.sin(time * 16)) * 0.9;
        m.armL.rotation.x = -1.5 + Math.max(0, Math.sin(time * 16 + Math.PI)) * 0.9;
      } else if (p.pose === 'search' && !p.moving) {
        m.head.rotation.x = 0.45;
        m.armL.rotation.x = 0;
        m.armR.rotation.x = -0.9 + Math.sin(time * 3) * 0.25;
      } else if (v && v.people.includes(p)) {
        m.armL.rotation.x = -s * 0.5;
        m.armR.rotation.x = v.state === 'wait' && !p.moving ? -1.2 + Math.max(0, Math.sin(time * 10)) * 0.4 : s * 0.5;
      } else {
        m.armL.rotation.x = -s * 0.5; m.armR.rotation.x = s * 0.5;
      }

      let el = this.labels.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'simLabel visitor';
        el.innerHTML = `<div class="thought"></div><div class="nm">${p.first}</div>`;
        this.view.overlay.appendChild(el);
        this.labels.set(p.id, el);
      }
      const th = el.firstChild;
      if (th.textContent !== icon) th.textContent = icon;
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

  syncVehicles(time) {
    const live = new Set();
    const flash = Math.floor(time * 6) % 2 === 0;
    for (const v of this.game.vehicles) {
      live.add(v.id);
      let m = this.vehicleMeshes.get(v.id);
      if (!m) {
        m = v.kind === 'police' ? policeCarMesh() : v.kind === 'van' ? vanMesh() : v.kind === 'bike' ? bikeMesh() : fireTruckMesh();
        this.scene.add(m);
        this.vehicleMeshes.set(v.id, m);
      }
      m.position.set(v.x, 0, v.z);
      m.rotation.y = v.yaw;
      if (m.userData.beacons) {
        const [a, b] = m.userData.beacons;
        a.material.emissiveIntensity = flash ? 3 : 0.15;
        b.material.emissiveIntensity = flash ? 0.15 : 3;
      }
    }
    for (const [id, m] of this.vehicleMeshes) {
      if (live.has(id)) continue;
      this.scene.remove(m);
      disposeTree(m);
      this.vehicleMeshes.delete(id);
    }
  }

  clear() {
    this.cars = [];
    this.wrecks = [];
    this.walkers = [];
    this.visitorMeshes.clear();
    this.vehicleMeshes.clear();
    for (const el of this.labels.values()) el.remove();
    this.labels.clear();
  }
}

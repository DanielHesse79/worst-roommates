// Procedural low-poly models. Furniture is built facing +z with origin at the footprint centre.
import * as THREE from 'three';

const matCache = new Map();
const sharedMats = new WeakSet();
export function mat(color, opts = {}) {
  const { unique, ...params } = opts;
  const k = color + JSON.stringify(params);
  if (!unique && matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...params });
  if (!unique) { matCache.set(k, m); sharedMats.add(m); }
  return m;
}

// Free the GPU resources of a removed object tree. Cached materials are shared and kept.
export function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (sharedMats.has(m)) continue;
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}

export function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), color instanceof THREE.Material ? color : mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), color instanceof THREE.Material ? color : mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function sphere(r, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), color instanceof THREE.Material ? color : mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Canvas texture for floors: tiles, planks or carpet.
export function floorTexture(kind, color, repeatX, repeatZ) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const base = '#' + new THREE.Color(color).getHexString();
  const dark = '#' + new THREE.Color(color).multiplyScalar(0.82).getHexString();
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  if (kind === 'tile') {
    g.fillStyle = dark;
    g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  } else if (kind === 'wood') {
    g.strokeStyle = dark; g.lineWidth = 2;
    for (let y = 0; y <= 64; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
    for (let i = 0; i < 4; i++) { const x = (i * 23) % 64; g.beginPath(); g.moveTo(x, i * 16); g.lineTo(x, i * 16 + 16); g.stroke(); }
  } else {
    for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? dark : base; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatZ);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- furniture ----------

const WOOD = 0x8b5a2b, DARKWOOD = 0x5a3a1e, WHITE = 0xf2f2ee, STEEL = 0x9aa0a6, BLACK = 0x222222;

const BUILDERS = {
  fridge(g) {
    g.add(box(0.8, 1.9, 0.7, WHITE, 0, 0.95, 0));
    g.add(box(0.82, 0.02, 0.72, 0xcccccc, 0, 1.35, 0));
    g.add(box(0.04, 0.35, 0.04, STEEL, 0.3, 1.1, 0.37));
    g.add(box(0.04, 0.25, 0.04, STEEL, 0.3, 1.6, 0.37));
    const glow = box(0.84, 1.94, 0.74, 0x55ff55, 0, 0.95, 0, { transparent: true, opacity: 0.0, emissive: 0x33ff33, unique: true });
    glow.castShadow = false;
    g.userData.poisonGlow = glow;
    g.add(glow);
  },
  counter(g) { g.add(box(0.96, 0.85, 0.7, WOOD, 0, 0.425, 0)); g.add(box(1, 0.06, 0.75, 0x777777, 0, 0.88, 0)); },
  sink(g) {
    BUILDERS.counter(g);
    g.add(box(0.5, 0.04, 0.4, 0x333d44, 0, 0.9, 0.05));
    g.add(cyl(0.03, 0.03, 0.3, STEEL, 0, 1.05, -0.2));
  },
  stove(g) {
    g.add(box(0.9, 0.88, 0.7, 0xdddddd, 0, 0.44, 0));
    g.add(box(0.9, 0.04, 0.7, BLACK, 0, 0.9, 0));
    g.add(box(0.6, 0.35, 0.02, 0x111111, 0, 0.45, 0.36));
    for (const [x, z] of [[-0.22, -0.15], [0.22, -0.15], [-0.22, 0.15], [0.22, 0.15]]) g.add(cyl(0.1, 0.1, 0.02, 0x552222, x, 0.93, z));
  },
  table(g) {
    g.add(box(1.8, 0.06, 0.9, WOOD, 0, 0.75, 0));
    for (const [x, z] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) g.add(box(0.07, 0.72, 0.07, DARKWOOD, x, 0.36, z));
    for (const x of [-0.45, 0.45]) {
      g.add(box(0.4, 0.05, 0.4, DARKWOOD, x, 0.45, 0.65));
      g.add(box(0.4, 0.45, 0.05, DARKWOOD, x, 0.68, 0.85));
    }
  },
  tv(g) {
    g.add(box(1.0, 0.5, 0.5, DARKWOOD, 0, 0.25, 0));
    g.add(box(0.9, 0.7, 0.55, 0x3a3a3a, 0, 0.85, 0));
    const screen = box(0.72, 0.52, 0.02, 0x111111, 0, 0.87, 0.28, { emissive: 0x000000, unique: true });
    g.userData.screen = screen;
    g.add(screen);
    g.add(cyl(0.01, 0.01, 0.4, STEEL, -0.15, 1.35, 0, 6).rotateZ(0.4));
    g.add(cyl(0.01, 0.01, 0.4, STEEL, 0.15, 1.35, 0, 6).rotateZ(-0.4));
  },
  couch(g) {
    g.add(box(2.7, 0.45, 0.85, 0x7a2e3a, 0, 0.225, 0));
    g.add(box(2.7, 0.55, 0.22, 0x6a2432, 0, 0.6, -0.33));
    g.add(box(0.2, 0.3, 0.85, 0x6a2432, -1.25, 0.55, 0));
    g.add(box(0.2, 0.3, 0.85, 0x6a2432, 1.25, 0.55, 0));
  },
  fireplace(g) {
    g.add(box(1.0, 1.3, 0.55, 0x8a8580, 0, 0.65, -0.1));
    g.add(box(0.6, 0.55, 0.1, 0x151010, 0, 0.35, 0.18));
    g.add(box(1.1, 0.08, 0.65, 0x6d6862, 0, 1.3, -0.05));
    g.add(box(0.5, 0.9, 0.4, 0x8a8580, 0, 1.75, -0.2));
    const flames = new THREE.Group();
    for (let i = 0; i < 3; i++) flames.add(flameMesh(0.09 + i * 0.02, (i - 1) * 0.14, 0.2, 0.12));
    flames.visible = false;
    g.userData.flames = flames;
    g.add(flames);
  },
  tub(g) {
    g.add(box(1.9, 0.55, 0.85, WHITE, 0, 0.275, 0));
    g.add(box(1.7, 0.02, 0.65, 0x6fc3e8, 0, 0.5, 0, { transparent: true, opacity: 0.85 }));
    g.add(cyl(0.03, 0.03, 0.3, STEEL, -0.85, 0.7, 0));
  },
  toilet(g) {
    g.add(cyl(0.2, 0.16, 0.4, WHITE, 0, 0.2, 0.05));
    g.add(box(0.45, 0.45, 0.2, WHITE, 0, 0.55, -0.25));
  },
  bed(g, obj) {
    g.add(box(1.95, 0.35, 0.95, DARKWOOD, 0, 0.175, 0));
    g.add(box(1.85, 0.15, 0.9, 0xeeeeee, 0, 0.42, 0));
    g.add(box(1.25, 0.08, 0.92, [0x5a2d6e, 0x2d4d6e, 0x6e2d2d, 0x2d6e45, 0x6e5a2d, 0x3a3a44][obj.bedIndex || 0], -0.3, 0.52, 0));
    g.add(box(0.45, 0.12, 0.6, WHITE, 0.7, 0.55, 0));
    g.add(box(0.08, 0.7, 0.95, DARKWOOD, 0.98, 0.35, 0));
  },
  dresser(g) {
    g.add(box(0.9, 1.0, 0.5, WOOD, 0, 0.5, 0));
    for (const y of [0.3, 0.55, 0.8]) g.add(box(0.8, 0.02, 0.02, DARKWOOD, 0, y, 0.26));
  },
  computer(g) {
    g.add(box(0.95, 0.06, 0.6, WOOD, 0, 0.74, -0.05));
    for (const x of [-0.42, 0.42]) g.add(box(0.06, 0.72, 0.55, DARKWOOD, x, 0.36, -0.05));
    g.add(box(0.5, 0.35, 0.08, 0x2a2a2a, 0, 1.0, -0.2));
    const screen = box(0.44, 0.28, 0.01, 0x113311, 0, 1.0, -0.155, { emissive: 0x22aa44, emissiveIntensity: 0.6, unique: true });
    g.userData.screen = screen;
    g.add(screen);
  },
  bookshelf(g) {
    g.add(box(0.95, 1.8, 0.35, DARKWOOD, 0, 0.9, 0));
    const cols = [0x9c2f2f, 0x2f5c9c, 0x2f9c55, 0xc9a13b, 0x6e3b9c];
    for (let shelf = 0; shelf < 4; shelf++) {
      for (let i = 0; i < 6; i++) g.add(box(0.1, 0.3, 0.25, cols[(i + shelf) % 5], -0.35 + i * 0.13, 0.2 + shelf * 0.42, 0.04));
    }
  },
  heater(g) {
    g.add(box(0.55, 0.65, 0.25, 0xb0b0b0, 0, 0.33, 0));
    const coil = box(0.45, 0.45, 0.02, 0x442211, 0, 0.35, 0.13, { emissive: 0xff4400, emissiveIntensity: 0.1, unique: true });
    g.userData.coil = coil;
    g.add(coil);
  },
  ladder(g) {
    for (const z of [-0.22, 0.22]) {
      g.add(cyl(0.03, 0.03, 1.2, STEEL, 0, 0.3, z));
      const top = cyl(0.03, 0.03, 0.35, STEEL, -0.15, 0.9, z);
      top.rotation.z = Math.PI / 2;
      g.add(top);
    }
    for (const y of [-0.1, 0.15, 0.4]) {
      const r = cyl(0.025, 0.025, 0.44, STEEL, 0.02, y, 0);
      r.rotation.x = Math.PI / 2;
      g.add(r);
    }
  },
  grill(g) {
    const bowl = sphere(0.3, BLACK, 0, 0.75, 0);
    bowl.scale.set(1, 0.6, 1);
    g.add(bowl);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const leg = cyl(0.02, 0.02, 0.7, 0x333333, Math.sin(a) * 0.18, 0.35, Math.cos(a) * 0.18, 6);
      leg.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      g.add(leg);
    }
  },
  mailbox(g) {
    g.add(box(0.09, 0.95, 0.09, DARKWOOD, 0, 0.47, 0));
    g.add(box(0.34, 0.28, 0.5, 0x2d4d8e, 0, 1.05, 0));
    const top = cyl(0.17, 0.17, 0.5, 0x2d4d8e, 0, 1.19, 0, 12);
    top.rotation.x = Math.PI / 2;
    g.add(top);
    const flag = new THREE.Group();
    flag.position.set(0.19, 1.05, -0.1);
    flag.add(box(0.02, 0.3, 0.03, 0xd9442b, 0, 0.13, 0), box(0.02, 0.1, 0.14, 0xd9442b, 0, 0.24, 0.07));
    g.userData.flag = flag;
    g.add(flag);
  },
  telescope(g) {
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const leg = cyl(0.02, 0.02, 1.1, DARKWOOD, Math.sin(a) * 0.2, 0.52, Math.cos(a) * 0.2, 6);
      leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3);
      g.add(leg);
    }
    const tube = cyl(0.07, 0.09, 0.9, 0xc9a13b, 0, 1.2, 0);
    tube.rotation.x = -0.9;
    g.add(tube);
  },
};

export function buildFurniture(obj, facing) {
  const g = new THREE.Group();
  (BUILDERS[obj.type] || (x => x.add(box(0.8, 0.8, 0.8, 0xff00ff, 0, 0.4, 0))))(g, obj);
  g.rotation.y = facing;
  g.traverse(m => { m.userData.pick = { kind: 'object', id: obj.id }; });
  return g;
}

// ---------- effects ----------

export function flameMesh(r, x, y, z) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, r * 3, 8), mat(0xff7a1a, { emissive: 0xff5500, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }));
  m.position.set(x, y + r * 1.5, z);
  m.userData.baseY = y + r * 1.5;
  return m;
}

export function fireCluster() {
  const g = new THREE.Group();
  g.add(flameMesh(0.22, 0, 0, 0), flameMesh(0.15, 0.22, 0, 0.12), flameMesh(0.14, -0.2, 0, -0.15), flameMesh(0.1, 0.05, 0, 0.28));
  const light = new THREE.PointLight(0xff6a1a, 2.5, 3.5, 1.5);
  light.position.y = 0.6;
  g.add(light);
  return g;
}

export function tombstoneMesh(t) {
  const g = new THREE.Group();
  g.add(box(0.5, 0.6, 0.14, 0x9a9a9e, 0, 0.3, 0));
  const top = cyl(0.25, 0.25, 0.14, 0x9a9a9e, 0, 0.6, 0, 16);
  top.rotation.x = Math.PI / 2;
  g.add(top);
  g.add(box(0.7, 0.08, 0.5, 0x4a3a2a, 0, 0.04, 0.12));
  g.add(box(0.06, 0.25, 0.02, 0x555555, 0, 0.55, 0.08), box(0.18, 0.05, 0.02, 0x555555, 0, 0.6, 0.08));
  g.position.set(t.x + 0.5, 0, t.z + 0.5);
  g.traverse(m => { m.userData.pick = { kind: 'tomb', id: t.id }; });
  return g;
}

export function reaperMesh() {
  const g = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.8, 12), mat(0x0e0b12, { transparent: true, opacity: 1, unique: true }));
  robe.position.y = 0.9;
  g.add(robe);
  const hood = sphere(0.26, 0x0e0b12, 0, 1.75, 0);
  hood.material = robe.material;
  g.add(hood);
  const skull = sphere(0.15, 0xe8e2d0, 0, 1.72, 0.1);
  g.add(skull);
  for (const x of [-0.05, 0.05]) g.add(sphere(0.035, 0x000000, x, 1.74, 0.23));
  const handle = cyl(0.025, 0.025, 2.2, 0x3a2a1a, 0.45, 1.1, 0.1, 6);
  g.add(handle);
  const blade = box(0.8, 0.06, 0.03, 0xc0c4c8, 0.15, 2.15, 0.1);
  blade.rotation.z = -0.25;
  g.add(blade);
  g.userData.materials = [robe.material];
  return g;
}

export function meteorMesh() {
  const g = new THREE.Group();
  g.add(sphere(0.45, mat(0x5a3a2a, { emissive: 0xff5500, emissiveIntensity: 0.8 })));
  const trail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.5, 10), mat(0xffaa33, { emissive: 0xff7700, transparent: true, opacity: 0.6 }));
  trail.position.set(0, 1.4, 0);
  g.add(trail);
  g.add(new THREE.PointLight(0xff7722, 6, 8, 1.2));
  return g;
}

// ---------- sims ----------

const HAIR_COLORS = [0x2a1a10, 0x5a3a1e, 0xd8b45a, 0x9a3a1a, 0x8a8a8a, 0x111111];
const PANTS_COLORS = [0x2a2a3a, 0x3a4a6a, 0x4a3a2a, 0x2a3a2a, 0x5a2a3a];

// Each sim gets a stable look derived from their id.
function hairFor(head, style, color) {
  const hm = mat(color, { roughness: 0.9 });
  if (style === 0) {
    const cap = sphere(0.18, hm, 0, 0.05, -0.02);
    cap.scale.set(1, 0.7, 1);
    head.add(cap);
  } else if (style === 1) {
    const cap = sphere(0.175, hm, 0, 0.04, -0.02);
    cap.scale.set(1, 0.6, 1);
    head.add(cap);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), hm);
      spike.position.set(Math.sin(a) * 0.09, 0.15, Math.cos(a) * 0.09 - 0.02);
      spike.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      head.add(spike);
    }
  } else if (style === 2) {
    const cap = sphere(0.18, hm, 0, 0.05, -0.02);
    cap.scale.set(1, 0.7, 1);
    head.add(cap, sphere(0.09, hm, 0, 0.16, -0.12));
  } else if (style === 3) {
    const cap = sphere(0.185, hm, 0, 0.04, -0.02);
    cap.scale.set(1, 0.72, 1.02);
    head.add(cap, box(0.34, 0.32, 0.1, hm, 0, -0.1, -0.12));
  } else {
    head.add(box(0.16, 0.03, 0.03, hm, 0, -0.045, 0.16)); // bald, with a villainous moustache
  }
}

// Long, glossy hair falling past the shoulders.
function longHair(head, color) {
  const hm = mat(color, { roughness: 0.45 });
  const cap = sphere(0.19, hm, 0, 0.06, -0.04);
  cap.scale.set(1.02, 0.78, 0.92);
  head.add(cap);
  head.add(box(0.36, 0.46, 0.12, hm, 0, -0.18, -0.12));
  for (const x of [-0.16, 0.16]) head.add(box(0.07, 0.36, 0.1, hm, x, -0.13, 0.03));
}

// Knee-high boots with a heel.
function boot(leather) {
  const g = new THREE.Group();
  g.add(box(0.11, 0.08, 0.2, leather, 0, 0, 0.04));
  g.add(box(0.06, 0.07, 0.05, leather, 0, -0.03, -0.05));
  g.add(cyl(0.085, 0.08, 0.3, leather, 0, 0.17, 0, 12));
  g.add(cyl(0.095, 0.095, 0.04, leather, 0, 0.32, 0, 12));
  return g;
}

function handbag(colour) {
  const g = new THREE.Group();
  const leather = mat(colour, { roughness: 0.4 });
  g.add(box(0.22, 0.16, 0.08, leather, 0, -0.14, 0.02));
  g.add(box(0.05, 0.03, 0.085, 0xe8c66a, 0, -0.08, 0.02, { metalness: 0.8, roughness: 0.3 }));
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 6, 16, Math.PI), leather);
  strap.position.set(0, -0.06, 0.02);
  g.add(strap);
  return g;
}

export function simModel(sim) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const glam = sim.look === 'glam';
  const shirt = mat(sim.color, { unique: true });
  const skin = mat(sim.skin, { unique: true });
  const pants = glam ? skin : mat(PANTS_COLORS[sim.id % PANTS_COLORS.length]);
  const shoe = glam ? mat(0x111114, { roughness: 0.3, metalness: 0.15 }) : mat(0x1a1410);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12), shirt);
  torso.position.y = 0.8;
  torso.castShadow = true;
  body.add(torso);
  if (glam) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.3, 0.3, 18), shirt);
    skirt.position.y = 0.57;
    skirt.castShadow = true;
    body.add(skirt);
    body.add(cyl(0.185, 0.185, 0.035, 0xd4a857, 0, 0.7, 0, 18));
  } else {
    body.add(box(0.34, 0.12, 0.24, pants, 0, 0.56, 0));
  }
  body.add(cyl(0.06, 0.07, 0.1, skin, 0, 1.07, 0));

  const head = new THREE.Group();
  head.position.y = 1.2;
  body.add(head);
  head.add(sphere(0.17, skin));
  head.add(sphere(0.03, skin, 0, -0.01, 0.17));
  if (glam) longHair(head, 0x1a0f0a);
  else hairFor(head, (sim.id * 7 + 3) % 5, HAIR_COLORS[(sim.id * 5) % HAIR_COLORS.length]);
  const eyes = [], brows = [];
  for (const x of [-0.06, 0.06]) {
    const eye = sphere(0.03, 0xffffff, x, 0.02, 0.145);
    eye.add(sphere(0.017, 0x000000, 0, 0, 0.018));
    eyes.push(eye);
    head.add(eye);
    const brow = box(0.08, 0.02, 0.02, 0x1a0a05, x, 0.075, 0.155);
    brow.rotation.z = x < 0 ? -0.45 : 0.45;
    brows.push(brow);
    head.add(brow);
  }
  const grin = box(0.1, 0.015, 0.02, glam ? 0xb0183a : 0x551111, 0, -0.075, 0.155);
  grin.rotation.z = 0.12;
  head.add(grin);

  const limb = (w, h, material, x, y, end) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(w, h, 3, 8), material);
    m.position.y = -h / 2 - w;
    m.castShadow = true;
    pivot.add(m);
    if (end) { end.position.y = -h - w * 2; pivot.add(end); }
    body.add(pivot);
    return pivot;
  };
  const foot = () => (glam ? boot(shoe) : box(0.1, 0.07, 0.18, shoe, 0, 0, 0.04));
  const legL = limb(0.07, 0.3, pants, -0.08, 0.52, foot());
  const legR = limb(0.07, 0.3, pants, 0.08, 0.52, foot());
  const armL = limb(0.055, 0.28, shirt, -0.23, 1.0, sphere(0.055, skin));
  const armR = limb(0.055, 0.28, shirt, 0.23, 1.0, sphere(0.055, skin));
  if (glam) {
    const bag = handbag(0x1a1a1f);
    bag.position.y = -0.4;
    armR.add(bag);
  }

  const plumbob = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), mat(0x33ff66, { emissive: 0x22aa44, emissiveIntensity: 0.8, unique: true }));
  plumbob.scale.set(0.8, 1.5, 0.8);
  plumbob.position.y = 1.72;
  root.add(plumbob);

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 32), new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  root.add(ring);

  const fire = new THREE.Group();
  fire.add(flameMesh(0.15, 0, 0.7, 0), flameMesh(0.12, 0.12, 0.9, 0.05), flameMesh(0.1, -0.1, 1.0, -0.05));
  fire.visible = false;
  root.add(fire);

  root.traverse(m => { m.userData.pick = { kind: 'sim', id: sim.id }; });
  ring.userData.pick = null;
  return { root, body, head, torso, eyes, brows, grin, legL, legR, armL, armR, plumbob, ring, fire, shirt, skin, flash: 0, face: 0 };
}

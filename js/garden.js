// Decorative surroundings: textured grass, fence, street, trees, bushes, lamps and the neighbours' houses.
// Everything sits on the lot edge or outside the walkable grid so it never blocks sims.
import * as THREE from 'three';
import { GRID_W, GRID_H } from './data.js';
import { mat, box } from './models.js';
import { HOUSES } from './neighbours.js';

// Deterministic pseudo-random so the neighbourhood looks the same every time.
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#709977';
  g.fillRect(0, 0, 128, 128);
  const r = seeded(7);
  for (let i = 0; i < 900; i++) {
    const shade = r();
    g.fillStyle = shade < 0.5 ? 'rgba(50,90,60,0.13)' : 'rgba(179,200,120,0.13)';
    g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 2 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tree(r, x, z) {
  const g = new THREE.Group();
  const h = 1.2 + r() * 1.2;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, h, 7), mat(0x6b4a2e));
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const greens = [0x3f7d3a, 0x4f9444, 0x356b33, 0x5a9e3f];
  if (r() < 0.35) {
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9 - i * 0.22, 1.1, 8), mat(0x2f6b3a, { flatShading: true }));
      cone.position.y = h + 0.3 + i * 0.55;
      cone.castShadow = true;
      g.add(cone);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + r() * 0.35, 0), mat(greens[Math.floor(r() * greens.length)], { flatShading: true }));
      blob.position.set((r() - 0.5) * 0.7, h + 0.2 + r() * 0.5, (r() - 0.5) * 0.7);
      blob.castShadow = true;
      g.add(blob);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = r() * Math.PI * 2;
  return g;
}

function bush(r, x, z) {
  const g = new THREE.Group();
  const cols = [0x3f8a3a, 0x4a9a40, 0x357a33];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + r() * 0.15, 0), mat(cols[i % 3], { flatShading: true }));
    s.position.set((r() - 0.5) * 0.5, 0.25, (r() - 0.5) * 0.5);
    s.castShadow = true;
    g.add(s);
  }
  if (r() < 0.5) {
    const flowerCol = [0xff6ab0, 0xffe14a, 0xffffff, 0xb26aff][Math.floor(r() * 4)];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mat(flowerCol, { emissive: flowerCol, emissiveIntensity: 0.15 }));
      f.position.set((r() - 0.5) * 0.6, 0.45 + r() * 0.1, (r() - 0.5) * 0.6);
      g.add(f);
    }
  }
  g.position.set(x, 0, z);
  return g;
}

function saleSign() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f0e6'; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#c0392b'; ctx.fillRect(0, 0, 256, 34);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 26px Georgia'; ctx.textAlign = 'center'; ctx.fillText('FOR SALE', 128, 26);
  ctx.fillStyle = '#2a2a2a'; ctx.font = 'bold 20px Georgia'; ctx.fillText('Motivated sellers.', 128, 72); ctx.fillText('Very motivated.', 128, 104);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Group();
  sign.add(box(0.08, 1.3, 0.08, 0x6a4a2a, 0, 0.65, 0));
  sign.add(box(1.2, 0.6, 0.05, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), 0, 1.1, 0.06));
  return sign;
}

// A neighbour's house, facing the street. Walls and window glow are its own materials so the view
// can repaint it for each new family and light it up at night; the FOR SALE sign shows when it's empty.
function neighbourHouse(scene, side) {
  const { x, z } = HOUSES[side];
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const walls = new THREE.MeshStandardMaterial({ color: 0xd8c3a5, roughness: 0.9, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a3440, emissive: 0xffc870, emissiveIntensity: 0, roughness: 0.3 });
  g.add(box(8, 2.8, 6, walls, 0, 1.4, 0));
  const rise = 1.8, run = 3.3, len = Math.hypot(run, rise), tilt = Math.atan2(rise, run);
  for (const s of [-1, 1]) {
    const slope = box(8.6, 0.14, len, 0x6a3a2e, 0, 2.8 + rise / 2, s * run / 2);
    slope.rotation.x = s * tilt;
    g.add(slope);
  }
  const gable = new THREE.Shape([new THREE.Vector2(-3, 0), new THREE.Vector2(3, 0), new THREE.Vector2(0, rise)]);
  for (const gx of [-4, 4]) {
    const end = new THREE.Mesh(new THREE.ShapeGeometry(gable), walls);
    end.rotation.y = Math.PI / 2;
    end.position.set(gx, 2.8, 0);
    g.add(end);
  }
  g.add(box(0.6, 1.4, 0.6, 0x8a7a70, 2.4, 4.1, -1));
  g.add(box(1, 1.9, 0.1, 0x5a3a28, 0, 0.95, 3.02));
  for (const wx of [-2.6, 2.6]) g.add(box(1.3, 0.9, 0.06, glass, wx, 1.6, 3.02), box(1.45, 0.08, 0.1, 0xf4f0e6, wx, 1.1, 3.05));
  for (const wz of [-1.4, 1.4]) g.add(box(0.06, 0.9, 1.1, glass, side === 'west' ? 4.02 : -4.02, 1.6, wz));
  // Front path down to the pavement, and a little hedge.
  const pathLen = GRID_H + 0.3 - (z + 3);
  g.add(box(1.1, 0.02, pathLen, 0xc9c2b4, 0, 0.012, 3 + pathLen / 2));
  for (const hx of [-2.8, 2.8]) g.add(box(3.4, 0.5, 0.5, 0x3f7a3a, hx, 0.25, GRID_H - z - 0.6));
  const sign = saleSign();
  sign.position.set(1.8, 0, GRID_H - z - 1.4);
  sign.visible = false;
  g.add(sign);
  g.traverse(o => { o.userData.pick = { kind: 'house', side }; });
  scene.add(g);
  return { walls, glass, sign };
}

export function buildGarden(scene) {
  const out = { lamps: [] };
  const r = seeded(42);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 120), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
  ground.material.map.repeat.set(35, 30);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(GRID_W / 2, -0.01, GRID_H / 2);
  ground.receiveShadow = true;
  ground.userData.pick = { kind: 'floor' };
  scene.add(ground);

  // Street along the south side: sidewalk, kerb, asphalt with dashes.
  scene.add(box(140, 0.04, 1.4, 0xb9b4aa, GRID_W / 2, 0.02, GRID_H + 0.9));
  scene.add(box(140, 0.08, 0.15, 0x8f8a80, GRID_W / 2, 0.04, GRID_H + 1.65));
  scene.add(box(140, 0.02, 5, 0x3a3b40, GRID_W / 2, 0.01, GRID_H + 4.2));
  for (let x = -60; x < 80; x += 3) scene.add(box(1.4, 0.025, 0.12, 0xe8e0b0, x, 0.02, GRID_H + 4.2));

  // Picket fence on the lot boundary, with a gap for the front path.
  const fenceMat = mat(0xf2ede4);
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (const y of [0.2, 0.45]) {
      const m = box(len, 0.05, 0.05, fenceMat, (x0 + x1) / 2, y, (z0 + z1) / 2);
      m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      scene.add(m);
    }
    const n = Math.round(len / 0.35);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      scene.add(box(0.07, 0.6, 0.07, fenceMat, x0 + (x1 - x0) * t, 0.3, z0 + (z1 - z0) * t));
    }
  };
  rail(0, 0, GRID_W, 0);
  rail(0, 0, 0, GRID_H);
  rail(GRID_W, 0, GRID_W, GRID_H);
  rail(0, GRID_H, 9.9, GRID_H);
  rail(11.1, GRID_H, GRID_W, GRID_H);

  // Street lamps; their lights switch on at night.
  for (const x of [3, 17, 31, -11]) {
    scene.add(box(0.1, 2.6, 0.1, 0x333338, x, 1.3, GRID_H + 1.3));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(0xfff2c0, { emissive: 0xffd27a, emissiveIntensity: 0.2, unique: true }));
    bulb.position.set(x, 2.65, GRID_H + 1.3);
    scene.add(bulb);
    const light = new THREE.PointLight(0xffd9a0, 0, 9, 1.5);
    light.position.set(x, 2.5, GRID_H + 1.3);
    scene.add(light);
    out.lamps.push({ bulb, light });
  }

  // Trees and bushes in a ring outside the lot.
  const spots = [];
  for (let i = 0; i < 70; i++) {
    const side = Math.floor(r() * 3);
    let x, z;
    if (side === 0) { x = -2 - r() * 12; z = -8 + r() * 26; }
    else if (side === 1) { x = GRID_W + 2 + r() * 12; z = -8 + r() * 26; }
    else { x = -8 + r() * (GRID_W + 16); z = -2 - r() * 10; }
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 1.6)) continue;
    // Keep the neighbours' houses and front gardens clear.
    if (Object.values(HOUSES).some(h => Math.abs(x - h.x) < 5.5 && z > 2.5 && z < GRID_H + 0.5)) continue;
    spots.push([x, z]);
    scene.add(r() < 0.6 ? tree(r, x, z) : bush(r, x, z));
  }
  for (let i = 0; i < 18; i++) scene.add(bush(r, -0.6 - r() * 0.6, 1 + i * 0.85));
  for (let i = 0; i < 12; i++) scene.add(bush(r, 1 + i * 1.8, -0.7 - r() * 0.5));
  out.houses = { west: neighbourHouse(scene, 'west'), east: neighbourHouse(scene, 'east') };
  return out;
}

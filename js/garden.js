// Decorative surroundings: textured grass, fence, street, trees, bushes and lamps.
// Everything sits on the lot edge or outside the walkable grid so it never blocks sims.
import * as THREE from 'three';
import { GRID_W, GRID_H } from './data.js';
import { mat, box } from './models.js';

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
    spots.push([x, z]);
    scene.add(r() < 0.6 ? tree(r, x, z) : bush(r, x, z));
  }
  for (let i = 0; i < 18; i++) scene.add(bush(r, -0.6 - r() * 0.6, 1 + i * 0.85));
  for (let i = 0; i < 12; i++) scene.add(bush(r, 1 + i * 1.8, -0.7 - r() * 0.5));
  return out;
}

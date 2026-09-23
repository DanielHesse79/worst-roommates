// Builds the static-ish lot: ground, floors, pool, walls, doors, furniture.
import * as THREE from 'three';
import { GRID_W, GRID_H, ROOMS, WALLS, POOL } from './data.js';
import { mat, box, floorTexture, buildFurniture } from './models.js';
import { buildGarden } from './garden.js';
import { dressLot } from './decor.js';

export const WALL_H = 2.2;
const THICK = 0.12;
const FLOOR_KIND = { Kitchen: 'tile', 'Living Room': 'wood', Bathroom: 'tile', Bedroom: 'carpet', Den: 'wood' };
const DEFAULT_FACING = { counter: 0, sink: 0, table: 0, couch: Math.PI, toilet: Math.PI, dresser: Math.PI, bookshelf: Math.PI };

export function objCenter(o) {
  const xs = o.cells.map(c => c[0]), zs = o.cells.map(c => c[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2 + 0.5, (Math.min(...zs) + Math.max(...zs)) / 2 + 0.5];
}

// Pale wavy light lines, scrolled over the water each frame.
function causticTexture(rx, rz) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3aa6dc';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(210, 245, 255, 0.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    const y0 = i * 15 + 4;
    for (let x = 0; x <= 128; x += 4) g.lineTo(x, y0 + Math.sin(x / 11 + i * 1.7) * 5 + Math.sin(x / 5 + i) * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, rz);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function facingFor(o) {
  if (!o.use || !o.cells.length) return DEFAULT_FACING[o.type] || 0;
  const [cx, cz] = objCenter(o);
  const a = Math.atan2(o.use[0] + 0.5 - cx, o.use[1] + 0.5 - cz);
  return Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
}

// Unit-height wall geometry with its base at y=0, so scale.y == height.
const wallGeoX = new THREE.BoxGeometry(THICK, 1, 1).translate(0, 0.5, 0);
const wallGeoZ = new THREE.BoxGeometry(1, 1, THICK).translate(0, 0.5, 0);
const postGeo = new THREE.BoxGeometry(THICK + 0.02, 1, THICK + 0.02).translate(0, 0.5, 0);

function wallMesh(axis, at, i, material) {
  const m = new THREE.Mesh(axis === 'x' ? wallGeoX : wallGeoZ, material);
  if (axis === 'x') m.position.set(at, 0, i + 0.5); else m.position.set(i + 0.5, 0, at);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildLot(scene, world) {
  const out = { walls: [], caps: [], doors: new Map(), objects: new Map(), hits: new Map(), lights: [] };
  out.garden = buildGarden(scene);

  for (let z = 11; z < GRID_H; z++) {
    const stone = box(0.8, 0.03, 0.8, 0xb8b0a0, 10.5, 0.015, z + 0.5);
    stone.userData.pick = { kind: 'floor' };
    scene.add(stone);
  }

  for (const r of ROOMS) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const tex = floorTexture(FLOOR_KIND[r.name], r.floor, w, d);
    const floor = box(w, 0.06, d, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), r.x0 + w / 2, 0.03, r.z0 + d / 2);
    floor.castShadow = false;
    floor.userData.pick = { kind: 'floor' };
    scene.add(floor);
    const lamp = new THREE.PointLight(0xffd9a0, 0, 7, 1.6);
    lamp.position.set(r.x0 + w / 2, 2.0, r.z0 + d / 2);
    scene.add(lamp);
    out.lights.push(lamp);
  }

  // pool: coping + water
  const pw = POOL.x1 - POOL.x0, pd = POOL.z1 - POOL.z0;
  const px = POOL.x0 + pw / 2, pz = POOL.z0 + pd / 2;
  const coping = 0xe8e2d4;
  scene.add(box(pw + 0.5, 0.08, 0.25, coping, px, 0.04, POOL.z0 - 0.12));
  scene.add(box(pw + 0.5, 0.08, 0.25, coping, px, 0.04, POOL.z1 + 0.12));
  scene.add(box(0.25, 0.08, pd, coping, POOL.x0 - 0.12, 0.04, pz));
  scene.add(box(0.25, 0.08, pd, coping, POOL.x1 + 0.12, 0.04, pz));
  const water = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.04, pd),
    new THREE.MeshStandardMaterial({ color: 0x5cc4f0, map: causticTexture(pw / 2, pd / 2), emissive: 0x0a3a5a, transparent: true, opacity: 0.82, roughness: 0.15 }));
  scene.add(box(pw, 0.02, pd, 0x1a6a9a, px, 0.0, pz)); // pool floor, seen through the water
  water.position.set(px, 0.02, pz);
  water.userData.pick = { kind: 'pool' };
  scene.add(water);
  out.water = water;

  // walls (one piece per unit edge so doors can be bricked individually)
  const wallMat = mat(0xf3e6d1);
  const brickMat = mat(0xa4513d);
  const posts = new Set();
  const doorAt = new Map(world.doors.map(d => [`${d.axis}:${d.at}:${d.pos}`, d]));
  for (const w of WALLS) {
    for (let i = w.from; i < w.to; i++) {
      if (w.axis === 'x') { posts.add(`${w.at},${i}`); posts.add(`${w.at},${i + 1}`); } else { posts.add(`${i},${w.at}`); posts.add(`${i + 1},${w.at}`); }
      const door = doorAt.get(`${w.axis}:${w.at}:${i}`);
      if (!door) {
        const m = wallMesh(w.axis, w.at, i, wallMat);
        scene.add(m);
        out.walls.push(m);
        continue;
      }
      const brick = wallMesh(w.axis, w.at, i, brickMat);
      brick.visible = false;
      brick.userData.pick = { kind: 'door', id: door.id };
      scene.add(brick);
      out.walls.push(brick);
      const sill = box(w.axis === 'x' ? 0.2 : 0.9, 0.03, w.axis === 'x' ? 0.9 : 0.2, 0x5a3a1e, brick.position.x, 0.07, brick.position.z);
      scene.add(sill);
      const lintel = box(w.axis === 'x' ? THICK : 1, 0.25, w.axis === 'x' ? 1 : THICK, 0xd8cbb3, brick.position.x, WALL_H - 0.125, brick.position.z);
      scene.add(lintel);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(w.axis === 'x' ? 0.4 : 0.9, 1.6, w.axis === 'x' ? 0.9 : 0.4),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      pick.position.set(brick.position.x, 0.8, brick.position.z);
      pick.userData.pick = { kind: 'door', id: door.id };
      scene.add(pick);
      out.doors.set(door.id, { brick, sill, lintel });
    }
  }
  for (const p of posts) {
    const [x, z] = p.split(',').map(Number);
    const m = new THREE.Mesh(postGeo, wallMat);
    m.position.set(x, 0, z);
    m.castShadow = true;
    scene.add(m);
    out.walls.push(m);
  }

  // Dark caps that ride on top of each wall piece, so cut-away walls read clearly from above.
  const capMat = mat(0x5e7470);
  for (const wall of out.walls) {
    const p = wall.geometry.parameters;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(p.width + 0.02, 0.05, p.depth + 0.02), capMat);
    cap.position.set(wall.position.x, 0, wall.position.z);
    scene.add(cap);
    out.caps.push({ cap, wall });
  }

  // Invisible hit boxes over each object's whole footprint, so thin things (telescope, ladder) are easy to click.
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  for (const o of world.objects.values()) {
    const g = buildFurniture(o, o.type === 'ladder' ? 0 : facingFor(o));
    let hit;
    if (o.type === 'ladder') {
      g.position.set(POOL.x0 + 0.1, 0, o.entry[1] + 0.5);
      hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.9), hitMat);
      hit.position.set(POOL.x0, 0.55, o.entry[1] + 0.5);
    } else {
      const [cx, cz] = objCenter(o);
      g.position.set(cx, 0.06, cz);
      const xs = o.cells.map(c => c[0]), zs = o.cells.map(c => c[1]);
      const w = Math.max(...xs) - Math.min(...xs) + 1, d = Math.max(...zs) - Math.min(...zs) + 1;
      hit = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 1.1, d * 0.92), hitMat);
      hit.position.set(cx, 0.55, cz);
    }
    hit.userData.pick = { kind: 'object', id: o.id };
    scene.add(g, hit);
    out.objects.set(o.id, g);
    out.hits.set(o.id, hit);
  }
  dressLot(scene, out);
  return out;
}

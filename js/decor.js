// Visual-only set dressing; never changes the walkable grid or furniture hit boxes.
import * as THREE from 'three';
import { box, mat } from './models.js';

function fabric(width, depth, color, accent, x, z) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = accent; ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 232, 232); ctx.strokeRect(21, 21, 214, 214);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.ellipse(128, 128, 32 + i * 20, 45 + i * 22, 0, 0, Math.PI * 2); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const rug = box(width, 0.014, depth, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), x, 0.075, z);
  rug.castShadow = false;
  return rug;
}

function plant(x, y, z, color = 0xd99171) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.22, 10), mat(color));
  pot.position.y = 0.11; g.add(pot);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), mat(i % 2 ? 0x729673 : 0x3b735e));
    const a = i * Math.PI * 2 / 5;
    leaf.scale.set(0.55, 2.4, 0.65);
    leaf.position.set(Math.sin(a) * 0.1, 0.34, Math.cos(a) * 0.1);
    leaf.rotation.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    g.add(leaf);
  }
  g.position.set(x, y, z);
  return g;
}

function doormat() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8a57d'; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#57473d'; ctx.lineWidth = 9; ctx.strokeRect(14, 14, 484, 228);
  ctx.fillStyle = '#392b29'; ctx.textAlign = 'center';
  ctx.font = 'bold 62px Georgia'; ctx.fillText('LIVE. LAUGH.', 256, 110);
  ctx.font = 'bold 54px Georgia'; ctx.fillText('LEAVE.', 256, 185);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = box(1.5, 0.025, 0.8, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), 10.5, 0.045, 11.6);
  m.castShadow = false;
  return m;
}

export function dressLot(scene, lot) {
  scene.add(fabric(3.5, 2.6, '#477d78', '#deca99', 10.2, 3.3));
  scene.add(fabric(2.2, 3, '#b9767e', '#eed4b2', 4, 8.1));
  scene.add(fabric(2.7, 1.6, '#d9b676', '#65567b', 10.3, 8.2));
  scene.add(fabric(1.4, 0.65, '#7bb2b6', '#e9ece0', 14.6, 2.75));
  scene.add(doormat());
  // Small props sit on existing furniture, so sims never walk through new obstacles.
  lot.objects.get('counter1')?.add(plant(-0.22, 0.92, 0));
  lot.objects.get('dresser')?.add(plant(0.12, 1, 0));
  const table = lot.objects.get('table');
  if (table) {
    for (const x of [-0.55, 0.55]) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.018, 18), mat(0xf4e4c7));
      plate.position.set(x, 0.84, 0.08); table.add(plate);
      table.add(box(0.09, 0.14, 0.09, 0xc67868, x, 0.91, -0.2));
    }
    table.add(plant(0, 0.84, -0.08, 0xe8d3a7));
  }
  // Welcoming fairy lights. The tenancy agreement is less welcoming.
  const cable = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 25 }, (_, i) => {
    const t = i / 24;
    return new THREE.Vector3(16.4 + t * 5, 2.1 - Math.sin(t * Math.PI) * 0.5, 9.2);
  }));
  scene.add(new THREE.Line(cable, new THREE.LineBasicMaterial({ color: 0x443c43 })));
  for (const x of [16.4, 21.4]) scene.add(box(0.07, 2.2, 0.07, 0x635347, x, 1.1, 9.2));
  lot.fairyBulbs = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 6), mat(i % 2 ? 0xffd3a2 : 0xfff0cd,
      { emissive: 0xffb35b, emissiveIntensity: 1, unique: true }));
    bulb.position.set(16.4 + t * 5, 2.03 - Math.sin(t * Math.PI) * 0.5, 9.2);
    scene.add(bulb); lot.fairyBulbs.push(bulb);
  }
}

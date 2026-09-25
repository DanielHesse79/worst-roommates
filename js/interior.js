// The inside of the house: wallpaper for every room (siding outside), paintings at eye height, and the
// ceilings and hanging lamps you only see in first person. Visual only, like decor.js: nothing here
// changes the walkable grid, furniture or what can be clicked.
import * as THREE from 'three';
import { ROOMS } from './data.js';
import { box, mat } from './models.js';

const THICK = 0.12;          // wall thickness (see lot.js)
const PX = 128;              // canvas pixels per metre along a wall
const H_PX = 282;            // canvas pixels for the 2.2 m wall height

const roomAt = (x, z) => ROOMS.find(r => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) || null;

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- wallpaper ----------

// y in canvas pixels, measured up from the floor.
const up = y => H_PX - y;
function skirting(g, color) { g.fillStyle = color; g.fillRect(0, up(14), PX, 14); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, up(15), PX, 1); }
function tiles(g, from, to, size, face, grout) {
  g.fillStyle = grout; g.fillRect(0, up(to), PX, to - from);
  for (let y = from; y < to; y += size) for (let x = 0; x < PX; x += size) { g.fillStyle = face; g.fillRect(x + 1, up(Math.min(to, y + size)) + 1, size - 2, Math.min(size, to - y) - 2); }
}
// Draws a motif so that it wraps around the panel edge, keeping neighbouring panels seamless.
function wrapped(g, x, draw) { for (const dx of [-PX, 0, PX]) if (x + dx > -30 && x + dx < PX + 30) draw(x + dx); }

const PAPER = {
  // Retro kitchen: white tiles to counter height, mint paint above.
  Kitchen: g => {
    g.fillStyle = '#cfe5d3'; g.fillRect(0, 0, PX, H_PX);
    for (let y = 150; y < H_PX; y += 26) for (let x = 8; x < PX; x += 32) { g.fillStyle = 'rgba(80,130,100,0.18)'; g.fillRect(x, up(y), 4, 4); }
    tiles(g, 0, 128, 16, '#f6f3ec', '#c8c2b6');
    g.fillStyle = '#8fb59b'; g.fillRect(0, up(131), PX, 3);
  },
  // Living room: teal stripes with a thin gold line.
  'Living Room': g => {
    for (let x = 0; x < PX; x += 32) { g.fillStyle = '#3f6c68'; g.fillRect(x, 0, 16, H_PX); g.fillStyle = '#497b76'; g.fillRect(x + 16, 0, 16, H_PX); g.fillStyle = '#c9a966'; g.fillRect(x + 15, 0, 1.5, H_PX); }
    skirting(g, '#4a3222');
  },
  // Bathroom: pale blue tiles most of the way up.
  Bathroom: g => {
    g.fillStyle = '#e6f1f4'; g.fillRect(0, 0, PX, H_PX);
    tiles(g, 0, 190, 21, '#cfe5ee', '#9dbac5');
  },
  // Bedroom: a floral paper that was a bold choice in 1974.
  Bedroom: g => {
    g.fillStyle = '#b9a5cb'; g.fillRect(0, 0, PX, H_PX);
    for (let row = 0; row < 12; row++) {
      for (const col of [0, 1, 2]) {
        const x = col * 43 + (row % 2 ? 21 : 0), y = 26 + row * 22;
        wrapped(g, x, cx => {
          g.fillStyle = row % 3 ? '#f2c9d6' : '#fff1d8';
          for (let p = 0; p < 5; p++) { const a = p * Math.PI * 2 / 5; g.beginPath(); g.arc(cx + Math.cos(a) * 4, up(y) + Math.sin(a) * 4, 3.2, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = '#d9a441'; g.beginPath(); g.arc(cx, up(y), 2, 0, Math.PI * 2); g.fill();
        });
      }
    }
    skirting(g, '#efe7da');
  },
  // Den: dark green with a diamond pattern over wooden wainscoting.
  Den: g => {
    g.fillStyle = '#2f4a3c'; g.fillRect(0, 0, PX, H_PX);
    g.strokeStyle = '#3d5e4b'; g.lineWidth = 2;
    for (let y = 120; y < H_PX + 32; y += 32) for (let x = 0; x <= PX; x += 32) { g.beginPath(); g.moveTo(x, up(y)); g.lineTo(x + 16, up(y + 16)); g.lineTo(x, up(y + 32)); g.lineTo(x - 16, up(y + 16)); g.closePath(); g.stroke(); }
    g.fillStyle = '#7b5437'; g.fillRect(0, up(115), PX, 115);
    g.strokeStyle = '#5e3e28'; g.lineWidth = 2;
    for (const x of [6, 70]) g.strokeRect(x, up(100), 52, 80);
    g.fillStyle = '#9a6b45'; g.fillRect(0, up(118), PX, 6);
  },
  // The outside: painted weatherboards.
  outside: g => {
    g.fillStyle = '#ece0c6'; g.fillRect(0, 0, PX, H_PX);
    for (let y = 0; y < H_PX; y += 22) { g.fillStyle = '#cdbd9d'; g.fillRect(0, up(y) - 2, PX, 2); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, up(y) - 4, PX, 1); }
  },
};
const paperMats = new Map();
function paper(kind) {
  if (!paperMats.has(kind)) paperMats.set(kind, new THREE.MeshStandardMaterial({ map: canvas(PX, H_PX, PAPER[kind]), roughness: 0.92 }));
  return paperMats.get(kind);
}

// A panel of wallpaper on one face of a wall piece. It's a child of the wall, so it rises and falls
// with the cut-away walls.
const panelGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
function hang(wall, axis, side, material) {
  const m = new THREE.Mesh(panelGeo, material);
  const off = side * (THICK / 2 + 0.003);
  if (axis === 'x') { m.position.x = off; m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; } else { m.position.z = off; m.rotation.y = side > 0 ? 0 : Math.PI; }
  m.receiveShadow = true;
  m.raycast = () => {};
  wall.add(m);
}

// ---------- paintings ----------

function frameArt(w, h, draw) { return canvas(Math.round(w * 320), Math.round(h * 320), draw); }
const ART = {
  landlord: (g, w, h) => {
    g.fillStyle = '#2b2024'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3140'; g.beginPath(); g.moveTo(w * 0.2, h); g.quadraticCurveTo(w / 2, h * 0.55, w * 0.8, h); g.fill();
    g.fillStyle = '#e2b996'; g.beginPath(); g.ellipse(w / 2, h * 0.42, w * 0.17, h * 0.23, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2b1a14'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(w * 0.4, h * 0.34); g.lineTo(w * 0.47, h * 0.37); g.moveTo(w * 0.6, h * 0.34); g.lineTo(w * 0.53, h * 0.37); g.stroke();
    g.fillStyle = '#2b1a14'; g.fillRect(w * 0.43, h * 0.5, w * 0.14, 5);
    g.fillStyle = '#c9a966'; g.font = `bold ${Math.round(h * 0.07)}px Georgia`; g.textAlign = 'center'; g.fillText('THE LANDLORD', w / 2, h * 0.93);
  },
  clown: (g, w, h) => {
    g.fillStyle = '#5d6f8f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5f0ea'; g.beginPath(); g.ellipse(w / 2, h * 0.5, w * 0.24, h * 0.32, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d93b3b'; g.beginPath(); g.arc(w / 2, h * 0.52, w * 0.05, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#333'; g.lineWidth = 4; g.beginPath(); g.arc(w / 2, h * 0.72, w * 0.1, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.fillStyle = '#333'; for (const x of [0.42, 0.58]) { g.beginPath(); g.arc(w * x, h * 0.42, 5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#7cc0ea'; g.beginPath(); g.ellipse(w * 0.6, h * 0.5, 4, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e0772f'; for (const x of [0.28, 0.72]) { g.beginPath(); g.arc(w * x, h * 0.28, w * 0.08, 0, Math.PI * 2); g.fill(); }
  },
  ship: (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#39404d'); sky.addColorStop(1, '#6d7684'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff7a8'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.78, 0); g.lineTo(w * 0.7, h * 0.25); g.lineTo(w * 0.76, h * 0.25); g.lineTo(w * 0.66, h * 0.5); g.stroke();
    g.save(); g.translate(w * 0.42, h * 0.58); g.rotate(-0.35);
    g.fillStyle = '#5a3a22'; g.fillRect(-w * 0.16, 0, w * 0.32, h * 0.08);
    g.fillStyle = '#efe8d8'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -h * 0.3); g.lineTo(w * 0.14, 0); g.fill();
    g.restore();
    g.fillStyle = '#20455a';
    for (let x = -20; x < w + 20; x += 30) { g.beginPath(); g.arc(x, h * 0.72, 22, Math.PI, 0); g.fill(); }
    g.fillRect(0, h * 0.72, w, h);
  },
  sunset: (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#5b3b73'); sky.addColorStop(0.6, '#f08a4b'); sky.addColorStop(1, '#f7c96a'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe28a'; g.beginPath(); g.arc(w * 0.5, h * 0.7, w * 0.14, Math.PI, 0); g.fill();
    g.fillStyle = '#3f2a3f'; g.beginPath(); g.moveTo(0, h); g.quadraticCurveTo(w * 0.3, h * 0.55, w * 0.6, h * 0.8); g.quadraticCurveTo(w * 0.8, h * 0.62, w, h * 0.75); g.lineTo(w, h); g.fill();
  },
  flowers: (g, w, h) => {
    g.fillStyle = '#e8dcc5'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6b8aa6'; g.beginPath(); g.moveTo(w * 0.4, h * 0.95); g.lineTo(w * 0.6, h * 0.95); g.lineTo(w * 0.58, h * 0.6); g.lineTo(w * 0.42, h * 0.6); g.fill();
    g.strokeStyle = '#6b5a36'; g.lineWidth = 3;
    for (const [dx, dy] of [[-0.18, 0.3], [0.02, 0.18], [0.2, 0.34]]) {
      g.beginPath(); g.moveTo(w * 0.5, h * 0.6); g.quadraticCurveTo(w * (0.5 + dx), h * dy, w * (0.5 + dx * 1.3), h * (dy + 0.15)); g.stroke();
      g.fillStyle = '#7d5b3c'; g.beginPath(); g.arc(w * (0.5 + dx * 1.3), h * (dy + 0.17), 8, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#7d5b3c'; for (const x of [0.3, 0.66, 0.72]) g.fillRect(w * x, h * 0.93, 6, 3);
  },
  deposit: (g, w, h) => {
    g.fillStyle = '#f3efe4'; g.fillRect(0, 0, w, h);
    const blocks = [[0, 0, 0.45, 0.55, '#d8322b'], [0.5, 0, 0.5, 0.3, '#f3efe4'], [0.5, 0.35, 0.22, 0.35, '#2f55a4'], [0, 0.6, 0.3, 0.4, '#f1c93b'], [0.77, 0.75, 0.23, 0.25, '#1d1d1d']];
    for (const [x, y, bw, bh, c] of blocks) { g.fillStyle = c; g.fillRect(w * x, h * y, w * bw, h * bh); }
    g.fillStyle = '#1d1d1d'; for (const x of [0.46, 0.73]) g.fillRect(w * x, 0, 6, h); for (const y of [0.56, 0.32, 0.72]) g.fillRect(0, h * y, w, 6);
    g.font = `italic ${Math.round(h * 0.075)}px Georgia`; g.textAlign = 'right'; g.fillText('"Deposit" (partially returned)', w * 0.97, h * 0.96);
  },
  dogs: (g, w, h) => {
    g.fillStyle = '#3a2a22'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f7a4a'; g.beginPath(); g.ellipse(w / 2, h * 0.78, w * 0.45, h * 0.2, 0, 0, Math.PI * 2); g.fill();
    for (const [x, c] of [[0.22, '#9b6b3e'], [0.5, '#d9c7a4'], [0.78, '#5a4432']]) {
      g.fillStyle = c; g.beginPath(); g.arc(w * x, h * 0.42, w * 0.1, 0, Math.PI * 2); g.fill();
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(w * x + s * w * 0.09, h * 0.4, w * 0.035, h * 0.1, s * 0.3, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#111'; for (const s of [-1, 1]) { g.beginPath(); g.arc(w * x + s * w * 0.035, h * 0.4, 3.5, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.arc(w * x, h * 0.47, 5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#fff'; for (const x of [0.3, 0.46, 0.62]) g.fillRect(w * x, h * 0.72, w * 0.07, h * 0.1);
  },
  family: (g, w, h) => {
    g.fillStyle = '#c8b28a'; g.fillRect(0, 0, w, h);
    const people = [[0.2, 0.5, '#6a3d3d'], [0.4, 0.45, '#3d4f6a'], [0.6, 0.47, '#4a6a3d'], [0.8, 0.52, '#6a5a3d']];
    for (const [x, y, c] of people) {
      g.fillStyle = c; g.fillRect(w * x - w * 0.07, h * y + h * 0.1, w * 0.14, h * 0.45);
      g.fillStyle = '#e7c3a0'; g.beginPath(); g.arc(w * x, h * y, w * 0.06, 0, Math.PI * 2); g.fill();
    }
    // Somebody fell out with somebody.
    g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath();
    for (let i = 0; i < 14; i++) g.lineTo(w * 0.6 + Math.sin(i * 2.1) * w * 0.05, h * 0.47 + Math.cos(i * 1.7) * h * 0.06);
    g.stroke();
  },
  sampler: text => (g, w, h) => {
    g.fillStyle = '#f4ecdc'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b8505a'; g.lineWidth = 2;
    for (let x = 8; x < w - 8; x += 12) for (const y of [8, h - 16]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 7, y + 7); g.moveTo(x + 7, y); g.lineTo(x, y + 7); g.stroke(); }
    g.fillStyle = '#4a5e8a'; g.textAlign = 'center'; g.font = `bold ${Math.round(h * 0.2)}px Georgia`;
    const lines = text.split('|');
    lines.forEach((line, i) => {
      const y = h / 2 + (i - (lines.length - 1) / 2) * h * 0.24 + h * 0.07;
      if (line.startsWith('~')) { g.fillText(line.slice(1), w / 2, y); const tw = g.measureText(line.slice(1)).width; g.fillStyle = '#b8505a'; g.fillRect(w / 2 - tw / 2, y - h * 0.07, tw, 4); g.fillStyle = '#4a5e8a'; }
      else g.fillText(line, w / 2, y);
    });
  },
};

// Where the paintings hang: which wall piece, which side faces the room, and what's on it.
const PAINTINGS = [
  { axis: 'z', at: 1, i: 5, side: 1, w: 0.62, h: 0.46, art: ART.sampler('BLESS THIS|MESS'), frame: 0x8a5a3a },
  { axis: 'x', at: 7, i: 5, side: -1, w: 0.8, h: 0.55, art: ART.sunset, frame: 0x3a2a22 },
  { axis: 'x', at: 13, i: 2, side: -1, w: 0.6, h: 0.78, art: ART.landlord, frame: 0xc9a54a },
  { axis: 'x', at: 7, i: 4, side: 1, w: 0.52, h: 0.66, art: ART.clown, frame: 0x6a4a8a },
  { axis: 'z', at: 6, i: 8, side: -1, w: 0.9, h: 0.6, art: ART.ship, frame: 0x5a3a22 },
  { axis: 'x', at: 13, i: 4, side: 1, w: 0.5, h: 0.4, art: ART.sampler('PLEASE JIGGLE|THE HANDLE'), frame: 0xf2f2f2 },
  { axis: 'x', at: 1, i: 8, side: 1, w: 0.6, h: 0.72, art: ART.flowers, frame: 0xd9c38a },
  { axis: 'z', at: 11, i: 3, side: -1, w: 0.66, h: 0.5, art: ART.sampler('HOME SWEET|~HOME|ALIBI'), frame: 0x8a5a3a },
  { axis: 'z', at: 6, i: 12, side: 1, w: 0.85, h: 0.6, art: ART.deposit, frame: 0x1d1d1d },
  { axis: 'x', at: 16, i: 10, side: -1, w: 0.85, h: 0.6, art: ART.dogs, frame: 0x6a4a2a },
  { axis: 'z', at: 11, i: 13, side: -1, w: 0.75, h: 0.55, art: ART.family, frame: 0xc9a54a },
];

function painting({ axis, at, i, side, w, h, art, frame }) {
  const g = new THREE.Group();
  const f = box(w + 0.08, h + 0.08, 0.035, frame);
  f.castShadow = false;
  g.add(f);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: frameArt(w, h, art), roughness: 0.7 }));
  pic.position.z = 0.019;
  g.add(pic);
  const off = side * (THICK / 2 + 0.02);
  if (axis === 'x') { g.position.set(at + off, 1.5, i + 0.5); g.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; } else { g.position.set(i + 0.5, 1.5, at + off); g.rotation.y = side > 0 ? 0 : Math.PI; }
  g.traverse(o => { o.raycast = () => {}; });
  return g;
}

// ---------- ceilings and lamps (first person only) ----------

function plaster(stain) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#f2ede3'; g.fillRect(0, 0, w, h);
    for (let n = 0; n < 900; n++) { g.fillStyle = `rgba(120,110,95,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    if (stain) {
      // The bathroom ceiling has seen things. The flat upstairs does not exist, and yet.
      const r = g.createRadialGradient(w * 0.6, h * 0.4, 10, w * 0.6, h * 0.4, 70);
      r.addColorStop(0, 'rgba(150,110,60,0.35)'); r.addColorStop(0.8, 'rgba(150,110,60,0.18)'); r.addColorStop(1, 'rgba(150,110,60,0)');
      g.fillStyle = r; g.beginPath(); g.arc(w * 0.6, h * 0.4, 70, 0, Math.PI * 2); g.fill();
    }
  });
}

// Each room's lamp says something about who picked it.
function lamp(room, bulbMat) {
  const g = new THREE.Group();
  const drop = room === 'Den' ? 0.55 : 0.42;
  g.add(box(0.012, drop, 0.012, 0x222222, 0, -drop / 2, 0));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bulbMat);
  bulb.position.y = -drop - 0.05;
  g.add(bulb);
  if (room === 'Kitchen') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x2f5a45, { side: THREE.DoubleSide }));
    dome.position.y = -drop + 0.02; g.add(dome);
  } else if (room === 'Living Room') {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.24, 20, 1, true), mat(0xf1e2c2, { side: THREE.DoubleSide }));
    drum.position.y = -drop - 0.02; g.add(drum);
  } else if (room === 'Bathroom') {
    bulb.scale.setScalar(2.2);
  } else if (room === 'Bedroom') {
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.26, 0.22, 16, 1, true), mat(0xe58fb0, { side: THREE.DoubleSide }));
    shade.position.y = -drop - 0.02; g.add(shade);
    for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; g.add(box(0.015, 0.08, 0.015, 0xf5d36b, Math.cos(a) * 0.25, -drop - 0.17, Math.sin(a) * 0.25)); }
  }
  // The den gets a bare bulb. Landlord special.
  g.traverse(o => { o.castShadow = false; o.raycast = () => {}; });
  return g;
}

export function decorateInterior(scene, lot, pieces, wallH) {
  paperMats.clear(); // a new game disposes the old house's textures
  // Wallpaper on both faces of every wall piece: the room on each side, or siding outside.
  for (const { wall, axis, at, i } of pieces) {
    for (const side of [-1, 1]) {
      const [x, z] = axis === 'x' ? [side > 0 ? at : at - 1, i] : [i, side > 0 ? at : at - 1];
      const room = roomAt(x, z);
      hang(wall, axis, side, paper(room ? room.name : 'outside'));
    }
  }
  lot.paintings = PAINTINGS.map(p => { const g = painting(p); scene.add(g); return g; });
  lot.ceiling = [];
  lot.lampBulbs = [];
  for (const r of ROOMS) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    // Lit from below by nothing much, a ceiling would look dark: it glows faintly instead.
    const tex = plaster(r.name === 'Bathroom');
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 1, side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(r.x0 + w / 2, wallH - 0.002, r.z0 + d / 2);
    ceil.raycast = () => {};
    ceil.visible = false;
    scene.add(ceil);
    lot.ceiling.push(ceil);
    const bulbMat = mat(0xfff4d6, { emissive: 0xffd9a0, emissiveIntensity: 0.2, unique: true });
    const l = lamp(r.name, bulbMat);
    l.position.set(r.x0 + w / 2, wallH, r.z0 + d / 2);
    l.visible = false;
    scene.add(l);
    lot.ceiling.push(l);
    lot.lampBulbs.push(bulbMat);
  }
}

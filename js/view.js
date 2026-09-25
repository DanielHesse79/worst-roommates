import * as THREE from 'three';
import { GRID_W, GRID_H } from './data.js';
import { buildLot, objCenter, WALL_H } from './lot.js';
import { mat, fireCluster, tombstoneMesh, reaperMesh, meteorMesh, simModel, slipperMesh, disposeTree } from './models.js';
import { Effects } from './effects.js';
import { canPlaceFloorTrap, FLOOR_TRAPS } from './traps.js';
import { Street } from './street.js';
import { SpeechView } from './speech-view.js';

const CUT_H = 0.55;
const CAM_KEY = 'worst-roommates-camera';
// Isometric (the classic view), a free 3D perspective, or a perspective that follows your character.
export const CAM_MODES = { iso: { icon: '📐', name: 'Isometric' }, persp: { icon: '🎥', name: '3D' }, follow: { icon: '🎬', name: 'Follow' } };
const PERSP_DIST = 32;             // camera distance at zoom 1 in the perspective modes
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const CHARRED = mat(0x1d1714);
const lerpAngle = (a, b, t) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * t;

export class View {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9fc5e8, 50, 100);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.persp = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    // Target sits right of the lot centre so the house isn't hidden behind the right-hand sidebar.
    this.cam = { target: new THREE.Vector3(GRID_W / 2 + 2, 0, GRID_H / 2 - 1), angle: Math.PI / 4, goal: Math.PI / 4, zoom: 1.0, pitch: 0.8 };
    let mode = null;
    try { mode = localStorage.getItem(CAM_KEY); } catch { /* default view */ }
    this.setCameraMode(CAM_MODES[mode] ? mode : 'iso');
    this.projectiles = [];
    this.keys = new Set();
    this.wallsUp = false;
    this.roofOn = false;
    this.wallH = CUT_H;
    this.simModels = new Map();
    this.tombs = new Map();
    this.fires = new Map();
    this.reapers = [];
    this.meteorViz = new Map();
    this.labels = new Map();
    this.popups = [];
    this.comicCooldown = 0;
    this.overlay = document.getElementById('overlay');
    this.raycaster = new THREE.Raycaster();

    this.hemi = new THREE.HemisphereLight(0xd9e9ff, 0x88727a, 1.1);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    this.sun.position.set(GRID_W / 2 - 10, 22, GRID_H / 2 + 6);
    this.sun.target.position.copy(this.cam.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0xd4d6ff, 0.5);
    this.fill.position.set(26, 12, -10);
    this.scene.add(this.fill);

    this.lot = buildLot(this.scene, game.world);
    this.fx = new Effects(this.scene, game);
    this.street = new Street(this.scene, game, this);
    this.speech = new SpeechView(this);
    this.bindControls();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  reset() {
    disposeTree(this.scene);
    this.scene.clear();
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill);
    this.lot = buildLot(this.scene, this.game.world);
    this.fx.clear();
    this.street.clear();
    this.simModels.clear();
    this.tombs.clear();
    this.fires.clear();
    this.meteorViz.clear();
    this.reapers = [];
    for (const el of this.labels.values()) el.remove();
    this.labels.clear();
    for (const p of this.popups) p.el.remove();
    this.popups = [];
    this.speech.clear();
    this.comicCooldown = 0;
    this.projectiles = [];
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
  }

  // ---------- controls ----------

  bindControls() {
    const c = this.canvas;
    let down = null;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, button: e.button, orbit: e.button === 2 || e.shiftKey, moved: false }; });
    window.addEventListener('pointermove', e => {
      this.hover = { x: e.clientX, y: e.clientY, onCanvas: e.target === c };
      if (!down) return;
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) down.moved = true;
      if (down.moved && down.orbit) this.orbit(dx, dy);
      else if (down.moved) this.panPixels(dx, dy);
      down.lx = e.clientX; down.ly = e.clientY;
    });
    window.addEventListener('pointerup', e => {
      if (down && !down.moved && down.button === 0 && e.target === c) this.game.ui.onWorldClick(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
      down = null;
    });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.cam.zoom = Math.max(0.5, Math.min(3, this.cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'q') this.cam.goal += Math.PI / 2;
      if (k === 'e') this.cam.goal -= Math.PI / 2;
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
  }

  // How much ground one screen pixel covers at the point the camera looks at.
  worldPerPixel() {
    if (this.camMode === 'iso') return (this.viewSize() * 2) / this.canvas.clientHeight;
    return (2 * (PERSP_DIST / this.cam.zoom) * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2))) / this.canvas.clientHeight;
  }
  viewSize() { return 9 / this.cam.zoom; }
  // Screen-up covers more ground than screen-across, depending on how steeply the camera looks down.
  depthScale() { return this.camMode === 'iso' ? 1.4 : 1 / Math.sin(this.cam.pitch); }

  panPixels(dx, dy) {
    // Grabbing the view means you want to look somewhere else: stop following.
    if (this.camMode === 'follow') { this.setCameraMode('persp'); this.game.ui.refresh(); }
    const s = this.worldPerPixel(), a = this.cam.angle;
    const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const fwd = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
    this.cam.target.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s * this.depthScale());
    this.clampTarget();
  }

  // Turn the view freely; in the perspective modes, tilt it too.
  orbit(dx, dy) {
    this.cam.angle -= dx * 0.008;
    this.cam.goal = this.cam.angle;
    if (this.camMode !== 'iso') this.cam.pitch = clamp(this.cam.pitch + dy * 0.006, 0.22, 1.4);
  }

  setCameraMode(mode) {
    this.camMode = mode;
    this.camera = mode === 'iso' ? this.ortho : this.persp;
    if (mode === 'follow') { this.cam.zoom = Math.max(this.cam.zoom, 1.7); this.cam.pitch = 0.55; }
    else if (mode === 'persp') this.cam.pitch = clamp(this.cam.pitch, 0.6, 1.1);
    try { localStorage.setItem(CAM_KEY, mode); } catch { /* this session only */ }
  }

  cycleCamera() {
    const modes = Object.keys(CAM_MODES);
    this.setCameraMode(modes[(modes.indexOf(this.camMode) + 1) % modes.length]);
  }

  clampTarget() {
    const t = this.cam.target;
    t.x = Math.max(-2, Math.min(GRID_W + 2, t.x));
    t.z = Math.max(-2, Math.min(GRID_H + 2, t.z));
  }

  updateCamera(dt) {
    const k = this.keys, sp = 12 * dt / this.cam.zoom;
    let px = 0, pz = 0;
    if (k.has('w') || k.has('arrowup')) pz -= 1;
    if (k.has('s') || k.has('arrowdown')) pz += 1;
    if (k.has('a') || k.has('arrowleft')) px -= 1;
    if (k.has('d') || k.has('arrowright')) px += 1;
    if (px || pz) this.panPixels(-px * sp / this.worldPerPixel(), -pz * sp / this.worldPerPixel() / this.depthScale());
    this.cam.angle += (this.cam.goal - this.cam.angle) * (1 - Math.exp(-dt * 8));
    const a = this.cam.angle, t = this.cam.target;
    if (this.camMode === 'follow') {
      const p = this.game.player;
      if (p && p.alive && !p.status.away) {
        const k = 1 - Math.exp(-dt * 4);
        t.x += (p.x - t.x) * k;
        t.z += (p.z - t.z) * k;
      }
    }
    if (this.camMode === 'iso') {
      this.camera.position.set(t.x + Math.sin(a) * 30, t.y + 26, t.z + Math.cos(a) * 30);
    } else {
      const d = PERSP_DIST / this.cam.zoom, p = this.cam.pitch;
      this.camera.position.set(t.x + Math.sin(a) * Math.cos(p) * d, t.y + Math.sin(p) * d, t.z + Math.cos(a) * Math.cos(p) * d);
    }
    this.camera.lookAt(t);
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.8;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.8;
    }
    if (this.camMode === 'iso') {
      const h = this.viewSize();
      Object.assign(this.camera, { left: -h * this.aspect, right: h * this.aspect, top: h, bottom: -h });
    } else {
      this.camera.aspect = this.aspect;
    }
    this.camera.updateProjectionMatrix();
  }

  // ---------- thrown things ----------

  // A slipper in flight: a spinning arc from the thrower's hand to the target's head (or past them, if
  // they duck), then left lying on the floor until it's fetched back at `backAt` (game minutes).
  throwSlipper(from, to, { miss = false, backAt = null } = {}) {
    const start = new THREE.Vector3(from.x, 1.05, from.z);
    const end = new THREE.Vector3(to.x, 1.2, to.z);
    if (miss) end.addScaledVector(end.clone().sub(start).setY(0).normalize(), 1.6).setY(0.3);
    const mesh = slipperMesh();
    mesh.position.copy(start);
    this.scene.add(mesh);
    const dist = start.distanceTo(end);
    this.projectiles.push({ mesh, start, end, t: 0, dur: 0.22 + dist * 0.05, arc: 0.35 + dist * 0.12, backAt, landed: false });
  }

  syncProjectiles(dt) {
    this.projectiles = this.projectiles.filter(p => {
      if (!p.landed) {
        p.t = Math.min(1, p.t + dt / p.dur);
        p.mesh.position.lerpVectors(p.start, p.end, p.t);
        p.mesh.position.y += Math.sin(Math.PI * p.t) * p.arc;
        p.mesh.rotation.x += dt * 16;
        p.mesh.rotation.y += dt * 5;
        if (p.t < 1) return true;
        // Thwack, and down it drops.
        p.landed = true;
        this.burst(p.end.x, p.end.z, 'dust');
        p.mesh.position.set(p.end.x + (Math.random() - 0.5) * 0.5, 0.03, p.end.z + (Math.random() - 0.5) * 0.5);
        p.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
        return true;
      }
      if (p.backAt !== null && this.game.clock < p.backAt) return true;
      this.scene.remove(p.mesh);
      disposeTree(p.mesh);
      return false;
    });
  }

  // ---------- picking ----------

  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const g = this.game;
    for (const hit of this.raycaster.intersectObjects(this.scene.children, true)) {
      let o = hit.object, hidden = false;
      for (let p = o; p; p = p.parent) if (!p.visible) hidden = true;
      if (hidden || !o.userData.pick) continue;
      const p = o.userData.pick;
      if (p.kind === 'object') return { kind: 'object', obj: g.world.objects.get(p.id) };
      if (p.kind === 'sim') { const sim = g.sims.find(s => s.id === p.id); if (sim && sim.alive) return { kind: 'sim', sim }; continue; }
      if (p.kind === 'tomb') return { kind: 'tomb', tomb: g.world.tombstones.find(t => t.id === p.id) };
      if (p.kind === 'door') return { kind: 'door', door: g.world.doors.find(d => d.id === p.id) };
      if (p.kind === 'pool') return { kind: 'pool' };
      if (p.kind === 'visitor') return g.visit ? { kind: 'visitor' } : null;
      if (p.kind === 'house') return { kind: 'house', side: p.side };
      if (p.kind === 'mess') { const mess = g.world.mess.get(p.key); if (mess) return { kind: 'mess', mess }; continue; }
      if (p.kind === 'car') { const car = this.street.cars.find(c => c.id === p.id); if (car && !car.crash) return { kind: 'car', car }; continue; }
      if (p.kind === 'responder') { const person = g.responders.find(r => r.id === p.id); if (person) return { kind: 'responder', person }; continue; }
      const cx = Math.floor(hit.point.x), cz = Math.floor(hit.point.z);
      if (g.world.inPool(cx, cz)) return { kind: 'pool' };
      if (g.world.inBounds(cx, cz)) return { kind: 'floor', cell: [cx, cz] };
      return null;
    }
    return null;
  }

  // ---------- per-frame sync ----------

  render(dt, time) {
    const g = this.game;
    this.comicCooldown = Math.max(0, this.comicCooldown - dt);
    this.updateCamera(dt);
    this.updateDaylight();
    this.syncWalls(dt);
    this.syncObjects(time);
    this.syncFire(time);
    this.syncTombs();
    this.syncSims(dt, time);
    this.syncReapers(dt);
    this.syncMeteors();
    this.fx.update(dt, time);
    this.syncProjectiles(dt);
    this.street.update(dt, time);
    this.syncNeighbours();
    this.syncHover(time);
    this.lot.water.material.emissiveIntensity = 0.8 + Math.sin(time * 2) * 0.2;
    const wm = this.lot.water.material.map;
    if (wm) { wm.offset.x = time * 0.02; wm.offset.y = Math.sin(time * 0.3) * 0.05; }
    this.renderer.render(this.scene, this.camera);
    this.syncLabels(dt);
    this.speech.render();
  }

  // Neighbours' houses: painted in the current family's colours, lit at night, FOR SALE when empty.
  syncNeighbours() {
    const houses = this.lot.garden.houses, nb = this.game.neighbours;
    if (!houses || !nb) return;
    for (const side of ['west', 'east']) {
      const h = houses[side], n = nb[side];
      if (h.family !== n.family) { h.family = n.family; h.walls.color.setHex(n.family.wall); }
      h.sign.visible = n.state !== 'home';
      h.glass.emissiveIntensity = n.state === 'home' ? 0.1 + 1.6 * (this.night || 0) : 0;
    }
  }

  updateDaylight() {
    const hour = (this.game.clock / 60) % 24;
    const f = Math.max(0, Math.sin(((hour - 6) / 14) * Math.PI));
    const day = hour >= 6 && hour <= 20 ? f : 0;
    this.hemi.intensity = 0.55 + 1.0 * day;
    this.sun.intensity = 0.2 + 1.55 * day;
    this.fill.intensity = 0.35 + 0.25 * day;
    this.sun.color.setHSL(0.1, 0.6, 0.55 + 0.35 * day);
    const sky = new THREE.Color(0x141026).lerp(new THREE.Color(0x9fc5e8), day);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    const night = day < 0.35 ? 1 - day / 0.35 : 0;
    for (const l of this.lot.lights) l.intensity = 3 * night;
    for (const bulb of this.lot.fairyBulbs) bulb.material.emissiveIntensity = 0.5 + 2 * night;
    for (const { bulb, light } of this.lot.garden.lamps) {
      light.intensity = 6 * night;
      bulb.material.emissiveIntensity = 0.2 + 2.5 * night;
    }
    this.night = night;
  }

  // Hover feedback: object outline, trap placement tile and cursor.
  syncHover(time) {
    const g = this.game;
    if (!this.hoverTile) {
      this.hoverTile = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }));
      this.hoverTile.rotation.x = -Math.PI / 2;
      this.hoverBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffe07a }));
    }
    if (!this.hoverTile.parent) this.scene.add(this.hoverTile, this.hoverBox);
    this.hoverTile.visible = false;
    this.hoverBox.visible = false;
    const h = this.hover;
    if (!h || !h.onCanvas || !g.started) { this.canvas.style.cursor = 'default'; return; }
    const pick = this.pick(h.x, h.y);
    const armed = g.armedTrap;
    if (FLOOR_TRAPS.has(armed) && pick && pick.kind === 'floor') {
      const [x, z] = pick.cell;
      const ok = canPlaceFloorTrap(g, armed, x, z);
      this.hoverTile.position.set(x + 0.5, 0.09, z + 0.5);
      this.hoverTile.material.color.setHex(ok ? 0x6aff8a : 0xff4a4a);
      this.hoverTile.material.opacity = 0.35 + 0.15 * Math.sin(time * 6);
      this.hoverTile.visible = true;
    }
    if (pick && pick.kind === 'object') {
      const hit = this.lot.hits.get(pick.obj.id);
      const p = hit.geometry.parameters;
      this.hoverBox.position.copy(hit.position);
      this.hoverBox.scale.set(p.width, p.height, p.depth);
      this.hoverBox.material.color.setHex(armed ? 0xb0a8ff : 0xffe07a);
      this.hoverBox.visible = true;
    }
    this.canvas.style.cursor = armed ? 'crosshair' : pick && pick.kind !== 'floor' ? 'pointer' : 'default';
  }

  syncWalls(dt) {
    // The roof sits on full-height walls.
    const full = this.wallsUp || this.roofOn;
    const goal = full ? WALL_H : CUT_H;
    this.wallH += (goal - this.wallH) * (1 - Math.exp(-dt * 10));
    for (const m of this.lot.walls) m.scale.y = this.wallH;
    this.lot.roof.visible = this.roofOn && this.wallH > WALL_H - 0.05;
    for (const d of this.game.world.doors) {
      const v = this.lot.doors.get(d.id);
      v.brick.visible = d.bricked;
      v.sill.visible = !d.bricked;
      v.lintel.visible = !d.bricked && full;
    }
    for (const { cap, wall } of this.lot.caps) {
      cap.visible = wall.visible;
      cap.position.y = this.wallH + 0.025;
    }
  }

  syncObjects(time) {
    const g = this.game;
    for (const [id, mesh] of this.lot.objects) {
      const o = g.world.objects.get(id);
      const u = mesh.userData;
      if (o.charred && !u.charred) {
        u.charred = true;
        mesh.traverse(m => { if (m.isMesh && m !== u.poisonGlow) m.material = CHARRED; });
      }
      if (id === 'ladder') mesh.visible = o.present;
      if (u.flag) u.flag.rotation.x = o.flagUp ? 0 : -Math.PI / 2;
      if (id === 'bookshelf') {
        if (!u.baseQuat) u.baseQuat = mesh.quaternion.clone();
        if (o.toppled) {
          u.fall = Math.min(1, (u.fall || 0) + 0.05);
          const k = 1 - (1 - u.fall) * (1 - u.fall);
          mesh.quaternion.copy(u.baseQuat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), k * Math.PI * 0.48));
        } else if (o.wobbly) {
          mesh.quaternion.copy(u.baseQuat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.04 + Math.sin(time * 9) * 0.02));
        }
      }
      if (u.poisonGlow) u.poisonGlow.material.opacity = o.poisoned > 0 ? 0.12 + 0.08 * Math.sin(time * 4) : 0;
      if (u.speakers) {
        const beat = o.charred ? 0 : o.blasting > 0 ? 1 : o.playing > 0 ? 0.5 : 0;
        for (const sp of u.speakers) sp.scale.setScalar(1 + beat * 0.14 * Math.abs(Math.sin(time * 13)));
      }
      if (u.coil && !u.charred) u.coil.material.emissiveIntensity = o.cranked > 0 ? 1.2 + 0.5 * Math.sin(time * 6) : 0.1;
      if (u.flames) {
        u.flames.visible = o.lit > 0 && !o.charred;
        const s = o.stoked ? 1.8 : 1;
        u.flames.children.forEach((f, i) => f.scale.set(s, s * (0.8 + 0.3 * Math.sin(time * 12 + i)), s));
      }
      if (u.screen && id === 'tv' && !u.charred) {
        const watching = g.sims.some(s => s.alive && s.action && s.action.stage === 'do' && s.action.def.id === 'watch');
        u.screen.material.emissive.setHex(o.broken ? 0x000000 : watching ? 0x6688ff : 0x111122);
        u.screen.material.emissiveIntensity = watching ? 0.6 + 0.4 * Math.random() : 0.4;
      }
    }
  }

  syncFire(time) {
    const fire = this.game.world.fire;
    for (const [k, f] of fire) {
      if (!this.fires.has(k)) {
        const c = fireCluster();
        c.position.set(f.x + 0.5, 0.06, f.z + 0.5);
        this.scene.add(c);
        this.fires.set(k, c);
      }
    }
    for (const [k, c] of this.fires) {
      if (!fire.has(k)) { this.scene.remove(c); disposeTree(c); this.fires.delete(k); continue; }
      c.children.forEach((m, i) => {
        if (!m.isMesh) { m.intensity = 2 + Math.random(); return; }
        const s = 0.8 + 0.35 * Math.sin(time * 14 + i * 2 + c.position.x);
        m.scale.set(1, s, 1);
        m.position.y = m.userData.baseY * s;
      });
    }
  }

  syncTombs() {
    for (const t of this.game.world.tombstones) {
      if (this.tombs.has(t.id)) continue;
      const m = tombstoneMesh(t);
      this.scene.add(m);
      this.tombs.set(t.id, m);
    }
  }

  spawnReaper(sim) {
    const r = reaperMesh();
    r.position.set(sim.x + 0.7, 0, sim.z + 0.4);
    r.rotation.y = Math.atan2(sim.x - r.position.x, sim.z - r.position.z);
    this.scene.add(r);
    this.reapers.push({ mesh: r, t: 0, simId: sim.id });
  }

  syncReapers(dt) {
    for (const r of this.reapers) {
      r.t += dt;
      const op = r.t < 0.5 ? r.t / 0.5 : r.t > 3.2 ? Math.max(0, 1 - (r.t - 3.2) / 0.6) : 1;
      r.mesh.userData.materials.forEach(m => { m.opacity = op; });
      r.mesh.position.y = 0.1 + Math.sin(r.t * 3) * 0.08;
      r.mesh.visible = op > 0.02;
      if (r.t > 3.8) {
        this.scene.remove(r.mesh);
        disposeTree(r.mesh);
        const sm = this.simModels.get(r.simId);
        if (sm) { this.scene.remove(sm.root); disposeTree(sm.root); this.simModels.delete(r.simId); }
      }
    }
    this.reapers = this.reapers.filter(r => r.t <= 3.8);
  }

  syncMeteors() {
    const active = new Set();
    for (const m of this.game.meteors) {
      active.add(m);
      if (!this.meteorViz.has(m)) { const v = meteorMesh(); this.scene.add(v); this.meteorViz.set(m, v); }
      const v = this.meteorViz.get(m);
      const k = Math.min(1, m.t / m.dur);
      v.position.set(m.x + 8 * (1 - k), 0.4 + 30 * (1 - k), m.z - 8 * (1 - k));
      v.lookAt(m.x + 8, 30, m.z - 8);
      v.rotateX(Math.PI / 2);
    }
    for (const [m, v] of this.meteorViz) if (!active.has(m)) { this.scene.remove(v); disposeTree(v); this.meteorViz.delete(m); }
  }

  syncSims(dt, time) {
    const g = this.game;
    for (const sim of g.sims) {
      let m = this.simModels.get(sim.id);
      if (!m) {
        if (!sim.alive) continue;
        m = simModel(sim);
        m.face = sim.facing;
        this.scene.add(m.root);
        this.simModels.set(sim.id, m);
      }
      posePose(this, m, sim, dt, time, g.selected === sim);
      m.root.visible = sim.alive ? !sim.status.away : m.root.visible;
    }
  }

  // ---------- HTML overlays ----------

  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return [-9999, -9999];
    const r = this.canvas.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  }

  syncLabels(dt) {
    const g = this.game;
    for (const sim of g.sims) {
      let el = this.labels.get(sim.id);
      if (!sim.alive) { if (el) { el.remove(); this.labels.delete(sim.id); } continue; }
      if (!el) {
        el = document.createElement('div');
        el.className = 'simLabel';
        el.innerHTML = '<div class="thought"></div><div class="nm"></div>';
        this.overlay.appendChild(el);
        this.labels.set(sim.id, el);
      }
      el.style.display = sim.status.away ? 'none' : '';
      if (sim.status.away) continue;
      const y = sim.status.swimming ? 1.3 : 2.05;
      const [sx, sy] = this.project(sim.x, y, sim.z);
      el.style.transform = `translate(${sx}px, ${sy}px)`;
      el.classList.toggle('selected', g.selected === sim);
      const th = el.firstChild;
      th.textContent = sim.thought || '';
      th.style.display = sim.thought ? 'block' : 'none';
      el.lastChild.textContent = sim.first;
    }
    // Warning markers over objects the player has tampered with.
    for (const o of g.world.objects.values()) {
      const armed = (o.sabotaged || o.fireworks || o.wobbly || (o.poisoned > 0 && !o.poisonedBy)) && !o.charred;
      let el = this.labels.get('obj:' + o.id);
      if (!armed) { if (el) el.style.display = 'none'; continue; }
      if (!el) {
        el = document.createElement('div');
        el.className = 'objMark';
        this.overlay.appendChild(el);
        this.labels.set('obj:' + o.id, el);
      }
      const [cx, cz] = o.cells.length ? objCenter(o) : [o.use[0] + 0.5, o.use[1] + 0.5];
      const [sx, sy] = this.project(cx, 1.6, cz);
      el.textContent = o.fireworks ? '🎆' : o.wobbly ? '📚' : o.sabotaged ? (o.type === 'stove' || o.type === 'grill' ? '🔧' : '⚡') : '🦠';
      el.style.display = 'block';
      el.style.transform = `translate(${sx}px, ${sy}px)`;
    }
    this.popups = this.popups.filter(p => {
      p.t += dt;
      const [sx, sy] = this.project(p.sim.x, 2.2 + p.t * 0.8, p.sim.z);
      p.el.style.transform = `translate(${sx}px, ${sy}px)`;
      p.el.style.opacity = String(Math.max(0, 1 - p.t / 1.6));
      if (p.t > 1.6) { p.el.remove(); return false; }
      return true;
    });
  }

  addPopup(sim, text, color) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.color = color;
    this.overlay.appendChild(el);
    this.popups.push({ el, sim, t: 0 });
  }

  flash(sim) {
    const m = this.simModels.get(sim.id);
    if (m) m.flash = 1.2;
    this.fx.burst(sim.x, sim.z, 'sparks', 1.0);
  }

  burst(x, z, kind) {
    this.fx.burst(x, z, kind);
    const captions = { explosion: 'DEPOSIT: GONE.', gas: 'BIOHAZARD.', fright: 'NOPE.', sparks: 'WARRANTY VOID.' };
    if (!captions[kind] || this.comicCooldown > 0) return;
    this.comicCooldown = 3;
    const el = document.createElement('div'); el.className = 'popup comicCaption'; el.textContent = captions[kind];
    this.overlay.appendChild(el); this.popups.push({ el, sim: { x, z }, t: 0 });
  }
}

// Positions and animates one sim model according to what the sim is doing.
function posePose(view, m, sim, dt, t, selected) {
  const { root, body, head, legL, legR, armL, armR, plumbob, ring, fire } = m;
  const a = sim.action;
  const doing = a && a.stage === 'do' ? a.def.id : null;
  const partnerDoing = sim.status.engagedWith && sim.status.engagedWith.action ? sim.status.engagedWith.action.def.id : null;
  m.face = lerpAngle(m.face, sim.facing, 1 - Math.exp(-dt * 12));
  let x = sim.x, z = sim.z, y = 0, face = m.face;

  body.rotation.set(0, 0, 0);
  body.position.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  for (const l of [legL, legR, armL, armR]) l.rotation.set(0, 0, 0);

  const lying = !sim.alive || sim.status.passedOut > 0 || doing === 'sleep' || doing === 'nap';
  if (lying) {
    body.rotation.x = -Math.PI / 2;
    body.position.set(0, 0.18, 0.55);
    if ((doing === 'sleep' || doing === 'nap') && a.target.cells) {
      const bed = view.lot.objects.get(a.target.id);
      [x, z] = objCenter(a.target);
      y = 0.45;
      face = bed.rotation.y - Math.PI / 2;
      body.position.z = 0.75;
    }
  } else if (sim.status.swimming) {
    y = -0.72;
    armL.rotation.x = Math.sin(t * 6) * 2.2;
    armR.rotation.x = Math.sin(t * 6 + Math.PI) * 2.2;
    if (sim.status.stuck) { armL.rotation.z = -2.6 + Math.sin(t * 14) * 0.5; armR.rotation.z = 2.6 - Math.sin(t * 14) * 0.5; }
  } else if ((doing === 'bath' || doing === 'radio') && a.target.cells) {
    [x, z] = objCenter(a.target);
    y = -0.35;
  } else {
    if (sim.moving) {
      const s = Math.sin(t * 11);
      legL.rotation.x = s * 0.6; legR.rotation.x = -s * 0.6;
      armL.rotation.x = -s * 0.5; armR.rotation.x = s * 0.5;
      body.position.y = Math.abs(s) * 0.04;
    }
    if (doing === 'fight' || partnerDoing === 'fight') {
      armR.rotation.x = -1.5 + Math.sin(t * 18) * 0.7;
      armL.rotation.x = -1.5 + Math.sin(t * 18 + 2) * 0.7;
      body.position.x = Math.sin(t * 25) * 0.05;
    } else if (sim.status.panic > 0 || sim.status.onFire > 0 || sim.status.stuck) {
      armL.rotation.z = -2.6 + Math.sin(t * 16) * 0.5;
      armR.rotation.z = 2.6 + Math.sin(t * 16 + 1) * 0.5;
    } else if (doing === 'dance') {
      body.rotation.z = Math.sin(t * 8) * 0.2;
      armL.rotation.z = -2.2 + Math.sin(t * 8) * 0.6;
      armR.rotation.z = 2.2 + Math.sin(t * 8) * 0.6;
      body.position.y = Math.abs(Math.sin(t * 8)) * 0.1;
    } else if (doing === 'stargaze' || doing === 'taunt') {
      head.rotation.x = -0.6;
      if (doing === 'taunt') armR.rotation.z = 2.8 + Math.sin(t * 10) * 0.2;
    } else if (a && a.def.approachSim && doing) {
      armR.rotation.x = -0.7 + Math.sin(t * 6) * 0.35;
    } else if (doing) {
      armL.rotation.x = armR.rotation.x = -0.9 + Math.sin(t * 4) * 0.1;
    }
  }

  m.torso.scale.y = 1 + Math.sin(t * 2.2 + sim.id) * 0.025;
  const blink = ((t + sim.id * 1.7) % 3.7) < 0.12;
  const eyesShut = blink || !sim.alive || sim.status.passedOut > 0 || doing === 'sleep' || doing === 'nap';
  for (const e of m.eyes) e.scale.y = eyesShut ? 0.15 : 1;
  const speaking = view.game.dialogue.active.has(sim.id);
  const worried = sim.status.panic > 0 || sim.status.stuck || sim.status.poisoned > 0;
  m.grin.scale.y = eyesShut ? 0.6 : worried ? 3 : speaking ? 1.5 + Math.abs(Math.sin(t * 14)) * 3 : 1;
  m.grin.scale.x = worried ? 0.6 : 1;
  // Villains scowl; the charmer's brows stay relaxed and confident.
  const rest = sim.look === 'glam' ? -0.12 : 0.35;
  m.brows.forEach((b, i) => { b.rotation.z = (i ? 1 : -1) * (worried ? -0.35 : speaking ? 0.15 : rest); });
  if (speaking && !lying && !sim.moving) head.rotation.z = Math.sin(t * 4 + sim.id) * 0.07;
  const pb = selected ? 1.25 : 1;
  plumbob.scale.set(0.8 * pb, 1.5 * pb, 0.8 * pb);

  root.position.set(x, y, z);
  root.rotation.y = face;
  ring.visible = selected && sim.alive;
  ring.position.y = 0.03 - y;
  plumbob.visible = sim.alive && !lying;
  plumbob.rotation.y += dt * 2;
  plumbob.position.y = 1.72 + Math.sin(t * 2) * 0.04;
  const mood = sim.mood() / 100;
  plumbob.material.color.setHSL(mood * 0.33, 0.9, 0.5);
  plumbob.material.emissive.setHSL(mood * 0.33, 0.9, 0.25);
  fire.visible = sim.status.onFire > 0 && sim.alive;
  if (fire.visible) fire.children.forEach((f, i) => f.scale.set(1, 0.8 + 0.4 * Math.sin(t * 15 + i), 1));

  if (m.flash > 0) {
    m.flash -= dt;
    const on = Math.floor(m.flash * 12) % 2 === 0;
    m.shirt.emissive.setHex(on ? 0xffee55 : 0x000000);
    m.skin.emissive.setHex(on ? 0xffee55 : 0x000000);
  } else {
    m.shirt.emissive.setHex(0x000000);
    m.skin.emissive.setHex(sim.status.poisoned > 0 ? 0x1f5a1f : 0x000000);
  }
}

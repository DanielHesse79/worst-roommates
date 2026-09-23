import { GRID_W, GRID_H, HOUSE, ROOMS, WALLS, DOORS, POOL, FURNITURE } from './data.js';

export const cellKey = (x, z) => x + ',' + z;
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class World {
  constructor(bedCount = 2) {
    this.doors = DOORS.map(d => ({ ...d, bricked: false }));
    this.objects = new Map();
    for (const f of FURNITURE) {
      if (f.bedIndex !== undefined && f.bedIndex >= bedCount) continue;
      this.objects.set(f.id, { ...f, poisoned: 0, charred: false, broken: false, lit: 0, cranked: 0, present: true });
    }
    this.traps = new Map();      // cellKey -> { type, x, z, uses } hidden floor traps
    this.piranhas = false;
    this.piranhasKnown = false;
    this.fire = new Map();       // cellKey -> { x, z, life, spread }
    this.scorched = new Set();   // cellKey
    this.tombstones = [];
    this.furnitureCells = new Map(); // cellKey -> object
    for (const o of this.objects.values()) {
      for (const [x, z] of o.cells) this.furnitureCells.set(cellKey(x, z), o);
    }
    this.version = 0; // bumped whenever walkability changes so sims re-path
    this.rebuildEdges();
  }

  get ladder() { return this.objects.get('ladder'); }

  rebuildEdges() {
    this.walls = new Set();
    for (const w of WALLS) {
      for (let i = w.from; i < w.to; i++) this.walls.add(w.axis === 'x' ? `v:${w.at}:${i}` : `h:${w.at}:${i}`);
    }
    for (const d of this.doors) {
      if (!d.bricked) this.walls.delete(d.axis === 'x' ? `v:${d.at}:${d.pos}` : `h:${d.at}:${d.pos}`);
    }
    this.version++;
  }

  toggleDoor(id) {
    const d = this.doors.find(dd => dd.id === id);
    d.bricked = !d.bricked;
    this.rebuildEdges();
    return d;
  }

  inBounds(x, z) { return x >= 0 && z >= 0 && x < GRID_W && z < GRID_H; }
  isIndoor(x, z) { return x >= HOUSE.x0 && x < HOUSE.x1 && z >= HOUSE.z0 && z < HOUSE.z1; }
  inPool(x, z) { return x >= POOL.x0 && x < POOL.x1 && z >= POOL.z0 && z < POOL.z1; }
  roomAt(x, z) { return ROOMS.find(r => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) || null; }
  objectAt(x, z) { return this.furnitureCells.get(cellKey(x, z)) || null; }
  tombAt(x, z) { return this.tombstones.find(t => t.x === x && t.z === z) || null; }

  isBlocked(x, z) {
    if (!this.inBounds(x, z)) return true;
    if (this.inPool(x, z)) return true;
    if (this.furnitureCells.has(cellKey(x, z))) return true;
    return !!this.tombAt(x, z);
  }

  edgeBlocked(x, z, nx, nz) {
    if (nx !== x) return this.walls.has(`v:${Math.max(x, nx)}:${z}`);
    return this.walls.has(`h:${Math.max(z, nz)}:${x}`);
  }

  canStep(x, z, nx, nz) {
    if (this.isBlocked(nx, nz)) return false;
    const dx = nx - x, dz = nz - z;
    if (dx !== 0 && dz !== 0) {
      return this.canStep(x, z, x + dx, z) && this.canStep(x, z, x, z + dz) &&
        this.canStep(x + dx, z, nx, nz) && this.canStep(x, z + dz, nx, nz);
    }
    return !this.edgeBlocked(x, z, nx, nz);
  }

  // A* over cells, 8-directional. Returns cells to walk (excluding start), or null.
  findPath(sx, sz, tx, tz) {
    if (sx === tx && sz === tz) return [];
    if (this.isBlocked(tx, tz)) return null;
    const open = [{ x: sx, z: sz, g: 0, f: 0 }];
    const came = new Map();
    const gScore = new Map([[cellKey(sx, sz), 0]]);
    const h = (x, z) => {
      const dx = Math.abs(x - tx), dz = Math.abs(z - tz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.x === tx && cur.z === tz) {
        const path = [];
        let k = cellKey(tx, tz);
        while (k !== cellKey(sx, sz)) {
          const [x, z] = k.split(',').map(Number);
          path.push([x, z]);
          k = came.get(k);
        }
        return path.reverse();
      }
      for (const [dx, dz] of DIRS8) {
        const nx = cur.x + dx, nz = cur.z + dz;
        if (!this.canStep(cur.x, cur.z, nx, nz)) continue;
        const g = cur.g + (dx && dz ? 1.414 : 1);
        const nk = cellKey(nx, nz);
        if (g < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, g);
          came.set(nk, cellKey(cur.x, cur.z));
          open.push({ x: nx, z: nz, g, f: g + h(nx, nz) });
        }
      }
    }
    return null;
  }

  nearestWalkable(x, z) {
    const seen = new Set([cellKey(x, z)]);
    const q = [[x, z]];
    while (q.length) {
      const [cx, cz] = q.shift();
      if (!this.isBlocked(cx, cz)) return [cx, cz];
      for (const [dx, dz] of DIRS4) {
        const nx = cx + dx, nz = cz + dz;
        const k = cellKey(nx, nz);
        if (this.inBounds(nx, nz) && !seen.has(k)) { seen.add(k); q.push([nx, nz]); }
      }
    }
    return [x, z];
  }

  // A random reachable cell within `r` steps (used by panicking sims).
  randomNear(x, z, r) {
    const out = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const nx = x + dx, nz = z + dz;
        if (!this.isBlocked(nx, nz) && (dx || dz)) out.push([nx, nz]);
      }
    }
    return out.length ? out[Math.floor(Math.random() * out.length)] : null;
  }

  // ---------- hidden traps ----------

  trapAt(x, z) { return this.traps.get(cellKey(x, z)) || null; }
  addTrap(type, x, z, uses) { this.traps.set(cellKey(x, z), { type, x, z, uses }); }
  removeTrap(t) { this.traps.delete(cellKey(t.x, t.z)); }

  // ---------- tombstones ----------

  addTombstone(x, z, sim, cause) {
    const [tx, tz] = this.nearestWalkable(x, z);
    const t = { id: 'tomb-' + sim.id, x: tx, z: tz, name: sim.name, cause, simId: sim.id };
    this.tombstones.push(t);
    this.version++;
    return t;
  }

  // ---------- fire ----------

  isBurning(x, z) { return this.fire.has(cellKey(x, z)); }

  canBurn(x, z) {
    const k = cellKey(x, z);
    if (this.fire.has(k) || this.scorched.has(k)) return false;
    const obj = this.objectAt(x, z);
    return this.isIndoor(x, z) || (obj && obj.type === 'grill');
  }

  ignite(x, z) {
    if (!this.canBurn(x, z)) return false;
    this.fire.set(cellKey(x, z), { x, z, life: 60 + Math.random() * 50, spread: 0 });
    return true;
  }

  nearestFire(x, z) {
    let best = null, bd = Infinity;
    for (const f of this.fire.values()) {
      const d = Math.max(Math.abs(f.x - x), Math.abs(f.z - z));
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  // Distance (in cells, Chebyshev) to the nearest flame.
  fireDistance(x, z) {
    let best = Infinity;
    for (const f of this.fire.values()) best = Math.min(best, Math.max(Math.abs(f.x - x), Math.abs(f.z - z)));
    return best;
  }

  updateFire(minutes) {
    const newFires = [];
    for (const [k, f] of this.fire) {
      f.life -= minutes;
      f.spread += minutes;
      const obj = this.objectAt(f.x, f.z);
      if (obj) obj.charred = true;
      while (f.spread >= 6) {
        f.spread -= 6;
        if (Math.random() < 0.2) {
          const [dx, dz] = DIRS4[Math.floor(Math.random() * 4)];
          const nx = f.x + dx, nz = f.z + dz;
          if (this.inBounds(nx, nz) && this.isIndoor(nx, nz) && !this.edgeBlocked(f.x, f.z, nx, nz) && this.canBurn(nx, nz)) {
            newFires.push([nx, nz]);
          }
        }
      }
      if (f.life <= 0) {
        this.fire.delete(k);
        this.scorched.add(k);
      }
    }
    for (const [x, z] of newFires) this.ignite(x, z);
  }
}

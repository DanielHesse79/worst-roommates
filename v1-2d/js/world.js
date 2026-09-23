// world.js — the house grid, rooms, objects, fire and pool mechanics

const TILE = 48;
const COLS = 14;
const ROWS = 10;

const ROOMS = [
  { x: 0, y: 0, w: 5, h: 4, color: '#3a2a1a', label: 'Kitchen' },
  { x: 5, y: 0, w: 5, h: 4, color: '#2a1a2a', label: 'Living Room' },
  { x: 10, y: 0, w: 4, h: 4, color: '#1a2530', label: 'Bathroom' },
  { x: 0, y: 4, w: 4, h: 6, color: '#2a2a1a', label: 'Bedroom A' },
  { x: 4, y: 4, w: 4, h: 6, color: '#241a2e', label: 'Bedroom B' },
  { x: 8, y: 4, w: 6, h: 6, color: '#16301c', label: 'Backyard' },
];

function tileToPixel(x, y) {
  return { px: x * TILE + TILE / 2, py: y * TILE + TILE / 2 };
}

function isFlammable(x, y) {
  // kitchen + living room tiles can catch fire
  return (x >= 0 && x < 5 && y >= 0 && y < 4) || (x >= 5 && x < 10 && y >= 0 && y < 4);
}

function makeWorld() {
  const world = {
    objects: [
      { id: 'stove', type: 'stove', x: 1, y: 1, emoji: '🍳', flammable: true, rigged: false },
      { id: 'fridge', type: 'fridge', x: 3, y: 1, emoji: '🧊', poisoned: false, rigged: false },
      { id: 'table', type: 'table', x: 2, y: 3, emoji: '🍽️' },
      { id: 'fireplace', type: 'fireplace', x: 6, y: 1, emoji: '🕯️', flammable: true },
      { id: 'tv', type: 'tv', x: 8, y: 2, emoji: '📺', rigged: false },
      { id: 'tub', type: 'tub', x: 11, y: 1, emoji: '🛁' },
      { id: 'bedA', type: 'bed', x: 1, y: 6, emoji: '🛏️' },
      { id: 'bedB', type: 'bed', x: 5, y: 6, emoji: '🛏️' },
    ],
    pool: {
      tiles: [],
      ladder: { x: 9, y: 6 },
      ladderPresent: true,
      ladderTimer: 0,
    },
    fire: new Map(), // "x,y" -> ticks remaining burning
    ash: new Set(),  // "x,y" burnt out tiles
  };
  for (let x = 9; x <= 12; x++) {
    for (let y = 5; y <= 7; y++) {
      world.pool.tiles.push({ x, y });
    }
  }
  return world;
}

function isPoolTile(world, x, y) {
  return world.pool.tiles.some(t => t.x === x && t.y === y);
}

function isLadderTile(world, x, y) {
  return world.pool.ladder.x === x && world.pool.ladder.y === y;
}

function getObject(world, id) {
  return world.objects.find(o => o.id === id);
}

function objectAt(world, x, y) {
  return world.objects.find(o => o.x === x && o.y === y);
}

function key(x, y) { return x + ',' + y; }

function igniteTile(world, x, y) {
  if (!isFlammable(x, y)) return false;
  if (world.fire.has(key(x, y)) || world.ash.has(key(x, y))) return false;
  world.fire.set(key(x, y), 6); // burns for 6 ticks
  return true;
}

// Advances fire spread/burnout by one simulation tick. Returns list of currently burning tiles.
function tickFire(world) {
  const spreadTo = [];
  for (const [k, ticksLeft] of world.fire.entries()) {
    const [x, y] = k.split(',').map(Number);
    // chance to spread to a flammable, non-burning, non-ashed neighbour
    if (Math.random() < 0.22) {
      const neighbours = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbours) {
        const nk = key(nx, ny);
        if (isFlammable(nx, ny) && !world.fire.has(nk) && !world.ash.has(nk)) {
          spreadTo.push(nk);
          break;
        }
      }
    }
    const remaining = ticksLeft - 1;
    if (remaining <= 0) {
      world.fire.delete(k);
      world.ash.add(k);
    } else {
      world.fire.set(k, remaining);
    }
  }
  for (const nk of spreadTo) {
    if (!world.fire.has(nk)) world.fire.set(nk, 6);
  }
  return [...world.fire.keys()].map(k => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });
}

function isBurning(world, x, y) {
  return world.fire.has(key(x, y));
}

function nearestFireDistance(world, x, y) {
  let best = Infinity;
  for (const k of world.fire.keys()) {
    const [fx, fy] = k.split(',').map(Number);
    const d = Math.abs(fx - x) + Math.abs(fy - y);
    if (d < best) best = d;
  }
  return best;
}

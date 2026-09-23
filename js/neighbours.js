// The families either side of the lot. Every bit of rudeness wears their patience down; when it runs
// out they sell up and a removal van comes. The house sits empty for a while, then somebody new moves in.
import { GRID_W, GRID_H } from './data.js';
import { vehicle, driveVehicle } from './emergency.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export const SIDES = ['west', 'east'];
// Where each neighbour's house stands (its centre); the front door faces the street.
export const HOUSES = { west: { x: -9.5, z: 7 }, east: { x: GRID_W + 9.5, z: 7 } };
export const houseDoor = side => [HOUSES[side].x, HOUSES[side].z + 3.3];
const FAR_CURB = GRID_H + 6.3; // removal vans park across the road, out of the emergency lane

// trait: nosy (counts your graves), grumpy (loses patience fast) or sweet (forgives a lot).
export const FAMILIES = [
  { name: 'Crabtree', visitor: 'Mrs. Crabtree', shirt: 0xb05a8a, wall: 0xd8c3a5, trait: 'nosy', hello: 'drops by "just to say hello". Her eyes are everywhere.' },
  { name: 'Pemberton', visitor: 'Mr. Pemberton', shirt: 0x3a6a8a, wall: 0xa8c0d0, trait: 'grumpy', hello: 'marches over to complain about the state of your hedge.' },
  { name: 'Lovelace', visitor: 'Dr. Lovelace', shirt: 0x6a3a8a, wall: 0xe8b8c4, trait: 'sweet', hello: 'brings round a suspiciously heavy lasagne.' },
  { name: 'Stubbs', visitor: 'Grandpa Stubbs', shirt: 0x7a6a4a, wall: 0xc8d8a8, trait: 'nosy', hello: 'wanders over to tell you about the war. Which war is unclear.' },
  { name: 'Nguyen', visitor: 'Mrs. Nguyen', shirt: 0x2a8a6a, wall: 0xf0e0a0, trait: 'sweet', hello: 'wants to borrow a cup of sugar. And a good look around.' },
  { name: 'Karenson', visitor: 'Karen Karenson', shirt: 0xd08a3a, wall: 0xf4f0e8, trait: 'grumpy', hello: 'arrives with a clipboard, a petition and a lot of opinions about your bins.' },
  { name: 'Moth', visitor: 'Mr. Moth', shirt: 0x4a4a52, wall: 0xb8b0c8, trait: 'nosy', hello: 'appears on the doorstep without anyone hearing him arrive. He just wants to chat.' },
];
const MOVING_OUT = [
  'They are moving somewhere quieter. Like a motorway.',
  'The estate agent describes the street as "lively".',
  'Their therapist agreed it was for the best.',
  'They leave a one-star review of the neighbourhood.',
];

const household = family => ({ family, patience: 100, state: 'home', banned: false, van: null, t: 0 });

export function initNeighbours(g) {
  const [a, b] = [...FAMILIES].sort(() => Math.random() - 0.5);
  g.neighbours = { west: household(a), east: household(b) };
  g.pastFamilies = [];
  g.welcome = null;
}

// A side whose family is home and still willing to visit, or null.
export function visitingSide(g) {
  const sides = SIDES.filter(s => g.neighbours[s].state === 'home' && !g.neighbours[s].banned);
  if (g.welcome && sides.includes(g.welcome)) return g.welcome;
  return sides.length ? pick(sides) : null;
}

export function annoyNeighbour(g, side, amount, msg) {
  const n = g.neighbours[side];
  if (!n || n.state !== 'home' || amount <= 0) return;
  const t = n.family.trait;
  n.patience -= amount * (t === 'grumpy' ? 1.5 : t === 'sweet' ? 0.6 : 1);
  if (msg) g.log(`${msg} (The ${n.family.name}s' patience: ${Math.max(0, Math.round(n.patience))}%)`, 'evil');
  if (n.patience <= 0) moveOut(g, side);
}

export function pleaseNeighbour(g, side, amount, msg) {
  const n = g.neighbours[side];
  if (!n || n.state !== 'home') return;
  n.patience = Math.min(100, n.patience + amount);
  if (msg) g.log(`${msg} (The ${n.family.name}s' patience: ${Math.round(n.patience)}%)`, 'dim');
}

function moveOut(g, side) {
  const n = g.neighbours[side];
  n.state = 'moving';
  n.t = 90;
  n.van = vehicle(g, 'van', HOUSES[side].x, side === 'west' ? -1 : 1, FAR_CURB);
  g.pastFamilies.push(n.family.name);
  g.log(`🚚 The ${n.family.name}s have had enough of you. A removal van pulls up outside their house. ${pick(MOVING_OUT)}`, 'warn');
}

function moveIn(g, side) {
  const n = g.neighbours[side];
  const taken = new Set([...SIDES.map(s => g.neighbours[s].family.name), ...g.pastFamilies]);
  const fresh = FAMILIES.filter(f => !taken.has(f.name));
  const family = fresh.length ? pick(fresh) : pick(FAMILIES.filter(f => f.name !== n.family.name));
  Object.assign(n, household(family));
  n.van = vehicle(g, 'van', HOUSES[side].x, side === 'west' ? -1 : 1, FAR_CURB);
  n.vanLeaves = g.clock + 120;
  g.welcome = side;
  g.nextVisit = Math.min(g.nextVisit, g.clock + rand(60, 120));
  g.log(`🏡 New neighbours move in next door: the ${family.name}s. They repaint the house immediately. They seem nice. For now.`, 'tool');
}

export function updateNeighbours(g, gdt, min) {
  for (const side of SIDES) {
    const n = g.neighbours[side];
    if (n.van) {
      driveVehicle(g, n.van, gdt);
      if (!g.vehicles.includes(n.van)) n.van = null;
    }
    if (n.state === 'moving') {
      if (n.van && n.van.state !== 'parked') continue;
      n.t -= min;
      if (n.t > 0) continue;
      if (n.van) n.van.state = 'leave';
      n.state = 'empty';
      n.t = rand(480, 720);
      g.log(`🏚️ The ${n.family.name}s are gone. A FOR SALE sign goes up next door.`, 'dim');
    } else if (n.state === 'empty') {
      n.t -= min;
      if (n.t <= 0) moveIn(g, side);
    } else if (n.van && n.van.state === 'parked' && g.clock > n.vanLeaves) {
      n.van.state = 'leave';
    }
  }
}

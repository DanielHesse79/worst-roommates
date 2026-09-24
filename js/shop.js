// The black market: spend blood money from contracts on new tools, characters and permanent upgrades.
import { ROSTER } from './data.js';

const RECRUIT_PRICE = { pete: 150, bertha: 150, gus: 200, seance: 200 };

export const SHOP = [
  ...ROSTER.filter(r => r.locked).map(r => ({ id: 'recruit:' + r.id, kind: 'recruit', name: r.name, icon: '🤝', price: RECRUIT_PRICE[r.id], desc: r.pitch })),
  { id: 'chili', kind: 'trap', name: "Grandma's chili", icon: '🫘', price: 120, desc: 'Unlocks the chili trap: whoever eats it becomes a walking, silent-but-deadly gas hazard.' },
  { id: 'beartrap', kind: 'trap', name: 'Bear trap', icon: '🪤', price: 150, desc: 'Unlocks bear traps you can hide in the lawn.' },
  { id: 'fireworks', kind: 'trap', name: 'Fireworks stash', icon: '🎆', price: 200, desc: 'Unlocks fireworks hidden in the fireplace or grill.' },
  { id: 'ghost', kind: 'trap', name: 'Restless spirits', icon: '👻', price: 200, desc: 'Unlocks waking the dead: ghosts that scare the weak to death at night.' },
  { id: 'piranhas', kind: 'trap', name: 'Piranhas', icon: '🐟', price: 250, desc: 'Unlocks stocking the pool with piranhas.' },
  { id: 'brakes', kind: 'trap', name: 'Oil drum', icon: '🛢️', price: 200, desc: 'Unlocks pouring oil on the road: passing cars skid into the front garden and explode.' },
  { id: 'letterbomb', kind: 'trap', name: 'Letter bomb', icon: '📬', price: 250, desc: 'Unlocks posting explosive parcels to the mailbox.' },
  { id: 'pockets', kind: 'upgrade', name: 'Deep pockets', icon: '👛', price: 150, desc: 'Start every contract with $100 extra cash.' },
  { id: 'silent', kind: 'upgrade', name: 'Silent tools', icon: '🤫', price: 200, desc: 'Being seen sabotaging something raises suspicion by 8 instead of 15.' },
  { id: 'alibi', kind: 'upgrade', name: 'Airtight alibi', icon: '📝', price: 200, desc: 'Suspicion fades twice as fast.' },
  { id: 'discount', kind: 'upgrade', name: 'Bulk discount', icon: '🏷️', price: 250, desc: 'All tools cost 20% less cash.' },
];

// Traps that must be bought before they can be used in contracts (free play has everything).
export const LOCKED_TRAPS = new Set(SHOP.filter(i => i.kind === 'trap').map(i => i.id));

// Blood money for finishing a contract: paid per newly earned star; replays earn a small tip.
export function contractReward(contract, stars, previousBest) {
  const fresh = Math.max(0, stars - previousBest);
  return fresh > 0 ? Math.round(contract.pay * fresh / 3) : Math.round(contract.pay * 0.15);
}

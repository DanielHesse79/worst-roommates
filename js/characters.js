// Animated figures (Kenney "Mini Characters", CC0: models/LICENSE-kenney.txt), loaded when first needed.
// The named characters each have their own figure; everyone else gets one of the rest, avoiding doubles
// where possible. Until a figure has loaded, or with classic figures chosen in the settings, a sim uses
// the procedural model from models.js instead.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { box, trimmings, toiletBrush, handbag } from './models.js';
import { objCenter } from './lot.js';

const SOURCE_HEIGHT = 0.78;        // the figures as modelled, feet at 0
const SCALE = 1.3 / SOURCE_HEIGHT; // a little shorter than the classic sims: the heads are big
// From the pack's twelve: female-a has a toy blaster moulded into her hand, and male-c's police uniform
// would confuse everyone, so neither is shipped.
const FIGURES = ['female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-d', 'male-e', 'male-f'];
const ROSTER_FIGURE = {
  nermin: 'female-c', asraa: 'female-e', daniel: 'male-e', silas: 'male-d', gus: 'male-b', pete: 'male-b', gloria: 'female-f',
  dolly: 'female-b', adam: 'male-a', vincent: 'male-f', bertha: 'female-b', seance: 'female-d',
};
const RANDOM = FIGURES;
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// The game's first names are old-fashioned and unambiguous; anyone else gets whichever figure is free.
const FEMALE = new Set(['Mildred', 'Delilah', 'Ivy', 'Petunia', 'Wanda', 'Griselda', 'Ophelia', 'Ursula', 'Agatha', 'Beatrix', 'Granny', 'Mother']);
const MALE = new Set(['Chad', 'Reginald', 'Bartholomew', 'Gordon', 'Cornelius', 'Malcolm', 'Ambrose', 'Doyle', 'Mortimer', 'Lucius']);

// Which figure a sim wears. Named characters keep theirs; the rest avoid anyone else's in the house.
export function figureFor(sim, sims) {
  if (sim.figure) return sim.figure;
  let f = sim.rosterId && ROSTER_FIGURE[sim.rosterId];
  if (!f) {
    const taken = new Set(sims.filter(o => o !== sim).map(o => o.figure || (o.rosterId && ROSTER_FIGURE[o.rosterId])).filter(Boolean));
    const kind = FEMALE.has(sim.first) ? 'female-' : MALE.has(sim.first) ? 'male-' : '';
    const fits = RANDOM.filter(x => x.startsWith(kind));
    const free = fits.filter(x => !taken.has(x));
    const pool = free.length ? free : fits;
    f = pool[hash(sim.name) % pool.length];
  }
  sim.figure = f;
  return f;
}

// ---------- loading ----------

const loader = new GLTFLoader();
const cache = new Map(); // figure -> source | 'loading' | 'failed'

// True once the figure can be built. The first call starts loading it.
export function figureReady(f) {
  const c = cache.get(f);
  if (c === undefined) {
    cache.set(f, 'loading');
    loader.loadAsync(`models/character-${f}.glb`).then(g => cache.set(f, prepare(g))).catch(() => cache.set(f, 'failed'));
    return false;
  }
  return typeof c === 'object';
}

// Where the hands and feet are, in their bones' own space, measured once from the rest pose.
function prepare(gltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const bones = {};
  scene.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const local = (bone, x, y, z) => bone.worldToLocal(new THREE.Vector3(x, y, z));
  const r = bones['arm-right'].getWorldPosition(new THREE.Vector3()), l = bones['arm-left'].getWorldPosition(new THREE.Vector3());
  const fr = bones['leg-right'].getWorldPosition(new THREE.Vector3()), fl = bones['leg-left'].getWorldPosition(new THREE.Vector3());
  return {
    scene, animations: gltf.animations,
    handR: local(bones['arm-right'], r.x - 0.24, r.y, r.z + 0.02), handL: local(bones['arm-left'], l.x + 0.24, l.y, l.z + 0.02),
    footR: local(bones['leg-right'], fr.x, 0.02, fr.z + 0.03), footL: local(bones['leg-left'], fl.x, 0.02, fl.z + 0.03),
  };
}

// ---------- building ----------

// Props sized in world units, hung on a bone of a scaled figure.
function hold(bone, at, prop) {
  prop.scale.setScalar(1 / SCALE);
  prop.position.copy(at);
  bone.add(prop);
}

export function buildCharacter(sim, f) {
  const src = cache.get(f);
  const model = cloneSkinned(src.scene);
  model.scale.setScalar(SCALE);
  // One material per sim, so damage flashes and poison tints stay on the right person.
  let material = null;
  model.traverse(o => {
    if (!o.isMesh) return;
    material = material || o.material.clone();
    o.material = material;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // the animation moves the mesh outside its original bounds
  });
  const bones = {};
  model.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  body.add(model);
  const headRest = bones.head.quaternion.clone();

  // What makes a few of them who they are.
  if (sim.rosterId === 'vincent') {
    const brush = toiletBrush();
    brush.rotation.z = Math.PI / 2;
    hold(bones['arm-right'], src.handR, brush);
  }
  if (sim.rosterId === 'asraa') hold(bones['arm-right'], src.handR, handbag(0x1a1a1f));
  if (sim.rosterId === 'nermin' || sim.personality === 'auntie') {
    for (const [leg, at] of [['leg-right', src.footR], ['leg-left', src.footL]]) hold(bones[leg], at, box(0.13, 0.04, 0.22, 0xe87aa0));
  }

  // Easy to click: an invisible box the size of a person.
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.45, 0.5), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.y = 0.72;
  root.add(hit);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
  const { plumbob, ring, fire } = trimmings(root);
  root.traverse(o => { o.userData.pick = { kind: 'sim', id: sim.id }; });
  ring.userData.pick = null;
  return { kind: 'figure', figure: f, root, body, model, bones, headRest, mixer, actions, current: null, material, plumbob, ring, fire, flash: 0, face: sim.facing };
}

// Frees what belongs to this figure alone; geometry and textures are shared with the loaded original.
export function disposeCharacter(m) {
  m.mixer.stopAllAction();
  m.material.dispose();
}

// ---------- animating ----------

const SIT = new Set(['watch', 'devgame', 'scheme', 'workhome', 'playtesting', 'pizza', 'darkarts', 'code', 'usetoilet', 'candlelit', 'jobhunt', 'hacklock', 'hackwires', 'insultbikers']);
const HANDS = new Set(['cook', 'grill', 'bake', 'snack', 'hair', 'clean', 'fixit', 'poison', 'npcgas', 'toiletbrush', 'fish', 'trash', 'toxin',
  'light', 'stoke', 'crank', 'weeds', 'lightcandles', 'blowcandles', 'mail', 'repair', 'hideladder', 'putback', 'feral', 'studychem', 'studydiy', 'charm', 'warm', 'warmhands', 'toenails', 'stopmusic', 'blast']);
const RUDE = new Set(['insult', 'scene', 'gaslight', 'smear', 'triangulate', 'silent', 'barge', 'airhorn', 'rudevisit']);
const FRIENDLY = new Set(['chat', 'lovebomb', 'joke', 'story', 'note', 'apologise', 'errand', 'drink', 'gossip', 'lure', 'guilttrip', 'doorchat', 'charmcop', 'answercop', 'flirtfire', 'coffee', 'ramble']);

function play(m, name, { once = false, speed = 1 } = {}) {
  const next = m.actions[name] || m.actions.idle;
  next.timeScale = speed;
  if (m.current === next) return;
  if (once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else next.setLoop(THREE.LoopRepeat, Infinity);
  next.reset().fadeIn(m.current ? 0.2 : 0).play();
  if (m.current) m.current.fadeOut(0.2);
  m.current = next;
}

// Positions a figure and picks the animation that fits what the sim is doing.
export function animateCharacter(view, m, sim, dt, t, selected) {
  const a = sim.action, st = sim.status;
  const doing = a && a.stage === 'do' ? a.def.id : null;
  const partner = st.engagedWith && st.engagedWith.action ? st.engagedWith.action.def.id : null;
  const pace = Math.min(3, [0, 1, 3, 8][view.game.speed] || 1); // legs keep up with fast-forward, within reason
  m.face = lerpAngle(m.face, sim.facing, 1 - Math.exp(-dt * 12));
  let x = sim.x, z = sim.z, y = 0, face = m.face;
  m.body.rotation.set(0, 0, 0);
  m.body.position.set(0, 0, 0);

  const sleeping = doing === 'sleep' || doing === 'nap';
  if (!sim.alive || st.passedOut > 0) {
    play(m, 'die', { once: true });
  } else if (sleeping) {
    // Flat on their back in bed, breathing.
    m.body.rotation.x = -Math.PI / 2;
    m.body.position.set(0, 0.18, 0.55);
    if (a.target.cells) {
      const bed = view.lot.objects.get(a.target.id);
      [x, z] = objCenter(a.target);
      y = 0.45;
      face = bed.rotation.y - Math.PI / 2;
      m.body.position.z = 0.75;
    }
    play(m, 'idle', { speed: 0.5 });
  } else if (st.swimming) {
    y = -0.72;
    play(m, st.stuck ? 'fall' : 'walk', { speed: st.stuck ? 1.4 : 0.6 });
  } else if ((doing === 'bath' || doing === 'radio') && a.target.cells) {
    [x, z] = objCenter(a.target);
    y = -0.35;
    play(m, 'sit');
  } else if (st.trapped > 0) {
    play(m, 'crouch');
  } else if (sim.moving) {
    play(m, st.panic > 0 || st.onFire > 0 || st.fleeing ? 'sprint' : 'walk', { speed: pace });
  } else if (st.panic > 0 || st.onFire > 0 || st.stuck) {
    play(m, 'fall', { speed: 1.5 });
  } else if (doing === 'fight' || partner === 'fight') {
    play(m, (Math.floor(t * 1.5) + sim.id) % 3 === 2 ? 'attack-kick-right' : 'attack-melee-right', { speed: 1.2 });
  } else if (doing === 'slipper' || doing === 'breathe') {
    play(m, 'attack-melee-left');
  } else if (doing === 'dance') {
    play(m, 'jump', { speed: 0.8 });
  } else if (doing && SIT.has(doing)) {
    play(m, 'sit');
  } else if (doing && (HANDS.has(doing) || doing.startsWith('sab-'))) {
    play(m, 'interact-right', { speed: 0.8 });
  } else if (doing === 'read') {
    play(m, 'holding-both');
  } else if (doing && RUDE.has(doing)) {
    play(m, 'emote-no');
  } else if (doing && FRIENDLY.has(doing)) {
    play(m, 'emote-yes', { speed: 0.6 });
  } else if (doing === 'taunt') {
    play(m, 'attack-melee-right', { speed: 0.7 });
  } else {
    play(m, 'idle');
  }
  m.bones.head.quaternion.copy(m.headRest); // the tweaks below must not pile up when a clip leaves the head alone
  m.mixer.update(dt);
  // A little life on top of the clip: looking up at the stars, bobbing along while talking.
  if (m.bones.head && (doing === 'stargaze' || doing === 'taunt')) m.bones.head.rotation.x -= 0.5;
  if (m.bones.head && view.game.dialogue.active.has(sim.id) && sim.alive && !sleeping) m.bones.head.rotation.z += Math.sin(t * 4 + sim.id) * 0.08;

  const pb = selected ? 1.25 : 1;
  m.plumbob.scale.set(0.8 * pb, 1.5 * pb, 0.8 * pb);
  m.root.position.set(x, y, z);
  m.root.rotation.y = face;
  m.ring.visible = selected && sim.alive;
  m.ring.position.y = 0.03 - y;
  m.plumbob.visible = sim.alive && !sleeping && !(st.passedOut > 0);
  m.plumbob.rotation.y += dt * 2;
  m.plumbob.position.y = 1.72 + Math.sin(t * 2) * 0.04;
  const mood = sim.mood() / 100;
  m.plumbob.material.color.setHSL(mood * 0.33, 0.9, 0.5);
  m.plumbob.material.emissive.setHSL(mood * 0.33, 0.9, 0.25);
  m.fire.visible = st.onFire > 0 && sim.alive;
  if (m.fire.visible) m.fire.children.forEach((f, i) => f.scale.set(1, 0.8 + 0.4 * Math.sin(t * 15 + i), 1));
  if (m.flash > 0) {
    m.flash -= dt;
    m.material.emissive.setHex(Math.floor(m.flash * 12) % 2 === 0 ? 0xffee55 : 0x000000);
  } else {
    m.material.emissive.setHex(st.poisoned > 0 ? 0x1f5a1f : 0x000000);
  }
}

const lerpAngle = (a, b, k) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k;

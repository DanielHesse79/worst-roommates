// Static game data: lot layout, furniture, traits, names, death flavour.
// Cell (x,z) spans world [x,x+1) x [z,z+1). Wall lines sit on integer coordinates.

export const GRID_W = 22;
export const GRID_H = 16;
export const MIN_PER_SEC = 5; // game minutes per real second at 1x

// Every cause must have a finite value, or one death can poison the suspicion meter.
export const DEATH_SUSPICION = {
  Meteor: 0, Fright: 0, Boredom: 2, Laughter: 2, Fart: 3, Slip: 5, Crushed: 6, Fire: 8, Electrocution: 8, Explosion: 10,
  Fight: 15, Poison: 22, Drowning: 8, Starvation: 10, Piranhas: 25, 'Bear Trap': 25, 'Letter Bomb': 20, 'Car Crash': 3, 'Biker Gang': 2, 'Bad Breath': 3,
};

export const HOUSE = { x0: 1, z0: 1, x1: 16, z1: 11 };

export const ROOMS = [
  { name: 'Kitchen', x0: 1, z0: 1, x1: 7, z1: 6, floor: 0xe2d6b9 },
  { name: 'Living Room', x0: 7, z0: 1, x1: 13, z1: 6, floor: 0xb88568 },
  { name: 'Bathroom', x0: 13, z0: 1, x1: 16, z1: 6, floor: 0xbfd8e0 },
  { name: 'Bedroom', x0: 1, z0: 6, x1: 7, z1: 11, floor: 0x8c839f },
  { name: 'Den', x0: 7, z0: 6, x1: 16, z1: 11, floor: 0xb4a187 },
];

// axis 'x': vertical line at x=at spanning z in [from,to)
// axis 'z': horizontal line at z=at spanning x in [from,to)
export const WALLS = [
  { axis: 'z', at: 1, from: 1, to: 16 },
  { axis: 'z', at: 11, from: 1, to: 16 },
  { axis: 'x', at: 1, from: 1, to: 11 },
  { axis: 'x', at: 16, from: 1, to: 11 },
  { axis: 'x', at: 7, from: 1, to: 11 },
  { axis: 'x', at: 13, from: 1, to: 6 },
  { axis: 'z', at: 6, from: 1, to: 16 },
];

// A door is a gap in a wall line at cell index `pos` along the line.
export const DOORS = [
  { id: 'door-front', axis: 'z', at: 11, pos: 10, name: 'Front Door' },
  { id: 'door-yard', axis: 'x', at: 16, pos: 8, name: 'Back Door' },
  { id: 'door-kit-liv', axis: 'x', at: 7, pos: 3, name: 'Kitchen Door' },
  { id: 'door-liv-bath', axis: 'x', at: 13, pos: 3, name: 'Bathroom Door' },
  { id: 'door-kit-bed', axis: 'z', at: 6, pos: 3, name: 'Bedroom Door' },
  { id: 'door-liv-den', axis: 'z', at: 6, pos: 10, name: 'Den Archway' },
  { id: 'door-bed-den', axis: 'x', at: 7, pos: 8, name: 'Bedroom Side Door' },
];

export const POOL = { x0: 17, z0: 2, x1: 21, z1: 8 };

// type drives both the 3D model and which interactions are offered.
export const FURNITURE = [
  { id: 'fridge', type: 'fridge', name: 'Fridge', cells: [[1, 1]], use: [1, 2] },
  { id: 'counter1', type: 'counter', name: 'Counter', cells: [[2, 1]] },
  { id: 'stove', type: 'stove', name: 'Bargain Stove', cells: [[3, 1]], use: [3, 2] },
  { id: 'counter2', type: 'sink', name: 'Sink', cells: [[4, 1]] },
  { id: 'table', type: 'table', name: 'Dining Table', cells: [[4, 3], [5, 3]] },
  { id: 'tv', type: 'tv', name: 'Ancient TV', cells: [[10, 1]], use: [10, 3] },
  { id: 'couch', type: 'couch', name: 'Couch', cells: [[9, 4], [10, 4], [11, 4]] },
  { id: 'fireplace', type: 'fireplace', name: 'Fireplace', cells: [[12, 2]], use: [11, 2] },
  { id: 'tub', type: 'tub', name: 'Bathtub', cells: [[14, 1], [15, 1]], use: [14, 2] },
  { id: 'toilet', type: 'toilet', name: 'Toilet', cells: [[15, 5]], use: [14, 5] },
  { id: 'candles', type: 'candles', name: 'Scented Candles', cells: [[13, 1]], use: [13, 2] },
  { id: 'vanity', type: 'vanity', name: 'Vanity Mirror', cells: [[15, 3]], use: [14, 3] },
  // One bed per sim: only the first N beds are built (see World). bedIndex sets the order.
  { id: 'bedA', type: 'bed', name: 'Lumpy Bed', cells: [[1, 7], [1, 8]], use: [2, 7], bedIndex: 0 },
  { id: 'bedB', type: 'bed', name: 'Creaky Bed', cells: [[1, 9], [1, 10]], use: [2, 9], bedIndex: 1 },
  { id: 'bedC', type: 'bed', name: 'Squeaky Bed', cells: [[5, 6], [6, 6]], use: [5, 7], bedIndex: 2 },
  { id: 'bedD', type: 'bed', name: 'Saggy Bed', cells: [[3, 10], [4, 10]], use: [3, 9], bedIndex: 3 },
  { id: 'bedE', type: 'bed', name: 'Camp Bed', cells: [[14, 6], [15, 6]], use: [14, 7], bedIndex: 4 },
  { id: 'bedF', type: 'bed', name: 'Futon of Regret', cells: [[8, 6], [9, 6]], use: [8, 7], bedIndex: 5 },
  { id: 'dresser', type: 'dresser', name: 'Dresser', cells: [[6, 10]] },
  { id: 'computer', type: 'computer', name: 'Computer', cells: [[8, 10]], use: [8, 9] },
  { id: 'bookshelf', type: 'bookshelf', name: 'Bookshelf', cells: [[12, 10]], use: [12, 9] },
  { id: 'heater', type: 'heater', name: 'Space Heater', cells: [[14, 9]], use: [13, 9] },
  { id: 'stereo', type: 'stereo', name: 'Enormous Stereo', cells: [[15, 10]], use: [14, 10] },
  { id: 'ladder', type: 'ladder', name: 'Pool Ladder', cells: [], use: [16, 4], entry: [17, 4] },
  { id: 'grill', type: 'grill', name: 'Rusty Grill', cells: [[18, 10]], use: [18, 11] },
  { id: 'telescope', type: 'telescope', name: 'Telescope', cells: [[20, 12]], use: [19, 12] },
  { id: 'mailbox', type: 'mailbox', name: 'Mailbox', cells: [[9, 15]], use: [10, 15] },
  { id: 'shed', type: 'shed', name: 'Garden Shed', cells: [[1, 13]], use: [2, 13] },
];

export const TRAITS = {
  hotheaded: { name: 'Hot-Headed', icon: '💢', desc: 'Picks fights constantly and hits harder.' },
  clumsy: { name: 'Clumsy', icon: '🤕', desc: 'Much more likely to cause accidents.' },
  glutton: { name: 'Glutton', icon: '🍗', desc: 'Always hungry. Eats anything, even suspicious leftovers.' },
  pyro: { name: 'Pyromaniac', icon: '🔥', desc: 'Loves fire. Lights things when bored.' },
  noswim: { name: "Can't Swim", icon: '🫧', desc: 'Tires out twice as fast in the pool.' },
  paranoid: { name: 'Paranoid', icon: '👀', desc: 'Often notices poison and refuses "special" drinks.' },
  lazy: { name: 'Lazy', icon: '🥱', desc: 'Energy drains faster. Learns skills slowly.' },
  stargazer: { name: 'Stargazer', icon: '🔭', desc: 'Drawn to the telescope. The sky notices.' },
  genius: { name: 'Evil Genius', icon: '🧠', desc: 'Learns skills fast — fewer accidents. Annoying.' },
};

// Toxic roommate archetypes. Each one has manipulation tactics they use (and you can order).
export const PERSONALITIES = {
  narcissist: { name: 'The Narcissist', icon: '🪞', desc: 'Grandiose and entitled. Gaslights, triangulates, love-bombs — then discards.', tactics: ['gaslight', 'triangulate', 'lovebomb'] },
  schemer: { name: 'The Schemer', icon: '🦊', desc: 'Charming, callous and fearless. Runs smear campaigns and plays people off each other.', tactics: ['smear', 'triangulate', 'gaslight'] },
  drama: { name: 'The Drama Magnet', icon: '🎭', desc: 'Needs an audience at all times. Makes scenes and guilt-trips people into doing things.', tactics: ['scene', 'guilttrip'] },
  vampire: { name: 'The Emotional Vampire', icon: '🧛', desc: 'Drains everyone nearby with silent treatments, guilt trips and stories that never end.', tactics: ['silent', 'guilttrip', 'story'] },
  charmer: { name: 'The Charmer', icon: '😘', desc: 'Impossible to say no to. Lures people anywhere with a wink and tells jokes that could kill.', tactics: ['lure', 'joke', 'lovebomb'] },
  hacker: { name: 'The Hacker', icon: '💻', desc: 'Lives at the computer. Hacks the smart home and makes people playtest his games.', tactics: ['playtest'] },
  slob: { name: 'The Slob', icon: '🪥', desc: 'Hygiene is a conspiracy. Brushes with the toilet brush, then breathes on people until they drop.', tactics: ['breathe'] },
};

// Who you can be. You move into the target's house as one of them, hold down their job, and use
// their talents (personality tactics, traits, skills) to make the others' deaths look like accidents.
export const ROSTER = [
  { id: 'gloria', name: 'Gloria Grandeur', personality: 'narcissist', traits: ['genius', 'paranoid'], skills: { charisma: 4, chemistry: 1 },
    pitch: 'Influencer. Gaslights targets until they stop trusting their own memory, and confused people have accidents. Paranoid, so nobody poisons her.' },
  { id: 'silas', name: 'Silas Sly', personality: 'schemer', traits: ['hotheaded', 'genius'], skills: { charisma: 4, handiness: 2 },
    pitch: 'Used-car salesman. Smear campaigns turn the whole house against the target, and he wins most fights.' },
  { id: 'dolly', name: 'Dolly Drama', personality: 'drama', traits: ['paranoid', 'lazy'], skills: { charisma: 3, cooking: 1 },
    pitch: 'Soap-opera extra. Guilt-trips people into cooking for her, even the ones who absolutely should not be near a stove.' },
  { id: 'adam', name: 'Adam', personality: 'vampire', traits: ['lazy', 'genius'], skills: { charisma: 5, logic: 2 },
    pitch: 'Telemarketer. Can talk anyone to death: a silent treatment tanks their Fun, then one of his endless stories finishes the job.' },
  { id: 'asraa', name: 'Asraa Z', personality: 'charmer', traits: ['genius', 'stargazer'], immortal: true, skills: { chemistry: 10, charisma: 11, logic: 10, cooking: 8 },
    look: 'glam', color: 0x8e1f3d, skin: 0xe0ac69, pitch: 'Dr. of chemistry and expert witness at a law firm: the best-paid job in town. Immortal, devastatingly gorgeous, and she gets away with everything: her charisma goes to eleven. Her designer toxins are untraceable, nobody refuses her drinks, and suspicion fades twice as fast around her.' },
  { id: 'daniel', name: 'Daniel', personality: 'hacker', traits: ['genius', 'lazy'], immortal: true, skills: { logic: 7, handiness: 3 },
    pitch: 'Immortal hacker who makes obscure indie games from home (no commute, but no alibi either). From the computer he can overload the wiring or smart-lock every door.' },
  { id: 'vincent', name: 'Vincent', personality: 'slob', traits: ['glutton', 'lazy'], skills: { handiness: 3, chemistry: 2, cooking: 1 },
    look: 'slob', color: 0xc9b26b, pitch: 'Dental hygienist at a discount clinic who brushes his teeth with the toilet brush. Every morning. With pride. Fresh from the bowl, his breath floors grown adults one close-up "good morning" at a time, and sleeping roommates get it worst.' },
  { id: 'pete', name: 'Pyro Pete', first: 'Pete', personality: 'schemer', traits: ['pyro', 'genius'], skills: { handiness: 4, chemistry: 2 },
    pitch: 'Works at the fireworks shop. Lights fireplaces, stokes them, cranks heaters. Knows exactly how close is too close.', locked: true },
  { id: 'bertha', name: 'Big Bertha', first: 'Bertha', personality: 'drama', traits: ['hotheaded', 'glutton'], skills: { charisma: 3, handiness: 2 },
    pitch: 'Nightclub bouncer, works nights. Throws scenes, throws punches, rarely loses.', locked: true },
  { id: 'gus', name: 'Gassy Gus', first: 'Gus', personality: 'vampire', traits: ['glutton', 'genius'], skills: { cooking: 5, chemistry: 1 },
    pitch: 'Chili cook with an iron stomach. Eat the chili yourself and walk into a small room with the target.', locked: true },
  { id: 'seance', name: 'Sister Séance', first: 'Séance', personality: 'narcissist', traits: ['stargazer', 'paranoid'], skills: { charisma: 3, chemistry: 2 },
    pitch: 'Works the psychic hotline from home at night. Her dark-arts research raises Doom twice as fast.', locked: true },
];

export const FIRST_NAMES = ['Chad', 'Mildred', 'Reginald', 'Delilah', 'Bartholomew', 'Ivy', 'Gordon',
  'Petunia', 'Cornelius', 'Wanda', 'Malcolm', 'Griselda', 'Ambrose', 'Ophelia', 'Doyle', 'Ursula',
  'Mortimer', 'Agatha', 'Lucius', 'Beatrix'];
export const LAST_NAMES = ['Malwood', 'Grimshaw', 'Vipers', 'Cruze', 'Fang', 'Nightshade', 'Rot',
  'Wicked', 'Vane', 'Blight', 'Scowle', 'Thorne', 'Ashgrave', 'Cinder', 'Gall', 'Doom'];

export const SIM_COLORS = [0xe0574a, 0x4a90e0, 0xe0c04a, 0x6ac25a, 0xb26ae0, 0xe08a4a, 0x4ac0b0, 0xe04a9a];
export const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

export const CAUSES = {
  Fire: { icon: '🔥', lines: ['went up in flames, still insisting it was under control.', 'was flambéed by their own cooking.', 'panicked in exactly the wrong direction.',
    'learned that hairspray and candles are not a skincare routine.', 'weeded the garden, then became the weeds.'] },
  Drowning: { icon: '🌊', lines: ['discovered the pool had no way out.', 'treaded water until they didn\'t.', 'sank while cursing whoever took the ladder.'] },
  Electrocution: { icon: '⚡', lines: ['learned electricity is not a hobby.', 'lit up like a Christmas tree. Once.', 'should have unplugged it first.'] },
  Starvation: { icon: '🍽️', lines: ['starved behind a wall that used to be a door.', 'was too busy scheming to eat.', 'wasted away, evil to the last breath.'] },
  Poison: { icon: '🧪', lines: ['ate the leftovers. The leftovers won.', 'accepted a "special" drink. Bold.', 'should have checked the expiry date.'] },
  Fight: { icon: '🥊', lines: ['lost a fight they absolutely started.', 'talked big and got flattened.', 'discovered their rival hit harder.'] },
  Meteor: { icon: '☄️', lines: ['taunted the heavens. The heavens answered.', 'looked up at exactly the wrong moment.', 'was struck from orbit. Poetic.'] },
  Slip: { icon: '🧽', lines: ['found the freshly waxed floor. Head first.', 'moonwalked into the afterlife.', 'slipped, flailed, and did not get up.'] },
  Crushed: { icon: '📚', lines: ['was finally buried in literature.', 'reached for a book. The bookshelf reached back.', 'learned how heavy an encyclopedia collection is.'] },
  Explosion: { icon: '💥', lines: ['lit the fire. The fireworks lit everything else.', 'went out with a bang. Literally.', 'was scattered across the lot in festive colours.',
    'baked bread. The flour had other plans.'] },
  Piranhas: { icon: '🐟', lines: ['discovered the pool had new residents.', 'was eaten, bite by tiny bite.', 'will be missed by nobody, except the piranhas.'] },
  Fright: { icon: '👻', lines: ['met a ghost and their heart gave out.', 'was scared to death. By someone they killed.', 'screamed once, very loudly, then never again.'] },
  'Bear Trap': { icon: '🪤', lines: ['stepped exactly where the grass looked a bit funny.', 'found out why you shouldn\'t walk barefoot on the lawn.', 'lost a leg, then everything else.'] },
  Fart: { icon: '💨', lines: ['was taken out by one that was silent but deadly.', 'inhaled at exactly the wrong moment.', "was gassed by Grandma's three-bean chili. Tragic. Fragrant."] },
  'Letter Bomb': { icon: '📬', lines: ['finally got some mail. It was the last.', 'opened a parcel marked "DEFINITELY NOT A BOMB".', 'signed for a delivery with their entire body.'] },
  Boredom: { icon: '🥱', lines: ['was bored to death by a four-hour story about crypto.', 'died mid-yawn. The story continues without them.', 'begged for the story to end. It did — for them.'] },
  'Car Crash': { icon: '🚗', lines: ['was in the front garden when a car arrived without its brakes.', 'met a hatchback at forty miles an hour. The hatchback won.', 'was flattened by rush hour, which came early and through the fence.'] },
  'Biker Gang': { icon: '🏍️', lines: ['was beaten to a pulp by bikers who had never met them.', 'looked at Knuckles funny. Once.', 'was trampled by a man called Tiny.'] },
  Laughter: { icon: '😂', lines: ['laughed so hard their heart simply gave up.', 'died laughing. Genuinely, finally, completely.', 'heard the punchline and never recovered.'] },
  'Bad Breath': { icon: '🤢', lines: ['got a "good morning" from two centimetres away and never got another.', 'was breathed on by someone who brushes with the toilet brush.', 'smelled something so foul their heart took early retirement.'] },
};

// More dark humour: newspaper headlines, gravestone epitaphs and the Reaper's commentary.
export const HEADLINES = {
  Fire: ['LOCAL COOK FINALLY GETS A REVIEW: "WELL DONE"', 'HOUSE FIRE BLAMED ON "VIBES"', '"EXTRA HOLD" HAIRSPRAY HOLDS FLAME FOR RECORD TIME'],
  Drowning: ['POOL PARTY ENDS EARLY FOR ONE GUEST', 'LADDER STILL MISSING, POLICE "NOT REALLY LOOKING"'],
  Electrocution: ['DIY ENTHUSIAST FINALLY CONDUCTS SOMETHING', 'TV REPAIR GOES "SHOCKINGLY" WRONG, PUN INTENDED'],
  Starvation: ['MAN LOCKED IN BEDROOM "HAD IT COMING", SAYS LANDLORD', 'ROOM WITHOUT A DOOR CLAIMS FIRST TENANT'],
  Poison: ['LEFTOVERS WIN AGAIN', 'EXPIRY DATE IGNORED FOR THE LAST TIME'],
  Fight: ['ROOMMATE DISPUTE SETTLED PERMANENTLY', 'LOCAL BRAWL: ONE WINNER, ONE HEADSTONE'],
  Meteor: ['ASTRONOMERS CALL IT "ONE IN A BILLION". NEIGHBOURS CALL IT "DESERVED"', 'SKY FINALLY ANSWERS BACK'],
  Slip: ['FLOOR DESCRIBED AS "SPOTLESS" AT INQUEST', 'CLEANEST DEATH SCENE DETECTIVES HAVE EVER SEEN'],
  Crushed: ['READING IS DANGEROUS, SAYS CORONER', 'BOOKSHELF CHARGED WITH NOTHING'],
  Explosion: ['FIREWORKS SEASON STARTS EARLY', 'NEIGHBOURS REPORT "LOVELY COLOURS, ONE SCREAM"', 'HOME BAKER RISES TO THE OCCASION, THEN KEEPS RISING'],
  Piranhas: ['AQUARIUM "DELIGHTED" TO HEAR FISH ARE EATING WELL', 'POOL CLOSED FOR "RESTOCKING"'],
  Fright: ['GHOST DENIES INVOLVEMENT', 'HAUNTING RATED FIVE STARS ON REVIEW SITE'],
  'Bear Trap': ['SUBURBAN BEAR POPULATION: STILL ZERO. BEAR TRAPS: ONE FEWER', 'GARDEN LANDSCAPING TURNS LETHAL'],
  Fart: ["GRANDMA'S CHILI RECIPE CLASSIFIED AS A WEAPON", 'AIR QUALITY WARNING ISSUED FOR ONE BATHROOM'],
  'Letter Bomb': ['POSTMAN DENIES EVERYTHING, WHISTLES', 'FINALLY, SOME MAIL THAT ISN\'T A BILL'],
  Boredom: ['MAN DIES DURING STORY; STORY CONTINUES', 'CRYPTO CLAIMS ANOTHER VICTIM (INDIRECTLY)'],
  'Car Crash': ['BRAKES FAIL, FENCE FAILS, RESIDENT FAILS', 'DRIVER "JUST WANTED TO SEE THE GARDEN"'],
  'Biker Gang': ['BIKER GANG "JUST PASSING THROUGH", SAYS BIKER GANG', 'LOCAL MAN MEETS HELL\'S GRANNIES. LOCAL MAN LOSES'],
  Laughter: ['COMEDIAN "DEVASTATED", ALSO "A LITTLE PROUD"', 'KILLER JOKE CLAIMS ANOTHER VICTIM'],
  'Bad Breath': ['TOILET BRUSH SOUGHT FOR QUESTIONING', 'DENTISTS: "WE SAID BRUSH TWICE A DAY, NOT WITH THAT"', 'MINTY FRESH? CORONER SAYS "NOT EVEN CLOSE"'],
};
export const EPITAPHS = ['Finally quiet.', 'Still owes rent.', 'Died as they lived: annoying.', 'Loved by no one in particular.',
  'Gone, but not missed.', 'They had it coming.', 'Here lies a terrible roommate.', 'Please do not disturb. Seriously.',
  'At least the dishes are done now.', 'Returned to sender.'];
export const REAPER_QUIPS = ['"Finally. I had this one pencilled in for years."', '"Another one from this house? I should get a parking space."',
  '"Don\'t worry, it\'s quieter where you\'re going. Well. Not with you there."', '"Sign here. And here. And... no, that\'s fine, I\'ll sign for you."',
  '"You\'re on my list twice. Someone really wanted this."'];

export const IMMORTAL_LINES = [
  'dusts off the ashes, fixes their hair and carries on.',
  'dies briefly, finds it boring, and comes back.',
  'is sent back by the Grim Reaper with a note: "not this one, too much paperwork".',
  'shrugs off certain death like a mild inconvenience.',
];

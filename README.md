# Worst Roommates

A darkly comic 3D life-sim in the browser. Everyone has a roommate they'd pay to get rid of — you take the contracts. Plant your crew in the house, hide traps, manipulate the household, and make every death look like an accident before suspicion catches up with you.

**▶ Play: https://danielhesse79.github.io/worst-roommates/**

## Features

- Eleven hand-made contracts with fixed targets, required causes of death, deadlines and ★★★ bonus goals
- Pick your crew — toxic personalities with tactics like gaslighting, triangulation and guilt-trips
- Hidden traps, Hand of Fate powers, a suspicion meter, a black market and 17 ways to die
- Visitors at the door who are the worst possible witnesses, and procedural sound with no audio files

## Run locally

The game uses ES modules, so serve it over HTTP instead of opening the HTML file:

```bash
python serve.py
```

Then open http://localhost:8642. The original 2D prototype lives at `/v1-2d/`.

Built with [Three.js](https://threejs.org/) (vendored in `vendor/`).

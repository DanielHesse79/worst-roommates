# Repository Guidelines

## Project Structure & Module Organization

The current game, **Worst Roommates**, is a static JavaScript/Three.js application.

- `index.html` and `style.css` define the page, controls, and overlays.
- `js/main.js` coordinates the game loop and session state. Simulation lives in `sim.js`, `world.js`, `autonomy.js`, `interactions.js`, `traps.js`, `visitors.js`, and `emergency.js` (fire brigade and police searches).
- `js/data.js` holds shared definitions; `js/contracts.js` defines campaign objectives, evaluation, and saved progress.
- `js/view.js`, `models.js`, `lot.js`, `garden.js`, and `effects.js` handle rendering and procedural assets; `js/ui.js` manages the interface.
- `vendor/three.module.min.js` supplies Three.js through the HTML import map. Avoid hand-editing this dependency.
- `v1-2d/` contains the earlier 2D game. Keep changes scoped to the intended version.

## Build, Test, and Development Commands

Run commands from the repository root with Python 3 installed:

- `python serve.py` serves the game at `http://localhost:8642/` with caching disabled.
- `python serve.py 9000` selects an alternate port.
- Visit `http://localhost:8642/v1-2d/` to run the earlier version.

Use an HTTP server rather than opening HTML directly because the current game uses ES modules. There is no package installation, build step, or configured automated test command.

## Coding Style & Naming Conventions

Match existing JavaScript: two-space indentation, semicolons, single-quoted strings, and explicit `.js` extensions on relative imports. Use `camelCase` for functions and variables, `PascalCase` for classes, and `UPPER_SNAKE_CASE` for shared constants. Keep filenames lowercase. Python uses four-space indentation. Preserve existing CSS custom properties and compact rules. No formatter or linter is configured.

## Testing Guidelines

No automated test framework, test naming convention, or coverage threshold exists. For behavior changes, manually check:

- Contract selection and free play; pause, speed, camera, and selection controls.
- Changed interactions, autonomy, pathfinding, and relevant win/failure conditions.
- Retry and progress persistence after reloading; browser console and network errors.

Record reproduction steps and results. Use a separate browser profile for clean progress; campaign data uses the `worst-roommates-progress` localStorage key.

## Commit & Pull Request Guidelines

The repository lives at `github.com/DanielHesse79/worst-roommates`; GitHub Pages publishes `main` as the playable game, so anything merged to `main` goes live. Use concise imperative subjects, such as `Fix pool exit pathfinding`. Keep changes focused. PRs should explain the behavior change, link relevant issues, report manual checks, and include screenshots or short recordings for visual changes.

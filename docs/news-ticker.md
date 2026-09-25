# The Daily Grave news ticker

The top strip contains 64 authored English satire headlines with public figures and fictional
afterlife appearances by historical criminals. These are invented jokes, not a live news feed.
The visible `FICTIONAL SATIRE` label stays beside the headlines, including on the menu screens.
Edit the `[category, headline]` entries in `js/news.js` to add material.

- The deck shuffles and uses every headline before starting a new cycle, avoiding adjacent repeats.
- Scrolling uses real time, independent of pause, difficulty and fast-forward in the simulation.
- Hovering with a mouse or focusing the controls with the keyboard temporarily stops scrolling.
- Pause shows the current headline in full, wrapping as needed. Next skips to another headline.
- Reduced-motion preferences select the static layout with manual Next navigation.
- The settings checkbox hides the strip. Visibility and explicit pause preferences persist locally.
- The game controls and upper panels follow the measured heights of the strip and control bar.

## Verification, 2026-09-24

Passed: JavaScript syntax checks for `js/news.js` and `js/ui.js`; `git diff --check`; an offline
Node check of all 64 unique headline texts, category/length constraints, and 100 shuffled cycles
(6,400 selections) without an early or adjacent repetition.

Browser verification is pending. The browser tool's automatic approval review blocked opening the
local preview due to an account usage-limit failure, then rejected a repeat after continuation.
No visual, console or responsive-browser result is claimed for this change.

Manual checks to complete when browser access is available:

1. Serve the repository over HTTP and open the game with clean test progress. Check the contract board,
   character picker and free play: the strip must remain above each screen without hiding controls.
2. Watch several headlines pass at normal speed, fast-forward and game pause. Check continuous motion
   at the same reading speed and no blank gap when the leading headline is removed.
3. Pause, read the full headline, use Next, and resume. Move the pointer off the strip and confirm
   scrolling restarts without needing to click elsewhere. Check keyboard Tab, Space and Enter.
4. Disable the ticker under settings and reload. Enable it again; verify saved visibility and pause
   state, correct panel positions and unaffected campaign progress.
5. Check 1440px, 900px and 390px widths, especially paused wrapping, the settings menu and the contract
   modal. With reduced motion enabled, text must remain static and Next must still work.
6. Check the browser console and network panel for errors or missing resources.

No dependencies, network feed, simulation rules, campaign storage or legacy 2D files are changed.

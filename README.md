# dogonline-torment-nexus-tracker
Track your queue and loot for dogonline.net when torment nexus-ing.

**NEW 10/24/2026**<BR />
You can additionally add keyboard controls by following the install instructions below but for [KEYBOARD-CONTROLS.js](KEYBOARD-CONTROLS.js)

<!-- https://docs-md.com/markdown-toc-generator -->
### Table of Contents
- [Cute Splash Image](#cute-splash-image)
- [Current Possible Bugs](#current-possible-bugs)
- [To-Do](#to-do)
- [Using](#using)
- [Demonstration Video](#demonstration-video)
- [Keyboard Controls Screenshots](#keyboard-controls-screenshots)

## Cute Splash Image

<img width="1016" height="1216" alt="image" src="https://github.com/user-attachments/assets/86651dc3-5ea2-4176-bc21-3b333c3d5772" />

## Current Possible Bugs

- Failing to Lyre Hot Pot will let reinforcements spawn which are not yet taken into account.<br />This will be fixed. In the meantime, make sure to Lyre your Hot Pots.

## To-Do

- ~~See if Freak Staff works properly (it probably doesn't)~~ **It does.** I'm amazing.
- Add Peeper Beeper spawn support
- Add Reaper Peepers Reaper support
- ~~Make scythed enemy copies monochrome~~
  - Addressed in commit [`5a97400`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/5a97400601b4e019ad6accaaaf3731dafa02932f) <sub><i>cloned enemies now grayscale, fix site bugs that make non-cloned enemies grayscale also</i></sub>
  - Addressed in commit [`d224387`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/d224387e50b13072db8ad3232d0a7d395502396a) <sub><i>add scythe indicator (telephony literally impossible to tell if cloned)</i></sub>
- Knowing when Dogmatic Seal is or isn't equipped
- Extend scythe overlay graphic to other non-standard spawn types (ex. beeper, reaper, hot pot, trickster donut, etc)
- Add pop up warning if you try to start a run with gold boot + a weapon equipped

## Using

Copy the code in [TOWER-TRACKER.js](TOWER-TRACKER.js) using the button provided by GitHub:
<br />
<img width="313" height="122" alt="image" src="https://github.com/user-attachments/assets/0cc778f8-ca16-4d30-8339-f39a64025fd9" />

Open [The Lonely Tower](https://dogonline.net/tower) on dogonline.net, press F12 to open devtools, paste the code into your console, then press Enter.

(Some browsers might require you to type `allow pasting` before doing so)

## Demonstration Video
https://github.com/user-attachments/assets/864d239e-08c0-4016-a093-b07ff072f022

## Keyboard Controls Screenshots

<img width="1485" height="750" alt="image" src="https://github.com/user-attachments/assets/4b9edd19-9075-494b-882c-50c66bef7d65" />

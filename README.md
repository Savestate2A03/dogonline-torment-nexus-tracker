# dogonline-torment-nexus-tracker
Track your queue and loot for dogonline.net when torment nexus-ing.

<!-- https://docs-md.com/markdown-toc-generator -->
## Table of Contents
- [Using](#using)
  - [Via Tapermonkey](#via-tapermonkey)
  - [Via Console (F12)](#via-console-f12)
- [Cute Splash Image](#cute-splash-image)
- [Latest Updates](#latest-updates)
- [Current Possible Bugs](#current-possible-bugs)
- [To-Do](#to-do)
- [Demonstration Video](#demonstration-video)

If you find this tool useful, and you have a dog pop / pawpsicle to spare... `H2N7E5A3` 🥺

## Using
### Via Tapermonkey

Read the [Tampermonkey guide](TAMPERMONKEY-GUIDE.md).

### Via Console (F12)
Copy the code in [TOWER-TRACKER.js](TOWER-TRACKER.js) using the button provided by GitHub:
<br />
<img width="313" height="122" alt="image" src="https://github.com/user-attachments/assets/0cc778f8-ca16-4d30-8339-f39a64025fd9" />

Open [The Lonely Tower](https://dogonline.net/tower) on dogonline.net, press F12 to open devtools, paste the code into your console, then press Enter.

(Some browsers might require you to type `allow pasting` before doing so)

## Cute Splash Image

<details><summary>Expand to view</summary><img width="1016" height="1216" alt="image" src="https://github.com/user-attachments/assets/86651dc3-5ea2-4176-bc21-3b333c3d5772" /></details>

## Latest Updates
**NEW 11/5/2026**<BR />
- Fix light mode on chrome (actually actually for real for real this time)
- Add `@top-level-async` to Userscript settings
- Options and Loot show on map
- Some CSS optimizations
- Option to disable queue entirely
- Add DOGGI export for tower logging efforts

----

**NEW 11/4/2026**<BR />
Lots of QoL added in  commit [`c290444`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/c290444aa3730c1aca0bff169cb412c19f9eb9f9)!
- Works in light mode now! (for real this time!!!)
- Dogmatic Seal option added to options menu
- Queue list automatically hides >= 100 enemies
- Latest loot shows up at the top of the list so you don't have to keep scrolling
- Tower Floor Select and Buttons now appear at the top of the webpage (added in commit [`f2cfcdf`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/f2cfcdfe0cd6d69206a3359c0d8d32eeee24923e), thank you amgg!)
- Option in menu added to allow disabled weapon presses to advance text (added in commit [`4abaae0`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/4abaae0dffcdf7fd19a36a8ec69fd348fdf7d20c))
- Loot tracking classification! (added in commit [`ab5e74a`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/ab5e74a6624dfef9353c1fb798d3cef2b948fc86), with help from bethan (mazel) in [PR #2](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/pull/2))
<img width="230" height="429" alt="image" src="https://github.com/user-attachments/assets/85eeac0b-6eb9-490b-b31e-6fcaf307fd0e" />

----

**NEW 11/2/2026**<BR />
Keyboard controls now integrated into the main tracker in commit [`77ace4c`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/77ace4c6f4bf37c419cee8a4777954aeec5046e8)!
- Toggleable option
- Bind buttons by clicking button first, then key next
- Works in light mode now!
<img width="360" alt="image" src="https://github.com/user-attachments/assets/1bca2a0b-a6c7-4e7e-aafd-7ebc91f12b37" />

----

**NEW 10/28/2026**<BR />
New options menu added in commit [`8d8e8c5`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/8d8e8c5b4f8207a6f5d9d77bb9ed8758710f9897)!
- Clear loot between sessions enable/disable
- Congo line enable/disable
- Automatic scrolling enable/disable
<img width="360" height="158" alt="image" src="https://github.com/user-attachments/assets/2504cb85-8220-4e81-9298-e9e42c2805a9" />

## Current Possible Bugs

- Failing to Lyre Hot Pot will let reinforcements spawn which are not yet taken into account.<br />This will be fixed. In the meantime, make sure to Lyre your Hot Pots.

## To-Do

- ~~See if Freak Staff works properly (it probably doesn't)~~ **It does.** I'm amazing.
- Add Peeper Beeper spawn support
- Add Reaper Peepers Reaper support
- ~~Make scythed enemy copies monochrome~~
  - Addressed in commit [`5a97400`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/5a97400601b4e019ad6accaaaf3731dafa02932f) <sub><i>cloned enemies now grayscale, fix site bugs that make non-cloned enemies grayscale also</i></sub>
  - Addressed in commit [`d224387`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/d224387e50b13072db8ad3232d0a7d395502396a) <sub><i>add scythe indicator (telephony literally impossible to tell if cloned)</i></sub>
- ~~Knowing when Dogmatic Seal is or isn't equipped~~
- Extend scythe overlay graphic to other non-standard spawn types (ex. beeper, reaper, hot pot, trickster donut, etc)
- Add pop up warning if you try to start a run with gold boot + a weapon equipped
- ~~Congo line toggle~~
  - Addressed in commit [`8d8e8c5`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/8d8e8c5b4f8207a6f5d9d77bb9ed8758710f9897) <sub><i>features update</i></sub>
- Frisbee Tracker
- ~~Persist Loot Option Between Dives~~
  - Addressed in commit [`8d8e8c5`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/8d8e8c5b4f8207a6f5d9d77bb9ed8758710f9897) <sub><i>features update</i></sub>
- ~~Detect if No Longer In Tower (But Floor isn’t Clear, eg suspended)~~
  - Addressed in commit [`8d8e8c5`](https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/commit/8d8e8c5b4f8207a6f5d9d77bb9ed8758710f9897) <sub><i>features update</i></sub>

## Demonstration Video
https://github.com/user-attachments/assets/864d239e-08c0-4016-a093-b07ff072f022

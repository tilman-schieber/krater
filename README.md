# KRATER

Moles with bazookas: a turn-based artillery game in the tradition of Worms, built in TypeScript with no runtime dependencies. Runs entirely in the browser. A sibling of [Vektor](https://github.com/tilman-schieber/vektor) and [Kaboom](https://github.com/tilman-schieber/kaboom), on the same [arcade-kit](https://github.com/tilman-schieber/arcade-kit), with sprite art drawn with [PixelLab](https://pixellab.ai).

**Play:** https://gh.tschieber.de/krater/

Two to four teams of moles take turns on a destructible map: walk, jump, aim, fire one weapon, then run. Every blast leaves a crater; whatever falls into the water at the bottom is gone, and after a while the water rises. The last team with a mole standing wins.

Teams are human or CPU, set on the title screen. Humans share one keyboard and the game says whose turn it is; CPU moles come in three strengths. Three maps (jungle, arctic, volcano), generated fresh every game, with caves, overhangs and islands.

## Weapons

Tab opens the panel. Most are unlimited; the rarer ones come a few per game and in crates.

| Weapon | What it does |
| --- | --- |
| Bazooka | Blows up on contact. The wind bends it. |
| Grenade | Bounces, goes off when the fuse runs out; 1-5 set the fuse. |
| Cluster | Flies like a shell; press fire again while it flies and five bomblets rain down from there. On the ground it bursts upward. |
| Shotgun | Two straight shots of 30; aim again in between. |
| Dynamite | Dropped at your feet, five seconds. Run. |
| Airstrike | Five bombs on a mark, from the side you point at. Open sky only. |
| Teleport | Anywhere in one blink. Ends the turn. |
| Girder | A steel beam, in four orientations, to stand on or hide behind. Doesn't end the turn. |
| Rope | Hook on and swing; fire again or jump to let go. Doesn't end the turn. |
| Bat | A whack for whoever stands in front of you. Best at the water's edge. |
| Skip | End the turn without a shot. |

Crates float down between turns: a red cross heals 25, a bomb is one more of a rare weapon. A mole that runs out of health blows up, and that blast hurts too.

## Controls

| Key | Action |
| --- | --- |
| Left / Right (A / D) | Walk |
| Up / Down (W / S) | Aim; turn a girder |
| Space | Hold to charge, let go to fire; confirm a mark |
| Enter | Jump forward |
| Backspace | Backflip |
| Tab / Q | Weapons |
| 1-5 | Fuse of grenades and clusters |
| Esc | Pause (Backspace quits from the pause screen) |
| Z | Zoom out and in (100%, 66%, 50%) |
| M | Music on/off |

With the mouse: drag, or push against the screen's edge, to look around; the wheel zooms; click to place a mark and click it again to confirm an airstrike, teleport or girder (a click on the panel picks a weapon). The turn clock can be switched off on the title screen. A gamepad works too: stick or d-pad to walk and aim, A fires, B jumps, X flips, Y or the shoulder buttons open the weapons, Start pauses. On phones, the buttons are below the screen and a tap on the map places the mark.

## CPU moles

A CPU mole tries shots on the game's own flight code: a grid of angles and powers for the bazooka, grenade and cluster (with the wind and the bounces), straight lines for the shotgun, the sky over each enemy for an airstrike, and dynamite or the bat when it stands next to someone. Each shot is scored by the damage it would do to the other teams minus what it would do to its own, with bonuses for kills and for knocks toward the water. If nothing is worth firing, it walks toward the nearest enemy and looks again. Skill blurs the chosen angle and power, thins the search and makes it pick worse options now and then.

## Art

The mole is a PixelLab v3 character (side view, 40px) with template animations for idle, walk, jump, backflip, hurt, death and throw; teams are palette swaps of the red bandana. Weapon icons, projectiles, crates and the gravestone come from PixelLab object packs, the explosion from its effects artist, the terrain textures and the parallax strips from its image generator (the textures made seamless with its inpainting). [tools/ASSETS.md](tools/ASSETS.md) lists each asset's tool, prompt and id. The terrain is painted in code from a solid-or-not bitmap: texture fill, a grass rim where the sky is close, dark edges, and steel for girders.

## Development

```sh
npm install
npm run dev
npm run build
```

Add `?debug` to the URL for the camera and phase readout. In a dev build the console has `game` and `sim(opts)`, which plays a CPU battle without a screen and returns the result (`sim({ seed: 1, teams: 4 })`); the world it ended with is in `.world`.

For balancing, `npm run playtest` has CPU teams fight many games headless: it starts Vite, opens the dev build in headless Chromium (`puppeteer-core`; set `CHROMIUM` if the browser isn't `/usr/bin/chromium`) and calls `sim()` once per game, thirty games in about fifteen seconds. It prints how long games run, who wins by seat and by skill, and a table per weapon: turns used, damage per use to the other teams and to the user's own, kills and water knock-ins per use, and each weapon's share of all damage. Runs are reproducible by seed; every game goes in full to `tools/playtest/out/`. `npm run playtest -- --help` lists the options.

```sh
npm run playtest -- --games 40 --teams mix            # 2, 3 and 4 teams in turn, skill 0.7
npm run playtest -- --games 30 --skills 0.2,0.9      # easy against hard: does skill matter?
npm run playtest -- --games 30 --move 0 --wind off   # a rules variant
```

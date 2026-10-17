# Krater asset log

All art was generated with PixelLab (MCP) and saved under `src/assets/`. Processing was done with ImageMagick; nothing was smooth-scaled.

## Mole

| path | tool | prompt | id |
|---|---|---|---|
| mole/stand.png | create_character (mode v3, side view, 40px, black outline, medium detail) | "chubby cartoon mole soldier standing upright on two legs, dark brown fur, big pink nose, tiny squinting eyes, round army helmet, red bandana around the neck, small claws, friendly, game character" | character 4bb809c5-ab97-4b3e-a8bc-cae315d1cf0a, east rotation |
| mole/idle_0..3 | animate_character, template breathing-idle, east | n/a | group 00c63931-e1b3-447c-88cc-e8a48b78f3bf |
| mole/walk_0..3 | template walking-4-frames, east | n/a | group 3ef3f023-17a6-4b66-81d6-7ba43cad2bf3 |
| mole/jump_0..7 | template jumping-2, east | n/a | group 49040232-679b-4928-8b77-da09218b541b |
| mole/flip_0..9 | template backflip, east | n/a | group d5d610c5-39dd-481b-934f-bafd63b5efe5 |
| mole/hurt_0..5 | template taking-punch, east | n/a | group 3d1bd146-d602-4b16-9491-c93432304f3d |
| mole/death_0..6 | template falling-back-death, east | n/a | group 05218f65-ebbc-428a-b804-2463a0b0979c |
| mole/throw_0..6 | template throw-object, east | n/a | group 7481c1e8-1c6e-4bc9-b7cd-fb2e89889619 |

Only the east direction was animated; the game mirrors it. Team colours are made at load time by recolouring the red bandana (`teamed` in `sprites.ts`). A standard-mode character (bc6d631f-e669-440d-934d-2e8ff96e2b8a) was tried first and came out as a human soldier; unused.

## Icons, items and projectiles

| path | tool | prompt (item) | id |
|---|---|---|---|
| icons/{bazooka,grenade,cluster,shotgun,dynamite,airstrike,teleport,girder,rope,bat,skip}.png, items/{crate_health,crate_weapon,parachute,grave,crosshair}.png, items/plane.png (= airstrike) | create_1_direction_object, 32px, sidescroller, 64-candidate grid with item_descriptions (review 8ec2f926-12b4-4d5b-8442-7332483f0237, frames 0-15) | "cartoon game weapon and item icons, side view, black outline, bright colours"; items: green bazooka tube, green hand grenade, cluster bomb, double barrelled shotgun, dynamite bundle with clock, grey propeller bomber plane, blue teleport swirl, steel I-beam, coiled rope with hook, baseball bat, white flag, crate with red cross, crate with bomb, parachute canopy, tombstone, red crosshair | objects a1dea90d…, 0b2efdc9…, 1b3af7b8…, 57d00786…, 45365076…, 38e3ba22…, 5ab46d6c…, b93c6255…, c9a75eb4…, 232b729f…, a77522d2…, d8d511c1…, 77933690…, ab1ae1c4…, 17862c1b…, 4253b785… (tag `krater`) |
| proj/{shell,grenade,bomblet,dynamite,hook,bomb,bullet,clod}.png | create_1_direction_object, 16px, sidescroller, 64-candidate grid (review da72edf7-3b53-4138-acb0-672b8d62d4e3, frames 0-7) | "small cartoon projectiles, side view, black outline"; items: bazooka shell pointing right, small grenade, bomblet, dynamite with lit fuse, grappling hook, aerial bomb pointing down, shotgun shell, dirt clod | objects b1be361b…, 9609ff20…, 38d2db64…, 71a1aebb…, a932a279…, f0cdaf40…, 788be147…, 58bc6c79… |

The shell sprite points right and is turned to its flight direction in code; the bomb points down. `hook`, `bullet` and `clod` are kept for later use.

## Effects

| path | tool | notes |
|---|---|---|
| fx/explosion_0..11 (64x64) | create_vfx (lite) | "round fiery explosion, orange and yellow fireball that bursts outward with a bright white flash at the start, flame tongues, then collapses into dark grey smoke puffs that drift up and fade, 64x64, about 12 frames, cartoon pixel art, black outline". Effect eed0c2c0-74e5-4b53-8707-04f60009a2fe ("krater explosion", 12 fps, anchor 14,12). The 768x64 sheet was cut with `magick -crop 64x64`. Drawn scaled to the blast radius. |

## Terrain textures (64x64)

| path | tool | prompt | job |
|---|---|---|---|
| terrain/dirt.png | create_image_pixflux (seed 11, lineless, medium shading) | "seamless brown soil dirt texture with small pebbles and roots, side view cross-section of earth, pixel art game terrain fill, no outline" | acd56059-cb11-4ef6-a56f-be862649b65c |
| terrain/ice.png | create_image_pixflux (seed 12) | "seamless packed snow and blue glacier ice texture with cracks, …" | d0bf7d5f-8c74-47d2-b918-b55a8f5fe73a |
| terrain/basalt.png | create_image_pixflux (seed 13) | "seamless dark basalt volcanic rock texture with glowing orange lava cracks, …" | 91b3219c-06da-4b7c-957e-ea7d340aebf7 |

None of the three tiled cleanly, so each was rolled by half its size (`magick -roll +32+32`) and the cross-shaped seam (10px wide) inpainted with inpaint_image ("… continuing the surrounding texture seamlessly"): jobs 39c659f3-d252-4c6a-9cb0-922dde3176e6 (dirt), dd60b85d-b0d3-4fcd-8fff-7031fe5c2e3f (ice), 92ddc160-9199-4ae6-b3e6-0c686f01945d (basalt). The committed files are the inpainted ones.

## Background strips

| path | size | prompt | job |
|---|---|---|---|
| bg/jungle_far.png | 400x160 | "distant jungle mountains and misty hills silhouette layered in blue-green haze, wide horizontal landscape strip, pixel art parallax background layer" (seed 7) | 2bcff47f-cb98-4df3-9e19-f91c51a6c138 |
| bg/jungle_near.png | 400x120 | "row of lush jungle trees and palms with ferns, dark green foliage, wide horizontal strip, pixel art parallax foreground layer, side view" (seed 8) | 60add6bd-f338-4b9e-9f6c-ecd153f31132 |
| bg/arctic_far.png | 400x160 | "distant snowy mountain range with white peaks and pale blue glaciers under a cold sky, …" (seed 7) | 586fd965-2e0f-445b-a144-cefe8d9d9f12 |
| bg/arctic_near.png | 400x120 | "row of snow covered pine trees and ice boulders, dark blue-green firs with white snow, …" (seed 8) | 60dfeb01-9477-4f94-9e24-d6fa072f89de |
| bg/volcano_far.png | 400x160 | "distant dark volcanoes erupting with red glow and ash clouds under a dark red night sky, …" (seed 7) | 7f7d5eff-13af-4ea5-8818-b2d94d2511a3 |
| bg/volcano_near.png | 400x120 | "row of jagged black basalt rock spires and dead burnt trees with glowing embers, …" (seed 8) | 7456e02c-1423-4896-8304-fd0c482f09a2 |

The far strips came back opaque with their own sky; the game paints its sky gradient down to the strip's top colour (`skyBottom` in `themes.ts`) and fills below the strip with its bottom colour (`farBottom`). The near strips had a white sky, keyed out with a flood fill from the top corners (`magick -fuzz 4% -fill none -draw "alpha 2,2 floodfill" …`).

Generations spent: about 95.

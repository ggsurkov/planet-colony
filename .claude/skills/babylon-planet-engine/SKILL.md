---
name: babylon-planet-engine
description: Conventions for changing the Babylon.js scene in src/lib/engine/PlanetEngine.ts and src/lib/engine/proceduralTextures.ts — texture/terrain-mask invariants, the Svelte boundary, and per-frame animation. Use when adding or modifying planet visuals, scanner/ability effects, colony markers, or procedural textures.
---

# PlanetEngine / procedural textures

This project renders one procedurally generated planet with Babylon.js. Two
files hold almost all of that logic:

- `src/lib/engine/PlanetEngine.ts` — the Babylon scene: camera, lights, mesh,
  materials, picking, per-frame animation.
- `src/lib/engine/proceduralTextures.ts` — pure canvas 2D drawing functions
  (diffuse map, normal map, stars, terrain mask).

## Hard invariants

1. **`proceduralTextures.ts` imports nothing from `@babylonjs/core`.** It
   must stay plain canvas code so it stays testable and reusable outside
   Babylon. Put any Babylon-specific texture logic in `PlanetEngine.ts`
   instead (see `generateCloudTexture`, `generateDetailNormalTexture` there
   for the pattern).
2. **The diffuse texture and the terrain mask must derive from the same
   seeded noise (`terrainElevation`, `isLiquidAt`, same `seed`).** A pixel
   that looks like a dark pool on screen must classify as `LIQUID` when
   clicked. Never add a second, independent noise source for one but not
   the other.
3. **The planet mesh stays `MeshBuilder.CreateSphere`, never an icosphere.**
   Its lat/long UV layout is what the equirectangular textures and the
   terrain mask assume; an icosphere's UV unwrap would break picking and
   texture alignment.
4. **No Babylon object crosses into Svelte state.** `PlanetEngine` talks to
   the host UI only through `PlanetEngineEvents` (outbound callbacks) and
   `PlanetControls` (a narrow inbound imperative handle), both defined in
   `src/lib/types/game.ts`. Adding a new capability the UI can trigger means
   adding a method to `PlanetControls`, not exposing the engine or scene.
5. **New textures get max-quality filtering.** Call
   `applyMaxQualityFiltering()` on any new `DynamicTexture`/`Texture`, same
   as the existing diffuse/bump/detail/cloud textures.
6. **Per-frame animation lives in `tick()`.** Time-based effects (fades,
   rotation, pulsing) read `performance.now()` / `engine.getDeltaTime()`
   inside `tick()`, not in a separate `setInterval`. `setTimeout`/`setInterval`
   are only for one-shot delays (e.g. the scan-duration timeout), and must be
   cleared in `dispose()`.
7. **Self-glowing shells get excluded from `GlowLayer`.** If a new mesh
   fakes its own emissive glow (Fresnel rim, neon material), call
   `glowLayer.addExcludedMesh(mesh)` — otherwise `GlowLayer` blooms it into a
   flat, blown-out shape (see `createAtmosphereAndClouds`).
8. **`dispose()` must undo everything the constructor started**: timers,
   `window` listeners, the render loop, then `scene.dispose()` /
   `engine.dispose()`.

## Adding a tunable constant

Follow the existing top-of-file pattern: a named `const`, and — only when the
chosen value isn't self-explanatory — a short comment giving the reason
(e.g. why `BASE_AMBIENT_INTENSITY` is `0.08`, not the tuning history of every
value tried). Don't hardcode magic numbers inline in methods.

## Before changing texture/terrain code

Read `terrainElevation`, `isLiquidAt`, and `BIOME_PALETTES` in
`proceduralTextures.ts` first — most visual changes (new biome, new liquid
behavior) are a palette or threshold change there, not new noise functions.

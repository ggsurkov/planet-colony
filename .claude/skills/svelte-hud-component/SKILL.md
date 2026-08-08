---
name: svelte-hud-component
description: Conventions for Svelte 5 UI components in src/lib/components/ — runes-only state, callback-prop wiring to App.svelte, the Babylon/Svelte boundary, and the sci-fi HUD visual language (Tailwind, cyan/amber/emerald, font-mono). Use when adding or editing any HUD overlay, panel, toast, modal, or dock component.
---

# Svelte HUD components

`src/lib/components/*.svelte` are Svelte 5 runes-mode components that render
the game's sci-fi HUD around the Babylon canvas (`PlanetViewport.svelte`).

## State and props

1. **Runes only.** `$props()`, `$state()`, `$derived()`, `$effect()`. Never
   use legacy `export let` or `$:`.
2. **Props via an explicit `interface Props`**, then destructure:
   ```ts
   interface Props {
     colony: Colony | null;
     open: boolean;
   }
   let { colony, open }: Props = $props();
   ```
3. **Parent–child communication is callback props, not `createEventDispatcher`.**
   Name them `onXxx` (`onColonyCreated`, `onClose`, `onBuildModule`, ...) and
   wire the handler in `App.svelte`, matching its existing `handleXxx`
   functions. `App.svelte` is the single owner of game state — new
   components don't introduce a store.
4. **Clear every `setTimeout`/`setInterval` in `onDestroy`.** See
   `BottomDock.svelte`'s `clearCountdown`/flash-timeout pattern.

## The Babylon/Svelte boundary

Only `PlanetViewport.svelte` touches `PlanetEngine` directly. It exposes a
plain-data `PlanetControls` handle (see `src/lib/types/game.ts`) through
`onEngineReady`, and forwards engine events as plain values (numbers,
strings, plain `{x,y,z}` objects) — never a Babylon `Scene`, `Mesh`, or
`Material`. Any new component that needs to trigger an engine ability adds a
method to `PlanetControls` and receives the handle as a prop, same as
`BottomDock`.

## Visual language

Match the existing HUD look — see `HudOverlay.svelte` and `BottomDock.svelte`:

- Tailwind utility classes only. No component-scoped `<style>` blocks.
- Palette: cyan (`cyan-300`/`cyan-400`) as primary, amber for
  warnings/aiming state, emerald for active/success state.
- `font-mono`, wide letter-spacing (`tracking-widest`, `tracking-[0.2em]`).
- Glow via `drop-shadow-[...]` / `shadow-[0_0_Npx_rgba(...)]` arbitrary
  values, not Tailwind's default `shadow-*` scale.
- Panels use `backdrop-blur-md` over a dark, semi-transparent background
  (`bg-[#0a1128]/80` or `bg-slate-950/90`).
- Decorative/status-only layers get `pointer-events-none`; only the actual
  interactive control cluster inside gets `pointer-events-auto`.

## Adding a new HUD element

1. Add the `.svelte` file in `src/lib/components/`.
2. Add its state and `handleXxx` callbacks to `App.svelte`.
3. Mount it inside `<main>` in `App.svelte`, passing plain-data props and
   callback props — never a Babylon object, never the raw `PlanetEngine`.

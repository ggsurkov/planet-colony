<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { PlanetEngine } from '../engine/PlanetEngine';
	import type { Colony, OrbitStatus, PlanetControls } from '../types/game';

	interface Props {
		onColonyCreated: (colony: Colony) => void;
		onColonySelected: (colonyId: string) => void;
		onOrbitStatusChanged: (status: OrbitStatus) => void;
		onPlacementDenied: (reason: string) => void;
		onPlacementPending: (point: { x: number; y: number; z: number }) => void;
		onReady?: () => void;
		onEngineReady?: (controls: PlanetControls) => void;
		onScanTriggered?: (durationMs: number) => void;
	}

	let {
		onColonyCreated,
		onColonySelected,
		onOrbitStatusChanged,
		onPlacementDenied,
		onPlacementPending,
		onReady,
		onEngineReady,
		onScanTriggered
	}: Props = $props();

	let canvasEl: HTMLCanvasElement;
	let engine: PlanetEngine | null = null;

	onMount(() => {
		engine = new PlanetEngine(canvasEl, {
			onColonyCreated,
			onColonySelected,
			onOrbitStatusChanged,
			onPlacementDenied,
			onPlacementPending,
			onReady: () => onReady?.(),
			onScanTriggered: (durationMs) => onScanTriggered?.(durationMs)
		});

		// Narrow imperative handle only — never hand the PlanetEngine instance
		// itself (or any Babylon object) out to Svelte state.
		onEngineReady?.({
			enableScanTarget: () => engine?.enableScanTarget(),
			placeColony: (point) => engine?.placeColony(point)
		});
	});

	onDestroy(() => {
		engine?.dispose();
		engine = null;
	});
</script>

<canvas bind:this={canvasEl} class="block h-full w-full touch-none outline-none"></canvas>

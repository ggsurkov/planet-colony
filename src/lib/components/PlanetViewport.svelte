<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { PlanetEngine } from '../engine/PlanetEngine';
	import type { Colony, OrbitStatus } from '../types/game';

	interface Props {
		onColonyCreated: (colony: Colony) => void;
		onColonySelected: (colonyId: string) => void;
		onOrbitStatusChanged: (status: OrbitStatus) => void;
		onPlacementDenied: (reason: string) => void;
		onReady?: () => void;
	}

	let { onColonyCreated, onColonySelected, onOrbitStatusChanged, onPlacementDenied, onReady }: Props = $props();

	let canvasEl: HTMLCanvasElement;
	let engine: PlanetEngine | null = null;

	onMount(() => {
		engine = new PlanetEngine(canvasEl, {
			onColonyCreated,
			onColonySelected,
			onOrbitStatusChanged,
			onPlacementDenied,
			onReady: () => onReady?.()
		});
	});

	onDestroy(() => {
		engine?.dispose();
		engine = null;
	});
</script>

<canvas bind:this={canvasEl} class="block h-full w-full touch-none outline-none"></canvas>

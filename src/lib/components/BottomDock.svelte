<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { PlanetControls } from '../types/game';

	/** Emitted by App.svelte the instant PlanetEngine fires the scan (a click
	 *  on the planet while aiming) — `id` changes on every trigger so the
	 *  effect below can tell a fresh trigger apart from the same value
	 *  arriving again. */
	interface ScanTrigger {
		durationMs: number;
		id: number;
	}

	interface Props {
		planetControls: PlanetControls | null;
		ready: boolean;
		scanTrigger: ScanTrigger | null;
	}

	let { planetControls, ready, scanTrigger }: Props = $props();

	const SLOT_COUNT = 9;

	type ScannerState = 'idle' | 'aiming' | 'scanning';

	let scannerState = $state<ScannerState>('idle');
	let scanSecondsLeft = $state(0);
	let countdownInterval: ReturnType<typeof setInterval> | undefined;
	let lastHandledTriggerId = -1;

	function clearCountdown() {
		if (countdownInterval !== undefined) {
			clearInterval(countdownInterval);
			countdownInterval = undefined;
		}
	}

	function handleScannerClick() {
		// Only arms targeting mode — the scan itself now fires the instant the
		// player clicks the planet, tracked via the `scanTrigger` prop below.
		if (!ready || !planetControls || scannerState !== 'idle') return;
		planetControls.enableScanTarget();
		scannerState = 'aiming';
	}

	$effect(() => {
		if (!scanTrigger || scanTrigger.id === lastHandledTriggerId) return;
		lastHandledTriggerId = scanTrigger.id;

		scannerState = 'scanning';
		scanSecondsLeft = Math.round(scanTrigger.durationMs / 1000);

		clearCountdown();
		countdownInterval = setInterval(() => {
			scanSecondsLeft -= 1;
			if (scanSecondsLeft <= 0) {
				clearCountdown();
				scannerState = 'idle';
			}
		}, 1000);
	});

	onDestroy(clearCountdown);

	let scannerButtonClass = $derived(
		scannerState === 'aiming'
			? 'border-amber-400/70 bg-amber-400/10'
			: scannerState === 'scanning'
				? 'border-emerald-400/70 bg-emerald-400/10'
				: 'border-cyan-400/30 bg-cyan-400/5'
	);
	let scannerIconClass = $derived(
		scannerState === 'aiming'
			? 'text-amber-300'
			: scannerState === 'scanning'
				? 'text-emerald-300 animate-spin'
				: 'text-cyan-300'
	);

	// Slots 1..8 (index 1..8, key '2'..'9') have no ability wired up yet — a
	// hotkey press still gives Sci-Fi tactile feedback via a brief flash.
	const PLACEHOLDER_COUNT = SLOT_COUNT - 1;
	let flashedSlot = $state<number | null>(null);
	let flashTimeout: ReturnType<typeof setTimeout> | undefined;

	function flashPlaceholder(index: number) {
		flashedSlot = index;
		if (flashTimeout) clearTimeout(flashTimeout);
		flashTimeout = setTimeout(() => {
			flashedSlot = null;
		}, 180);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.repeat) return;
		if (e.key < '1' || e.key > '9') return;
		const index = Number(e.key) - 1;
		if (index >= SLOT_COUNT) return;

		if (index === 0) {
			handleScannerClick();
			return;
		}
		flashPlaceholder(index);
	}

	onDestroy(() => {
		if (flashTimeout) clearTimeout(flashTimeout);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if scannerState === 'scanning'}
	<div class="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center">
		<div
			class="animate-pulse rounded border border-emerald-400/50 bg-slate-950/90 px-4 py-1.5 font-mono text-xs tracking-[0.2em] text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.35)]"
		>
			[SCANNING DARK SIDE: {scanSecondsLeft}s]
		</div>
	</div>
{/if}

<div class="pointer-events-auto fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
	<div
		class="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-[#0a1128]/80 p-2 shadow-[0_0_24px_rgba(56,224,255,0.15)] backdrop-blur-md"
	>
		<button
			type="button"
			onclick={handleScannerClick}
			disabled={!ready}
			title="Scanner Module [1]"
			class="group relative flex h-14 w-14 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40 {scannerButtonClass}"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				class="h-7 w-7 transition {scannerIconClass}"
			>
				<circle cx="12" cy="12" r="9" opacity="0.35" />
				<circle cx="12" cy="12" r="6" opacity="0.6" />
				<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
				<path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
			</svg>
			<span
				class="pointer-events-none absolute inset-0 rounded-lg opacity-0 shadow-[0_0_14px_rgba(56,224,255,0.5)] transition group-hover:opacity-100"
			></span>
			<span
				class="pointer-events-none absolute bottom-0.5 right-1 font-mono text-[9px] leading-none tracking-tighter text-cyan-300/70"
			>
				[1]
			</span>
		</button>

		{#each Array(PLACEHOLDER_COUNT) as _, i (i)}
			{@const slotIndex = i + 1}
			<button
				type="button"
				onclick={() => flashPlaceholder(slotIndex)}
				title="Dock Slot [{slotIndex + 1}]"
				class="group relative h-14 w-14 rounded-lg border transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:shadow-[0_0_14px_rgba(56,224,255,0.35)] {flashedSlot ===
				slotIndex
					? 'border-cyan-300/80 bg-cyan-400/20 shadow-[0_0_14px_rgba(56,224,255,0.5)]'
					: 'border-cyan-400/15 bg-cyan-400/[0.03]'}"
			>
				<span
					class="pointer-events-none absolute bottom-0.5 right-1 font-mono text-[9px] leading-none tracking-tighter text-cyan-300/50"
				>
					[{slotIndex + 1}]
				</span>
			</button>
		{/each}
	</div>
</div>

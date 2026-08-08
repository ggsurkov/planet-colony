<script lang="ts">
	import type { OrbitStatus } from '../types/game';

	interface Props {
		orbitStatus: OrbitStatus | null;
		colonyCount: number;
		ready: boolean;
	}

	let { orbitStatus, colonyCount, ready }: Props = $props();

	function fmt(n: number | undefined): string {
		if (n === undefined || Number.isNaN(n)) return '---';
		return n.toString().padStart(3, '0');
	}
</script>

<div class="pointer-events-none absolute inset-0 font-mono text-cyan-300">
	<!-- corner brackets -->
	<div class="absolute left-4 top-4 h-10 w-10 border-l-2 border-t-2 border-cyan-400/70"></div>
	<div class="absolute right-4 top-4 h-10 w-10 border-r-2 border-t-2 border-cyan-400/70"></div>
	<div class="absolute bottom-4 left-4 h-10 w-10 border-b-2 border-l-2 border-cyan-400/70"></div>
	<div class="absolute bottom-4 right-4 h-10 w-10 border-b-2 border-r-2 border-cyan-400/70"></div>

	<!-- center crosshair -->
	<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
		<div class="relative h-14 w-14 opacity-60">
			<div class="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-cyan-300"></div>
			<div class="absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 bg-cyan-300"></div>
			<div class="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-cyan-300"></div>
			<div class="absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 bg-cyan-300"></div>
			<div class="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/80"></div>
		</div>
	</div>

	<!-- top status bar -->
	<div class="absolute inset-x-0 top-0 flex items-start justify-between px-6 py-4 text-xs tracking-widest">
		<div>
			<div class="text-lg font-semibold tracking-[0.3em] text-cyan-200 drop-shadow-[0_0_8px_rgba(56,224,255,0.6)]">
				EXO-772 <span class="text-cyan-500">/</span> AURELIA
			</div>
			<div class="mt-1 text-cyan-400/70">
				{ready ? 'ORBITAL SCAN LINK — STABLE' : 'INITIALIZING ORBITAL LINK...'}
			</div>
			<div class="mt-2 space-y-0.5 text-amber-400/80">
				<div>ATMOSPHERE: <span class="text-amber-300">UNBREATHABLE (0.00 bar)</span></div>
				<div>TERRAFORM INDEX: <span class="text-amber-300">0.0%</span></div>
				{#if orbitStatus}
					<div>SURFACE TYPE: <span class="text-amber-300">{orbitStatus.planetType}</span></div>
				{/if}
			</div>
		</div>
		<div class="text-right leading-relaxed text-cyan-300/90">
			<div>ALT&nbsp;<span class="text-cyan-100">{fmt(orbitStatus?.altitudeKm)}</span>&nbsp;KM</div>
			<div>LON&nbsp;<span class="text-cyan-100">{fmt(orbitStatus?.longitudeDeg)}</span>&deg;</div>
			<div>LAT&nbsp;<span class="text-cyan-100">{fmt(orbitStatus?.latitudeDeg)}</span>&deg;</div>
			<div class="mt-1 text-cyan-500/80">COLONIES: <span class="text-cyan-100">{colonyCount}</span></div>
		</div>
	</div>

	<!-- bottom hint -->
	<div class="absolute inset-x-0 bottom-4 flex justify-center text-[11px] tracking-[0.2em] text-cyan-400/50">
		CLICK SURFACE TO DEPLOY COLONY BEACON &middot; DRAG TO ORBIT &middot; SCROLL TO ZOOM
	</div>
</div>

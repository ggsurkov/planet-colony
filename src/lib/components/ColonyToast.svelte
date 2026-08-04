<script lang="ts">
	import type { Colony } from '../types/game';

	interface Props {
		colony: Colony | null;
		visible: boolean;
	}

	let { colony, visible }: Props = $props();
</script>

<div
	class="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center transition-all duration-300"
	class:opacity-0={!visible}
	class:translate-y-2={!visible}
	class:opacity-100={visible}
	class:translate-y-0={visible}
>
	{#if colony}
		<div
			class="flex items-center gap-3 rounded border border-emerald-400/40 bg-slate-950/90 px-4 py-2.5 font-mono text-sm text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.25)] backdrop-blur-md"
		>
			<span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"></span>
			<span class="tracking-wide">
				NEW COLONY DEPLOYED — <span class="font-semibold text-emerald-100">{colony.name}</span>
			</span>
		</div>
	{/if}
</div>

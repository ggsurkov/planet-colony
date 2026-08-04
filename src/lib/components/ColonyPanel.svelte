<script lang="ts">
	import type { Colony } from '../types/game';

	interface Props {
		colony: Colony | null;
		open: boolean;
		onClose: () => void;
		onBuildModule?: () => void;
	}

	let { colony, open, onClose, onBuildModule }: Props = $props();

	function coord(n: number): string {
		return n.toFixed(3);
	}
</script>

<div
	class="pointer-events-auto absolute right-0 top-0 z-20 h-full w-[22rem] max-w-[90vw] border-l border-cyan-400/30 bg-slate-950/85 font-mono text-cyan-100 shadow-[-8px_0_30px_rgba(0,0,0,0.5)] backdrop-blur-md transition-transform duration-300 ease-out"
	class:translate-x-0={open}
	class:translate-x-full={!open}
>
	{#if colony}
		<div class="flex h-full flex-col">
			<div class="flex items-start justify-between border-b border-cyan-400/20 px-5 py-4">
				<div>
					<div class="text-[10px] uppercase tracking-[0.3em] text-cyan-500/70">Colony Record</div>
					<div class="mt-1 text-lg font-semibold tracking-wide text-cyan-200 drop-shadow-[0_0_6px_rgba(56,224,255,0.5)]">
						{colony.name}
					</div>
				</div>
				<button
					onclick={onClose}
					class="rounded border border-cyan-400/30 px-2 py-1 text-xs text-cyan-300/80 transition hover:border-cyan-300 hover:text-cyan-100"
				>
					CLOSE ✕
				</button>
			</div>

			<div class="space-y-5 overflow-y-auto px-5 py-4 text-sm">
				<div class="flex items-center gap-2">
					<span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"></span>
					<span class="tracking-[0.2em] text-emerald-300">ONLINE / OPERATIONAL</span>
				</div>

				<div>
					<div class="mb-1 text-[10px] uppercase tracking-[0.25em] text-cyan-500/70">Global Coordinates</div>
					<div class="grid grid-cols-3 gap-2 text-xs text-cyan-200/90">
						<div class="rounded border border-cyan-400/15 bg-cyan-400/5 px-2 py-1">
							X <span class="block text-cyan-100">{coord(colony.position.x)}</span>
						</div>
						<div class="rounded border border-cyan-400/15 bg-cyan-400/5 px-2 py-1">
							Y <span class="block text-cyan-100">{coord(colony.position.y)}</span>
						</div>
						<div class="rounded border border-cyan-400/15 bg-cyan-400/5 px-2 py-1">
							Z <span class="block text-cyan-100">{coord(colony.position.z)}</span>
						</div>
					</div>
				</div>

				<div>
					<div class="mb-1 text-[10px] uppercase tracking-[0.25em] text-cyan-500/70">
						Established
					</div>
					<div class="text-cyan-200/90">{colony.createdAt.toLocaleString()}</div>
				</div>

				<div>
					<div class="mb-2 text-[10px] uppercase tracking-[0.25em] text-cyan-500/70">Installed Modules</div>
					<ul class="space-y-1.5">
						{#each colony.buildings as building (building)}
							<li class="flex items-center gap-2 rounded border border-cyan-400/15 bg-cyan-400/5 px-3 py-2 text-cyan-100/90">
								<span class="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
								{building}
							</li>
						{/each}
					</ul>
				</div>
			</div>

			<div class="mt-auto border-t border-cyan-400/20 px-5 py-4">
				<button
					onclick={onBuildModule}
					class="w-full rounded border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-cyan-400/20"
				>
					+ Build Module
				</button>
			</div>
		</div>
	{/if}
</div>

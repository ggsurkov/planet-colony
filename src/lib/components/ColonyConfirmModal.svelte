<script lang="ts">
	interface Props {
		open: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { open, onConfirm, onCancel }: Props = $props();
</script>

{#if open}
	<div class="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
		<div
			class="w-[26rem] max-w-[90vw] rounded-lg border border-cyan-400/40 bg-slate-950/95 font-mono text-cyan-100 shadow-[0_0_40px_rgba(56,224,255,0.25)]"
		>
			<div class="flex items-center justify-between border-b border-cyan-400/20 px-5 py-3">
				<div class="text-[10px] uppercase tracking-[0.3em] text-cyan-500/70">Landing Protocol</div>
				<span class="h-2 w-2 animate-pulse rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"></span>
			</div>

			<div class="space-y-4 px-5 py-5">
				<div class="text-sm leading-relaxed tracking-wide text-cyan-100/95">
					[ ПОДТВЕРЖДЕНИЕ ВЫСАДКИ ]<br />
					Развернуть аванпост в этом секторе?
				</div>

				<div class="flex gap-3">
					<button
						type="button"
						onclick={onConfirm}
						class="flex-1 rounded border border-emerald-400/50 bg-emerald-400/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-emerald-300 transition hover:border-emerald-300 hover:bg-emerald-400/20 hover:shadow-[0_0_14px_rgba(52,211,153,0.4)]"
					>
						[ ПОДТВЕРДИТЬ ]
					</button>
					<button
						type="button"
						onclick={onCancel}
						class="flex-1 rounded border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-red-300/90 transition hover:border-red-400 hover:bg-red-500/15 hover:shadow-[0_0_14px_rgba(239,68,68,0.35)]"
					>
						[ ОТМЕНА ]
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

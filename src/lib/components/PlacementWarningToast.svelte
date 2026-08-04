<script lang="ts">
	interface Props {
		message: string | null;
		visible: boolean;
	}

	let { message, visible }: Props = $props();
</script>

<div
	class="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center transition-opacity duration-200"
	class:opacity-0={!visible}
	class:opacity-100={visible}
>
	{#if message}
		<div
			class="animate-pulse rounded border-2 border-red-500/80 bg-red-950/90 px-6 py-3 font-mono text-sm font-semibold tracking-widest text-red-300 shadow-[0_0_25px_rgba(239,68,68,0.5)] backdrop-blur-sm"
		>
			[ CRITICAL WARNING ] {message}
		</div>
	{/if}
</div>

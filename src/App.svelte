<script lang="ts">
	import PlanetViewport from './lib/components/PlanetViewport.svelte';
	import HudOverlay from './lib/components/HudOverlay.svelte';
	import ColonyPanel from './lib/components/ColonyPanel.svelte';
	import ColonyToast from './lib/components/ColonyToast.svelte';
	import PlacementWarningToast from './lib/components/PlacementWarningToast.svelte';
	import ColonyConfirmModal from './lib/components/ColonyConfirmModal.svelte';
	import BottomDock from './lib/components/BottomDock.svelte';
	import type { Colony, OrbitStatus, PlanetControls } from './lib/types/game';

	let colonies: Colony[] = $state([]);
	let selectedColonyId: string | null = $state(null);
	let orbitStatus: OrbitStatus | null = $state(null);
	let ready = $state(false);
	// Plain functions only (see PlanetControls) — safe to hold in $state
	// since no Babylon Scene/Mesh/Material ever flows through it.
	let planetControls: PlanetControls | null = $state(null);
	let scanTrigger: { durationMs: number; id: number } | null = $state(null);
	let scanTriggerCounter = 0;

	let toastColony: Colony | null = $state(null);
	let toastVisible = $state(false);
	let toastTimeout: ReturnType<typeof setTimeout> | undefined;

	let placementWarning: string | null = $state(null);
	let placementWarningVisible = $state(false);
	let placementWarningTimeout: ReturnType<typeof setTimeout> | undefined;

	// Candidate LAND point awaiting player confirmation via ColonyConfirmModal
	// — nothing is spawned in PlanetEngine until the player confirms.
	let pendingColonyLocation: { x: number; y: number; z: number } | null = $state(null);

	let selectedColony = $derived(colonies.find((c) => c.id === selectedColonyId) ?? null);
	let panelOpen = $derived(selectedColony !== null);

	function handleColonyCreated(colony: Colony) {
		colonies = [...colonies, colony];

		toastColony = colony;
		toastVisible = true;
		if (toastTimeout) clearTimeout(toastTimeout);
		toastTimeout = setTimeout(() => {
			toastVisible = false;
		}, 3200);
	}

	function handleColonySelected(colonyId: string) {
		selectedColonyId = colonyId;
	}

	function handleOrbitStatusChanged(status: OrbitStatus) {
		orbitStatus = status;
	}

	function handlePlacementDenied(reason: string) {
		placementWarning = reason;
		placementWarningVisible = true;
		if (placementWarningTimeout) clearTimeout(placementWarningTimeout);
		placementWarningTimeout = setTimeout(() => {
			placementWarningVisible = false;
		}, 2500);
	}

	function handleScanTriggered(durationMs: number) {
		scanTriggerCounter += 1;
		scanTrigger = { durationMs, id: scanTriggerCounter };
	}

	function handlePlacementPending(point: { x: number; y: number; z: number }) {
		pendingColonyLocation = point;
	}

	function confirmColonyPlacement() {
		if (!pendingColonyLocation || !planetControls) return;
		planetControls.placeColony(pendingColonyLocation);
		pendingColonyLocation = null;
	}

	function cancelColonyPlacement() {
		pendingColonyLocation = null;
	}

	function closePanel() {
		selectedColonyId = null;
	}

	function buildModule() {
		if (!selectedColony) return;
		const id = selectedColony.id;
		colonies = colonies.map((c) =>
			c.id === id ? { ...c, buildings: [...c.buildings, `Auxiliary Module ${c.buildings.length}`] } : c
		);
	}
</script>

<main class="relative h-screen w-screen overflow-hidden bg-black">
	<PlanetViewport
		onColonyCreated={handleColonyCreated}
		onColonySelected={handleColonySelected}
		onOrbitStatusChanged={handleOrbitStatusChanged}
		onPlacementDenied={handlePlacementDenied}
		onPlacementPending={handlePlacementPending}
		onReady={() => (ready = true)}
		onEngineReady={(controls) => (planetControls = controls)}
		onScanTriggered={handleScanTriggered}
	/>

	<HudOverlay {orbitStatus} colonyCount={colonies.length} {ready} />

	<ColonyPanel colony={selectedColony} open={panelOpen} onClose={closePanel} onBuildModule={buildModule} />

	<ColonyToast colony={toastColony} visible={toastVisible} />

	<PlacementWarningToast message={placementWarning} visible={placementWarningVisible} />

	<ColonyConfirmModal
		open={pendingColonyLocation !== null}
		onConfirm={confirmColonyPlacement}
		onCancel={cancelColonyPlacement}
	/>

	<BottomDock {planetControls} {ready} {scanTrigger} />
</main>

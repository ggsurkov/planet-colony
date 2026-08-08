export interface Colony {
	id: string;
	name: string;
	position: { x: number; y: number; z: number };
	createdAt: Date;
	buildings: string[];
}

/** Dominant-surface classification, picked randomly per planet and driving
 *  which procedural texture/color pool PlanetEngine paints the sphere with. */
export enum PlanetType {
	Desert = 'DESERT',
	Grassy = 'GRASSY',
	Water = 'WATER',
	Mixed = 'MIXED'
}

export interface OrbitStatus {
	system: string;
	planet: string;
	planetType: PlanetType;
	altitudeKm: number;
	longitudeDeg: number;
	latitudeDeg: number;
}

export type PlanetEngineEvents = {
	onColonyCreated: (colony: Colony) => void;
	onColonySelected: (colonyId: string) => void;
	onOrbitStatusChanged: (status: OrbitStatus) => void;
	onPlacementDenied: (reason: string) => void;
	onReady: () => void;
	/** Fired the instant a single click on the planet (while the scanner is
	 *  being aimed) fires the scan — lets the HUD countdown stay in sync
	 *  with a trigger that now originates from the 3D view, not the dock. */
	onScanTriggered: (durationMs: number) => void;
	/** Fired instead of placing a colony immediately: a valid, unoccupied
	 *  LAND point was clicked, so the host UI should show a confirm dialog
	 *  and, if the player confirms, call `PlanetControls.placeColony` back
	 *  with this same point. */
	onPlacementPending: (point: { x: number; y: number; z: number }) => void;
};

/** Narrow imperative handle exposed by PlanetEngine for ability-style UI
 *  controls (e.g. the HUD dock). Deliberately just plain functions — no
 *  Babylon Scene/Mesh/Material ever crosses into Svelte state through this. */
export interface PlanetControls {
	enableScanTarget: () => void;
	/** Actually spawns the colony at `point` (a surface point previously
	 *  reported via `onPlacementPending`) — call once the player confirms
	 *  the landing dialog. */
	placeColony: (point: { x: number; y: number; z: number }) => void;
}

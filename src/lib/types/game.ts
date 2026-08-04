export interface Colony {
	id: string;
	name: string;
	position: { x: number; y: number; z: number };
	createdAt: Date;
	buildings: string[];
}

export interface OrbitStatus {
	system: string;
	planet: string;
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
};

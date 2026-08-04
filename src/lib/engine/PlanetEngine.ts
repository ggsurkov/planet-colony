import {
	ArcRotateCamera,
	Color3,
	Color4,
	DirectionalLight,
	DynamicTexture,
	Engine,
	GlowLayer,
	HemisphericLight,
	Mesh,
	MeshBuilder,
	PointerEventTypes,
	PointLight,
	Quaternion,
	Scalar,
	Scene,
	StandardMaterial,
	Texture,
	TransformNode,
	Vector2,
	Vector3
} from '@babylonjs/core';
import type { Colony, OrbitStatus, PlanetEngineEvents } from '../types/game';
import {
	drawProceduralDiffuse,
	drawProceduralNormal,
	drawProceduralStars,
	drawTerrainMask
} from './proceduralTextures';

const PLANET_RADIUS = 2;
const MIN_COLONY_SPACING = PLANET_RADIUS * 0.18;
/** Shared between the visual diffuse texture and the terrain mask so a
 *  visibly dark toxic pool always lines up with a LIQUID classification. */
const PLANET_SEED = 1337;
const TERRAIN_MASK_WIDTH = 512;
const TERRAIN_MASK_HEIGHT = 256;

const LIQUID_LANDING_DENIED_MESSAGE =
	'ОШИБКА ПОСАДКИ: Запрещено высаживаться на жидкость / токсичный бассейн!';

const TEXTURE_URLS = {
	normal: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg'
};

const NAME_PREFIXES = [
	'Colony',
	'Aurelia Sector',
	'New Terra',
	'Helios Outpost',
	'Zenith Base',
	'Meridian Point',
	'Vantage Station'
];
const GREEK_SUFFIXES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Sigma', 'Omega'];

const DEFAULT_BUILDINGS = ['Command Hub v1', 'Solar Array', 'Atmosphere Extractor', 'Life Support'];

interface MarkerRecord {
	root: TransformNode;
	pulseMesh: Mesh;
	light: PointLight;
	colony: Colony;
}

interface TerrainMask {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

/** Rotation quaternion that rotates local +Y onto `normal`. Version-safe (no FromUnitVectorsToRef dependency). */
function quaternionAligningUpTo(normal: Vector3): Quaternion {
	const up = Vector3.Up();
	const dot = Vector3.Dot(up, normal);
	if (dot > 0.9999) return Quaternion.Identity();
	if (dot < -0.9999) return Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI);
	const axis = Vector3.Cross(up, normal).normalize();
	const angle = Math.acos(Scalar.Clamp(dot, -1, 1));
	return Quaternion.RotationAxis(axis, angle);
}

/**
 * Encapsulates the entire Babylon.js scene lifecycle. Deliberately holds no
 * reference back to Svelte state — the host component only ever sees plain
 * data via `PlanetEngineEvents` callbacks.
 */
export class PlanetEngine {
	private readonly engine: Engine;
	private readonly scene: Scene;
	private readonly camera: ArcRotateCamera;
	private readonly planetMesh: Mesh;
	private readonly terrainMask: TerrainMask;
	private readonly events: PlanetEngineEvents;
	private readonly markers = new Map<string, MarkerRecord>();
	private readonly resizeHandler = () => this.engine.resize();
	private orbitStatusAccumulator = 0;
	private disposed = false;

	constructor(canvas: HTMLCanvasElement, events: PlanetEngineEvents) {
		this.events = events;
		this.engine = new Engine(canvas, true, { antialias: true, stencil: true, preserveDrawingBuffer: true });
		this.scene = new Scene(this.engine);
		this.scene.clearColor = new Color4(0, 0, 0, 1);

		this.camera = this.createCamera(canvas);
		this.createLights();
		this.createStarfield();
		this.planetMesh = this.createPlanet();
		this.terrainMask = this.buildTerrainMask(PLANET_SEED);
		this.createGlow();
		this.setupPicking();

		this.engine.runRenderLoop(() => this.tick());
		window.addEventListener('resize', this.resizeHandler);

		this.scene.executeWhenReady(() => this.events.onReady());
	}

	resize(): void {
		this.engine.resize();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		window.removeEventListener('resize', this.resizeHandler);
		this.engine.stopRenderLoop();
		this.scene.dispose();
		this.engine.dispose();
	}

	// ---------------------------------------------------------------------
	// Scene construction
	// ---------------------------------------------------------------------

	private createCamera(canvas: HTMLCanvasElement): ArcRotateCamera {
		const camera = new ArcRotateCamera(
			'orbitCamera',
			-Math.PI / 2.3,
			Math.PI / 2.4,
			PLANET_RADIUS * 4.2,
			Vector3.Zero(),
			this.scene
		);
		camera.lowerRadiusLimit = PLANET_RADIUS * 1.6;
		camera.upperRadiusLimit = PLANET_RADIUS * 9;
		camera.wheelPrecision = 40;
		camera.pinchPrecision = 80;
		camera.inertia = 0.85;
		camera.panningSensibility = 0;
		camera.lowerBetaLimit = 0.15;
		camera.upperBetaLimit = Math.PI - 0.15;
		camera.attachControl(canvas, true);
		return camera;
	}

	private createLights(): void {
		// Harsh, contrasty sun — a strong day/night terminator rather than an
		// even, friendly wash of light.
		const sun = new DirectionalLight('sun', new Vector3(-1, -0.3, 0.6), this.scene);
		sun.position = new Vector3(10, 3, -6);
		sun.intensity = 1.9;
		sun.diffuse = new Color3(1, 0.82, 0.68);

		// Cold, dim ambient fill so the unlit hemisphere stays bleak and
		// near-black instead of glowing — deep-space contrast, not a studio fill.
		const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
		ambient.intensity = 0.12;
		ambient.diffuse = new Color3(0.22, 0.3, 0.48);
		ambient.groundColor = new Color3(0.01, 0.01, 0.02);
	}

	private createStarfield(): void {
		const skybox = MeshBuilder.CreateSphere('starfield', { diameter: 4000, sideOrientation: Mesh.BACKSIDE }, this.scene);
		skybox.isPickable = false;
		skybox.infiniteDistance = true;

		const material = new StandardMaterial('starfieldMat', this.scene);
		const size = 2048;
		const starTexture = new DynamicTexture('starTex', { width: size, height: size }, this.scene, false);
		drawProceduralStars(starTexture.getContext() as unknown as CanvasRenderingContext2D, size);
		starTexture.update(false);

		material.emissiveTexture = starTexture;
		material.diffuseColor = Color3.Black();
		material.specularColor = Color3.Black();
		material.disableLighting = true;
		material.backFaceCulling = false;
		skybox.material = material;
	}

	private createPlanet(): Mesh {
		const planet = MeshBuilder.CreateSphere('planet', { diameter: PLANET_RADIUS * 2, segments: 128 }, this.scene);
		const material = new StandardMaterial('planetMat', this.scene);

		// Dry, sun-scorched rock: a low, soft specular so there's a faint dry
		// sheen instead of a blown-out white highlight.
		material.specularColor = new Color3(0.05, 0.045, 0.04);
		material.specularPower = 20;

		// The diffuse texture is always generated (never loaded remotely) so it
		// stays pixel-consistent with the terrain mask below — a visibly dark
		// toxic pool must always classify as LIQUID.
		const diffuseSize = 1024;
		const diffuseTexture = new DynamicTexture(
			'planetDiffuse',
			{ width: diffuseSize, height: diffuseSize / 2 },
			this.scene,
			true
		);
		drawProceduralDiffuse(diffuseTexture.getContext() as unknown as CanvasRenderingContext2D, diffuseSize, PLANET_SEED);
		diffuseTexture.update(false);
		material.diffuseTexture = diffuseTexture;

		this.loadTextureWithFallback(
			TEXTURE_URLS.normal,
			1024,
			(ctx, size) => drawProceduralNormal(ctx, size, PLANET_SEED),
			(tex) => (material.bumpTexture = tex)
		);

		planet.material = material;
		planet.isPickable = true;
		return planet;
	}

	private createGlow(): void {
		const glow = new GlowLayer('glow', this.scene);
		glow.intensity = 0.9;
	}

	/**
	 * Loads a remote texture; if it fails (offline / CDN unreachable), draws a
	 * procedurally generated equirectangular texture onto a DynamicTexture and
	 * swaps that in via `apply` instead.
	 */
	private loadTextureWithFallback(
		url: string,
		size: number,
		draw: (ctx: CanvasRenderingContext2D, size: number) => void,
		apply: (texture: Texture) => void
	): void {
		const texture = new Texture(
			url,
			this.scene,
			false,
			true,
			Texture.TRILINEAR_SAMPLINGMODE,
			undefined,
			() => {
				const fallback = new DynamicTexture(
					`${url}::fallback`,
					{ width: size, height: Math.round(size / 2) },
					this.scene,
					true
				);
				draw(fallback.getContext() as unknown as CanvasRenderingContext2D, size);
				fallback.update(false);
				apply(fallback);
			}
		);
		apply(texture);
	}

	/**
	 * Rasterizes the LAND/LIQUID mask onto an offscreen canvas once at startup
	 * and keeps only the raw pixel buffer — the canvas itself is never
	 * attached to the DOM or retained, so there's nothing left to leak.
	 */
	private buildTerrainMask(seed: number): TerrainMask {
		const width = TERRAIN_MASK_WIDTH;
		const height = TERRAIN_MASK_HEIGHT;
		let ctx: CanvasRenderingContext2D;
		if (typeof OffscreenCanvas !== 'undefined') {
			ctx = new OffscreenCanvas(width, height).getContext('2d') as unknown as CanvasRenderingContext2D;
		} else {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
		}
		drawTerrainMask(ctx, width, seed);
		const { data } = ctx.getImageData(0, 0, width, height);
		return { width, height, data };
	}

	private checkTerrainType(uv: Vector2): 'LAND' | 'LIQUID' {
		const { width, height, data } = this.terrainMask;
		const x = Math.min(width - 1, Math.max(0, Math.floor(uv.x * width)));
		const y = Math.min(height - 1, Math.max(0, Math.floor(uv.y * height)));
		const idx = (y * width + x) * 4;
		return data[idx] < 128 ? 'LIQUID' : 'LAND';
	}

	// ---------------------------------------------------------------------
	// Picking / colony placement
	// ---------------------------------------------------------------------

	private setupPicking(): void {
		this.scene.onPointerObservable.add((pointerInfo) => {
			if (pointerInfo.type !== PointerEventTypes.POINTERTAP) return;
			const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
			if (!pick?.hit || !pick.pickedMesh) return;

			const markerId = pick.pickedMesh.metadata?.colonyId as string | undefined;
			if (markerId) {
				this.events.onColonySelected(markerId);
				return;
			}

			if (pick.pickedMesh === this.planetMesh && pick.pickedPoint) {
				const uv = pick.getTextureCoordinates();
				if (!uv) return;

				if (this.checkTerrainType(uv) === 'LIQUID') {
					this.events.onPlacementDenied(LIQUID_LANDING_DENIED_MESSAGE);
					return;
				}

				this.tryPlaceColony(pick.pickedPoint);
			}
		});
	}

	private tryPlaceColony(surfacePoint: Vector3): void {
		for (const marker of this.markers.values()) {
			const existing = new Vector3(marker.colony.position.x, marker.colony.position.y, marker.colony.position.z);
			if (Vector3.Distance(existing, surfacePoint) < MIN_COLONY_SPACING) {
				return;
			}
		}

		const normal = surfacePoint.clone().normalize();
		const colony: Colony = {
			id: `colony-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
			name: this.generateColonyName(),
			position: { x: surfacePoint.x, y: surfacePoint.y, z: surfacePoint.z },
			createdAt: new Date(),
			buildings: [...DEFAULT_BUILDINGS]
		};

		this.createMarker(colony, normal);
		this.events.onColonyCreated(colony);
	}

	private generateColonyName(): string {
		const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
		const suffix = GREEK_SUFFIXES[Math.floor(Math.random() * GREEK_SUFFIXES.length)];
		const num = Math.floor(Math.random() * 9) + 1;
		return `${prefix} ${suffix}-${num}`;
	}

	private createMarker(colony: Colony, normal: Vector3): void {
		const root = new TransformNode(`marker-${colony.id}`, this.scene);
		const surfacePoint = new Vector3(colony.position.x, colony.position.y, colony.position.z);
		root.position = surfacePoint;
		root.rotationQuaternion = quaternionAligningUpTo(normal);

		const beaconHeight = PLANET_RADIUS * 0.14;
		const beaconMat = new StandardMaterial(`marker-mat-${colony.id}`, this.scene);
		beaconMat.diffuseColor = Color3.Black();
		beaconMat.specularColor = Color3.Black();
		beaconMat.emissiveColor = new Color3(0.18, 0.85, 1);
		beaconMat.disableLighting = true;

		const cylinder = MeshBuilder.CreateCylinder(
			`marker-body-${colony.id}`,
			{ height: beaconHeight, diameterTop: PLANET_RADIUS * 0.02, diameterBottom: PLANET_RADIUS * 0.045 },
			this.scene
		);
		cylinder.position.y = beaconHeight / 2;
		cylinder.material = beaconMat;
		cylinder.parent = root;
		cylinder.metadata = { colonyId: colony.id };

		const cone = MeshBuilder.CreateCylinder(
			`marker-tip-${colony.id}`,
			{ height: beaconHeight * 0.35, diameterTop: 0, diameterBottom: PLANET_RADIUS * 0.05 },
			this.scene
		);
		cone.position.y = beaconHeight + (beaconHeight * 0.35) / 2;
		cone.material = beaconMat;
		cone.parent = root;
		cone.metadata = { colonyId: colony.id };

		const ringMat = new StandardMaterial(`marker-ring-mat-${colony.id}`, this.scene);
		ringMat.diffuseColor = Color3.Black();
		ringMat.specularColor = Color3.Black();
		ringMat.emissiveColor = new Color3(0.18, 0.85, 1);
		ringMat.alpha = 0.55;
		ringMat.disableLighting = true;
		const ring = MeshBuilder.CreateTorus(
			`marker-ring-${colony.id}`,
			{ diameter: PLANET_RADIUS * 0.1, thickness: PLANET_RADIUS * 0.004, tessellation: 32 },
			this.scene
		);
		ring.position.y = 0.002;
		ring.material = ringMat;
		ring.parent = root;
		ring.isPickable = false;

		const light = new PointLight(`marker-light-${colony.id}`, new Vector3(0, beaconHeight, 0), this.scene);
		light.diffuse = new Color3(0.2, 0.85, 1);
		light.intensity = 0.6;
		light.range = PLANET_RADIUS * 0.6;
		light.parent = root;

		this.markers.set(colony.id, { root, pulseMesh: cone, light, colony });
	}

	// ---------------------------------------------------------------------
	// Per-frame updates
	// ---------------------------------------------------------------------

	private tick(): void {
		const dt = this.engine.getDeltaTime() / 1000;

		const t = performance.now() / 1000;
		for (const marker of this.markers.values()) {
			const pulse = 1 + Math.sin(t * 2.2 + marker.root.position.x * 3) * 0.18;
			marker.pulseMesh.scaling.set(pulse, 1, pulse);
			marker.light.intensity = 0.5 + Math.sin(t * 2.2) * 0.25;
		}

		this.orbitStatusAccumulator += dt;
		if (this.orbitStatusAccumulator > 0.15) {
			this.orbitStatusAccumulator = 0;
			this.emitOrbitStatus();
		}

		this.scene.render();
	}

	private emitOrbitStatus(): void {
		const status: OrbitStatus = {
			system: 'EXO-772',
			planet: 'AURELIA',
			altitudeKm: Math.round((this.camera.radius - PLANET_RADIUS) * 3185),
			longitudeDeg: Math.round((((this.camera.alpha * 180) / Math.PI) % 360 + 360) % 360),
			latitudeDeg: Math.round(90 - (this.camera.beta * 180) / Math.PI)
		};
		this.events.onOrbitStatusChanged(status);
	}
}

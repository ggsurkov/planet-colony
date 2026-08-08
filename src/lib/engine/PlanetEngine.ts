import {
	ArcRotateCamera,
	Color3,
	Color4,
	DefaultRenderingPipeline,
	DirectionalLight,
	DynamicTexture,
	Engine,
	FresnelParameters,
	GlowLayer,
	HemisphericLight,
	ImageProcessingConfiguration,
	Mesh,
	MeshBuilder,
	PointerEventTypes,
	PointLight,
	Quaternion,
	Scalar,
	Scene,
	SpotLight,
	StandardMaterial,
	Texture,
	TransformNode,
	Vector2,
	Vector3
} from '@babylonjs/core';
import { PlanetType, type Colony, type OrbitStatus, type PlanetEngineEvents } from '../types/game';
import {
	drawProceduralDiffuse,
	drawProceduralNormal,
	drawProceduralStars,
	drawTerrainMask,
	randomPlanetType,
	terrainElevation
} from './proceduralTextures';

const PLANET_RADIUS = 2;
const MIN_COLONY_SPACING = PLANET_RADIUS * 0.18;
/** Shared between the visual diffuse texture and the terrain mask so a
 *  visibly dark toxic pool always lines up with a LIQUID classification. */
const PLANET_SEED = 1337;
const TERRAIN_MASK_WIDTH = 512;
const TERRAIN_MASK_HEIGHT = 256;

/** Tiling factor for the close-up micro-detail normal layer — high enough
 *  that grain/cracks stay crisp at minimum camera radius instead of smearing
 *  into "soap" the way a single low-frequency normal map does under zoom. */
const DETAIL_MAP_TILING = 80;

const LIQUID_LANDING_DENIED_MESSAGE =
	'ОШИБКА ПОСАДКИ: Запрещено высаживаться на жидкость / токсичный бассейн!';

/** Kept low (spec: 0.05–0.1) so the unlit hemisphere reads as genuinely dark —
 *  the 50/50 day/night split itself is inherent to a single directional light
 *  on a sphere; this constant only controls how much that night side glows. */
const BASE_AMBIENT_INTENSITY = 0.08;
const baseAmbientDiffuse = () => new Color3(0.22, 0.3, 0.48);

/** "Thermal/night-vision" reveal used while the scanner ability is active. */
const SHADOW_SCAN_AMBIENT_INTENSITY = 0.6;
const shadowScanAmbientDiffuse = () => new Color3(0.15, 0.95, 0.55);

/** Local scan spotlight — the actual "shadow gets physically dispersed" beam,
 *  on top of the ambient night-vision fill above. Positioned just off the
 *  surface at the locked scan point and aimed straight down at it. */
const SCAN_LIGHT_INTENSITY = 6;
const SCAN_LIGHT_HEIGHT = PLANET_RADIUS * 0.9;
const SCAN_LIGHT_CONE_ANGLE = Math.PI / 2.4;
const SCAN_LIGHT_EXPONENT = 3;
const scanLightDiffuse = () => new Color3(0.55, 1, 0.85);

/** Fade duration (ms) for the scan light/ambient ramping in and back out,
 *  so the reveal never snaps on/off. */
const SCAN_FADE_MS = 700;

/** Full sun revolutions per second around the planet's Y axis. Was 3x a
 *  60-second baseline orbit; halved again (now 1.5x) because the terminator
 *  sweep at 3x was distracting rather than just "obviously animated". Slowed
 *  a further 4x on top of that so the day/night terminator crawls instead of
 *  visibly sweeping. */
const SUN_ORBIT_ANGULAR_SPEED = 0; // TEMP: disabled for lighting-balance debug screenshot

/** Slow independent drift for the Grassy/Water cloud shell, decoupled from
 *  both the sun's orbit and the (static) planet mesh. */
const CLOUD_ROTATION_SPEED = 0.015;

const DEFAULT_SCAN_DURATION_MS = 10000;

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
	private readonly planetType: PlanetType;
	private readonly terrainMask: TerrainMask;
	private readonly events: PlanetEngineEvents;
	private readonly markers = new Map<string, MarkerRecord>();
	private readonly resizeHandler = () => this.engine.resize();
	private readonly sun: DirectionalLight;
	private readonly ambientLight: HemisphericLight;
	private readonly scanSpotLight: SpotLight;
	private readonly sunBaseDirection = new Vector3(-0.979, 0, -0.2035);
	private readonly scanRing: Mesh;
	private readonly glowLayer: GlowLayer;
	private cloudMesh: Mesh | null = null;
	private atmosphereMesh: Mesh | null = null;
	private sunAngle = 0;
	private scanAimActive = false;
	private shadowScanActive = false;
	private shadowScanTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
	/** Wall-clock start of the current scan effect; drives the fade-in/hold/
	 *  fade-out curve computed each frame in tick(). */
	private scanEffectStartTime: number | null = null;
	private scanEffectDurationMs = 0;
	private orbitStatusAccumulator = 0;
	private disposed = false;

	constructor(canvas: HTMLCanvasElement, events: PlanetEngineEvents) {
		this.events = events;
		this.engine = new Engine(canvas, true, { antialias: true, stencil: true, preserveDrawingBuffer: true });
		this.scene = new Scene(this.engine);
		this.scene.clearColor = new Color4(0, 0, 0, 1);

		this.planetType = randomPlanetType();
		this.camera = this.createCamera(canvas);
		const { sun, ambient } = this.createLights();
		this.sun = sun;
		this.ambientLight = ambient;
		this.createStarfield();
		this.planetMesh = this.createPlanet();
		this.terrainMask = this.buildTerrainMask(PLANET_SEED);
		this.glowLayer = this.createGlow();
		if (this.planetType === PlanetType.Grassy || this.planetType === PlanetType.Water) {
			const { clouds, atmosphere } = this.createAtmosphereAndClouds();
			this.cloudMesh = clouds;
			this.atmosphereMesh = atmosphere;
		}
		this.scanRing = this.createScanRing();
		this.scanSpotLight = this.createScanLight();
		this.createRenderPipeline();
		this.setupPicking();

		(window as any).__debug = () => {
			const pick = this.scene.pick(this.engine.getRenderWidth() / 2, this.engine.getRenderHeight() / 2);
			const normal = pick?.pickedPoint ? pick.pickedPoint.clone().normalize() : null;
			return {
				sunDir: this.sun.direction.asArray(),
				sunBase: this.sunBaseDirection.asArray(),
				camPos: this.camera.position.asArray(),
				ambIntensity: this.ambientLight.intensity,
				pickedPoint: pick?.pickedPoint?.asArray() ?? null,
				pickedNormal: normal?.asArray() ?? null,
				dotNormalSun: normal ? Vector3.Dot(normal, this.sun.direction) : null,
				renderW: this.engine.getRenderWidth(),
				renderH: this.engine.getRenderHeight()
			};
		};

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
		if (this.shadowScanTimeoutHandle !== null) {
			clearTimeout(this.shadowScanTimeoutHandle);
		}
		window.removeEventListener('resize', this.resizeHandler);
		this.engine.stopRenderLoop();
		this.scene.dispose();
		this.engine.dispose();
	}

	// ---------------------------------------------------------------------
	// Scanner ability — imperative handle used by the HUD's BottomDock
	// ---------------------------------------------------------------------

	/** Enters targeting mode: a ring follows the raycast hit point under the
	 *  cursor on the planet surface. The very next click on the planet fires
	 *  the scan immediately — there is no separate confirm step. */
	enableScanTarget(): void {
		this.scanAimActive = true;
	}

	/** Fires the scan at `point`: locks the ring there (it stays visible for
	 *  the full duration, per spec, instead of hiding right away), drops a
	 *  bright local spotlight over the spot so the shadow there is actually
	 *  dispersed (not just a global ambient tint), and reveals the night side
	 *  for `durationMs` before smoothly reverting everything. */
	private triggerShadowScan(point: Vector3, durationMs: number = DEFAULT_SCAN_DURATION_MS): void {
		this.scanAimActive = false;
		this.positionScanRing(point);

		if (this.shadowScanTimeoutHandle !== null) {
			clearTimeout(this.shadowScanTimeoutHandle);
		}

		const normal = point.clone().normalize();
		this.scanSpotLight.position = normal.scale(PLANET_RADIUS + SCAN_LIGHT_HEIGHT);
		this.scanSpotLight.direction = normal.scale(-1);

		this.shadowScanActive = true;
		this.scanEffectStartTime = performance.now();
		this.scanEffectDurationMs = durationMs;

		this.shadowScanTimeoutHandle = setTimeout(() => {
			this.shadowScanActive = false;
			this.scanRing.setEnabled(false);
			this.scanEffectStartTime = null;
			this.scanSpotLight.intensity = 0;
			this.ambientLight.intensity = BASE_AMBIENT_INTENSITY;
			this.ambientLight.diffuse = baseAmbientDiffuse();
			this.shadowScanTimeoutHandle = null;
		}, durationMs);

		this.events.onScanTriggered(durationMs);
	}

	/** Called every frame while a scan is active: ramps the spotlight/ambient
	 *  reveal in over the first `SCAN_FADE_MS`, holds, then ramps back out
	 *  over the final `SCAN_FADE_MS` — so the dispersal never pops on/off. */
	private updateScanLightFade(): void {
		if (!this.shadowScanActive || this.scanEffectStartTime === null) return;

		const elapsed = performance.now() - this.scanEffectStartTime;
		const remaining = this.scanEffectDurationMs - elapsed;
		let fade = 1;
		if (elapsed < SCAN_FADE_MS) fade = elapsed / SCAN_FADE_MS;
		else if (remaining < SCAN_FADE_MS) fade = remaining / SCAN_FADE_MS;
		fade = Scalar.Clamp(fade, 0, 1);

		this.scanSpotLight.intensity = SCAN_LIGHT_INTENSITY * fade;
		this.ambientLight.intensity = Scalar.Lerp(BASE_AMBIENT_INTENSITY, SHADOW_SCAN_AMBIENT_INTENSITY, fade);
		this.ambientLight.diffuse = Color3.Lerp(baseAmbientDiffuse(), shadowScanAmbientDiffuse(), fade);
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

	private createLights(): { sun: DirectionalLight; ambient: HemisphericLight } {
		// Harsh, contrasty sun — a strong day/night terminator rather than an
		// even, friendly wash of light. A single directional light already
		// splits the sphere exactly 50/50 lit vs. unlit by construction; the
		// ambient fill below is what determines how dark the "unlit" half
		// actually reads.
		const sun = new DirectionalLight('sun', this.sunBaseDirection.clone(), this.scene);
		sun.position = this.sunBaseDirection.scale(-10);
		sun.intensity = 1.9;
		sun.diffuse = new Color3(1, 0.82, 0.68);

		// Cold, dim ambient fill so the unlit hemisphere stays bleak and
		// near-black instead of glowing — deep-space contrast, not a studio fill.
		const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
		ambient.intensity = BASE_AMBIENT_INTENSITY;
		ambient.diffuse = baseAmbientDiffuse();
		ambient.groundColor = new Color3(0.01, 0.01, 0.02);

		return { sun, ambient };
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
		this.applyMaxQualityFiltering(starTexture);

		material.emissiveTexture = starTexture;
		material.diffuseColor = Color3.Black();
		material.specularColor = Color3.Black();
		material.disableLighting = true;
		material.backFaceCulling = false;
		skybox.material = material;
	}

	private createPlanet(): Mesh {
		// CreateSphere (not CreateIcoSphere) is deliberate: its lat/long UV
		// layout is what the equirectangular diffuse/bump textures and the
		// terrain mask below assume. An icosphere's triangular UV unwrap would
		// misalign colony-placement picking against the painted terrain, so
		// the "no low-poly soap" requirement is met by keeping this segment
		// count high (128 → ~65k triangles, already smooth at any zoom) plus
		// the detail/parallax layers below, rather than swapping mesh types.
		const planet = MeshBuilder.CreateSphere('planet', { diameter: PLANET_RADIUS * 2, segments: 128 }, this.scene);
		const material = new StandardMaterial('planetMat', this.scene);

		// Dry, sun-scorched rock: a low, soft specular so there's a faint dry
		// sheen instead of a blown-out white highlight. Kept just bright enough
		// that bump/detail-map relief still catches a visible highlight —
		// at near-zero specular the perturbed normals have nothing to glint off.
		material.specularColor = new Color3(0.12, 0.11, 0.1);
		material.specularPower = 24;

		// The diffuse texture is always generated (never loaded remotely) so it
		// stays pixel-consistent with the terrain mask below — a visibly dark
		// toxic pool must always classify as LIQUID.
		const diffuseSize = 2048;
		const diffuseTexture = new DynamicTexture(
			'planetDiffuse',
			{ width: diffuseSize, height: diffuseSize / 2 },
			this.scene,
			true
		);
		drawProceduralDiffuse(
			diffuseTexture.getContext() as unknown as CanvasRenderingContext2D,
			diffuseSize,
			PLANET_SEED,
			this.planetType
		);
		diffuseTexture.update(false);
		this.applyMaxQualityFiltering(diffuseTexture);
		material.diffuseTexture = diffuseTexture;
		if (location.search.includes('debugLight')) {
			material.diffuseTexture = null;
			material.diffuseColor = new Color3(0.9, 0.9, 0.9);
		}

		// Primary bump map: normal RGB plus terrain elevation packed into the
		// alpha channel, so parallax occlusion below reads real crater/canyon
		// height instead of the flat, uniform alpha a plain normal map gives.
		const bumpSize = 2048;
		const bumpTexture = new DynamicTexture(
			'planetBump',
			{ width: bumpSize, height: bumpSize / 2 },
			this.scene,
			true
		);
		const bumpCtx = bumpTexture.getContext() as unknown as CanvasRenderingContext2D;
		drawProceduralNormal(bumpCtx, bumpSize, PLANET_SEED);
		this.encodeElevationIntoAlpha(bumpCtx, bumpSize, bumpSize / 2, PLANET_SEED);
		bumpTexture.update(false);
		this.applyMaxQualityFiltering(bumpTexture);
		material.bumpTexture = bumpTexture;
		material.useParallax = !location.search.includes('debugLight');
		material.useParallaxOcclusion = !location.search.includes('debugLight');
		if (location.search.includes('debugLight')) material.bumpTexture = null;
		// Kept modest: pushed much higher this starts producing radiating
		// streak artifacts at the equirectangular UV pinch on the poles.
		material.parallaxScaleBias = 0.06;

		// Micro-detail layer: a tightly tiled secondary normal map so close
		// camera zoom reveals grain/cracks instead of the base map smearing
		// into flat "soap".
		const detailTexture = this.generateDetailNormalTexture(512);
		this.applyMaxQualityFiltering(detailTexture);
		detailTexture.uScale = DETAIL_MAP_TILING;
		detailTexture.vScale = DETAIL_MAP_TILING;
		material.detailMap.texture = detailTexture;
		material.detailMap.isEnabled = true;
		material.detailMap.bumpLevel = 2.2;
		material.detailMap.diffuseBlendLevel = 0.25;

		planet.material = material;
		planet.isPickable = true;
		return planet;
	}

	private createGlow(): GlowLayer {
		const glow = new GlowLayer('glow', this.scene);
		glow.intensity = 0.9;
		return glow;
	}

	/**
	 * Grassy/Water-only: a semi-transparent cloud shell (independent slow
	 * rotation) plus a Fresnel-driven atmosphere rim glow. Desert/Mixed
	 * planets get neither — call site gates this on `planetType`.
	 */
	private createAtmosphereAndClouds(): { clouds: Mesh; atmosphere: Mesh } {
		StandardMaterial.FresnelEnabled = true;

		const cloudTexture = this.generateCloudTexture(1024);
		this.applyMaxQualityFiltering(cloudTexture);
		cloudTexture.hasAlpha = true;

		const cloudMat = new StandardMaterial('cloudMat', this.scene);
		cloudMat.diffuseTexture = cloudTexture;
		cloudMat.useAlphaFromDiffuseTexture = true;
		cloudMat.specularColor = Color3.Black();
		cloudMat.backFaceCulling = true;

		const clouds = MeshBuilder.CreateSphere(
			'clouds',
			{ diameter: (PLANET_RADIUS + 0.05) * 2, segments: 64 },
			this.scene
		);
		clouds.material = cloudMat;
		clouds.isPickable = false;

		const glowColor =
			this.planetType === PlanetType.Water ? new Color3(0.25, 0.55, 1) : new Color3(0.35, 0.9, 0.55);

		// No flat emissiveColor here — the whole point of a rim glow is that
		// the center of the shell (facing the camera dead-on) contributes
		// almost nothing, and only the grazing-angle silhouette lights up.
		// A constant base emissive would wash that out into a solid glowing
		// ball, especially once GlowLayer blooms it.
		const atmosphereMat = new StandardMaterial('atmosphereMat', this.scene);
		atmosphereMat.diffuseColor = Color3.Black();
		atmosphereMat.specularColor = Color3.Black();
		atmosphereMat.emissiveColor = Color3.Black();
		atmosphereMat.disableLighting = true;
		atmosphereMat.backFaceCulling = false;
		atmosphereMat.alpha = 0.9;
		atmosphereMat.emissiveFresnelParameters = new FresnelParameters({
			bias: 0.08,
			power: 5,
			leftColor: glowColor,
			rightColor: Color3.Black()
		});
		atmosphereMat.opacityFresnelParameters = new FresnelParameters({
			bias: 0.05,
			power: 4,
			leftColor: Color3.White(),
			rightColor: Color3.Black()
		});

		const atmosphere = MeshBuilder.CreateSphere(
			'atmosphere',
			{ diameter: (PLANET_RADIUS + 0.14) * 2, segments: 64 },
			this.scene
		);
		atmosphere.material = atmosphereMat;
		atmosphere.isPickable = false;

		// This shell already fakes its own glow via Fresnel; letting GlowLayer
		// bloom it too is what blew the whole planet out into a solid orb.
		this.glowLayer.addExcludedMesh(clouds);
		this.glowLayer.addExcludedMesh(atmosphere);

		return { clouds, atmosphere };
	}

	/** Self-contained blotchy alpha-noise cloud cover — deliberately not
	 *  reusing proceduralTextures.ts's noise so all scanner/cloud/lighting
	 *  additions stay isolated inside this class per the task's architecture rule. */
	private generateCloudTexture(size: number): DynamicTexture {
		const texture = new DynamicTexture('cloudTex', { width: size, height: size / 2 }, this.scene, false);
		const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
		const w = size;
		const h = size / 2;
		const image = ctx.createImageData(w, h);

		const hash = (x: number, y: number) => {
			const s = Math.sin(x * 91.3 + y * 57.1) * 43758.5453123;
			return s - Math.floor(s);
		};
		const valueNoise = (x: number, y: number) => {
			const xi = Math.floor(x);
			const yi = Math.floor(y);
			const xf = x - xi;
			const yf = y - yi;
			const tl = hash(xi, yi);
			const tr = hash(xi + 1, yi);
			const bl = hash(xi, yi + 1);
			const br = hash(xi + 1, yi + 1);
			const u = xf * xf * (3 - 2 * xf);
			const v = yf * yf * (3 - 2 * yf);
			return tl + (tr - tl) * u + (bl + (br - bl) * u - (tl + (tr - tl) * u)) * v;
		};
		const cloudFbm = (x: number, y: number) => {
			let amp = 0.5;
			let freq = 1;
			let sum = 0;
			for (let i = 0; i < 5; i++) {
				sum += valueNoise(x * freq, y * freq) * amp;
				amp *= 0.55;
				freq *= 2.1;
			}
			return sum;
		};

		for (let y = 0; y < h; y++) {
			const v = y / h;
			for (let x = 0; x < w; x++) {
				const u = x / w;
				const angle = u * Math.PI * 2;
				const wx = (Math.cos(angle) * 0.5 + 0.5) * 5;
				const wz = (Math.sin(angle) * 0.5 + 0.5) * 5;
				const n = cloudFbm(wx, wz + v * 5);
				// Smoothstep-carve wispy clumps out of the noise field instead of
				// an even haze covering the whole sphere.
				const density = Scalar.Clamp((n - 0.42) / 0.2, 0, 1);
				const alpha = density * density * (3 - 2 * density);
				const idx = (y * w + x) * 4;
				image.data[idx] = 255;
				image.data[idx + 1] = 255;
				image.data[idx + 2] = 255;
				image.data[idx + 3] = Math.round(alpha * 235);
			}
		}
		ctx.putImageData(image, 0, 0);
		texture.update(false);
		return texture;
	}

	/** Large targeting ring for the scanner ability — hidden until
	 *  `enableScanTarget()` is called, then tracks the raycast hit point. */
	private createScanRing(): Mesh {
		const material = new StandardMaterial('scanRingMat', this.scene);
		material.diffuseColor = Color3.Black();
		material.specularColor = Color3.Black();
		material.emissiveColor = new Color3(0.2, 0.9, 1);
		material.alpha = 0.75;
		material.disableLighting = true;
		material.backFaceCulling = false;

		const ring = MeshBuilder.CreateTorus(
			'scanRing',
			{ diameter: PLANET_RADIUS * 0.55, thickness: PLANET_RADIUS * 0.012, tessellation: 48 },
			this.scene
		);
		ring.material = material;
		ring.isPickable = false;
		ring.setEnabled(false);
		return ring;
	}

	/** Local reveal light for the scanner: a tight, intense cone aimed straight
	 *  down at the locked scan point, starting fully dark (intensity 0) until
	 *  `triggerShadowScan` fades it in. */
	private createScanLight(): SpotLight {
		const light = new SpotLight(
			'scanSpotLight',
			Vector3.Zero(),
			Vector3.Down(),
			SCAN_LIGHT_CONE_ANGLE,
			SCAN_LIGHT_EXPONENT,
			this.scene
		);
		light.diffuse = scanLightDiffuse();
		light.specular = Color3.Black();
		light.intensity = 0;
		light.range = PLANET_RADIUS * 2;
		return light;
	}

	/** ACES-toned cinematic post pipeline: FXAA to smooth mesh silhouette
	 *  edges, a sharpen pass for close-up crispness, and a light vignette. */
	private createRenderPipeline(): void {
		const pipeline = new DefaultRenderingPipeline('planetPipeline', true, this.scene, [this.camera]);
		pipeline.fxaaEnabled = true;
		pipeline.samples = 4;

		pipeline.imageProcessingEnabled = true;
		pipeline.imageProcessing.toneMappingEnabled = true;
		pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
		pipeline.imageProcessing.contrast = 1.2;
		pipeline.imageProcessing.vignetteEnabled = true;
		pipeline.imageProcessing.vignetteWeight = 1.4;

		pipeline.sharpenEnabled = true;
		pipeline.sharpen.edgeAmount = 0.3;
	}

	/** Forces trilinear + max anisotropic filtering so texture edges (planet
	 *  horizon, liquid-pool borders) never show stair-step aliasing. */
	private applyMaxQualityFiltering(texture: Texture): void {
		texture.anisotropicFilteringLevel = this.engine.getCaps().maxAnisotropy;
		texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
	}

	/** Writes terrain elevation into the alpha channel of an already-drawn
	 *  normal map so parallax occlusion has real per-pixel height to read. */
	private encodeElevationIntoAlpha(
		ctx: CanvasRenderingContext2D,
		width: number,
		height: number,
		seed: number
	): void {
		const image = ctx.getImageData(0, 0, width, height);
		for (let y = 0; y < height; y++) {
			const v = y / height;
			for (let x = 0; x < width; x++) {
				const u = x / width;
				const elevation = Scalar.Clamp(terrainElevation(u, v, seed), 0, 1);
				image.data[(y * width + x) * 4 + 3] = Math.round(elevation * 255);
			}
		}
		ctx.putImageData(image, 0, 0);
	}

	/**
	 * Fourier-synthesized micro-surface normal map: every octave uses integer
	 * u/v frequencies, so the height field is exactly periodic on [0,1] in
	 * both axes and tiles seamlessly no matter how high `uScale`/`vScale`
	 * push the repeat count on the material's detail map.
	 */
	private generateDetailNormalTexture(size: number): DynamicTexture {
		const texture = new DynamicTexture('planetDetailNormal', { width: size, height: size }, this.scene, false);
		const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
		const image = ctx.createImageData(size, size);

		let seed = 71;
		const rand = () => {
			seed = (seed * 9301 + 49297) % 233280;
			return seed / 233280;
		};
		const octaves = Array.from({ length: 6 }, (_, i) => ({
			fx: 3 + Math.floor(rand() * 10) + i * 2,
			fy: 3 + Math.floor(rand() * 10) + i * 2,
			phase: rand() * Math.PI * 2,
			amp: 1 / (i + 1)
		}));
		const heightAt = (u: number, v: number) => {
			let h = 0;
			for (const o of octaves) {
				h += Math.sin((u * o.fx + v * o.fy) * Math.PI * 2 + o.phase) * o.amp;
			}
			return h;
		};

		const d = 1 / size;
		const strength = 1.6;
		for (let y = 0; y < size; y++) {
			const v = y / size;
			for (let x = 0; x < size; x++) {
				const u = x / size;
				const nx = (heightAt(u - d, v) - heightAt(u + d, v)) * strength;
				const ny = (heightAt(u, v - d) - heightAt(u, v + d)) * strength;
				const nz = 1;
				const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
				const idx = (y * size + x) * 4;
				image.data[idx] = ((nx / len) * 0.5 + 0.5) * 255;
				image.data[idx + 1] = ((ny / len) * 0.5 + 0.5) * 255;
				image.data[idx + 2] = ((nz / len) * 0.5 + 0.5) * 255;
				image.data[idx + 3] = 255;
			}
		}
		ctx.putImageData(image, 0, 0);
		texture.update(false);
		return texture;
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
		drawTerrainMask(ctx, width, seed, this.planetType);
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
			if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
				this.updateScanRing();
				return;
			}

			if (pointerInfo.type !== PointerEventTypes.POINTERTAP) return;

			// While the scanner is being aimed, the very next click on the
			// planet fires the scan immediately — no separate confirm step.
			// A click that misses the planet is ignored; aiming stays active.
			if (this.scanAimActive) {
				const scanPick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
				if (scanPick?.hit && scanPick.pickedMesh === this.planetMesh && scanPick.pickedPoint) {
					this.triggerShadowScan(scanPick.pickedPoint, DEFAULT_SCAN_DURATION_MS);
				}
				return;
			}

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

	/** Raycasts the cursor against the planet and snaps the scan ring onto
	 *  the hit point's surface normal; hides it when the cursor drifts off
	 *  the sphere. No-op unless targeting mode is active. */
	private updateScanRing(): void {
		if (!this.scanAimActive) return;
		const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
		if (!pick?.hit || pick.pickedMesh !== this.planetMesh || !pick.pickedPoint) {
			this.scanRing.setEnabled(false);
			return;
		}
		this.positionScanRing(pick.pickedPoint);
	}

	/** Snaps the scan ring onto the surface at `point` (aligned to its local
	 *  normal) and shows it. Shared by the live-aiming raycast and the
	 *  locked position once a scan actually fires. */
	private positionScanRing(point: Vector3): void {
		const normal = point.clone().normalize();
		this.scanRing.position = normal.scale(PLANET_RADIUS + 0.01);
		this.scanRing.rotationQuaternion = quaternionAligningUpTo(normal);
		this.scanRing.setEnabled(true);
	}

	/** A valid LAND click no longer spawns a colony directly — it just reports
	 *  the candidate point back to the host UI so it can show a landing
	 *  confirm dialog. The actual mesh/record creation happens in the public
	 *  `placeColony` below, called once the player confirms. */
	private tryPlaceColony(surfacePoint: Vector3): void {
		if (this.isSpacingBlocked(surfacePoint)) return;

		this.events.onPlacementPending({ x: surfacePoint.x, y: surfacePoint.y, z: surfacePoint.z });
	}

	private isSpacingBlocked(surfacePoint: Vector3): boolean {
		for (const marker of this.markers.values()) {
			const existing = new Vector3(marker.colony.position.x, marker.colony.position.y, marker.colony.position.z);
			if (Vector3.Distance(existing, surfacePoint) < MIN_COLONY_SPACING) {
				return true;
			}
		}
		return false;
	}

	/** Imperative entry point used by the Svelte confirm dialog: actually
	 *  spawns the colony mesh cluster + record at `point`. Re-validates
	 *  spacing since other colonies may have been placed while the dialog
	 *  was open. */
	placeColony(point: { x: number; y: number; z: number }): void {
		const surfacePoint = new Vector3(point.x, point.y, point.z);
		if (this.isSpacingBlocked(surfacePoint)) return;

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

	/** Builds the outpost asset cluster: a central habitat dome, 2–3 smaller
	 *  satellite domes, cylindrical connector corridors between them, and a
	 *  glowing neon antenna on the central dome — all parented under one
	 *  `TransformNode` positioned on the surface and aligned to its normal. */
	private createMarker(colony: Colony, normal: Vector3): void {
		const root = new TransformNode(`marker-${colony.id}`, this.scene);
		const surfacePoint = new Vector3(colony.position.x, colony.position.y, colony.position.z);
		root.position = surfacePoint;
		root.rotationQuaternion = quaternionAligningUpTo(normal);

		const domeMat = new StandardMaterial(`marker-dome-mat-${colony.id}`, this.scene);
		domeMat.diffuseColor = new Color3(0.72, 0.8, 0.86);
		domeMat.specularColor = new Color3(0.5, 0.6, 0.7);
		domeMat.specularPower = 48;
		domeMat.emissiveColor = new Color3(0.03, 0.08, 0.12);
		domeMat.alpha = 0.88;

		const tubeMat = new StandardMaterial(`marker-tube-mat-${colony.id}`, this.scene);
		tubeMat.diffuseColor = new Color3(0.3, 0.34, 0.4);
		tubeMat.specularColor = new Color3(0.4, 0.45, 0.5);
		tubeMat.emissiveColor = new Color3(0.02, 0.03, 0.04);

		const neonMat = new StandardMaterial(`marker-neon-mat-${colony.id}`, this.scene);
		neonMat.diffuseColor = Color3.Black();
		neonMat.specularColor = Color3.Black();
		neonMat.emissiveColor = new Color3(0.18, 0.9, 1);
		neonMat.disableLighting = true;

		const centralDiameter = PLANET_RADIUS * 0.1;
		const centralDome = this.createDome(`marker-dome-central-${colony.id}`, centralDiameter, domeMat, root);
		centralDome.metadata = { colonyId: colony.id };

		// 2-3 smaller research domes ringed around the central hub, per spec.
		const satelliteCount = 2 + Math.floor(Math.random() * 2);
		const satelliteDiameter = centralDiameter * 0.48;
		const orbitDistance = centralDiameter * 0.62 + satelliteDiameter * 0.55;
		const angleOffset = Math.random() * Math.PI * 2;

		for (let i = 0; i < satelliteCount; i++) {
			const angle = angleOffset + (i / satelliteCount) * Math.PI * 2;
			const x = Math.cos(angle) * orbitDistance;
			const z = Math.sin(angle) * orbitDistance;

			const satelliteDome = this.createDome(
				`marker-dome-sat-${i}-${colony.id}`,
				satelliteDiameter,
				domeMat,
				root
			);
			satelliteDome.position.set(x, 0, z);
			satelliteDome.metadata = { colonyId: colony.id };

			// Connector corridor: a cylinder rotated from the default +Y axis
			// onto the flat (surface-tangent) direction toward the satellite,
			// reusing the same up-alignment helper used for surface normals.
			const dir = new Vector3(x, 0, z).normalize();
			const tube = MeshBuilder.CreateCylinder(
				`marker-tube-${i}-${colony.id}`,
				{ height: orbitDistance, diameter: centralDiameter * 0.1, tessellation: 12 },
				this.scene
			);
			tube.position.set(x / 2, centralDiameter * 0.05, z / 2);
			tube.rotationQuaternion = quaternionAligningUpTo(dir);
			tube.material = tubeMat;
			tube.parent = root;
			tube.isPickable = false;
		}

		// Neon antenna mast + beacon tip on the central dome.
		const antennaHeight = centralDiameter * 0.55;
		const antennaMast = MeshBuilder.CreateCylinder(
			`marker-antenna-${colony.id}`,
			{ height: antennaHeight, diameter: centralDiameter * 0.035, tessellation: 8 },
			this.scene
		);
		antennaMast.position.y = centralDiameter * 0.5 + antennaHeight / 2;
		antennaMast.material = neonMat;
		antennaMast.parent = root;
		antennaMast.isPickable = false;

		const antennaTip = MeshBuilder.CreateSphere(
			`marker-antenna-tip-${colony.id}`,
			{ diameter: centralDiameter * 0.09, segments: 12 },
			this.scene
		);
		antennaTip.position.y = centralDiameter * 0.5 + antennaHeight;
		antennaTip.material = neonMat;
		antennaTip.parent = root;
		antennaTip.metadata = { colonyId: colony.id };

		// Landing-pad ring at the cluster's base.
		const ringMat = new StandardMaterial(`marker-ring-mat-${colony.id}`, this.scene);
		ringMat.diffuseColor = Color3.Black();
		ringMat.specularColor = Color3.Black();
		ringMat.emissiveColor = new Color3(0.18, 0.85, 1);
		ringMat.alpha = 0.55;
		ringMat.disableLighting = true;
		const ring = MeshBuilder.CreateTorus(
			`marker-ring-${colony.id}`,
			{ diameter: (orbitDistance + satelliteDiameter) * 2.1, thickness: PLANET_RADIUS * 0.004, tessellation: 48 },
			this.scene
		);
		ring.position.y = 0.002;
		ring.material = ringMat;
		ring.parent = root;
		ring.isPickable = false;

		const light = new PointLight(
			`marker-light-${colony.id}`,
			new Vector3(0, centralDiameter * 0.5 + antennaHeight, 0),
			this.scene
		);
		light.diffuse = new Color3(0.2, 0.85, 1);
		light.intensity = 0.6;
		light.range = PLANET_RADIUS * 0.6;
		light.parent = root;

		this.markers.set(colony.id, { root, pulseMesh: antennaTip, light, colony });
	}

	/** One habitat dome: an open-bottomed hemisphere (`slice: 0.5`) resting
	 *  flat-side-down at the parent's local origin — the flat cut face never
	 *  needs a cap since it sits below the visible horizon at y = 0. */
	private createDome(name: string, diameter: number, material: StandardMaterial, parent: TransformNode): Mesh {
		const dome = MeshBuilder.CreateSphere(name, { diameter, segments: 24, slice: 0.5 }, this.scene);
		dome.material = material;
		dome.parent = parent;
		return dome;
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

		this.sunAngle += dt * SUN_ORBIT_ANGULAR_SPEED;
		const cos = Math.cos(this.sunAngle);
		const sin = Math.sin(this.sunAngle);
		const rotatedDirection = new Vector3(
			this.sunBaseDirection.x * cos - this.sunBaseDirection.z * sin,
			this.sunBaseDirection.y,
			this.sunBaseDirection.x * sin + this.sunBaseDirection.z * cos
		);
		this.sun.direction = rotatedDirection;
		this.sun.position = rotatedDirection.scale(-10);

		if (this.cloudMesh) {
			this.cloudMesh.rotation.y += dt * CLOUD_ROTATION_SPEED;
		}

		if (this.scanAimActive || this.shadowScanActive) {
			const pulse = 1 + Math.sin(t * 4) * 0.12;
			this.scanRing.scaling.set(pulse, pulse, pulse);
		}
		this.updateScanLightFade();

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
			planetType: this.planetType,
			altitudeKm: Math.round((this.camera.radius - PLANET_RADIUS) * 3185),
			longitudeDeg: Math.round((((this.camera.alpha * 180) / Math.PI) % 360 + 360) % 360),
			latitudeDeg: Math.round(90 - (this.camera.beta * 180) / Math.PI)
		};
		this.events.onOrbitStatusChanged(status);
	}
}

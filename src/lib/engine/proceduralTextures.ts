/**
 * Procedural canvas-based fallback textures, used when remote texture URLs
 * fail to load (offline, CDN down, etc). Pure canvas drawing — no Babylon
 * imports here, so this module stays trivially testable / reusable.
 *
 * The diffuse texture and the gameplay terrain mask are both derived from
 * the same deterministic elevation/liquid noise functions below, so a pool
 * that's visibly dark on the sphere is guaranteed to classify as LIQUID —
 * the mask is generated independently of whatever image ends up on screen.
 */

import { PlanetType } from '../types/game';

type RGB = [number, number, number];

interface BiomePalette {
	basin: RGB;
	dustPlain: RGB;
	rustPlain: RGB;
	canyon: RGB;
	basalt: RGB;
	mineralPeak: RGB;
	liquid: RGB;
	liquidEdge: RGB;
	/** Elevation above which liquid can never appear (mountains stay dry). */
	liquidElevationMax: number;
	/** Higher = liquid pools rarer/smaller; lower = broad ocean coverage. */
	liquidPoolThreshold: number;
}

/** Per-dominant-surface color/coverage pools. `terrainElevation` itself stays
 *  shared across types — only the palette and how much of the low/mid
 *  elevation band counts as LIQUID differ. */
const BIOME_PALETTES: Record<PlanetType, BiomePalette> = {
	[PlanetType.Desert]: {
		basin: [46, 32, 26],
		dustPlain: [120, 82, 56],
		rustPlain: [150, 74, 42],
		canyon: [98, 50, 32],
		basalt: [42, 37, 35],
		mineralPeak: [150, 138, 148],
		liquid: [36, 122, 104],
		liquidEdge: [64, 96, 70],
		liquidElevationMax: 0.24,
		liquidPoolThreshold: 0.78
	},
	[PlanetType.Grassy]: {
		basin: [28, 40, 22],
		dustPlain: [86, 112, 48],
		rustPlain: [64, 96, 40],
		canyon: [54, 70, 34],
		basalt: [40, 48, 36],
		mineralPeak: [206, 214, 198],
		liquid: [34, 96, 128],
		liquidEdge: [58, 118, 132],
		liquidElevationMax: 0.36,
		liquidPoolThreshold: 0.56
	},
	[PlanetType.Water]: {
		basin: [10, 34, 64],
		dustPlain: [18, 66, 104],
		rustPlain: [180, 168, 128],
		canyon: [96, 82, 58],
		basalt: [52, 48, 46],
		mineralPeak: [232, 236, 240],
		liquid: [12, 56, 96],
		liquidEdge: [24, 84, 118],
		liquidElevationMax: 0.52,
		liquidPoolThreshold: 0.34
	},
	[PlanetType.Mixed]: {
		basin: [40, 46, 34],
		dustPlain: [104, 96, 58],
		rustPlain: [110, 84, 48],
		canyon: [80, 62, 40],
		basalt: [44, 42, 40],
		mineralPeak: [190, 192, 186],
		liquid: [24, 90, 118],
		liquidEdge: [46, 110, 124],
		liquidElevationMax: 0.32,
		liquidPoolThreshold: 0.63
	}
};

export function randomPlanetType(): PlanetType {
	const types = Object.values(PlanetType);
	return types[Math.floor(Math.random() * types.length)];
}

// Cheap deterministic value-noise (no deps): sum of sine lattices at
// increasing frequency, seeded so re-renders are stable.
function hash2(x: number, y: number, seed: number): number {
	const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
	return s - Math.floor(s);
}

function valueNoise(x: number, y: number, seed: number): number {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = x - xi;
	const yf = y - yi;
	const tl = hash2(xi, yi, seed);
	const tr = hash2(xi + 1, yi, seed);
	const bl = hash2(xi, yi + 1, seed);
	const br = hash2(xi + 1, yi + 1, seed);
	const u = xf * xf * (3 - 2 * xf);
	const v = yf * yf * (3 - 2 * yf);
	const top = tl + (tr - tl) * u;
	const bottom = bl + (br - bl) * u;
	return top + (bottom - top) * v;
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
	let amp = 0.5;
	let freq = 1;
	let sum = 0;
	let max = 0;
	for (let i = 0; i < octaves; i++) {
		sum += valueNoise(x * freq, y * freq, seed + i * 17) * amp;
		max += amp;
		amp *= 0.5;
		freq *= 2;
	}
	return sum / max;
}

/** Equirectangular terrain elevation in [0,1], sampled by (u,v) in [0,1]. */
export function terrainElevation(u: number, v: number, seed: number): number {
	// wrap u so the texture tiles seamlessly around the sphere
	const angle = u * Math.PI * 2;
	const wx = (Math.cos(angle) * 0.5 + 0.5) * 6;
	const wz = (Math.sin(angle) * 0.5 + 0.5) * 6;
	const y = v * 6;
	let n = fbm(wx + wz * 0.3, y, seed, 6);
	// polar basins run slightly lower/flatter than the equatorial highlands
	const poleFalloff = 1 - Math.pow(Math.abs(v - 0.5) * 2, 2) * 0.3;
	n *= poleFalloff;
	return n;
}

function liquidPoolNoise(u: number, v: number, seed: number): number {
	const angle = u * Math.PI * 2;
	const wx = (Math.cos(angle) * 0.5 + 0.5) * 14;
	const wz = (Math.sin(angle) * 0.5 + 0.5) * 14;
	return fbm(wx, wz + v * 14, seed + 900, 3);
}

/** True where a liquid pool sits inside a low-lying basin. Coverage is
 *  driven entirely by the biome palette's thresholds — a Water world and a
 *  Desert world share the same elevation field, just classify it differently. */
export function isLiquidAt(u: number, v: number, seed: number, palette: BiomePalette): boolean {
	const elevation = terrainElevation(u, v, seed);
	if (elevation >= palette.liquidElevationMax) return false;
	return liquidPoolNoise(u, v, seed) > palette.liquidPoolThreshold;
}

export function drawProceduralDiffuse(
	ctx: CanvasRenderingContext2D,
	size: number,
	seed = 1337,
	planetType: PlanetType = PlanetType.Mixed
) {
	const palette = BIOME_PALETTES[planetType];
	const w = size;
	const h = size / 2;
	const img = ctx.createImageData(w, h);
	const { basin, dustPlain, rustPlain, canyon, basalt, mineralPeak, liquid, liquidEdge } = palette;

	const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
	const mix = (c1: RGB, c2: RGB, t: number): RGB => [
		lerp(c1[0], c2[0], t),
		lerp(c1[1], c2[1], t),
		lerp(c1[2], c2[2], t)
	];

	for (let y = 0; y < h; y++) {
		const v = y / h;
		for (let x = 0; x < w; x++) {
			const u = x / w;
			const n = terrainElevation(u, v, seed);
			let color: RGB;

			if (n < 0.22) {
				color = basin;
			} else if (n < 0.38) {
				color = mix(basin, dustPlain, (n - 0.22) / 0.16);
			} else if (n < 0.55) {
				color = mix(dustPlain, rustPlain, (n - 0.38) / 0.17);
			} else if (n < 0.72) {
				color = mix(rustPlain, canyon, (n - 0.55) / 0.17);
			} else if (n < 0.88) {
				color = mix(canyon, basalt, (n - 0.72) / 0.16);
			} else {
				color = mix(basalt, mineralPeak, (n - 0.88) / 0.12);
			}

			if (isLiquidAt(u, v, seed, palette)) {
				const edgeT = Math.min(1, liquidPoolNoise(u, v, seed) - palette.liquidPoolThreshold) * 6;
				color = mix(liquidEdge, liquid, Math.min(1, edgeT));
			}

			const idx = (y * w + x) * 4;
			img.data[idx] = color[0];
			img.data[idx + 1] = color[1];
			img.data[idx + 2] = color[2];
			img.data[idx + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
}

export function drawProceduralNormal(
	ctx: CanvasRenderingContext2D,
	size: number,
	seed = 1337
) {
	const w = size;
	const h = size / 2;
	const img = ctx.createImageData(w, h);
	const heightAt = (u: number, v: number) => terrainElevation(u, v, seed);
	const du = 1 / w;
	const dv = 1 / h;

	for (let y = 0; y < h; y++) {
		const v = y / h;
		for (let x = 0; x < w; x++) {
			const u = x / w;
			const hL = heightAt(u - du, v);
			const hR = heightAt(u + du, v);
			const hD = heightAt(u, Math.max(0, v - dv));
			const hU = heightAt(u, Math.min(1, v + dv));
			const strength = 3.2;
			const nx = (hL - hR) * strength;
			const ny = (hD - hU) * strength;
			const nz = 1.0;
			const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
			const idx = (y * w + x) * 4;
			img.data[idx] = ((nx / len) * 0.5 + 0.5) * 255;
			img.data[idx + 1] = ((ny / len) * 0.5 + 0.5) * 255;
			img.data[idx + 2] = ((nz / len) * 0.5 + 0.5) * 255;
			img.data[idx + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
}

/**
 * Binary LAND (white) / LIQUID (black) mask, read back pixel-by-pixel by
 * PlanetEngine to classify a click's UV without touching the visual texture.
 */
export function drawTerrainMask(
	ctx: CanvasRenderingContext2D,
	size: number,
	seed: number,
	planetType: PlanetType = PlanetType.Mixed
) {
	const palette = BIOME_PALETTES[planetType];
	const w = size;
	const h = size / 2;
	const img = ctx.createImageData(w, h);
	for (let y = 0; y < h; y++) {
		const v = y / h;
		for (let x = 0; x < w; x++) {
			const u = x / w;
			const value = isLiquidAt(u, v, seed, palette) ? 0 : 255;
			const idx = (y * w + x) * 4;
			img.data[idx] = value;
			img.data[idx + 1] = value;
			img.data[idx + 2] = value;
			img.data[idx + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
}

export function drawProceduralStars(
	ctx: CanvasRenderingContext2D,
	size: number,
	seed = 99,
	count = 1200
) {
	ctx.fillStyle = '#00010a';
	ctx.fillRect(0, 0, size, size);

	let s = seed;
	const rand = () => {
		s = (s * 9301 + 49297) % 233280;
		return s / 233280;
	};

	for (let i = 0; i < count; i++) {
		const x = rand() * size;
		const y = rand() * size;
		const r = rand() * 1.3 + 0.15;
		const b = rand() * 0.6 + 0.4;
		ctx.beginPath();
		ctx.fillStyle = `rgba(255,255,255,${b.toFixed(2)})`;
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}

	for (let i = 0; i < count / 40; i++) {
		const x = rand() * size;
		const y = rand() * size;
		const hue = 190 + rand() * 60;
		ctx.beginPath();
		ctx.fillStyle = `hsla(${hue}, 80%, 80%, 0.9)`;
		ctx.arc(x, y, rand() * 1.8 + 1, 0, Math.PI * 2);
		ctx.fill();
	}
}

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

const LIQUID_ELEVATION_MAX = 0.32;
const LIQUID_POOL_THRESHOLD = 0.63;

function liquidPoolNoise(u: number, v: number, seed: number): number {
	const angle = u * Math.PI * 2;
	const wx = (Math.cos(angle) * 0.5 + 0.5) * 14;
	const wz = (Math.sin(angle) * 0.5 + 0.5) * 14;
	return fbm(wx, wz + v * 14, seed + 900, 3);
}

/** True where a rare toxic liquid pool sits inside a low-lying basin. */
export function isLiquidAt(u: number, v: number, seed: number): boolean {
	const elevation = terrainElevation(u, v, seed);
	if (elevation >= LIQUID_ELEVATION_MAX) return false;
	return liquidPoolNoise(u, v, seed) > LIQUID_POOL_THRESHOLD;
}

export function drawProceduralDiffuse(
	ctx: CanvasRenderingContext2D,
	size: number,
	seed = 1337
) {
	const w = size;
	const h = size / 2;
	const img = ctx.createImageData(w, h);
	const basin: [number, number, number] = [46, 32, 26];
	const dustPlain: [number, number, number] = [120, 82, 56];
	const rustPlain: [number, number, number] = [150, 74, 42];
	const canyon: [number, number, number] = [98, 50, 32];
	const basalt: [number, number, number] = [42, 37, 35];
	const mineralPeak: [number, number, number] = [150, 138, 148];
	const toxicPool: [number, number, number] = [36, 122, 104];
	const toxicPoolEdge: [number, number, number] = [64, 96, 70];

	const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
	const mix = (
		c1: [number, number, number],
		c2: [number, number, number],
		t: number
	): [number, number, number] => [
		lerp(c1[0], c2[0], t),
		lerp(c1[1], c2[1], t),
		lerp(c1[2], c2[2], t)
	];

	for (let y = 0; y < h; y++) {
		const v = y / h;
		for (let x = 0; x < w; x++) {
			const u = x / w;
			const n = terrainElevation(u, v, seed);
			let color: [number, number, number];

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

			if (isLiquidAt(u, v, seed)) {
				const edgeT = Math.min(1, liquidPoolNoise(u, v, seed) - LIQUID_POOL_THRESHOLD) * 6;
				color = mix(toxicPoolEdge, toxicPool, Math.min(1, edgeT));
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
export function drawTerrainMask(ctx: CanvasRenderingContext2D, size: number, seed: number) {
	const w = size;
	const h = size / 2;
	const img = ctx.createImageData(w, h);
	for (let y = 0; y < h; y++) {
		const v = y / h;
		for (let x = 0; x < w; x++) {
			const u = x / w;
			const value = isLiquidAt(u, v, seed) ? 0 : 255;
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

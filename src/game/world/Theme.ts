/**
 * Everything about a map that is colour or vegetation rather than layout. The
 * desert theme reproduces the original constants exactly so mission 1 renders
 * as it always has; the jungle swaps every one of them.
 */

export type RGB = [number, number, number];

export interface GroundPalette {
  light: number;
  dark: number;
  rockA: number;
  rockB: number;
  /** Damp band just above the water line. */
  wet: number;
  underwater: number;
  /** Strength of the wind-ripple stripes on flat ground, 0 to 1. */
  ripple: number;
}

export interface SkyPalette {
  horizon: number;
  zenith: number;
  haze: number;
  sun: number;
  hemiSky: number;
  hemiGround: number;
}

export interface WaterPalette {
  deep: number;
  shallow: number;
  foam: number;
  foamAmount: number;
  /** Multiplier on the noise frequency; larger means smaller ripples. */
  scale: number;
  /** Colour of the bottom showing through the shallows. */
  bed?: number;
  /** Multiplier on the swell gain; rivers want almost none. */
  swell?: number;
  /** Multiplier on surf foam and breaker whitewater. */
  shore?: number;
  /** Direction the swell travels in, x then z; the coastal field seeds the edges it comes from. */
  swellDir?: [number, number];
  /** Direction the wind sea travels in; defaults to the swell direction. */
  windDir?: [number, number];
  /** Peak wavelength of the JONSWAP spectrum in metres. */
  peakWavelength?: number;
  /** Amplitude gains for the swell, wind sea and capillary cascades. */
  gains?: [number, number, number];
  /** Surface wind strength; drives whitecap coverage and foam drift. */
  surfaceWind?: number;
}

export interface OverviewPalette {
  water: RGB;
  shallow: RGB;
  landLow: RGB;
  landHigh: RGB;
  /** Thin strip for ground between the water line and 1.2 m, jungle only. */
  bank?: RGB;
}

export type PropKind = "rock" | "shrub" | "cactus" | "palm" | "broadleaf" | "fern" | "spruce";

export interface PropSet {
  kind: PropKind;
  count: number;
  scale: [number, number];
  castShadow: boolean;
  /** How far the base is pushed into the ground, in units of scale. */
  sink: number;
  /** Per-instance tints chosen at random; omit for the material colour alone. */
  tints?: number[];
  /** Override the kind's material colour, for a grey arctic boulder or a dead shrub. */
  color?: number;
  /** Skip ground whose normal y is below this, so trees do not lean off banks. */
  maxSlope?: number;
  /** Metres of clear ground kept between this kind and the water. */
  bankMargin?: number;
  /** Maximum lean in radians under the rotor downwash; omit for rigid props. */
  sway?: number;
}

export interface PropTheme {
  /** Lowest ground a prop may stand on. */
  minHeight: number;
  bankMargin: number;
  /** Clear circles around every spawn and patrol lane, not just the flats. */
  clearSpawns: boolean;
  sets: PropSet[];
}

export interface Theme {
  id: "desert" | "jungle" | "arctic" | "gulf";
  /** Colour used for the mission picker swatch. */
  swatch: number;
  ground: GroundPalette;
  fog: { color: number; near: number; far: number };
  sky: SkyPalette;
  water: WaterPalette;
  overview: OverviewPalette;
  dust: { start: number; end: number };
  /** What the downwash kicks up: a sand ring, or leaf litter and grass. */
  wash: "dust" | "leaves";
  props: PropTheme;
}

export const desertTheme: Theme = {
  id: "desert",
  swatch: 0xd9b56a,
  ground: { light: 0xe0c07f, dark: 0xc59d5c, rockA: 0x8f6f4c, rockB: 0x5f4a35, wet: 0x8f7d59, underwater: 0x4e6a5e, ripple: 1 },
  fog: { color: 0xe2d0ad, near: 260, far: 900 },
  sky: { horizon: 0xe6d3b0, zenith: 0x6f9fc9, haze: 0xf3e4c4, sun: 0xfff0d6, hemiSky: 0x9fb9d6, hemiGround: 0x8a6b45 },
  water: { deep: 0x134a5f, shallow: 0x28869a, foam: 0xcfe6ea, foamAmount: 0.6, scale: 1, bed: 0xc9b58c, swellDir: [1, 0.25], windDir: [1, 0.45], peakWavelength: 48, gains: [1.45, 1.25, 1.1], surfaceWind: 1.15 },
  overview: { water: [28, 70, 92], shallow: [28, 70, 92], landLow: [150, 120, 70], landHigh: [220, 180, 110] },
  dust: { start: 0xe8d3a8, end: 0xd2b98c },
  wash: "dust",
  props: {
    minHeight: 2.2,
    bankMargin: 0,
    clearSpawns: false,
    sets: [
      { kind: "rock", count: 420, scale: [0.6, 3.2], castShadow: true, sink: 0.35 },
      { kind: "shrub", count: 380, scale: [0.7, 1.6], castShadow: false, sink: 0.3 },
      { kind: "cactus", count: 160, scale: [0.7, 1.4], castShadow: true, sink: 0.05 },
    ],
  },
};

export const jungleTheme: Theme = {
  id: "jungle",
  swatch: 0x3f7a35,
  ground: { light: 0x5d8a3c, dark: 0x3a5f2c, rockA: 0x5f5a4a, rockB: 0x3b3a30, wet: 0x5a4d35, underwater: 0x3d5541, ripple: 0 },
  fog: { color: 0xb7c9b0, near: 220, far: 760 },
  sky: { horizon: 0xd6dfcf, zenith: 0x7f9fb8, haze: 0xe4e9dc, sun: 0xfff6e2, hemiSky: 0xaebfcf, hemiGround: 0x3d5a2e },
  water: { deep: 0x2f4a3a, shallow: 0x4f7a5a, foam: 0xb9c9b0, foamAmount: 0.25, scale: 2, bed: 0x6d6a4a, swell: 0.3, shore: 0.3, swellDir: [1, 0.3], windDir: [0.6, 1], peakWavelength: 30, gains: [0.9, 0.7, 0.9], surfaceWind: 0.6 },
  overview: { water: [24, 64, 58], shallow: [52, 104, 88], landLow: [44, 80, 38], landHigh: [104, 124, 64], bank: [138, 128, 92] },
  dust: { start: 0x8a7a55, end: 0x6b6a4a },
  wash: "leaves",
  props: {
    minHeight: 1.5,
    bankMargin: 8,
    clearSpawns: true,
    sets: [
      { kind: "palm", count: 900, scale: [0.8, 1.35], castShadow: true, sink: 0.1, maxSlope: 0.8, tints: [0xffffff, 0xd8e8c0, 0xc8d8a8], sway: 0.1 },
      { kind: "broadleaf", count: 1300, scale: [0.8, 1.3], castShadow: true, sink: 0.1, maxSlope: 0.8, tints: [0xffffff, 0xcfe0b0, 0xb8cc98, 0xe0e8c8], sway: 0.07 },
      { kind: "fern", count: 1600, scale: [0.7, 1.5], castShadow: false, sink: 0.2, bankMargin: 3, sway: 0.4 },
      { kind: "rock", count: 250, scale: [0.6, 3.0], castShadow: true, sink: 0.35 },
      { kind: "shrub", count: 400, scale: [0.7, 1.6], castShadow: false, sink: 0.3, sway: 0.25 },
    ],
  },
};

export const arcticTheme: Theme = {
  id: "arctic",
  swatch: 0xdfe8ef,
  ground: { light: 0xeef2f5, dark: 0xd6dee6, rockA: 0x6b6f76, rockB: 0x3f434a, wet: 0xb9c6cf, underwater: 0x556b7a, ripple: 0.4 },
  fog: { color: 0xdfe6ec, near: 200, far: 720 },
  sky: { horizon: 0xe8eef2, zenith: 0x8fb0cc, haze: 0xf2f5f7, sun: 0xfff8ec, hemiSky: 0xbcd0e0, hemiGround: 0xd8dde2 },
  water: { deep: 0x1c3340, shallow: 0x2f5566, foam: 0xe6f0f4, foamAmount: 0.45, scale: 1.2, bed: 0x7e8b94, swellDir: [1, 0.15], windDir: [1, -0.2], peakWavelength: 60, gains: [0.95, 0.6, 0.7], surfaceWind: 0.8 },
  overview: { water: [24, 48, 64], shallow: [40, 80, 96], landLow: [205, 212, 220], landHigh: [245, 248, 250] },
  dust: { start: 0xf0f4f6, end: 0xd8e0e6 },
  wash: "dust",
  props: {
    minHeight: 1.2,
    bankMargin: 0,
    clearSpawns: true,
    sets: [
      { kind: "spruce", count: 700, scale: [0.8, 1.4], castShadow: true, sink: 0.1, maxSlope: 0.75, tints: [0xffffff, 0xe8f0f4, 0xd8e4ea], sway: 0.06 },
      { kind: "rock", count: 300, scale: [0.6, 3.4], castShadow: true, sink: 0.35, color: 0x7a7e84 },
      { kind: "shrub", count: 250, scale: [0.6, 1.3], castShadow: false, sink: 0.3, color: 0x6e6a5e, sway: 0.2 },
    ],
  },
};

export const gulfTheme: Theme = {
  id: "gulf",
  swatch: 0x2fa3ad,
  ground: { light: 0xd8c39a, dark: 0xb59a6b, rockA: 0x8c7d68, rockB: 0x5c5045, wet: 0xb7a582, underwater: 0x4c8a8c, ripple: 0.5 },
  fog: { color: 0xe8dcc4, near: 240, far: 900 },
  sky: { horizon: 0xf1e6cf, zenith: 0x7fb2d6, haze: 0xf6eedc, sun: 0xfff2dc, hemiSky: 0xa8c4d8, hemiGround: 0x8a7a5c },
  water: { deep: 0x0f6b7a, shallow: 0x2fa3ad, foam: 0xe4f4f4, foamAmount: 0.5, scale: 1, bed: 0xd5c39c, swellDir: [0.15, -1], windDir: [0.35, -1], peakWavelength: 42, gains: [1.2, 1.1, 1.0], surfaceWind: 1.0 },
  overview: { water: [18, 92, 104], shallow: [52, 150, 160], landLow: [176, 154, 112], landHigh: [222, 204, 164] },
  dust: { start: 0xe4d2ac, end: 0xcdb98f },
  wash: "dust",
  props: {
    minHeight: 1.5,
    bankMargin: 4,
    clearSpawns: true,
    sets: [
      { kind: "rock", count: 320, scale: [0.6, 3.6], castShadow: true, sink: 0.35, color: 0x8a7b66 },
      { kind: "shrub", count: 260, scale: [0.6, 1.4], castShadow: false, sink: 0.3, color: 0x7a7f58 },
      { kind: "palm", count: 120, scale: [0.8, 1.25], castShadow: true, sink: 0.1, maxSlope: 0.85, bankMargin: 6, tints: [0xffffff, 0xe8e0c8], sway: 0.1 },
    ],
  },
};

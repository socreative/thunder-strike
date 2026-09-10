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
}

export interface OverviewPalette {
  water: RGB;
  shallow: RGB;
  landLow: RGB;
  landHigh: RGB;
  /** Thin strip for ground between the water line and 1.2 m, jungle only. */
  bank?: RGB;
}

export type PropKind = "rock" | "shrub" | "cactus" | "palm" | "broadleaf" | "fern";

export interface PropSet {
  kind: PropKind;
  count: number;
  scale: [number, number];
  castShadow: boolean;
  /** How far the base is pushed into the ground, in units of scale. */
  sink: number;
  /** Per-instance tints chosen at random; omit for the material colour alone. */
  tints?: number[];
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
  id: "desert" | "jungle";
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
  water: { deep: 0x134a5f, shallow: 0x28869a, foam: 0xcfe6ea, foamAmount: 0.6, scale: 1 },
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
  water: { deep: 0x2f4a3a, shallow: 0x4f7a5a, foam: 0xb9c9b0, foamAmount: 0.25, scale: 2 },
  overview: { water: [24, 64, 58], shallow: [52, 104, 88], landLow: [44, 80, 38], landHigh: [104, 124, 64], bank: [138, 128, 92] },
  dust: { start: 0x8a7a55, end: 0x6b6a4a },
  wash: "leaves",
  props: {
    minHeight: 1.5,
    bankMargin: 8,
    clearSpawns: true,
    sets: [
      { kind: "palm", count: 900, scale: [0.8, 1.35], castShadow: true, sink: 0.1, maxSlope: 0.8, tints: [0xffffff, 0xd8e8c0, 0xc8d8a8], sway: 0.24 },
      { kind: "broadleaf", count: 1300, scale: [0.8, 1.3], castShadow: true, sink: 0.1, maxSlope: 0.8, tints: [0xffffff, 0xcfe0b0, 0xb8cc98, 0xe0e8c8], sway: 0.18 },
      { kind: "fern", count: 1600, scale: [0.7, 1.5], castShadow: false, sink: 0.2, bankMargin: 3, sway: 0.75 },
      { kind: "rock", count: 250, scale: [0.6, 3.0], castShadow: true, sink: 0.35 },
      { kind: "shrub", count: 400, scale: [0.7, 1.6], castShadow: false, sink: 0.3, sway: 0.5 },
    ],
  },
};

// The colour of the day: green while there is plenty left, through yellow
// and orange on the last cells, to a deep red once the battery is empty.
// Worked out in OKLCH so the steps look even, then turned into plain hex
// colours, which is all a phone's widgets and screens understand.

export interface Tone {
  /** The background. */
  bg: string;
  /** Text and lit cells on that background. */
  fg: string;
  /** Unlit cells. */
  track: string;
  /** True when the background is dark and the text is light. */
  dark: boolean;
}

const INK = '#10120F';

function channel(x: number): number {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

/** An OKLCH colour (lightness 0 to 1, chroma, hue in degrees) as #RRGGBB. */
export function oklchToHex(lightness: number, chroma: number, hueDegrees: number): string {
  const h = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(h);
  const b = chroma * Math.sin(h);
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return '#' + [channel(r), channel(g), channel(bl)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * The colour for a point in the day, where `t` is the share of the goal used.
 * Green dulls slowly for the first two thirds, turns yellow by five sixths,
 * orange through the last cell, and deep red from the moment it is empty.
 */
export function toneAt(t: number): Tone {
  if (!(t < 1)) return { bg: oklchToHex(0.45, 0.19, 27), fg: '#FFFFFF', track: 'rgba(255,255,255,0.30)', dark: true };
  const x = Math.max(0, t);
  let hue: number;
  let light: number;
  let chroma: number;
  if (x <= 0.667) {
    const k = x / 0.667;
    hue = 150;
    light = 76 - 7 * k;
    chroma = 0.18 - 0.04 * k;
  } else if (x <= 0.833) {
    const k = (x - 0.667) / 0.166;
    hue = 150 - 50 * k;
    light = 69 + 15 * k;
    chroma = 0.14 + 0.03 * k;
  } else if (x <= 0.944) {
    const k = (x - 0.833) / 0.111;
    hue = 100 - 45 * k;
    light = 84 - 12 * k;
    chroma = 0.17 + 0.01 * k;
  } else {
    const k = (x - 0.944) / 0.056;
    hue = 55 - 25 * k;
    light = 72 - 9 * k;
    chroma = 0.18 + 0.02 * k;
  }
  return { bg: oklchToHex(light / 100, chroma, hue), fg: INK, track: 'rgba(16,18,15,0.22)', dark: false };
}

/** The colour shown for a number of lit cells: the middle of that cell's stretch of the day. */
export function toneForCells(cells: number, totalCells = 6): Tone {
  if (cells <= 0) return toneAt(1);
  return toneAt((totalCells - cells + 0.5) / totalCells);
}

/** Relative luminance of a #RRGGBB colour, for checking that text can be read on it. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

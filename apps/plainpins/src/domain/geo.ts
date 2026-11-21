// A little geometry for the map: where to look so a set of pins is in view.

export interface Camera {
  lat: number;
  lng: number;
  /** 1 shows the whole globe; each step up halves the width in view. */
  zoom: number;
}

export const GLOBE_ZOOM = 1;
export const PLACE_ZOOM = 13;

interface Point {
  lat: number;
  lng: number;
}

const RAD = Math.PI / 180;

/** The middle of some points on the sphere (so pins either side of the date line average sensibly). */
export function centerOf(points: Point[]): Point | null {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const la = p.lat * RAD;
    const lo = p.lng * RAD;
    x += Math.cos(la) * Math.cos(lo);
    y += Math.cos(la) * Math.sin(lo);
    z += Math.sin(la);
  }
  const hyp = Math.hypot(x, y);
  if (hyp < 1e-9 && Math.abs(z) < 1e-9) return { lat: 0, lng: 0 };
  return { lat: Math.atan2(z, hyp) / RAD, lng: Math.atan2(y, x) / RAD };
}

/** Degrees between two points along the surface. */
export function arcDegrees(a: Point, b: Point): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / RAD;
}

/** A camera that takes in every point, with some air round the edge. One point gets a close look; none, the globe. */
export function cameraFor(points: Point[], fallback: Point = { lat: 30, lng: -40 }): Camera {
  const center = centerOf(points);
  if (!center) return { ...fallback, zoom: GLOBE_ZOOM };
  if (points.length === 1) return { ...center, zoom: PLACE_ZOOM };
  let reach = 0;
  for (const p of points) reach = Math.max(reach, arcDegrees(center, p));
  if (reach < 0.002) return { ...center, zoom: PLACE_ZOOM };
  // The width in view is 360 / 2^zoom degrees; ask for a little over twice the reach.
  const zoom = Math.log2(360 / (reach * 2.8));
  return { ...center, zoom: Math.max(GLOBE_ZOOM, Math.min(PLACE_ZOOM, zoom)) };
}

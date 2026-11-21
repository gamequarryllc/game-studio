import * as Location from 'expo-location';

// Looking places up on the iPhone. Names come from Apple's own geocoder, the
// same one Maps uses; the app has no lookup service of its own.
// The web preview has its own version of this file: geo.web.ts.

export const CAN_SEARCH = true;
export const CAN_LOCATE = true;

export interface Where {
  locality: string;
  country: string;
  /** A name for the spot itself, when the geocoder knows one ("Holland State Park"). */
  name: string;
}

/** What a point on the map is called; null when nothing could be found (no signal, open water). */
export async function describe(lat: number, lng: number): Promise<Where | null> {
  try {
    const [hit] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!hit) return null;
    const town = hit.city ?? hit.district ?? hit.subregion ?? '';
    const region = hit.region ?? '';
    const locality = [town, region].filter((part, i, all) => part !== '' && all.indexOf(part) === i).join(', ');
    const street = hit.street ?? '';
    // The geocoder's "name" is often just the street address; that is not a name worth suggesting.
    const name = hit.name && hit.name !== street && !/^\d/.test(hit.name) && hit.name !== town ? hit.name : '';
    return { locality, country: hit.country ?? '', name };
  } catch {
    return null;
  }
}

/** The first match for some typed words: a town, an address, a landmark. */
export async function search(text: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const [hit] = await Location.geocodeAsync(text);
    return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  } catch {
    return null;
  }
}

export type Located = { ok: true; lat: number; lng: number } | { ok: false; reason: 'denied' | 'unavailable' };

/** Where the phone is now. Asks for permission the first time. */
export async function locate(): Promise<Located> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: 'denied' };
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
    const fix = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { ok: true, lat: fix.coords.latitude, lng: fix.coords.longitude };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

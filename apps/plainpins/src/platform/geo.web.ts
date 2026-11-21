// The web preview's version of geo.ts. A browser has no geocoder of its own,
// and the preview calls no service, so places are named by hand here.

export const CAN_SEARCH = false;
export const CAN_LOCATE = false;

export interface Where {
  locality: string;
  country: string;
  name: string;
}

export async function describe(_lat: number, _lng: number): Promise<Where | null> {
  return null;
}

export async function search(_text: string): Promise<{ lat: number; lng: number } | null> {
  return null;
}

export type Located = { ok: true; lat: number; lng: number } | { ok: false; reason: 'denied' | 'unavailable' };

export async function locate(): Promise<Located> {
  return { ok: false, reason: 'unavailable' };
}

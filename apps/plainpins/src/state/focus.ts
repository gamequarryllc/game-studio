// A note passed from one screen to the map: "show this place". The map picks
// it up when it next comes to the front.

let wanted: string | null = null;
const listeners = new Set<() => void>();

export const focus = {
  ask(placeId: string): void {
    wanted = placeId;
    for (const l of listeners) l();
  },
  take(): string | null {
    const id = wanted;
    wanted = null;
    return id;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

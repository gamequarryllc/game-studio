// The web preview sells nothing, so the store is simply absent here.

export type BuyResult = 'purchased' | 'cancelled' | 'failed';
export type RestoreResult = 'restored' | 'nothing' | 'failed';

export function storeAvailable(): boolean {
  return false;
}

export async function startStore(_onChange: (owned: boolean) => void): Promise<{ owned: boolean; price: string | null }> {
  return { owned: false, price: null };
}

export async function buy(): Promise<BuyResult> {
  return 'failed';
}

export async function restore(): Promise<RestoreResult> {
  return 'failed';
}

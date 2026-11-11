import { Platform } from 'react-native';

import { ENTITLEMENT_ID, PRODUCT_ID, REVENUECAT_IOS_API_KEY, purchasesConfigured } from './config';

// The only part of the app that talks to a server: RevenueCat, which checks
// and restores the Pro purchase. It is not even loaded until a key is set.
// The web preview has a stand-in that does nothing: revenuecat.web.ts.

type Purchases = typeof import('react-native-purchases').default;
type CustomerInfo = import('react-native-purchases').CustomerInfo;
type PurchasesPackage = import('react-native-purchases').PurchasesPackage;

export type BuyResult = 'purchased' | 'cancelled' | 'failed';
export type RestoreResult = 'restored' | 'nothing' | 'failed';

let sdk: Purchases | null = null;
let proPackage: PurchasesPackage | null = null;

const active = (info: CustomerInfo) => info.entitlements.active[ENTITLEMENT_ID] !== undefined;

export function storeAvailable(): boolean {
  return Platform.OS === 'ios' && purchasesConfigured();
}

/** Starts the store. Resolves with whether Pro is owned and the price to show. */
export async function startStore(onChange: (owned: boolean) => void): Promise<{ owned: boolean; price: string | null }> {
  if (!storeAvailable()) return { owned: false, price: null };
  const mod = await import('react-native-purchases');
  sdk = mod.default;
  sdk.configure({ apiKey: REVENUECAT_IOS_API_KEY });
  sdk.addCustomerInfoUpdateListener((info) => onChange(active(info)));
  const info = await sdk.getCustomerInfo();
  let price: string | null = null;
  try {
    const offerings = await sdk.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    proPackage = packages.find((p) => p.product.identifier === PRODUCT_ID) ?? offerings.current?.lifetime ?? null;
    price = proPackage?.product.priceString ?? null;
  } catch {
    price = null;
  }
  return { owned: active(info), price };
}

export async function buy(): Promise<BuyResult> {
  if (!sdk || !proPackage) return 'failed';
  try {
    const result = await sdk.purchasePackage(proPackage);
    return active(result.customerInfo) ? 'purchased' : 'failed';
  } catch (e) {
    return (e as { userCancelled?: boolean } | null)?.userCancelled ? 'cancelled' : 'failed';
  }
}

export async function restore(): Promise<RestoreResult> {
  if (!sdk) return 'failed';
  try {
    return active(await sdk.restorePurchases()) ? 'restored' : 'nothing';
  } catch {
    return 'failed';
  }
}

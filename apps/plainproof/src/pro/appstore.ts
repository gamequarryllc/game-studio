import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { PRODUCT_ID } from './config';

// Buying and restoring Pro, straight from the App Store on the iPhone (StoreKit,
// through expo-iap). There is no server in between and no account: Apple signs
// each purchase and the iPhone checks the signature itself, so the app sends
// nothing anywhere. The web preview has a stand-in that sells nothing: appstore.web.ts.

type Iap = typeof import('expo-iap');
type Purchase = import('expo-iap').Purchase;

/** 'pending' is Ask to Buy: the purchase waits for a parent's approval. 'unavailable': the App Store did not offer the product. */
export type BuyResult = 'purchased' | 'cancelled' | 'pending' | 'unavailable' | 'failed';
export type RestoreResult = 'restored' | 'nothing' | 'failed';

/** After the purchase sheet closes, how long to wait for its result before asking the App Store what is owned. */
const SETTLE_MS = 2500;

let iap: Iap | null = null;
let price: string | null = null;
let productFound = false;
let waiting: ((result: BuyResult) => void) | null = null;
let tellOwned: (owned: boolean) => void = () => {};

/** Expo Go has no StoreKit module, so nothing can be bought there. */
export function storeAvailable(): boolean {
  return Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

function finish(result: BuyResult) {
  const resolve = waiting;
  waiting = null;
  resolve?.(result);
}

/** Whether this Apple Account holds Pro, as the iPhone knows it (this works offline). null when it could not be read. */
async function ownsPro(): Promise<boolean | null> {
  if (!iap) return null;
  try {
    const held = await iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    return held.some((p) => p.productId === PRODUCT_ID && p.purchaseState !== 'pending');
  } catch {
    return null;
  }
}

async function loadProduct(): Promise<void> {
  if (!iap) return;
  const found = await iap.fetchProducts({ skus: [PRODUCT_ID], type: 'in-app' });
  const product = (found ?? []).find((p) => p.id === PRODUCT_ID);
  productFound = product !== undefined;
  price = product?.displayPrice ?? null;
}

async function settle(purchase: Purchase): Promise<void> {
  if (!iap || purchase.productId !== PRODUCT_ID) return;
  if (purchase.purchaseState === 'pending') {
    finish('pending');
    return;
  }
  try {
    await iap.finishTransaction({ purchase, isConsumable: false });
  } catch {
    // An unfinished transaction is offered again at the next launch; the purchase itself stands.
  }
  if (purchase.purchaseState === 'purchased' || (await ownsPro()) === true) {
    tellOwned(true);
    finish('purchased');
  } else {
    finish('failed');
  }
}

/**
 * Starts the store. `owned` is null when it could not be read, so a saved answer is kept.
 * `onChange` is also called later, when a purchase arrives by itself (an Ask to Buy approval).
 */
export async function startStore(onChange: (owned: boolean) => void): Promise<{ owned: boolean | null; price: string | null }> {
  if (!storeAvailable()) return { owned: false, price: null };
  tellOwned = onChange;
  // Loaded here, not at the top of the file: Expo Go has no StoreKit module, and loading it there would stop the app.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-iap') as Iap;
  await mod.initConnection();
  iap = mod;
  mod.purchaseUpdatedListener((purchase) => void settle(purchase));
  mod.purchaseErrorListener((error) => {
    if (error.code === mod.ErrorCode.UserCancelled) finish('cancelled');
    else if (error.code === mod.ErrorCode.Pending || error.code === mod.ErrorCode.DeferredPayment) finish('pending');
    else finish('failed');
  });
  const owned = await ownsPro();
  try {
    await loadProduct();
  } catch {
    // Offline: the price is read again when the Pro screen opens.
  }
  return { owned, price };
}

/** The App Store's own price text, read again if it wasn't there at the start. */
export async function readPrice(): Promise<string | null> {
  if (iap && !productFound) {
    try {
      await loadProduct();
    } catch {
      // Still offline.
    }
  }
  return price;
}

export async function buy(): Promise<BuyResult> {
  const store = iap;
  if (!store) return 'failed';
  await readPrice();
  if (!productFound) return 'unavailable';
  if (waiting) return 'failed';
  return new Promise<BuyResult>((resolve) => {
    waiting = resolve;
    store
      .requestPurchase({ request: { apple: { sku: PRODUCT_ID } }, type: 'in-app' })
      .then((result) => {
        const purchase = Array.isArray(result) ? result[0] : result;
        if (purchase) void settle(purchase);
        // The result normally arrives through the listeners. If nothing has by now, ask what is owned.
        setTimeout(() => {
          if (!waiting) return;
          void ownsPro().then((owned) => {
            if (owned) tellOwned(true);
            finish(owned ? 'purchased' : 'cancelled');
          });
        }, SETTLE_MS);
      })
      .catch((e: unknown) => finish((e as { code?: string } | null)?.code === store.ErrorCode.UserCancelled ? 'cancelled' : 'failed'));
  });
}

export async function restore(): Promise<RestoreResult> {
  if (!iap) return 'failed';
  let reached = true;
  try {
    // Asks the App Store afresh; it may ask for the Apple Account password.
    await iap.restorePurchases();
  } catch {
    reached = false;
  }
  const owned = await ownsPro();
  if (owned) {
    tellOwned(true);
    return 'restored';
  }
  return reached && owned === false ? 'nothing' : 'failed';
}

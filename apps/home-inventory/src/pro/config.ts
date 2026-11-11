// What the store sells. One purchase, once, forever: no subscription.

/** RevenueCat's public iOS key. Empty until the owner adds it, which keeps real purchases switched off. */
export const REVENUECAT_IOS_API_KEY = '';

/** The entitlement in RevenueCat that the purchase unlocks. */
export const ENTITLEMENT_ID = 'home_inventory_pro';

/** The App Store product: a non-consumable. */
export const PRODUCT_ID = 'com.gamequarry.homeinventory.pro';

/** Shown only when the store's own price can't be read (test builds). Never used to charge anyone. */
export const EXPECTED_PRICE = '$5.99';

export function purchasesConfigured(): boolean {
  return REVENUECAT_IOS_API_KEY.trim() !== '';
}

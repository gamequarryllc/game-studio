// What the store sells. One purchase, once, forever: no subscription.

/** The App Store product: a non-consumable. It is the bundle id plus ".pro" (the release check holds it to that). */
export const PRODUCT_ID = 'com.gamequarry.plainproof.pro';

/** Shown only where there is no store to read the price from (the web preview, Expo Go). Never used to charge anyone. */
export const EXPECTED_PRICE = '$5.99';

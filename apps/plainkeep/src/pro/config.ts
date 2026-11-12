// What the store sells. One purchase, once, forever: no subscription.

/** The App Store product: a non-consumable. It is the bundle id plus ".pro" (the release check holds it to that). */
export const PRODUCT_ID = 'com.gamequarry.plainkeep.pro';

/** Shown only where there is no store to read the price from (the web preview). Never used to charge anyone. */
export const EXPECTED_PRICE = '$6.99';

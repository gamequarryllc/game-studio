// Run before any App Store build: `npm run check:release`.
// A store build must be able to sell and restore Pro. Without the RevenueCat
// key the Pro screen only explains that purchases are off, which is right for
// Expo Go and the web preview and wrong for a build that goes to App Review.

const fs = require('fs');
const path = require('path');

const config = fs.readFileSync(path.join(__dirname, '..', 'src', 'pro', 'config.ts'), 'utf8');
const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;
const problems = [];

const key = /REVENUECAT_IOS_API_KEY = '([^']*)'/.exec(config);
if (!key) problems.push('src/pro/config.ts: REVENUECAT_IOS_API_KEY was not found.');
else if (key[1].trim() === '') problems.push('src/pro/config.ts: REVENUECAT_IOS_API_KEY is empty. Add the public App Store key from RevenueCat (it starts with "appl_").');
else if (!key[1].startsWith('appl_')) problems.push('src/pro/config.ts: REVENUECAT_IOS_API_KEY should be the public App Store key, which starts with "appl_". Never put a secret key here.');

const bundle = app.ios && app.ios.bundleIdentifier;
if (!config.includes(`'${bundle}.pro'`)) problems.push(`src/pro/config.ts: PRODUCT_ID should be ${bundle}.pro, to match app.json.`);

if (problems.length > 0) {
  console.error('Not ready for an App Store build:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Ready: the store key is set and the product id matches the bundle id.');

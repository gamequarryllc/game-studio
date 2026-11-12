// Run before any App Store build: `npm run check:release`.
// A store build must be able to sell and restore Pro, and must carry nothing
// that only a test build should have.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const config = read('src/pro/config.ts');
const app = JSON.parse(read('app.json')).expo;
const pkg = JSON.parse(read('package.json'));
const problems = [];

const bundle = app.ios && app.ios.bundleIdentifier;
if (!config.includes(`PRODUCT_ID = '${bundle}.pro'`)) problems.push(`src/pro/config.ts: PRODUCT_ID should be ${bundle}.pro, to match app.json and the product in App Store Connect.`);

if (!pkg.dependencies['expo-iap']) problems.push('package.json: expo-iap is missing, so nothing can be bought.');
const plugins = (app.plugins || []).map((p) => (Array.isArray(p) ? p[0] : p));
if (!plugins.includes('expo-iap')) problems.push('app.json: "expo-iap" is missing from plugins, so the iPhone build would leave the store out.');

// The app's promise is that nothing leaves the phone. A purchase service that keeps its own records would break it.
for (const name of ['react-native-purchases']) {
  if (pkg.dependencies[name]) problems.push(`package.json: ${name} sends purchase records to its own servers; Plainproof buys straight from the App Store.`);
}

const listingPath = path.join(root, '..', '..', 'store', 'plainproof', 'listing.json');
if (fs.existsSync(listingPath)) {
  const listing = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
  if (listing.bundle_id !== bundle) problems.push(`store/plainproof/listing.json: bundle_id is ${listing.bundle_id}, app.json has ${bundle}.`);
}

if (problems.length > 0) {
  console.error('Not ready for an App Store build:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Ready: the product id matches the bundle id and the store is built in.');

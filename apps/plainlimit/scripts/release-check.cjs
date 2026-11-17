// Run before any App Store build: `npm run check:release` (tools/ios_app_build.sh
// refuses to upload a release build until it passes).
// A store build must carry nothing that only a test build should have, and must
// agree with its store listing.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const pkg = JSON.parse(read('package.json'));
const problems = [];
const bundle = app.ios && app.ios.bundleIdentifier;

// The test tools must switch off by themselves in a release build.
const screenTime = read('src/platform/screenTime.ts');
if (!/export const DEV_TOOLS = \(__DEV__ \|\| Platform\.OS === 'web' \|\| process\.env\.EXPO_PUBLIC_PLAYTEST === '1'\)/.test(screenTime)) {
  problems.push('src/platform/screenTime.ts: DEV_TOOLS no longer depends only on a development, web or playtest build.');
}
if (process.env.EXPO_PUBLIC_PLAYTEST === '1') problems.push('EXPO_PUBLIC_PLAYTEST=1 is set: that is the playtest flavor.');
for (const file of ['.env', '.env.local', '.env.production']) {
  const full = path.join(root, file);
  if (fs.existsSync(full) && /EXPO_PUBLIC_PLAYTEST\s*=\s*1/.test(fs.readFileSync(full, 'utf8'))) problems.push(`${file}: sets EXPO_PUBLIC_PLAYTEST=1, which would put the test tools in the store build.`);
}
// The browser stand-in for a phone is for the web preview only.
if (!/if \(Platform\.OS !== 'web' \|\| typeof window === 'undefined'\) return new Set<string>\(\);/.test(screenTime)) {
  problems.push('src/platform/screenTime.ts: the "?mock=" stand-in is no longer limited to the browser.');
}

// The app's promise is that nothing leaves the phone: no analytics, crash reporting or purchase service.
for (const name of ['react-native-purchases', '@sentry/react-native', 'expo-updates', '@react-native-firebase/app', 'expo-insights']) {
  if (pkg.dependencies[name]) problems.push(`package.json: ${name} talks to a server, and the privacy label says Data Not Collected.`);
}

const listingPath = path.join(root, '..', '..', 'store', 'plainlimit', 'listing.json');
if (!fs.existsSync(listingPath)) {
  problems.push('store/plainlimit/listing.json is missing.');
} else {
  const listing = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
  if (listing.bundle_id !== bundle) problems.push(`store/plainlimit/listing.json: bundle_id is ${listing.bundle_id}, app.json has ${bundle}.`);
  if ((listing.products || []).length > 0 && !fs.existsSync(path.join(root, 'src', 'pro', 'config.ts'))) {
    problems.push('The listing sells something, but the app has no purchase code (src/pro/config.ts).');
  }
}

if (problems.length > 0) {
  console.error('Not ready for an App Store build:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Ready: no test tools, no services that collect data, and the listing matches the app.');

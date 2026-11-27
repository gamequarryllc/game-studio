// Apple's usage report: the "what used it" list on Today.
//
// The phone runs this extension in a sealed box. It is handed the per-app
// times, draws them, and the picture is shown inside the app; nothing in it
// can be read by the app, saved or sent anywhere.
//
// Bundle id com.gamequarry.plainlimit.report (registered with Apple, Family
// Controls on; the App Group from build 167). The target plugin has no type of its own for a report
// extension; "app-intent" builds the same kind of target (an ExtensionKit
// extension), and Info.plist, written by plugins/withTargets.js, says which
// kind it really is.
/** @type {import('@kingstinct/expo-apple-targets/build/config-plugin').ConfigFunction} */
module.exports = () => ({
  type: 'app-intent',
  name: 'PlainlimitReport',
  bundleIdentifier: '.report',
  frameworks: ['DeviceActivity', 'SwiftUI'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    // To read the essentials, so "what used it" can leave them out (see `Essentials` in PlainlimitReport.swift).
    'com.apple.security.application-groups': ['group.com.gamequarry.plainlimit'],
  },
});

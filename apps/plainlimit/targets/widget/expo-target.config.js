// The home screen and lock screen widget: the six-cell battery.
// Bundle id com.gamequarry.plainlimit.widget (registered with Apple, App Groups on).
/** @type {import('@kingstinct/expo-apple-targets/build/config-plugin').ConfigFunction} */
module.exports = () => ({
  type: 'widget',
  name: 'PlainlimitWidget',
  bundleIdentifier: '.widget',
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.gamequarry.plainlimit'],
  },
});

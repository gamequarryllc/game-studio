// Prepares the app's extra iPhone targets before the Screen Time library's own
// plugin reads them. It must be listed before "react-native-device-activity" in
// app.json, and that plugin must have copyToTargetFolder: false.
//
// What it does, each time the Xcode project is written (expo prebuild):
//   1. Copies the library's three extensions (monitor, shield action, shield
//      configuration) from node_modules into targets/. They are not kept in git.
//   2. Gives the monitor extension the bundle id that is registered with Apple
//      (com.gamequarry.plainlimit.ActivityMonitor; the library's default ends
//      in "ActivityMonitorExtension").
//   3. Teaches the monitor extension to redraw the home screen widget when a
//      checkpoint is reached or the day starts over, and to note the time it
//      asked (the test build shows it), then to wait half a second so the
//      request has left before iOS puts the extension to sleep. Without this the widget would only
//      catch up when iOS next feels like refreshing it.
//
//   4. Writes targets/report/Info.plist (the usage report extension). Its
//      version and build number come from Xcode's settings, which the build
//      script sets to the app's.
//   5. Removes the push-notification entitlement the notifications package adds.
//
// targets/widget/ and targets/report/ are the app's own and are kept in git.
const fs = require('fs');
const path = require('path');
const { withEntitlementsPlist } = require('expo/config-plugins');

const EXTENSIONS = ['ActivityMonitorExtension', 'ShieldAction', 'ShieldConfiguration'];

const MONITOR_CONFIG = `// Written by plugins/withTargets.js. Do not edit: it is rewritten on every prebuild.
const { createConfig } = require("react-native-device-activity/config-plugin/createExpoTargetConfig");

const base = createConfig("device-activity-monitor");

module.exports = (config) => ({ ...base(config), bundleIdentifier: ".ActivityMonitor" });
`;

function replaceOnce(source, find, replacement, what) {
  const at = source.indexOf(find);
  if (at === -1 || source.indexOf(find, at + find.length) !== -1) {
    throw new Error(
      `plugins/withTargets.js: expected exactly one "${what}" in the Screen Time library's monitor extension. ` +
        'The library has changed; update the patch.',
    );
  }
  return source.slice(0, at) + replacement + source.slice(at + find.length);
}

function patchMonitor(file) {
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes('WidgetCenter.shared.reloadAllTimelines()')) return;
  source = replaceOnce(source, 'import os\n', 'import os\nimport WidgetKit\n', 'import os');
  for (const name of ['intervalDidStart', 'intervalDidEnd', 'eventDidReachThreshold']) {
    const call = `notifyAppWithName(name: "${name}")`;
    const asked = 'userDefaults?.set((Date().timeIntervalSince1970 * 1000).rounded(), forKey: "plainlimit_reload_asked")';
    source = replaceOnce(source, call, `${call}\n    ${asked}\n    WidgetCenter.shared.reloadAllTimelines()\n    Thread.sleep(forTimeInterval: 0.5)`, call);
  }
  fs.writeFileSync(file, source);
}

module.exports = function withTargets(config) {
  const projectRoot = config._internal?.projectRoot ?? process.cwd();
  const library = path.dirname(require.resolve('react-native-device-activity/package.json', { paths: [projectRoot] }));
  const targets = path.join(projectRoot, 'targets');
  fs.mkdirSync(targets, { recursive: true });
  // This runs every time the app's settings are read, which Xcode's build steps
  // also do. Copy only when the library's version has changed since the last
  // copy, and never delete the folder: the step that writes the Xcode project
  // leaves each target's entitlements file in it, and a build in progress is
  // reading these files.
  const version = require(path.join(library, 'package.json')).version;
  const stamp = `react-native-device-activity ${version}, patch 3\n`;
  for (const name of EXTENSIONS) {
    const to = path.join(targets, name);
    const marker = path.join(to, '.prepared');
    if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === stamp) continue;
    fs.mkdirSync(to, { recursive: true });
    fs.cpSync(path.join(library, 'targets', name), to, { recursive: true });
    fs.copyFileSync(path.join(library, 'ios', 'Shared.swift'), path.join(to, 'Shared.swift'));
    if (name === 'ActivityMonitorExtension') {
      fs.writeFileSync(path.join(to, 'expo-target.config.js'), MONITOR_CONFIG);
      patchMonitor(path.join(to, 'DeviceActivityMonitorExtension.swift'));
    }
    fs.writeFileSync(marker, stamp);
  }
  // The report extension's Info.plist: which kind of extension it is. Its
  // version and build number are left to Xcode's own settings, which the build
  // script gives on the command line. (The number used to be written here, but
  // the target is created with a build number of 1 and that is what reached
  // Apple, who wrote to say it did not match the app's.)
  const reportDir = path.join(targets, 'report');
  if (fs.existsSync(reportDir)) {
    fs.writeFileSync(
      path.join(reportDir, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleShortVersionString</key>
    <string>$(MARKETING_VERSION)</string>
    <key>CFBundleVersion</key>
    <string>$(CURRENT_PROJECT_VERSION)</string>
    <key>EXAppExtensionAttributes</key>
    <dict>
      <key>EXExtensionPointIdentifier</key>
      <string>com.apple.deviceactivityui.report-extension</string>
    </dict>
  </dict>
</plist>
`,
    );
  }

  // The app only ever shows notifications it makes on the phone itself. The
  // notifications package asks for Apple's push service by default, which would
  // need a capability the app does not use; take that back out.
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
};

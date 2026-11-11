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
//      checkpoint is reached or the day starts over. Without this the widget
//      would only catch up when iOS next feels like refreshing it.
//
//   4. Removes the push-notification entitlement the notifications package adds.
//
// targets/widget/ is the app's own and is kept in git.
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
    source = replaceOnce(source, call, `${call}\n    WidgetCenter.shared.reloadAllTimelines()`, call);
  }
  fs.writeFileSync(file, source);
}

module.exports = function withTargets(config) {
  const projectRoot = config._internal?.projectRoot ?? process.cwd();
  const library = path.dirname(require.resolve('react-native-device-activity/package.json', { paths: [projectRoot] }));
  const targets = path.join(projectRoot, 'targets');
  fs.mkdirSync(targets, { recursive: true });
  for (const name of EXTENSIONS) {
    const to = path.join(targets, name);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(path.join(library, 'targets', name), to, { recursive: true });
    fs.copyFileSync(path.join(library, 'ios', 'Shared.swift'), path.join(to, 'Shared.swift'));
  }
  fs.writeFileSync(path.join(targets, 'ActivityMonitorExtension', 'expo-target.config.js'), MONITOR_CONFIG);
  patchMonitor(path.join(targets, 'ActivityMonitorExtension', 'DeviceActivityMonitorExtension.swift'));
  // The app only ever shows notifications it makes on the phone itself. The
  // notifications package asks for Apple's push service by default, which would
  // need a capability the app does not use; take that back out.
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
};

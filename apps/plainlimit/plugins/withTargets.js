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
//   4. Teaches the covering screen's two extensions to note which app a lock
//      was last shown on, in the settings the app shares with its extensions.
//      After a Second thought sum the app reads the notes and opens that app
//      again (src/domain/appLinks.ts). Nothing of it leaves the phone.
//      - The extension that draws the screen is the one place iOS gives an
//        app's name. It notes the name, the bundle id and the app's code (the
//        opaque one Apple's picker hands over), replacing the note before, and
//        leaves the same note a second way: on a notification that is never
//        shown, which the app can read from the phone's waiting list.
//      - The extension behind the screen's buttons notes the code of the app
//        whose button was pressed. iOS can show a screen it drew earlier
//        without asking again, so the press is what says which app it is now.
//
//   5. Writes targets/report/Info.plist (the usage report extension). Its
//      version and build number come from Xcode's settings, which the build
//      script sets to the app's.
//   6. Removes the push-notification entitlement the notifications package adds.
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

function replaceTimes(source, find, replacement, what, times) {
  const parts = source.split(find);
  if (parts.length - 1 !== times) {
    throw new Error(
      `plugins/withTargets.js: expected "${what}" ${times === 1 ? 'exactly once' : `${times} times`} in the Screen Time library's extensions, found ${parts.length - 1}. ` +
        'The library has changed; update the patch.',
    );
  }
  return parts.join(replacement);
}

const replaceOnce = (source, find, replacement, what) => replaceTimes(source, find, replacement, what, 1);

function patchMonitor(file) {
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes('WidgetCenter.shared.reloadAllTimelines()')) return;
  source = replaceOnce(source, 'import os\n', 'import os\nimport WidgetKit\n', 'import os');
  for (const name of ['intervalDidStart', 'intervalDidEnd', 'eventDidReachThreshold']) {
    const call = `notifyAppWithName(name: "${name}")`;
    const asked = 'userDefaults?.set((Date().timeIntervalSince1970 * 1000).rounded(), forKey: "plainlimit_reload_asked")';
    // The minute checkpoints ("plmin") change nothing the widget draws, so they do not spend its redraws.
    // Nor do Second thought's timers (names starting "plask"): "Until I leave it" counts every minute of use,
    // and a day of opening apps that way would use up the redraws the battery needs.
    const redraw = `if activity.rawValue != "plmin" && !activity.rawValue.hasPrefix("plask") {\n      ${asked}\n      WidgetCenter.shared.reloadAllTimelines()\n      Thread.sleep(forTimeInterval: 0.5)\n    }`;
    source = replaceOnce(source, call, `${call}\n    ${redraw}`, call);
  }
  fs.writeFileSync(file, source);
}

// Swift added to both of the covering screen's extensions: an app's code as text, so the two
// notes can be matched. Each extension is built on its own, so each gets a copy.
const TOKEN_KEY = `
// Added by plugins/withTargets.js. Apple's opaque code for an app or a category, as text.
func plainlimitKey<T: Encodable>(_ token: T?) -> String {
  guard let token = token else { return "" }
  let encoder = JSONEncoder()
  encoder.outputFormatting = .sortedKeys
  guard let data = try? encoder.encode(token) else { return "" }
  return data.base64EncodedString()
}
`;

// Swift added to the extension that draws the covering screen. `userDefaults` is the library's
// own handle on the shared settings (Shared.swift, in the same target).
const NOTE_COVERED = `${TOKEN_KEY}
// Added by plugins/withTargets.js. Notes which app the covering screen was last drawn for,
// so that after a Second thought sum the app can open it again. A website notes no app.
// The note replaces the one before it and never leaves the phone.
func plainlimitText(_ placeholders: [String: String?], _ key: String) -> String {
  if let value = placeholders[key], let text = value {
    return text
  }
  return ""
}

// The codes of the app being drawn over, and of its category when it is covered through one.
// Kept here, and not passed with the words, so the library's own lists stay as they were.
var plainlimitDrawnKey = ""
var plainlimitDrawnCategory = ""

func plainlimitDrawn(_ application: ApplicationToken?, _ category: ActivityCategoryToken?) {
  plainlimitDrawnKey = plainlimitKey(application)
  plainlimitDrawnCategory = plainlimitKey(category)
}

func plainlimitNoteCovered(_ placeholders: [String: String?]) {
  let isApp = plainlimitText(placeholders, "tokenType").hasPrefix("application")
  let note: [String: Any] = [
    "name": isApp ? plainlimitText(placeholders, "applicationOrDomainDisplayName") : "",
    "bundle": isApp ? plainlimitText(placeholders, "plainlimitBundle") : "",
    "key": isApp ? plainlimitDrawnKey : "",
    "category": isApp ? plainlimitDrawnCategory : "",
    "at": (Date().timeIntervalSince1970 * 1000).rounded()
  ]
  userDefaults?.set(note, forKey: "plainlimit_covered")
  // The extension may be put to sleep as soon as the screen is drawn: write it out now.
  _ = userDefaults?.synchronize()

  // The same note a second way, in case the shared settings do not take it from here: on a
  // notification that never shows (it has no words, and is set for the year 2099). The app
  // reads it from the phone's list of waiting notifications. One name, replaced each time.
  let content = UNMutableNotificationContent()
  content.userInfo = ["plainlimitCovered": note]
  var never = DateComponents()
  never.year = 2099
  never.month = 1
  never.day = 1
  let request = UNNotificationRequest(
    identifier: "plainlimit-covered",
    content: content,
    trigger: UNCalendarNotificationTrigger(dateMatching: never, repeats: false)
  )
  // Waits a moment for the phone to take it, and no longer: the screen is waiting to be drawn.
  let taken = DispatchSemaphore(value: 0)
  UNUserNotificationCenter.current().add(request) { _ in
    taken.signal()
  }
  _ = taken.wait(timeout: .now() + 0.2)
}
`;

// Swift added to the extension behind the covering screen's buttons.
const NOTE_TAPPED = `${TOKEN_KEY}
// Added by plugins/withTargets.js. Notes which app's covering screen had a button pressed:
// its code, and its name where iOS gives one here (it usually does not). The app matches
// the code against the note the screen's own extension left. Replaced at every press.
func plainlimitNoteTapped(
  applicationToken: ApplicationToken?,
  webdomainToken: WebDomainToken?,
  categoryToken: ActivityCategoryToken?
) {
  var kind = "site"
  var key = plainlimitKey(webdomainToken)
  var name = ""
  var bundle = ""
  if let token = applicationToken {
    kind = "app"
    key = plainlimitKey(applicationToken)
    let application = Application(token: token)
    name = application.localizedDisplayName ?? ""
    bundle = application.bundleIdentifier ?? ""
  } else if categoryToken != nil {
    kind = "category"
    key = plainlimitKey(categoryToken)
  }
  let note: [String: Any] = [
    "kind": kind,
    "key": key,
    "name": name,
    "bundle": bundle,
    "at": (Date().timeIntervalSince1970 * 1000).rounded()
  ]
  userDefaults?.set(note, forKey: "plainlimit_tapped")
  _ = userDefaults?.synchronize()
}
`;

function patchShieldConfiguration(file) {
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes('plainlimitNoteCovered')) return;
  source = replaceOnce(source, 'import UIKit\n', 'import UIKit\nimport UserNotifications\n', 'import UIKit');
  // Both ways an app is covered (picked itself, or through its category) are told the app: pass its bundle id along.
  const named = '"applicationOrDomainDisplayName": application.localizedDisplayName,';
  source = replaceTimes(source, named, `${named}\n      "plainlimitBundle": application.bundleIdentifier,`, named, 2);
  // And keep its code, with its category's when it is covered through one (the button press then only names the category).
  const itself = '    // Customize the shield as needed for applications.\n';
  source = replaceOnce(source, itself, `${itself}    plainlimitDrawn(application.token, nil)\n`, 'configuration(shielding application)');
  const inCategory = '    logger.log("shielding application category")\n';
  source = replaceOnce(source, inCategory, `${inCategory}    plainlimitDrawn(application.token, category.token)\n`, 'configuration(shielding application, in category)');
  // Every covering screen is built here, with what it is drawn over.
  const build = 'func buildShield(placeholders: [String: String?], config: [String: Any]?)\n  -> ShieldConfiguration {\n';
  source = replaceOnce(source, build, `${build}\n  plainlimitNoteCovered(placeholders)\n`, 'func buildShield');
  fs.writeFileSync(file, source + NOTE_COVERED);
}

function patchShieldAction(file) {
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes('plainlimitNoteTapped')) return;
  // Every button press on a covering screen comes through here, with the code of what it covers.
  const handle = '  categoryToken: ActivityCategoryToken?\n) {\n  CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)\n';
  const note = '  plainlimitNoteTapped(\n    applicationToken: applicationToken, webdomainToken: webdomainToken, categoryToken: categoryToken)\n';
  source = replaceOnce(source, handle, `${handle}${note}`, 'func handleAction');
  fs.writeFileSync(file, source + NOTE_TAPPED);
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
  const stamp = `react-native-device-activity ${version}, patch 9\n`;
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
    if (name === 'ShieldConfiguration') patchShieldConfiguration(path.join(to, 'ShieldConfigurationExtension.swift'));
    if (name === 'ShieldAction') patchShieldAction(path.join(to, 'ShieldActionExtension.swift'));
    fs.writeFileSync(marker, stamp);
  }
  // The report extension's Info.plist: which kind of extension it is. Its
  // version and build number are left to Xcode's own settings, which the build
  // script gives on the command line. (The number used to be written here, but
  // the target is created with a build number of 1 and that is what reached
  // Apple, who wrote to say it did not match the app's.)
  const reportDir = path.join(targets, 'report');
  if (fs.existsSync(reportDir)) {
    // The day's total is drawn in the app's display face, so the extension
    // carries its own copy of the font (every file in the folder is bundled).
    const font = require.resolve('@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf', { paths: [projectRoot] });
    fs.copyFileSync(font, path.join(reportDir, 'SpaceGrotesk_700Bold.ttf'));
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

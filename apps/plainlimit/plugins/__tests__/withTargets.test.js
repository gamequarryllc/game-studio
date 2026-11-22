/* global __dirname, describe, beforeAll, afterAll, it, expect */
// The Swift that plugins/withTargets.js adds to the Screen Time library's
// extensions is never compiled here, only on the build machine. This checks
// that the patch still finds its places in the library's files and writes what
// the app expects to read, so a library update that moves them fails here
// first and not in a build.

const fs = require('fs');
const os = require('os');
const path = require('path');

const app = path.resolve(__dirname, '../..');

function prepare() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plainlimit-targets-'));
  fs.symlinkSync(path.join(app, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  const withTargets = require('../withTargets.js');
  withTargets({ name: 'x', slug: 'x', _internal: { projectRoot: root } });
  return root;
}

const count = (text, part) => text.split(part).length - 1;

describe('the target plugin', () => {
  let root = '';
  beforeAll(() => {
    root = prepare();
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const appFile = (file) => fs.readFileSync(path.join(app, file), 'utf8');

  it("has the covering screen's extension note the app it is drawn for", () => {
    const swift = read('targets/ShieldConfiguration/ShieldConfigurationExtension.swift');
    // Every covering screen is built in one place, and the note is taken there.
    expect(count(swift, '\n  plainlimitNoteCovered(placeholders)\n')).toBe(1);
    // Both ways an app is covered pass its bundle id along; websites have none.
    expect(count(swift, '"plainlimitBundle": application.bundleIdentifier,')).toBe(2);
    // And both keep the app's code, the second with its category's.
    expect(count(swift, '\n    plainlimitDrawn(application.token, nil)\n')).toBe(1);
    expect(count(swift, '\n    plainlimitDrawn(application.token, category.token)\n')).toBe(1);
    expect(count(swift, 'func plainlimitNoteCovered(')).toBe(1);
    expect(count(swift, 'func plainlimitKey<T: Encodable>(')).toBe(1);
    // Under the name the app reads.
    expect(swift).toContain('userDefaults?.set(note, forKey: "plainlimit_covered")');
    expect(appFile('src/platform/saved.ts')).toContain("coveredApp: 'plainlimit_covered'");
    // The library's own handle on the shared settings is in the same target.
    expect(read('targets/ShieldConfiguration/Shared.swift')).toMatch(/^var userDefaults = UserDefaults\(suiteName: appGroup\)$/m);
  });

  it('has it leave the same note on a notification that is never shown, under the names the app reads', () => {
    const swift = read('targets/ShieldConfiguration/ShieldConfigurationExtension.swift');
    expect(count(swift, '\nimport UserNotifications\n')).toBe(1);
    expect(swift).toContain('identifier: "plainlimit-covered",');
    expect(appFile('src/platform/backToApp.ts')).toContain("const WAITING_NOTE = 'plainlimit-covered';");
    expect(swift).toContain('content.userInfo = ["plainlimitCovered": note]');
    expect(appFile('src/platform/backToApp.ts')).toContain('.plainlimitCovered)');
    // No words on it, and set for a year that does not come.
    expect(swift).not.toMatch(/content\.(title|body|subtitle|sound)/);
    expect(swift).toContain('never.year = 2099');
  });

  it("has the buttons' extension note which screen was pressed, before anything else is done with the press", () => {
    const swift = read('targets/ShieldAction/ShieldActionExtension.swift');
    const press = '  CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)\n  plainlimitNoteTapped(\n    applicationToken: applicationToken, webdomainToken: webdomainToken, categoryToken: categoryToken)\n';
    expect(count(swift, press)).toBe(1);
    // In the one place every press comes through.
    expect(swift.indexOf(press)).toBeGreaterThan(swift.indexOf('func handleAction('));
    expect(swift.indexOf(press)).toBeLessThan(swift.indexOf('class ShieldActionExtension'));
    expect(count(swift, 'func plainlimitNoteTapped(')).toBe(1);
    expect(count(swift, 'func plainlimitKey<T: Encodable>(')).toBe(1);
    expect(swift).toContain('userDefaults?.set(note, forKey: "plainlimit_tapped")');
    expect(appFile('src/platform/saved.ts')).toContain("tappedApp: 'plainlimit_tapped'");
    expect(read('targets/ShieldAction/Shared.swift')).toMatch(/^var userDefaults = UserDefaults\(suiteName: appGroup\)$/m);
  });

  it('still teaches the monitor extension to redraw the widget, but not for the minute checkpoints or Second thought', () => {
    const swift = fs.readFileSync(path.join(root, 'targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift'), 'utf8');
    expect(count(swift, 'if activity.rawValue != "plmin" && !activity.rawValue.hasPrefix("plask") {')).toBe(3);
    expect(count(swift, 'WidgetCenter.shared.reloadAllTimelines()')).toBe(3);
  });

  it('leaves prepared targets alone the second time', () => {
    const files = ['targets/ShieldConfiguration/ShieldConfigurationExtension.swift', 'targets/ShieldAction/ShieldActionExtension.swift'];
    const before = files.map(read);
    require('../withTargets.js')({ name: 'x', slug: 'x', _internal: { projectRoot: root } });
    expect(files.map(read)).toEqual(before);
  });
});

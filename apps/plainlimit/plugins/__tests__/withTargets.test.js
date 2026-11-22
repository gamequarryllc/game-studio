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

  it("has the covering screen's extension note the app it is drawn for", () => {
    const swift = fs.readFileSync(path.join(root, 'targets/ShieldConfiguration/ShieldConfigurationExtension.swift'), 'utf8');
    // Every covering screen is built in one place, and the note is taken there.
    expect(count(swift, '\n  plainlimitNoteCovered(placeholders)\n')).toBe(1);
    // Both ways an app is covered pass its bundle id along; websites have none.
    expect(count(swift, '"plainlimitBundle": application.bundleIdentifier,')).toBe(2);
    expect(count(swift, 'func plainlimitNoteCovered(')).toBe(1);
    // Under the name the app reads.
    expect(swift).toContain('userDefaults?.set(note, forKey: "plainlimit_covered")');
    expect(fs.readFileSync(path.join(app, 'src/platform/saved.ts'), 'utf8')).toContain("coveredApp: 'plainlimit_covered'");
    // The library's own handle on the shared settings is in the same target.
    expect(fs.readFileSync(path.join(root, 'targets/ShieldConfiguration/Shared.swift'), 'utf8')).toMatch(/^var userDefaults = UserDefaults\(suiteName: appGroup\)$/m);
  });

  it('still teaches the monitor extension to redraw the widget, but not for the minute checkpoints or Second thought', () => {
    const swift = fs.readFileSync(path.join(root, 'targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift'), 'utf8');
    expect(count(swift, 'if activity.rawValue != "plmin" && !activity.rawValue.hasPrefix("plask") {')).toBe(3);
    expect(count(swift, 'WidgetCenter.shared.reloadAllTimelines()')).toBe(3);
  });

  it('leaves prepared targets alone the second time', () => {
    const file = path.join(root, 'targets/ShieldConfiguration/ShieldConfigurationExtension.swift');
    const before = fs.readFileSync(file, 'utf8');
    require('../withTargets.js')({ name: 'x', slug: 'x', _internal: { projectRoot: root } });
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });
});

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

  it("leaves the covering screen's two extensions as the library ships them", () => {
    // iOS keeps what the drawing extension knows inside it, so nothing is added there (NOTES.md, "Straight back to the app").
    const library = path.join(app, 'node_modules/react-native-device-activity/targets');
    for (const file of ['ShieldConfiguration/ShieldConfigurationExtension.swift', 'ShieldAction/ShieldActionExtension.swift']) {
      expect(read(`targets/${file}`)).toBe(fs.readFileSync(path.join(library, file), 'utf8'));
    }
  });

  it("still teaches the monitor extension to redraw the widget, but not for the minute checkpoints, Second thought or the essentials' timer", () => {
    const swift = fs.readFileSync(path.join(root, 'targets/ActivityMonitorExtension/DeviceActivityMonitorExtension.swift'), 'utf8');
    expect(count(swift, 'if plainlimitRedraws(activity: activity.rawValue) {')).toBe(3);
    expect(count(swift, 'WidgetCenter.shared.reloadAllTimelines()')).toBe(3);
    // The rule itself is in the library patch, which every extension is built with.
    const shared = fs.readFileSync(path.join(root, 'targets/ActivityMonitorExtension/Shared.swift'), 'utf8');
    expect(shared).toContain('func plainlimitRedraws(activity: String) -> Bool');
    expect(shared).toContain('if activity == "plmin" || activity == "plkept" || activity.hasPrefix("plask") { return false }');
  });

  it('leaves prepared targets alone the second time', () => {
    const files = ['targets/ShieldConfiguration/ShieldConfigurationExtension.swift', 'targets/ShieldAction/ShieldActionExtension.swift'];
    const before = files.map(read);
    require('../withTargets.js')({ name: 'x', slug: 'x', _internal: { projectRoot: root } });
    expect(files.map(read)).toEqual(before);
  });
});

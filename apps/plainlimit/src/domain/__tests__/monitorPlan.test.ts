import { wordFor } from '../battery';
import { checkpointsFor, GUARD_KEY, GUARD_MS, guardFor, PACE_SLACK_MINUTES } from '../checkpoints';
import {
  ACTIVITY,
  COUNTED_ID,
  KEPT_ACTIVITY,
  OVER_ACTIVITY,
  SHORTEST_WATCH_MINUTES,
  TICKS_ACTIVITY,
  TOPUP_ACTIVITY,
  WIDGET_PLAN_KEY,
  clockOf,
  countStart,
  includesEarlierUse,
  monitorPlan,
  puzzleNotice,
  rgbOf,
  spanOf,
  topUpWindow, earliestTrue, lockNotBefore } from '../monitorPlan';
import { DEFAULT_SETTINGS } from '../settings';
import { KEPT_MINUTES, SETTLE_MS } from '../tally';
import { glowForCells } from '../tone';
import type { Settings } from '../types';

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, allowed: [...DEFAULT_SETTINGS.allowed], ...over });
const minutesOf = (s: { hour: number; minute: number; second: number }) => s.hour * 60 + s.minute + s.second / 60;

describe('the plan handed to the phone', () => {
  test('the day runs from the recharge time to a minute before the next', () => {
    const plan = monitorPlan(settings({ rechargeMinute: 360 }));
    expect(plan.start).toEqual({ hour: 6, minute: 0 });
    expect(plan.end).toEqual({ hour: 5, minute: 59 });
    expect(monitorPlan(settings({ rechargeMinute: 0 })).end).toEqual({ hour: 23, minute: 59 });
    expect(clockOf(23 * 60 + 30)).toEqual({ hour: 23, minute: 30 });
  });

  test('one event per checkpoint, at the same minutes, in order', () => {
    for (const goal of [30, 45, 180, 195, 720]) {
      const plan = monitorPlan(settings({ goalMinutes: goal }));
      const checkpoints = checkpointsFor(goal);
      expect(plan.events.map((e) => e.name)).toEqual(checkpoints.map((c) => c.id));
      plan.events.forEach((event, i) => expect(minutesOf(event.after)).toBeCloseTo(checkpoints[i].minutes, 1));
      const times = plan.events.map((e) => minutesOf(e.after));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  test('spans carry hours, minutes and seconds, and are never zero', () => {
    expect(spanOf(180)).toEqual({ hour: 3, minute: 0, second: 0 });
    expect(spanOf(32.5)).toEqual({ hour: 0, minute: 32, second: 30 });
    expect(spanOf(0)).toEqual({ hour: 0, minute: 0, second: 1 });
  });

  test('names are safe for the library, which splits its records on "_"', () => {
    const plan = monitorPlan(settings());
    for (const name of [ACTIVITY, TOPUP_ACTIVITY, COUNTED_ID, ...plan.events.map((e) => e.name)]) expect(name).not.toContain('_');
  });

  test('the last cell brings the warning screen, the end brings the empty one, nothing else covers', () => {
    const plan = monitorPlan(settings());
    const covers = plan.events.flatMap((e) => e.actions.filter((a) => a.kind === 'cover').map((a) => [e.name, a.kind === 'cover' ? a.shield : '']));
    expect(covers).toEqual([
      ['cell-5', 'warning'],
      ['empty', 'empty'],
    ]);
    const notices = plan.events.filter((e) => e.actions.some((a) => a.kind === 'notify')).map((e) => e.name);
    expect(notices).toEqual(['final-warning']);
    // A 30-minute day: the last warning would land on the last cell, so it is left out.
    const short = monitorPlan(settings({ goalMinutes: 30 }));
    expect(short.events.filter((e) => e.actions.some((a) => a.kind === 'notify'))).toEqual([]);
    expect(short.events.find((e) => e.name === 'cell-5')?.actions).toEqual([{ kind: 'cover', shield: 'warning' }]);
  });

  test('the warning screen lets you carry on; the empty one depends on the level', () => {
    const warning = monitorPlan(settings()).shields.find((s) => s.id === 'warning');
    expect(warning?.primary).toBe('uncover');
    expect(warning?.secondary).toBe('close');
    const emptyAt = (emptyLevel: Settings['emptyLevel']) => monitorPlan(settings({ emptyLevel })).shields.find((s) => s.id === 'empty');
    expect(emptyAt('warn')?.secondary).toBe('uncover');
    expect(emptyAt('work')?.secondary).toBe('puzzle');
    expect(emptyAt('locked')?.secondary).toBeNull();
    expect(emptyAt('locked')?.copy.secondary).toBeNull();
    for (const level of ['warn', 'work', 'locked'] as const) expect(emptyAt(level)?.primary).toBe('close');
  });

  test('the empty screen and the notification quote the next top-up, not the first', () => {
    const second = monitorPlan(settings({ emptyLevel: 'work' }), 1).shields.find((s) => s.id === 'empty');
    expect(second?.copy.line).toContain('5 sums');
    expect(second?.copy.line).toContain('10 more minutes');
    expect(puzzleNotice(1).body).toContain('5 sums');
    expect(puzzleNotice(0).route).toBe('/puzzle');
  });

  test('the day counting is turned on starts from that moment; later days start at the recharge', () => {
    const recharge = new Date(2026, 10, 11, 6, 0);
    const turnedOn = new Date(2026, 10, 11, 16, 30).getTime();
    // Turned on this afternoon: do not ask for the morning's use, and nothing can arrive before 16:30.
    expect(includesEarlierUse(recharge, turnedOn)).toBe(false);
    expect(countStart(recharge, turnedOn).getTime()).toBe(turnedOn);
    // The next morning's recharge: counting was already on, so the whole day counts.
    const next = new Date(2026, 10, 12, 6, 0);
    expect(includesEarlierUse(next, turnedOn)).toBe(true);
    expect(countStart(next, turnedOn).getTime()).toBe(next.getTime());
    // Never recorded: behave as if it had always been on.
    expect(includesEarlierUse(recharge, null)).toBe(true);
    expect(countStart(recharge, null).getTime()).toBe(recharge.getTime());
    expect(monitorPlan(settings(), 0, turnedOn).widget.countFrom).toBe(turnedOn);
    expect(monitorPlan(settings()).widget.countFrom).toBe(0);
  });

  test('earned time ends at a minute on the clock, and the phone is given a stretch it will accept', () => {
    const minutesBetween = (w: ReturnType<typeof topUpWindow>) => (((w.end.hour * 60 + w.end.minute - (w.start.hour * 60 + w.start.minute)) % 1440) + 1440) % 1440;
    const until = new Date(2026, 10, 11, 22, 3, 20);
    const window = topUpWindow(until);
    expect(window.end).toEqual({ hour: 22, minute: 3 });
    expect(minutesBetween(window)).toBeGreaterThan(SHORTEST_WATCH_MINUTES);
    // Just after midnight the stretch starts the evening before.
    const late = topUpWindow(new Date(2026, 10, 12, 0, 5, 0));
    expect(late.end).toEqual({ hour: 0, minute: 5 });
    expect(late.start).toEqual({ hour: 23, minute: 49 });
    expect(minutesBetween(late)).toBeGreaterThan(SHORTEST_WATCH_MINUTES);
  });

  test('the words on a covering screen are light, because the phone darkens whatever is behind them', () => {
    for (const shield of monitorPlan(settings()).shields) {
      expect(shield.text).toEqual({ red: 244, green: 245, blue: 242 });
      // The phone pales the main button's label, so it is the light ink on a fill deep enough to read it on (4.5 to 1).
      expect(shield.buttonText).toEqual(shield.text);
      const light = (c: { red: number; green: number; blue: number }) => {
        const part = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
        return 0.2126 * part(c.red) + 0.7152 * part(c.green) + 0.0722 * part(c.blue);
      };
      expect((light(shield.buttonText) + 0.05) / (light(shield.button) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('carries the minute checkpoints apart from the day\'s own, with nothing to do', () => {
    const plan = monitorPlan(settings({ goalMinutes: 180 }));
    expect(plan.ticks.length).toBe(11);
    expect(plan.ticks.every((t) => t.actions.length === 0)).toBe(true);
    const own = new Set(plan.events.map((e) => e.name));
    expect(plan.ticks.some((t) => own.has(t.name))).toBe(false);
  });

  test('a checkpoint may not act before it can be true', () => {
    const from = new Date(2026, 10, 13, 6, 0, 0);
    // Thirty minutes of use cannot be reported sooner than about thirty minutes in.
    expect(earliestTrue(from, 30).getTime() - from.getTime()).toBe(28 * 60000);
    // A checkpoint in the first couple of minutes is never held back to before the count began.
    expect(earliestTrue(from, 1).getTime()).toBe(from.getTime());
    // What the phone reports the moment a day is registered falls before every checkpoint's time.
    const registered = new Date(from.getTime() + 5000);
    for (const event of monitorPlan(settings({ goalMinutes: 30 })).events) {
      expect(registered.getTime()).toBeLessThan(earliestTrue(from, event.minutes).getTime());
    }
  });

  test('the guard holds a lock back only in the minutes after registering', () => {
    // Build 72, 16 November: counted from 6 AM; at 6:47:57 PM the app noted "at most 50".
    const dayStart = new Date(2026, 10, 16, 6, 0, 0);
    const clock = (h: number, m = 0, sec = 0) => new Date(2026, 10, 16, h, m, sec).getTime();
    const registered = clock(19, 0);
    const known = guardFor({ at: clock(18, 47, 57), most: 50 }, registered, dayStart);
    if (!known) throw new Error('no guard');
    // With nothing known, as soon as it can be true from the day's start.
    expect(lockNotBefore(dayStart, null, 180)).toEqual(earliestTrue(dayStart, 180));
    // A false report right after registering cannot lock...
    expect(lockNotBefore(dayStart, known, 180).getTime()).toBeGreaterThan(registered + 60_000);
    // ...but the hold ends with the guard, so the real one later still locks (build 72 held it until after 9 PM).
    expect(lockNotBefore(dayStart, known, 180).getTime()).toBe(known.closes);
    // Never sooner than it could be true from the day's start.
    const early = new Date(2026, 10, 16, 6, 30);
    expect(lockNotBefore(early, guardFor({ at: clock(6, 40), most: 30 }, registered, early), 180)).toEqual(earliestTrue(early, 180));
  });

  test('colours are whole numbers from 0 to 255', () => {
    expect(rgbOf('#FF8000')).toEqual({ red: 255, green: 128, blue: 0 });
    for (const shield of monitorPlan(settings()).shields) {
      for (const v of [shield.background, shield.text, shield.accent, shield.button, shield.buttonText].flatMap((colour) => Object.values(colour))) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });
});

// The project has no Node type definitions; these two are all the test needs.
declare const require: (name: string) => { readFileSync(file: string, encoding: string): string; join(...parts: string[]): string };
declare const __dirname: string;

describe('the home screen widget agrees with the app', () => {
  const swift = require('fs').readFileSync(require('path').join(__dirname, '../../../targets/widget/PlainlimitWidget.swift'), 'utf8');

  test('the same colour for each number of cells', () => {
    const line = swift.match(/let toneGlows: \[UInt32\] = \[([^\]]+)\]/);
    expect(line).not.toBeNull();
    const inSwift = (line as RegExpMatchArray)[1].split(',').map((v) => '#' + v.trim().replace('0x', '').toUpperCase());
    expect(inSwift).toEqual([0, 1, 2, 3, 4, 5, 6].map((cells) => glowForCells(cells).toUpperCase()));
  });

  test('the same words', () => {
    for (const cells of [0, 1, 2, 3, 4, 6]) expect(swift).toContain(`"${wordFor(cells)}"`);
  });

  test('the same names for the shared settings and the checkpoints', () => {
    expect(swift).toContain(`let activityName = "${ACTIVITY}"`);
    expect(swift).toContain(`"${WIDGET_PLAN_KEY}"`);
    expect(swift).toContain('reached("empty"');
    expect(swift).toContain('reached("cell-\\(emptied)"');
    expect(Object.keys(monitorPlan(settings()).widget).sort()).toEqual(['countFrom', 'goalMinutes', 'rechargeMinute']);
    expect(swift).toContain('plan["countFrom"]');
    // The pace rule (checkpoints.ts, keepsPace) with the same numbers as the app.
    expect(swift).toContain(`let paceSlackMinutes = ${PACE_SLACK_MINUTES.toFixed(1)}`);
    expect(swift).toContain(`let guardMs = ${GUARD_MS.toLocaleString('en-US').replace(/,/g, '_')}.0`);
    expect(swift).toContain('plan["marks"]');
    // ...leaving out the reports of a day's re-reporting from its first registration on (checkpoints.ts, reReportsStart).
    expect(swift).toContain('plan["reReportsFrom"]');
    expect(swift).toContain('mark.at >= reReportsFrom && mark.at <= registeredAt + guardMs');
    expect(swift).toContain('keepsPace(at, minutes)');
    // The monitor extension's side of it, in the library patch, reads what screenTime.ts writes with each action.
    const patch = require('fs').readFileSync(require('path').join(__dirname, '../../../patches/react-native-device-activity+0.6.1.patch'), 'utf8');
    for (const part of ['action["pace"]', '"onlyIfTooSoon"', 'pace["skipFrom"]', 'pace["skipTo"]', 'pace["after"]', 'rule["key"]', 'rule["ms"]']) expect(patch).toContain(part);
    expect(swift).toContain('plan["goalMinutes"]');
    expect(swift).toContain('plan["rechargeMinute"]');
    // The guard the app saves at each registration, with the same key and fields.
    expect(swift).toContain(`"${GUARD_KEY}"`);
    for (const field of ['from', 'opens', 'closes']) expect(swift).toContain(`guardRecord?["${field}"]`);
    // The widget no longer works the guard out itself.
    expect(swift).not.toContain('plainlimit_known');
    // Checkpoints are read under the current round's names, as in the app.
    expect(swift).toContain('plan["round"]');
    expect(swift).toContain('plan["roundBefore"]');
    expect(swift).toContain('"\\(name)~\\(inRound)"');
  });

  test('the same rule for everything less the essentials (tally.ts), in the widget and in the monitor extension', () => {
    const ms = (n: number) => `${n.toLocaleString('en-US').replace(/,/g, '_')}.0`;
    // The widget: the essentials' reports are the plan's marks with `kept`, weighed as the app weighs them.
    expect(swift).toContain(`let settleMs = ${ms(SETTLE_MS)}`);
    expect(swift).toContain('mark["kept"]');
    expect(swift).toContain('registeredAt + settleMs');
    expect(swift).toContain('used = max(used, mark.minutes - ceiling)');
    expect(swift).toContain('cells = max(0, cellCount - Int((used * Double(cellCount) / goal).rounded(.down)))');
    // The monitor extension, in the library patch: what screenTime.ts writes with each action, and the one record beside them.
    const patch = require('fs').readFileSync(require('path').join(__dirname, '../../../patches/react-native-device-activity+0.6.1.patch'), 'utf8');
    for (const part of ['action["tally"]', 'tally["room"]', 'tally["mark"]', 'tally["unless"]', 'tally["minutes"]']) expect(patch).toContain(part);
    for (const field of ['round', 'rechargeMinute', 'countFrom', 'registeredAt', 'reReportsFrom', 'kept', 'everything']) expect(patch).toContain(`record["${field}"]`);
    for (const part of ['entry["key"]', 'entry["minutes"]', `let plainlimitSettleMs = ${ms(SETTLE_MS)}`, `let plainlimitPaceSlackMinutes = ${PACE_SLACK_MINUTES.toFixed(1)}`, `let plainlimitGuardMs = ${ms(GUARD_MS)}`, `"${GUARD_KEY}"`]) expect(patch).toContain(part);
    // The names the two sides share, as the app's own files have them.
    const read = (file: string) => require('fs').readFileSync(require('path').join(__dirname, '../..', file), 'utf8');
    expect(read('platform/saved.ts')).toContain("tally: 'plainlimit_tally'");
    expect(patch).toContain('"plainlimit_tally"');
    expect(read('platform/screenTime.ts')).toContain("const DONE_PREFIX = 'plainlimit_done_';");
    expect(patch).toContain('"plainlimit_done_\\(name)~\\(inRound)"');
    expect(patch).toContain('"plainlimit_done_\\(mark)~\\(inRound)"');
    // Which reports redraw the widget: not the essentials' own, nor the minute ones.
    expect(patch).toContain(`if activity == "${TICKS_ACTIVITY}" || activity == "${KEPT_ACTIVITY}" || activity.hasPrefix("plask") { return false }`);
    expect(patch).toContain(`if activity == "${OVER_ACTIVITY}" {`);
  });

  it('"what used it" leaves the essentials out: the report reads them where the app saves them', () => {
    const at = (file: string) => require('fs').readFileSync(require('path').join(__dirname, '../../..', file), 'utf8');
    const report = at('targets/report/PlainlimitReport.swift');
    // The essentials in force, under the library's own key, in the App Group the report is now let into.
    expect(at('src/platform/screenTime.ts')).toContain("export const ESSENTIALS_ID = 'plkeep';");
    expect(report).toContain('shared.dictionary(forKey: "familyActivitySelectionIds")');
    expect(report).toContain('saved["plkeep"] as? String');
    const group = '"appGroup": "group.com.gamequarry.plainlimit"';
    expect(at('app.json')).toContain(group);
    expect(report).toContain('private let appGroup = "group.com.gamequarry.plainlimit"');
    expect(at('targets/report/expo-target.config.js')).toContain("'com.apple.security.application-groups': ['group.com.gamequarry.plainlimit']");
    // The list the app asks for with essentials chosen, and the one without.
    expect(report).toContain('static let batteryApps = Self("BatteryApps")');
    expect(report).toContain('TopAppsReport(context: .batteryApps, lessEssentials: true)');
    expect(report).toContain('TopAppsReport(context: .topApps, lessEssentials: false)');
    const screen = at('src/ui/UsageReport.tsx');
    expect(screen).toContain("context={window.exact ? 'TopApps' : 'BatteryApps'}");
    // A change of essentials draws the list again.
    expect(at('modules/plainlimit-widgets/ios/PlainlimitWidgetsModule.swift')).toContain('Prop("minus")');
    expect(screen).toContain("context={window.exact ? 'TopApps' : 'BatteryApps'} minus={window.exact ? null : essentialsPicks()}");
  });

  it("Today's figure leaves the essentials out too, and draws nothing sooner than take them in", () => {
    const at = (file: string) => require('fs').readFileSync(require('path').join(__dirname, '../../..', file), 'utf8');
    const report = at('targets/report/PlainlimitReport.swift');
    // The figure the app asks for with essentials chosen, and the one without.
    expect(report).toContain('static let batteryTotal = Self("BatteryTotal")');
    expect(report).toContain('TotalReport(context: .batteryTotal, lessEssentials: true)');
    expect(report).toContain('TotalReport(context: .total, lessEssentials: false)');
    const screen = at('src/ui/UsageReport.tsx');
    expect(screen).toContain("context={window.exact ? 'Total' : 'BatteryTotal'} minus={window.exact ? null : essentialsPicks()}");
    // Essentials chosen but not readable: no figure, so the app's own, under the picture, stands.
    expect(report).toContain('if lessEssentials && kept.empty { return nil }');
    expect(report).toMatch(/if let seconds \{[\s\S]*?\} else \{\s*Color\.clear\s*\}/);
    // The same apps are skipped in the list, the figure and setup's picture.
    expect(report.match(/if kept\.keeps\(category\.category\.token\) \{ continue \}/g)).toHaveLength(3);
    expect(report.match(/if kept\.keeps\(app\.application\.token\) \{ continue \}/g)).toHaveLength(3);
    // Setup's picture is drawn again when the essentials change.
    expect(screen).toContain('context={`Setup${hours}`} minus={essentialsPicks()}');
  });

  it('setup offers the essentials before the goal, on one screen that can be skipped (the owner on build 169: the goal was picked against all of the phone\'s time)', () => {
    const at = (file: string) => require('fs').readFileSync(require('path').join(__dirname, '../../..', file), 'utf8');
    const setup = at('src/app/setup.tsx');
    // The story's three screens first (what it is, what is not counted, when it comes back), then what setup asks:
    // the essentials after access (Apple's list needs it) and before the goal, whose figures leave them out.
    expect(setup).toContain("const STEPS: Step[] = SCREEN_TIME_AVAILABLE ? ['welcome', 'free', 'morning', 'access', 'essentials', 'notify', 'goal', 'ready'] : ['welcome', 'free', 'morning', 'essentials', 'notify', 'goal', 'ready'];");
    // One list, opened from the screen's own button; chosen, setup moves on by itself; and it can be skipped.
    for (const words of ['const essentials = useEssentials(next);', '<EssentialsSteps e={essentials} mainInFoot />', '<Lead>They never count and never lock.</Lead>', "label: 'Choose essential apps'", "label: 'Skip for now', onPress: next", '{essentials.pickers}']) expect(setup).toContain(words);
    expect(setup.indexOf("if (step === 'essentials')")).toBeLessThan(setup.indexOf("if (step === 'goal')"));
    // The file that held which draft a test build was on is gone.
    expect(() => at('src/state/setupKind.ts')).toThrow();
  });

  it('setup says what its numbers are (the owner\'s friend, build 167: "how much what? what is this for?")', () => {
    const at = (file: string) => require('fs').readFileSync(require('path').join(__dirname, '../../..', file), 'utf8');
    const setup = at('src/app/setup.tsx');
    const story = at('src/ui/Story.tsx');
    // The story: one thing a screen, in the order the owner agreed, with the owner's own line for the essentials.
    for (const title of ['Your screen time is a battery', 'Your essential apps don&apos;t count', 'Full again every morning']) expect(setup).toContain(title);
    // "Essentials" alone is our word, which a new person has not met (the owner, build 169): the screen says whose apps they are and who picks them.
    expect(setup).not.toContain('<Heading>Essentials are free</Heading>');
    for (const words of ['>Apps you pick<', '>Everything else<', 'You pick them in a moment.']) expect(story).toContain(words);
    // And "free" did not tell the owner that the time is not counted (the app says "free" for what is not Pro,
    // too): the two boxes say NOT COUNTED and COUNTED, and no screen of setup or card on Today says "free".
    for (const words of ['>NOT COUNTED<', '>COUNTED<']) expect(story).toContain(words);
    expect(story).not.toContain('>FREE<');
    expect(setup).not.toContain('are free</Heading>');
    expect(at('src/ui/EssentialsOffer.tsx')).not.toMatch(/^\s*Keep your essentials free$/m);
    expect(at('src/ui/EssentialsOffer.tsx')).toContain('Pick your essential apps');
    expect(at('src/app/(tabs)/settings.tsx')).not.toContain("'always free'");
    expect(story).toContain('Use your phone. Don\u2019t abuse it.');
    // The goal screen: a title that says what the number is, and what happens at it, as three small pictures.
    expect(setup).toContain('<Heading>Daily screen time</Heading>');
    expect(setup).not.toContain('<Heading>How much a day?</Heading>');
    expect(setup).not.toContain("'Moves the line'");
    for (const words of ['`${goal} of use`', '"Apps lock"', '`Back at ${recharge}`']) expect(story).toContain(words);
    // The phone's figures under it are named for what they are (the owner on build 169, of a 5:24 average: "is this
    // my Plainlimit daily average?"): all of the phone's time, of which the essentials will not count.
    for (const words of ["'All your phone time'", "'Every app. Your essential apps won\\u2019t count.'", "'Without your essential apps'"]) expect(setup).toContain(words);
    expect(setup.indexOf('{figuresName}')).toBeLessThan(setup.indexOf('<SetupFigures '));
    expect(setup).not.toContain("'Every app counts.'");
    // The last screen: each figure named for who counts it (the owner on build 168: what the iPhone tracks against
    // what we count), how much of the goal is used, and the essentials in the iPhone's box but outside ours.
    for (const words of ['>iPhone tracks<', '>Plainlimit counts<', 'left today', '<FreeRow />', 'You can pick your essential apps next.']) expect(setup).toContain(words);
    expect(setup.indexOf('<FreeRow />')).toBeGreaterThan(setup.indexOf('>Plainlimit counts<'));
    for (const words of ['Your essential apps', 'Never counted']) expect(story).toContain(words);
    // Nothing there may say the figure has the essentials taken out: none are chosen yet on a new phone.
    expect(setup).not.toContain('without essentials');
    // On the chart, nothing is written where a bar's time can stand: the key to the shading is over it, and the
    // goal to try is a tag with a short pointer (the report extension), not a line across the bars.
    const report = at('src/ui/UsageReport.tsx');
    expect(report).not.toContain('zoneText');
    expect(report).toContain('Would lock');
    const swift = at('targets/report/PlainlimitReport.swift');
    expect(swift).toContain('line.move(to: CGPoint(x: end - 2, y: at))');
    expect(swift).not.toContain('line.move(to: CGPoint(x: weekAxis, y: at))\n            line.addLine(to: CGPoint(x: end, y: at))\n          }\n          .stroke(green, lineWidth: 2)');
  });

  it('setup cannot be run again from Settings (the owner, after build 168: it left the app half set up; a fresh install is the test)', () => {
    const at = (file: string) => require('fs').readFileSync(require('path').join(__dirname, '../../..', file), 'utf8');
    expect(at('src/app/(tabs)/settings.tsx')).not.toContain('Run setup again');
    expect(at('src/state/store.ts')).not.toContain('setupAgain');
  });
});

describe('the plan with essentials: everything, less their minutes (tally.ts)', () => {
  const goal = 120;

  test('without essentials there are no rungs and no action waits on anything', () => {
    const plan = monitorPlan(settings({ goalMinutes: goal }));
    expect(plan.kept).toEqual([]);
    expect(plan.over).toEqual([]);
    for (const event of plan.events) for (const action of event.actions) expect(action.tally).toBeUndefined();
    expect(plan.events.find((e) => e.name === 'empty')?.actions).toEqual([{ kind: 'cover', shield: 'empty' }]);
  });

  test('with essentials, their own rungs are registered and carry no actions', () => {
    const plan = monitorPlan(settings({ goalMinutes: goal }), 0, null, true);
    expect(plan.kept.map((k) => k.minutes)).toEqual([...KEPT_MINUTES]);
    expect(plan.kept.every((k) => k.actions.length === 0)).toBe(true);
    expect(plan.kept[0]).toMatchObject({ name: 'k1', after: { hour: 0, minute: 1, second: 0 } });
    // The same day, the same checkpoints: only what they do changes.
    const plain = monitorPlan(settings({ goalMinutes: goal }));
    expect(plan.events.map((e) => [e.name, e.minutes])).toEqual(plain.events.map((e) => [e.name, e.minutes]));
    expect(plan.ticks).toEqual(plain.ticks);
  });

  test('the lock waits on the essentials: at the goal with no room, and at each rung past it with that much', () => {
    const plan = monitorPlan(settings({ goalMinutes: goal }), 0, null, true);
    const lockOf = (event: { actions: { kind: string; tally?: { room: number; mark: string; unless: string[] } }[] }) => event.actions.find((a) => a.tally?.mark === 'lock');
    expect(lockOf(plan.events.find((e) => e.name === 'empty') as never)?.tally).toEqual({ room: 0, mark: 'lock', unless: ['lock'] });
    expect(plan.over.map((x) => x.minutes)).toEqual(KEPT_MINUTES.map((m) => goal + m));
    for (const rung of plan.over) {
      const lock = rung.actions[0];
      // First in the list, so the warnings after it see that it has acted.
      expect(lock).toMatchObject({ kind: 'cover', shield: 'empty', tally: { room: rung.minutes - goal, mark: 'lock', unless: ['lock'] } });
    }
    // Twelve hours of essentials on top of the goal still has a rung to lock on.
    expect(plan.over[plan.over.length - 1].after).toEqual({ hour: 14, minute: 0, second: 0 });
    // Nothing before the goal can lock.
    for (const event of plan.events.filter((e) => e.minutes < goal)) expect(lockOf(event as never)).toBeUndefined();
  });

  test('the warning screen and "Nearly out" wait the same way, once each, and never after the lock', () => {
    const plan = monitorPlan(settings({ goalMinutes: goal }), 0, null, true);
    const lastCell = 100;
    const near = goal - 7;
    for (const event of [...plan.events, ...plan.over]) {
      const warn = event.actions.find((a) => a.tally?.mark === 'warn');
      const nearly = event.actions.find((a) => a.tally?.mark === 'near');
      if (event.minutes >= lastCell) expect(warn).toMatchObject({ kind: 'cover', shield: 'warning', tally: { room: event.minutes - lastCell, unless: ['lock', 'warn'] } });
      else expect(warn).toBeUndefined();
      if (event.minutes >= near) expect(nearly).toMatchObject({ kind: 'notify', title: 'Nearly out', tally: { room: event.minutes - near, unless: ['lock', 'near'] } });
      else expect(nearly).toBeUndefined();
    }
  });
});

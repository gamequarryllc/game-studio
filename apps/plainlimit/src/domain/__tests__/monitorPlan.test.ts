import { wordFor } from '../battery';
import { checkpointsFor } from '../checkpoints';
import {
  ACTIVITY,
  ALLOWED_ID,
  COUNTED_ID,
  SHORTEST_WATCH_MINUTES,
  TOPUP_ACTIVITY,
  WIDGET_PLAN_KEY,
  clockOf,
  countStart,
  includesEarlierUse,
  monitorPlan,
  puzzleNotice,
  rgbOf,
  spanOf,
  topUpWindow, earliestTrue } from '../monitorPlan';
import { DEFAULT_SETTINGS } from '../settings';
import { toneForCells } from '../tone';
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
    for (const name of [ACTIVITY, TOPUP_ACTIVITY, COUNTED_ID, ALLOWED_ID, ...plan.events.map((e) => e.name)]) expect(name).not.toContain('_');
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

  test('everything is covered only when everything counts', () => {
    expect(monitorPlan(settings({ countMode: 'everything' })).coverEverything).toBe(true);
    expect(monitorPlan(settings({ countMode: 'timeWasters' })).coverEverything).toBe(false);
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
    const line = swift.match(/let toneBackgrounds: \[UInt32\] = \[([^\]]+)\]/);
    expect(line).not.toBeNull();
    const inSwift = (line as RegExpMatchArray)[1].split(',').map((v) => '#' + v.trim().replace('0x', '').toUpperCase());
    expect(inSwift).toEqual([0, 1, 2, 3, 4, 5, 6].map((cells) => toneForCells(cells).bg.toUpperCase()));
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
    expect(swift).toContain('plan["goalMinutes"]');
    expect(swift).toContain('plan["rechargeMinute"]');
  });
});

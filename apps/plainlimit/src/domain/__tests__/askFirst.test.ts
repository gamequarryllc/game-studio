import {
  ASK_ID,
  ASK_IDLE,
  ASK_OPEN,
  ASK_USE,
  ASK_WATCH,
  IDLE_MINUTES,
  IDLE_SPAN_MINUTES,
  USE_CAP_MINUTES,
  askLead,
  askNotice,
  askOpened,
  askShieldCopy,
  askShownOn,
  askStateLine,
  DEFAULT_ASK_FIRST,
  idleWindow,
  onAfterPicking,
  openChange,
  openChoice,
  openShort,
  openSpan,
  openUntil,
  opensCountedApps,
  repairAskFirst,
  tickOfUse,
  usedWindow,
} from '../askFirst';
import { ACTIVITY, COUNTED_ID, SHORTEST_WATCH_MINUTES, TICKS_ACTIVITY, TOPUP_ACTIVITY } from '../monitorPlan';
import { repairSettings } from '../settings';

describe('Ask first', () => {
  it('is off by default and repairs a saved copy', () => {
    expect(DEFAULT_ASK_FIRST).toEqual({ on: false, openMinutes: 10 });
    expect(repairAskFirst(undefined)).toEqual(DEFAULT_ASK_FIRST);
    expect(repairAskFirst({ on: true, openMinutes: 15 })).toEqual({ on: true, openMinutes: 15 });
    expect(repairAskFirst({ on: 'yes', openMinutes: 7 })).toEqual({ on: false, openMinutes: 10 });
  });

  it('is kept with the settings, and an older saved copy without it reads as off', () => {
    expect(repairSettings({ goalMinutes: 180 }).askFirst).toEqual(DEFAULT_ASK_FIRST);
    expect(repairSettings({ goalMinutes: 180, askFirst: { on: true, openMinutes: 5 } }).askFirst).toEqual({ on: true, openMinutes: 5 });
  });

  it('opens for the chosen minutes, on the minute, and never past the recharge', () => {
    const now = new Date(2026, 10, 17, 14, 3, 20);
    const recharge = new Date(2026, 10, 18, 6, 0).getTime();
    expect(openUntil(now, 10, recharge)).toEqual(new Date(2026, 10, 17, 14, 14));
    // Just before the recharge it ends a minute before it, but always at least a minute from now.
    const late = new Date(2026, 10, 18, 5, 55, 30);
    expect(openUntil(late, 10, recharge)).toEqual(new Date(2026, 10, 18, 5, 59));
    const last = new Date(2026, 10, 18, 5, 59, 10);
    expect(openUntil(last, 10, recharge).getTime()).toBeGreaterThan(last.getTime());
  });

  it('does not open counted apps while the battery is empty, unless time has been earned', () => {
    expect(opensCountedApps(false, false)).toBe(true);
    expect(opensCountedApps(true, false)).toBe(false);
    expect(opensCountedApps(true, true)).toBe(true);
    expect(askLead(10, false, '6:00 AM')).toContain('stay locked until 6:00 AM');
    expect(askLead(10, true, '6:00 AM')).not.toContain('locked');
  });

  it("gets its own covering screen: the watch activity's name holds the list's id, and no battery list or activity is mistaken for it", () => {
    // The phone shows a list's screen when a running activity's name contains the list's id.
    expect(ASK_WATCH.includes(ASK_ID)).toBe(true);
    expect(ASK_OPEN.includes(ASK_ID)).toBe(true);
    for (const activity of [ACTIVITY, TICKS_ACTIVITY, TOPUP_ACTIVITY]) {
      expect(activity.includes(ASK_ID)).toBe(false);
      expect(activity.includes(COUNTED_ID)).toBe(false);
    }
    expect(askShieldCopy(10, '6:00 AM').line).toContain('{applicationOrDomainDisplayName}');
    expect(askShieldCopy(10, '6:00 AM').line).toContain('10 minutes');
    expect(askNotice().route).toBe('/ask');
  });
});

describe('the Second thought screen while the battery is empty', () => {
  it('says that apps that count stay locked, and never promises the app opens', () => {
    const copy = askShieldCopy(10, '6:00 AM', true);
    expect(copy.title).toBe("Battery's empty");
    expect(copy.line).toContain('stay locked until 6:00 AM');
    expect(copy.line).not.toContain('opens for');
    expect(copy.secondary).toBe('Solve one sum');
  });

  it('says the sum needs charge on the usual screen, written before the battery runs out', () => {
    expect(askShieldCopy(10, '6:00 AM').line).toContain('while your battery has charge');
  });
});

describe('the switch', () => {
  it('turns on when apps are picked, and off when the list is left empty', () => {
    expect(onAfterPicking(3)).toBe(true);
    expect(onAfterPicking(1)).toBe(true);
    expect(onAfterPicking(0)).toBe(false);
  });

  it('shows on only with apps picked, except where nothing can be picked', () => {
    expect(askShownOn({ on: true, openMinutes: 10 }, 3, true)).toBe(true);
    expect(askShownOn({ on: true, openMinutes: 10 }, 0, true)).toBe(false);
    expect(askShownOn({ on: false, openMinutes: 10 }, 3, true)).toBe(false);
    expect(askShownOn({ on: true, openMinutes: 10 }, 0, false)).toBe(true);
    expect(askShownOn({ on: false, openMinutes: 10 }, 0, false)).toBe(false);
  });

  it('says under On or Off what that means just now', () => {
    expect(askStateLine(true, 1, true)).toBe('1 app asks first');
    expect(askStateLine(true, 3, true)).toBe('3 apps ask first');
    expect(askStateLine(false, 3, true)).toBe('Apps open as usual');
    // Off with nothing picked: the switch opens Apple's list, and picking turns it on.
    expect(askStateLine(false, 0, true)).toBe('Pick apps and it turns on');
    // Where nothing can be picked (the web preview) no number is claimed.
    expect(askStateLine(true, 0, false)).toBe('Your apps ask first');
    expect(askStateLine(false, 0, false)).toBe('Apps open as usual');
  });
});

describe('While I use it', () => {
  const minute = 60_000;
  const minuteOfDay = (clock: { hour: number; minute: number }) => clock.hour * 60 + clock.minute;
  /** How long a stretch given as two times of day runs, in minutes (it may cross midnight). */
  const runs = (window: { start: { hour: number; minute: number }; end: { hour: number; minute: number } }) => (minuteOfDay(window.end) - minuteOfDay(window.start) + 1440) % 1440;

  it('is one more choice beside the minutes, kept with the settings, and off in an older saved copy', () => {
    expect(openChoice({ on: true, openMinutes: 10 })).toBe(10);
    expect(openChoice({ on: true, openMinutes: 10, whileInUse: true })).toBe('use');
    expect(repairAskFirst({ on: true, openMinutes: 15, whileInUse: true })).toEqual({ on: true, openMinutes: 15, whileInUse: true });
    expect(repairAskFirst({ on: true, openMinutes: 15, whileInUse: 'yes' })).toEqual({ on: true, openMinutes: 15 });
    expect(repairAskFirst({ on: true, openMinutes: 15 }).whileInUse).toBeUndefined();
    expect(repairSettings({ goalMinutes: 180, askFirst: { on: true, openMinutes: 5, whileInUse: true } }).askFirst).toEqual({ on: true, openMinutes: 5, whileInUse: true });
  });

  it('keeps the minutes last chosen, so choosing a number again goes back to a number', () => {
    const chosen = { ...{ on: true, openMinutes: 15 as const }, ...openChange('use') };
    expect(chosen).toEqual({ on: true, openMinutes: 15, whileInUse: true });
    expect(openChoice({ ...chosen, ...openChange(5) })).toBe(5);
    expect({ ...chosen, ...openChange(5) }.whileInUse).toBe(false);
  });

  it('is never open for the whole day: one sum opens it for an hour at most, and it is covered again two minutes after it was last used', () => {
    expect(USE_CAP_MINUTES).toBe(60);
    expect(IDLE_MINUTES).toBe(2);
    expect(openSpan({ on: true, openMinutes: 10, whileInUse: true })).toBe(USE_CAP_MINUTES);
    expect(openSpan({ on: true, openMinutes: 10 })).toBe(10);
    expect(openShort({ on: true, openMinutes: 10, whileInUse: true })).toBe('while in use');
    expect(openShort({ on: true, openMinutes: 10 })).toBe('10 min');
  });

  it('says so on the covering screen, under the sum and once it is open', () => {
    const copy = askShieldCopy('use', '6:00 AM');
    expect(copy.line).toContain('{applicationOrDomainDisplayName}');
    expect(copy.line).toContain('stays open while you use it');
    expect(copy.line).toContain('battery has charge');
    expect(copy.line).not.toContain('minutes');
    // An empty battery says the same whatever the choice.
    expect(askShieldCopy('use', '6:00 AM', true)).toEqual(askShieldCopy(10, '6:00 AM', true));
    expect(askLead('use', true, '6:00 AM')).toBe('Your Second thought apps stay open while you use them, then ask again.');
    expect(askLead('use', false, '6:00 AM')).toContain('stay locked until 6:00 AM');
    expect(askOpened('use', '2:14 PM')).toEqual({ title: 'Open while you use it', line: expect.stringContaining('about 2 minutes after you stop') });
    expect(askOpened('use', '2:14 PM').line).not.toContain('2:14 PM');
    expect(askOpened(10, '2:14 PM')).toEqual({ title: 'Open for 10 minutes', line: 'Your Second thought apps are open until 2:14 PM. Go back to the one you wanted.' });
  });

  it("times it with timers of its own, named for the list so its screen still shows, and never with a battery's", () => {
    const names = [ASK_WATCH, ASK_OPEN, ASK_IDLE, ASK_USE];
    for (const name of [ASK_IDLE, ASK_USE]) {
      expect(name.includes(ASK_ID)).toBe(true);
      expect(name.includes(COUNTED_ID)).toBe(false);
      // The library joins names into its keys with "_".
      expect(name.includes('_')).toBe(false);
    }
    expect(new Set(names).size).toBe(names.length);
    // Records are cleared by the start of a name: neither new name starts another timer's.
    for (const other of [ASK_OPEN, ACTIVITY, TICKS_ACTIVITY, TOPUP_ACTIVITY]) {
      expect(other.startsWith(ASK_USE) || ASK_USE.startsWith(other)).toBe(false);
      expect(other.startsWith(ASK_IDLE) || ASK_IDLE.startsWith(other)).toBe(false);
    }
    expect(ASK_USE.startsWith(ASK_IDLE) || ASK_IDLE.startsWith(ASK_USE)).toBe(false);
  });

  it('first covers it again two to three minutes after the sum, on the minute, with a timer still running when the phone is next picked up', () => {
    const now = new Date(2026, 10, 22, 14, 3, 20);
    const idle = idleWindow(now);
    expect(idle.start).toEqual({ hour: 14, minute: 6 });
    expect(runs(idle)).toBe(IDLE_SPAN_MINUTES);
    expect(IDLE_SPAN_MINUTES).toBeGreaterThanOrEqual(12 * 60);
    expect(IDLE_SPAN_MINUTES).toBeLessThan(1440);
    // Exactly on a minute: that minute plus two.
    expect(idleWindow(new Date(2026, 10, 22, 14, 3, 0)).start).toEqual({ hour: 14, minute: 5 });
    // Late in the evening it runs over midnight.
    const late = idleWindow(new Date(2026, 10, 22, 23, 58, 30));
    expect(late.start).toEqual({ hour: 0, minute: 1 });
    expect(runs(late)).toBe(IDLE_SPAN_MINUTES);
  });

  it('counts use over a stretch that has already begun and ends with the hour, and is never shorter than the phone allows', () => {
    const now = new Date(2026, 10, 22, 14, 3, 20);
    const hour = usedWindow(now, new Date(now.getTime() + 60 * minute), SHORTEST_WATCH_MINUTES);
    expect(hour.start).toEqual({ hour: 14, minute: 2 });
    expect(hour.end).toEqual({ hour: 15, minute: 3 });
    // Close to the recharge the open stretch is short: the counting still gets the phone's shortest stretch.
    const short = usedWindow(now, new Date(2026, 10, 22, 14, 9), SHORTEST_WATCH_MINUTES);
    expect(short.end).toEqual({ hour: 14, minute: 9 });
    expect(runs(short)).toBeGreaterThan(SHORTEST_WATCH_MINUTES);
    // Over midnight.
    const night = usedWindow(new Date(2026, 10, 22, 23, 30, 10), new Date(2026, 10, 23, 0, 31), SHORTEST_WATCH_MINUTES);
    expect(night.start).toEqual({ hour: 23, minute: 29 });
    expect(night.end).toEqual({ hour: 0, minute: 31 });
  });

  it('names a checkpoint for every minute of use up to the cap, each name its own', () => {
    const names = Array.from({ length: USE_CAP_MINUTES }, (_, i) => tickOfUse(i + 1));
    expect(names[0]).toBe('use01');
    expect(names[USE_CAP_MINUTES - 1]).toBe('use60');
    expect(new Set(names).size).toBe(USE_CAP_MINUTES);
    for (const name of names) expect(name.includes('_')).toBe(false);
  });
});

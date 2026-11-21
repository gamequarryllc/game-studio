import { ASK_ID, ASK_OPEN, ASK_WATCH, askLead, askNotice, askShieldCopy, askShownOn, DEFAULT_ASK_FIRST, onAfterPicking, openUntil, opensCountedApps, repairAskFirst } from '../askFirst';
import { ACTIVITY, COUNTED_ID, TICKS_ACTIVITY, TOPUP_ACTIVITY } from '../monitorPlan';
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
});

import { addReading, markDone, setSettings, updateJob } from '../actions';
import { atTime, toYmd } from '../dates';
import { MAX_PLANNED, planReminders } from '../reminders';

import { CAR, HOME, NOW, TODAY, base, nextId, withJob } from '../__fixtures__/helpers';

const at = (ymd: string, h = 9, m = 0) => atTime(ymd, h, m);

describe('planning reminders', () => {
  it('plans nothing when reminders are off', () => {
    let doc = withJob(base(), { thingId: HOME, lastDoneYmd: '2026-09-01' }, 'filter0001');
    doc = setSettings(doc, { reminders: false }, NOW);
    expect(planReminders(doc, NOW)).toEqual([]);
  });

  it('warns ahead, reminds on the day, and nudges twice after', () => {
    const doc = withJob(base(), { thingId: HOME, name: 'Furnace filter', lastDoneYmd: '2026-09-01' }, 'filter0001');
    const plan = planReminders(doc, NOW);
    expect(plan.map((p) => [toYmd(new Date(p.fireAt)), p.title, p.body])).toEqual([
      ['2026-11-24', 'Furnace filter', 'Home · due in 7 days, on Dec 1'],
      ['2026-12-01', 'Furnace filter', 'Home · due today'],
      ['2026-12-04', 'Furnace filter', 'Home · 3 days overdue'],
      ['2026-12-11', 'Furnace filter', 'Home · 10 days overdue'],
    ]);
    expect(plan.every((p) => new Date(p.fireAt).getHours() === 9 && p.jobId === 'filter0001')).toBe(true);
  });

  it('uses the job’s own lead time and the chosen time of day', () => {
    let doc = withJob(base(), { thingId: HOME, name: 'Service', every: { n: 1, unit: 'year' }, lastDoneYmd: '2026-01-10', leadDays: 30 }, 'hvac000001');
    doc = setSettings(doc, { remindHour: 18, remindMinute: 30 }, NOW);
    const plan = planReminders(doc, NOW);
    expect(plan[0]).toMatchObject({ fireAt: at('2026-12-11', 18, 30), body: 'Home · due in 4 weeks, on Jan 10, 2027' });
  });

  it('skips what is already past, including this morning', () => {
    // Due today; it is noon and reminders are at nine: only the nudges are left.
    const doc = withJob(base(), { thingId: HOME, name: 'Alarms', every: { n: 1, unit: 'month' }, lastDoneYmd: '2026-10-12' }, 'alarm00001');
    expect(planReminders(doc, NOW).map((p) => toYmd(new Date(p.fireAt)))).toEqual(['2026-11-15', '2026-11-22']);
    // At eight the same morning, today's is still to come.
    expect(planReminders(doc, at(TODAY, 8)).map((p) => toYmd(new Date(p.fireAt)))).toEqual(['2026-11-12', '2026-11-15', '2026-11-22']);
  });

  it('stops nudging once a job is long overdue, and plans the next round when it is done', () => {
    let doc = withJob(base(), { thingId: HOME, name: 'Gutters', every: { n: 6, unit: 'month' }, lastDoneYmd: '2026-01-01' }, 'gutter0001');
    expect(planReminders(doc, NOW)).toEqual([]);
    doc = markDone(doc, 'gutter0001', { ymd: TODAY }, NOW, nextId());
    expect(toYmd(new Date(planReminders(doc, NOW)[0].fireAt))).toBe('2027-05-05');
  });

  it('a job nobody has logged gets a nudge to look on its check day and once more, with no countdown', () => {
    const doc = withJob(base(), { thingId: HOME, name: 'Chimney sweep', every: { n: 1, unit: 'year' } }, 'chimney001');
    const plan = planReminders(doc, NOW);
    expect(plan.map((p) => [toYmd(new Date(p.fireAt)), p.kind, p.body])).toEqual([
      ['2026-12-12', 'check', 'Home · not logged yet. When was it last done?'],
      ['2026-12-22', 'check', 'Home · not logged yet. When was it last done?'],
    ]);
  });

  it('a home just set up gets one nudge for all its unlogged jobs, not one each', () => {
    let doc = base();
    for (const name of ['Furnace filter', 'Clean dryer vent', 'Smoke alarm batteries']) doc = withJob(doc, { thingId: HOME, name, every: { n: 1, unit: 'year' } }, nextId('job'));
    const plan = planReminders(doc, NOW);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ kind: 'several', title: '3 jobs aren’t logged yet', body: 'Clean dryer vent (Home), Furnace filter (Home), Smoke alarm batteries (Home)', fireAt: at('2026-12-12') });
  });

  it('says which reminders only come if the job is still not done', () => {
    const doc = withJob(base(), { thingId: HOME, lastDoneYmd: '2026-09-01' }, 'filter0001');
    expect(planReminders(doc, NOW).map((p) => p.kind)).toEqual(['ahead', 'day', 'after', 'after']);
  });

  it('leaves out paused jobs', () => {
    let doc = withJob(base(), { thingId: HOME, lastDoneYmd: '2026-09-01' }, 'filter0001');
    doc = updateJob(doc, 'filter0001', { paused: true }, NOW);
    expect(planReminders(doc, NOW)).toEqual([]);
  });

  it('keeps nine o’clock at nine across a clock change', () => {
    // Due 2027-03-15; the week-ahead warning falls on the day the clocks go forward (2027-03-14 is after; 03-08 is before).
    const doc = withJob(base(), { thingId: HOME, every: { n: 4, unit: 'month' }, lastDoneYmd: '2026-11-15' }, 'dst0000001');
    const plan = planReminders(doc, NOW);
    expect(plan.map((p) => new Date(p.fireAt).getHours())).toEqual([9, 9, 9, 9]);
    expect(plan.map((p) => toYmd(new Date(p.fireAt)))).toEqual(['2027-03-08', '2027-03-15', '2027-03-18', '2027-03-25']);
  });

  it('times a distance job from the pace the car is driven at, and asks for a reading when it goes stale', () => {
    let doc = base();
    doc = addReading(doc, CAR, { ymd: '2026-08-01', value: 57000 }, NOW);
    doc = withJob(doc, { thingId: CAR, name: 'Oil change', every: null, everyDistance: 5000, lastDoneYmd: '2026-08-01', lastDoneDistance: 57000 }, 'oil0000001');
    const plan = planReminders(doc, NOW);
    const oil = plan.filter((p) => p.jobId === 'oil0000001');
    // 2,000 to go at 29 a day: January 20. That day is an estimate: it is worded as one, and not chased afterwards.
    expect(oil.map((p) => [toYmd(new Date(p.fireAt)), p.body])).toEqual([
      ['2027-01-13', 'Wagon · should be due around Jan 20, 2027, going by the odometer'],
      ['2027-01-20', 'Wagon · should be due about now. What does the odometer say?'],
    ]);
    const odo = plan.filter((p) => p.key.startsWith('odo:'));
    expect(odo).toHaveLength(1);
    expect(odo[0]).toMatchObject({ fireAt: at('2026-12-12'), thingId: CAR, jobId: null, title: 'Wagon: what does the odometer say?', kind: 'odometer' });
  });

  it('asks for a reading tomorrow when a car with distance jobs has none', () => {
    let doc = base();
    doc = { ...doc, things: doc.things.map((t) => (t.id === CAR ? { ...t, readings: [] } : t)) };
    doc = withJob(doc, { thingId: CAR, every: null, everyDistance: 6000 }, 'rotate0001');
    const plan = planReminders(doc, NOW);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ fireAt: at('2026-11-13') });
  });

  it('does not ask for readings on a car whose jobs all go by the calendar', () => {
    const doc = withJob(base(), { thingId: CAR, every: { n: 1, unit: 'year' }, lastDoneYmd: '2026-06-01' }, 'wipers0001');
    expect(planReminders(doc, NOW).some((p) => p.key.startsWith('odo:'))).toBe(false);
  });

  it('folds jobs that fall at the same minute into one reminder', () => {
    let doc = base();
    for (const name of ['Furnace filter', 'Range hood filter', 'Pest control', 'Water softener salt']) {
      doc = withJob(doc, { thingId: HOME, name, lastDoneYmd: '2026-09-01' }, nextId('job'));
    }
    const plan = planReminders(doc, NOW);
    expect(plan).toHaveLength(4);
    expect(plan[1]).toMatchObject({ title: '4 jobs due today', body: 'Furnace filter (Home), Pest control (Home), Range hood filter (Home) and 1 more', jobId: null, kind: 'several' });
    expect(plan[1].jobIds).toHaveLength(4);
  });

  it('says how each job stands when the jobs in one reminder stand differently', () => {
    let doc = base();
    // One a week ahead of its date, one on its date: both arrive on the same morning.
    doc = withJob(doc, { thingId: HOME, name: 'Furnace filter', lastDoneYmd: '2026-08-20' }, nextId('job'));
    doc = withJob(doc, { thingId: HOME, name: 'Pest control', lastDoneYmd: '2026-08-27' }, nextId('job'));
    const shared = planReminders(doc, NOW).filter((p) => p.kind === 'several');
    expect(shared[0]).toMatchObject({ title: '2 jobs need a look' });
    expect(shared[0].body).toMatch(/^Furnace filter \(Home, due [^)]+\), Pest control \(Home, due [^)]+\)$/);
  });

  it('keeps within what the iPhone will hold, nearest first', () => {
    let doc = base();
    for (let i = 0; i < 40; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      doc = withJob(doc, { thingId: HOME, name: `Job ${i}`, every: { n: 6, unit: 'month' }, lastDoneYmd: `2026-${i < 20 ? '07' : '08'}-${day}` }, nextId('job'));
    }
    const plan = planReminders(doc, NOW);
    expect(plan).toHaveLength(MAX_PLANNED);
    expect(plan.every((p, i) => i === 0 || plan[i - 1].fireAt <= p.fireAt)).toBe(true);
    expect(plan[0].fireAt).toBeGreaterThan(NOW);
  });

  it('gives the same reminder the same key every time', () => {
    const doc = withJob(base(), { thingId: HOME, lastDoneYmd: '2026-09-01' }, 'filter0001');
    expect(planReminders(doc, NOW).map((p) => p.key)).toEqual(planReminders(doc, NOW + 60_000).map((p) => p.key));
  });
});

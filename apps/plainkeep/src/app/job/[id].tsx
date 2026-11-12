import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Text, View } from 'react-native';

import { deleteJob, skipOnce, updateJob } from '@/domain/actions';
import { displayYmd, shortYmd, todayYmd } from '@/domain/dates';
import { distanceText, dueText, leadText, repeatText } from '@/domain/labels';
import { formatMoney } from '@/domain/money';
import { dueOf, entriesOf, lastDone } from '@/domain/schedule';
import { success, warning } from '@/platform/haptics';
import { useToday } from '@/state/clock';
import { goBack } from '@/state/nav';
import { store, useDoc } from '@/state/store';
import { confirm } from '@/ui/dialogs';
import { dueTone, readoutOf } from '@/ui/due';
import { SwitchRow } from '@/ui/form';
import { Gauge } from '@/ui/Gauge';
import { BarButton, Button, Card, Divider, EmptyState, Footnote, PushedScreen, Row, SectionLabel } from '@/ui/kit';
import { NO_ORPHAN, space, toneColor, type, useTheme } from '@/ui/theme';

/** A label with its value under it: for values too long to share a line. */
function Stacked({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingHorizontal: space.l, paddingVertical: 10 }}>
      <Text style={[type.footnote, { color: c.ink2 }]}>{label}</Text>
      <Text testID={testID} style={[type.body, { color: c.ink, marginTop: 1 }]}>
        {value}
      </Text>
    </View>
  );
}

export default function JobScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const doc = useDoc();
  const today = useToday();
  const job = doc.jobs.find((j) => j.id === params.id);
  const thing = job ? doc.things.find((t) => t.id === job.thingId) : undefined;

  if (!job || !thing) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, justifyContent: 'center' }}>
        <EmptyState title="This job is no longer here" body="It may have been deleted." action={<Button label="Back" onPress={() => goBack(router)} />} />
      </View>
    );
  }

  const unit = doc.settings.distanceUnit;
  const due = dueOf(job, doc, today);
  const tone = dueTone(due);
  const color = toneColor(c, tone);
  const readout = readoutOf(due, unit);
  const history = entriesOf(job.id, doc.entries).reverse();
  const last = lastDone(job.id, doc.entries);
  const lead = job.leadDays ?? doc.settings.leadDays;
  const live = due.state !== 'paused' && due.state !== 'finished';

  const skip = async () => {
    const sure = await confirm({ title: 'Skip it this time?', message: 'Nothing is logged as done. The job moves on to its next turn.', confirmLabel: 'Skip' });
    if (!sure) return;
    store.update((d, now) => skipOnce(d, job.id, todayYmd(now), now));
    success();
  };

  const remove = async () => {
    const sure = await confirm({
      title: `Delete ${job.name}?`,
      message: history.length > 0 ? 'What has been logged for it stays in the log.' : undefined,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!sure) return;
    warning();
    goBack(router);
    store.update((d, now) => deleteJob(d, job.id, now));
  };

  // For a mileage job: the day the odometer should get there, from the person's own driving.
  const pace = due.by === 'distance' && due.whenYmd !== null && due.distanceLeft !== null && due.distanceLeft > 0 ? `At the pace you drive, that is about ${shortYmd(due.whenYmd, today)}.` : null;
  const ends: string[] = [];
  if (due.ymd) ends.push(shortYmd(due.ymd, today));
  if (due.distance !== null) ends.push(distanceText(due.distance, unit));

  return (
    <PushedScreen testID="job-screen">
      <Stack.Screen options={{ title: '', headerRight: () => <BarButton testID="job-edit" label="Edit" onPress={() => router.push({ pathname: '/job-form', params: { id: job.id } })} /> }} />
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.s }}>
        <Text style={[type.subhead, { color: c.ink2 }]}>{thing.name}</Text>
        <Text testID="job-name" accessibilityRole="header" style={[type.largeTitle, NO_ORPHAN, { color: c.ink, fontSize: 36, lineHeight: 38, marginTop: 2 }]}>
          {job.name}
        </Text>
      </View>

      <Card style={{ marginTop: space.xl }}>
        <View style={{ padding: space.l, paddingBottom: space.m }}>
          {readout ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text testID="job-figure" style={[type.figure, { color }]}>
                {readout.figure}
              </Text>
              <Text style={[type.unit, { color: c.ink2, fontSize: 20, lineHeight: 22 }]}>{readout.unit}</Text>
            </View>
          ) : null}
          {live ? null : (
            <Text testID="job-due" style={[type.callout, { color: c.ink2 }]}>
              {due.state === 'paused' ? 'Put away for now. No due dates or reminders.' : 'Done. It was a one-off.'}
            </Text>
          )}
          {live && due.state === 'unknown' ? (
            <Text testID="job-due" style={[type.callout, { color: c.ink }]}>
              {dueText(due, unit, today)}
            </Text>
          ) : null}
          {live && due.used !== null ? (
            <View style={{ marginTop: space.l }}>
              <Gauge testID="job-gauge" used={due.used} tone={tone} marks={42} height={16} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={[type.caption, { color: c.ink2 }]}>{last ? `Done ${shortYmd(last.ymd, today)}` : 'Not logged yet'}</Text>
                <Text testID="job-ends" style={[type.caption, { color: c.ink2 }]}>
                  Due {ends.join(' or ')}
                </Text>
              </View>
              {pace ? (
                <Text testID="job-pace" style={[type.caption, { color: c.ink2, marginTop: 4 }]}>
                  {pace}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {live ? (
          <View style={{ flexDirection: 'row', gap: space.s, paddingHorizontal: space.l, paddingBottom: space.l }}>
            <Button testID="job-done" label="Mark done" icon="check" onPress={() => router.push({ pathname: '/done', params: { jobId: job.id } })} style={{ flex: 1 }} />
            <Button testID="job-skip" label="Skip" kind="soft" onPress={skip} />
          </View>
        ) : null}
      </Card>

      <SectionLabel>Schedule</SectionLabel>
      <Card>
        <Stacked testID="job-repeat" label="Comes round" value={repeatText(job, unit)} />
        <Divider />
        <Stacked label="Reminder" value={doc.settings.reminders ? leadText(lead) : 'Reminders are off'} />
        {job.note ? (
          <>
            <Divider />
            <Stacked testID="job-note" label="For next time" value={job.note} />
          </>
        ) : null}
      </Card>

      <SectionLabel>Each time</SectionLabel>
      {history.length === 0 ? (
        <Footnote style={{ marginTop: 0 }}>Nothing logged yet. If you know when it was last done, mark it done and set that date.</Footnote>
      ) : (
        <Card>
          {history.map((e, i) => (
            <Fragment key={e.id}>
              {i > 0 ? <Divider /> : null}
              <Row
                testID={`entry-${e.id}`}
                title={displayYmd(e.ymd)}
                subtitle={[e.skipped ? 'Skipped' : null, e.distance !== null && !e.skipped ? distanceText(e.distance, unit) : null, e.note || null].filter(Boolean).join(' · ') || undefined}
                value={e.cost !== null ? formatMoney(e.cost, doc.settings.currency, { whole: true }) : undefined}
                chevron
                onPress={() => router.push({ pathname: '/done', params: { entryId: e.id } })}
              />
            </Fragment>
          ))}
        </Card>
      )}

      <View style={{ marginTop: space.xxl }}>
        <Card>
          <SwitchRow testID="job-paused" label="Put away for now" value={job.paused} onChange={(on) => store.update((d, now) => updateJob(d, job.id, { paused: on }, now))} />
          <Divider />
          <Row testID="job-delete" title="Delete this job" destructive onPress={remove} />
        </Card>
        <Footnote>Put a job away when it is out of season, like a mower in winter. It keeps its history and comes back when you turn this off.</Footnote>
      </View>
    </PushedScreen>
  );
}

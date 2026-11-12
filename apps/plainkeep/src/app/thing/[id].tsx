import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { Text, View } from 'react-native';

import { deleteThing } from '@/domain/actions';
import { displayYmd, shortYmd } from '@/domain/dates';
import { distanceText } from '@/domain/labels';
import { formatMoney } from '@/domain/money';
import { currentReading, distancePerDay, listJobs } from '@/domain/schedule';
import { logNewestFirst, sumCost } from '@/domain/selectors';
import { warning } from '@/platform/haptics';
import { MAKES_PDF } from '@/platform/exporter';
import { usePro } from '@/pro/pro';
import { useToday } from '@/state/clock';
import { goBack } from '@/state/nav';
import { makeServiceRecord } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { confirm, notify } from '@/ui/dialogs';
import { thingIconName } from '@/ui/Icon';
import { JobRow } from '@/ui/JobRow';
import { BarButton, Button, Card, Divider, EmptyState, Footnote, IconPlate, PushedScreen, Row, SectionLabel } from '@/ui/kit';
import { Odometer } from '@/ui/Odometer';
import { NO_ORPHAN, space, type, useTheme } from '@/ui/theme';

const RECENT = 5;

export default function ThingScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const doc = useDoc();
  const today = useToday();
  const isPro = usePro().isPro;
  const [working, setWorking] = useState(false);
  const thing = doc.things.find((t) => t.id === params.id);

  if (!thing) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, justifyContent: 'center' }}>
        <EmptyState title="This is no longer here" body="It may have been deleted." action={<Button label="Back" onPress={() => goBack(router, '/things')} />} />
      </View>
    );
  }

  const unit = doc.settings.distanceUnit;
  const jobs = listJobs(doc, today).filter((l) => l.thing.id === thing.id);
  const log = logNewestFirst(doc.entries.filter((e) => e.thingId === thing.id));
  const spent = sumCost(log);
  const vehicle = thing.kind === 'vehicle';
  const reading = vehicle ? currentReading(thing) : null;
  const pace = vehicle ? distancePerDay(thing) : null;

  const record = async () => {
    if (!isPro) {
      router.push('/pro');
      return;
    }
    if (working) return;
    setWorking(true);
    try {
      await makeServiceRecord(thing.id);
    } catch {
      await notify('The record couldn’t be made', 'Try again in a moment.');
    } finally {
      setWorking(false);
    }
  };

  const remove = async () => {
    const sure = await confirm({
      title: `Delete ${thing.name}?`,
      message: jobs.length + log.length === 0 ? undefined : 'Its jobs and its whole log go with it. A backup, if you made one, is not touched.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!sure) return;
    warning();
    goBack(router, '/things');
    store.update((d, now) => deleteThing(d, thing.id, now));
  };

  return (
    <PushedScreen testID="thing-screen">
      <Stack.Screen options={{ title: '', headerRight: () => <BarButton testID="thing-edit" label="Edit" onPress={() => router.push({ pathname: '/thing-form', params: { id: thing.id } })} /> }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.xl, paddingTop: space.s }}>
        <IconPlate name={thingIconName(thing.icon)} size={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID="thing-name" accessibilityRole="header" style={[type.largeTitle, NO_ORPHAN, { color: c.ink, fontSize: 36, lineHeight: 38 }]} numberOfLines={2}>
            {thing.name}
          </Text>
          {thing.detail ? <Text style={[type.subhead, { color: c.ink2 }]}>{thing.detail}</Text> : null}
        </View>
      </View>

      {vehicle ? (
        <Card style={{ marginTop: space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Odometer testID="thing-odometer" value={reading?.value ?? null} unit={unit} size="m" />
              <Text testID="thing-reading-note" style={[type.footnote, { color: c.ink2 }]}>
                {reading ? `Read ${shortYmd(reading.ymd, today)}${pace !== null ? ` · about ${distanceText(Math.round(pace * 30), unit)} a month` : ''}` : 'No reading yet. Distance jobs need one.'}
              </Text>
            </View>
            <Button testID="thing-update-odometer" label="Update" kind="soft" onPress={() => router.push({ pathname: '/odometer', params: { thingId: thing.id } })} style={{ minHeight: 40, paddingHorizontal: space.l }} />
          </View>
        </Card>
      ) : null}

      <SectionLabel>Jobs</SectionLabel>
      <Card>
        {jobs.map((item, i) => (
          <Fragment key={item.job.id}>
            {i > 0 ? <Divider inset={space.l + 26 + space.m} /> : null}
            <JobRow
              item={item}
              today={today}
              unit={unit}
              showThing={false}
              onOpen={() => router.push({ pathname: '/job/[id]', params: { id: item.job.id } })}
              onDone={() => router.push({ pathname: '/done', params: { jobId: item.job.id } })}
            />
          </Fragment>
        ))}
        {jobs.length > 0 ? <Divider inset={0} /> : null}
        <Row testID="thing-add-job" title="Add a job" tint onPress={() => router.push({ pathname: '/job-form', params: { thingId: thing.id } })} />
        <Divider />
        <Row testID="thing-suggest" title="Suggested jobs" tint onPress={() => router.push({ pathname: '/suggestions', params: { thingId: thing.id } })} />
      </Card>

      <SectionLabel trailing={spent !== null ? <Text style={[type.subhead, type.tabular, { color: c.ink2 }]}>{formatMoney(spent, doc.settings.currency, { whole: true })} in all</Text> : undefined}>Log</SectionLabel>
      <Card>
        {log.slice(0, RECENT).map((e) => (
          <Fragment key={e.id}>
            <Row
              testID={`entry-${e.id}`}
              title={e.title}
              subtitle={[displayYmd(e.ymd), e.skipped ? 'Skipped' : null, e.distance !== null && !e.skipped ? distanceText(e.distance, unit) : null].filter(Boolean).join(' · ')}
              value={e.cost !== null ? formatMoney(e.cost, doc.settings.currency, { whole: true }) : undefined}
              chevron
              onPress={() => router.push({ pathname: '/done', params: { entryId: e.id } })}
            />
            <Divider />
          </Fragment>
        ))}
        {log.length > RECENT ? (
          <>
            <Row testID="thing-all-log" title={`All ${log.length} entries`} tint chevron onPress={() => router.push({ pathname: '/log', params: { thingId: thing.id } })} />
            <Divider />
          </>
        ) : null}
        <Row testID="thing-log-other" title="Log something else" subtitle={log.length === 0 ? 'A repair or a one-off that isn’t on a schedule' : undefined} tint onPress={() => router.push({ pathname: '/done', params: { thingId: thing.id } })} />
      </Card>

      <SectionLabel>Service record</SectionLabel>
      <Card>
        <Row
          testID="thing-record"
          title={MAKES_PDF ? 'Make a PDF' : 'Open the record'}
          subtitle={isPro ? 'Everything logged, with dates, readings and costs' : 'Part of Plainkeep Pro'}
          tint
          chevron
          onPress={record}
        />
      </Card>
      <Footnote>For a buyer, a landlord or a warranty claim: one page that shows it was looked after.</Footnote>

      <View style={{ marginTop: space.xxl }}>
        <Card>
          <Row testID="thing-delete" title={`Delete ${thing.name}`} destructive onPress={remove} />
        </Card>
      </View>
    </PushedScreen>
  );
}

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { displayYmd, shortYmd } from '@/domain/dates';
import { distanceText } from '@/domain/labels';
import { formatMoney } from '@/domain/money';
import { currentReading, distancePerDay, listJobs } from '@/domain/schedule';
import { logNewestFirst, sumCost } from '@/domain/selectors';
import { MAKES_PDF } from '@/platform/exporter';
import { tap } from '@/platform/haptics';
import { usePro } from '@/pro/pro';
import { useToday } from '@/state/clock';
import { goBack } from '@/state/nav';
import { makeServiceRecord } from '@/state/operations';
import { useDoc } from '@/state/store';
import { choose, notify } from '@/ui/dialogs';
import { Icon, thingIconName } from '@/ui/Icon';
import { JobRow } from '@/ui/JobRow';
import { BarButton, Button, Card, Divider, EmptyState, Footnote, IconPlate, PushedScreen, Row, SectionLabel } from '@/ui/kit';
import { Odometer } from '@/ui/Odometer';
import { NO_ORPHAN, space, type, useTheme } from '@/ui/theme';

const RECENT = 5;

/** The small plus at the end of a section's heading. */
function HeaderAdd({ onPress, label, testID }: { onPress: () => void; label: string; testID: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.sunk : c.card })}>
      <Icon name="add" size={17} color={c.blue} />
    </Pressable>
  );
}

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

  const addJob = async () => {
    const picked = await choose({ choices: [{ key: 'new', label: 'New job' }, { key: 'suggest', label: 'Suggested jobs' }] });
    if (picked === 'new') router.push({ pathname: '/job-form', params: { thingId: thing.id } });
    else if (picked === 'suggest') router.push({ pathname: '/suggestions', params: { thingId: thing.id } });
  };

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

  return (
    <PushedScreen testID="thing-screen">
      <Stack.Screen options={{ title: '', headerRight: () => <BarButton testID="thing-edit" label="Edit" onPress={() => router.push({ pathname: '/thing-form', params: { id: thing.id } })} /> }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.xl, paddingTop: space.s }}>
        <IconPlate name={thingIconName(thing.icon)} size={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID="thing-name" accessibilityRole="header" style={[type.largeTitle, NO_ORPHAN, { color: c.ink, fontSize: 36, lineHeight: 43 }]} numberOfLines={2}>
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
                {reading ? `Read ${shortYmd(reading.ymd, today)}` : 'No reading yet. Mileage jobs need one.'}
                {reading && pace !== null ? `\nAbout ${distanceText(Math.round(pace * 30), unit)} a month` : ''}
              </Text>
            </View>
            <Button testID="thing-update-odometer" label="Update" kind="soft" onPress={() => router.push({ pathname: '/odometer', params: { thingId: thing.id } })} style={{ minHeight: 40, paddingHorizontal: space.l }} />
          </View>
        </Card>
      ) : null}

      <SectionLabel trailing={<HeaderAdd testID="thing-add-job" label="Add a job" onPress={addJob} />}>Jobs</SectionLabel>
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
        {jobs.length === 0 ? <Row testID="thing-suggest" title="See suggested jobs" subtitle="The usual ones, with their usual intervals" tint chevron onPress={() => router.push({ pathname: '/suggestions', params: { thingId: thing.id } })} /> : null}
      </Card>

      <SectionLabel
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            {spent !== null ? <Text style={[type.subhead, type.tabular, { color: c.ink2 }]}>{formatMoney(spent, doc.settings.currency)} spent</Text> : null}
            <HeaderAdd testID="thing-log-other" label="Log something that was done" onPress={() => router.push({ pathname: '/done', params: { thingId: thing.id } })} />
          </View>
        }>
        Log
      </SectionLabel>
      {log.length === 0 ? <Footnote style={{ marginTop: 0 }}>Nothing logged yet. Jobs you mark done land here; repairs and one-offs can be added with the plus.</Footnote> : null}
      <Card>
        {log.slice(0, RECENT).map((e, i) => (
          <Fragment key={e.id}>
            {i > 0 ? <Divider /> : null}
            <Row
              testID={`entry-${e.id}`}
              title={e.title}
              subtitle={[displayYmd(e.ymd), e.skipped ? 'Skipped' : null, e.distance !== null && !e.skipped ? distanceText(e.distance, unit) : null].filter(Boolean).join(' · ')}
              value={e.cost !== null ? formatMoney(e.cost, doc.settings.currency) : undefined}
              chevron
              onPress={() => router.push({ pathname: '/done', params: { entryId: e.id } })}
            />
          </Fragment>
        ))}
        {log.length > RECENT ? (
          <>
            <Divider />
            <Row testID="thing-all-log" title={`All ${log.length} entries`} tint chevron onPress={() => router.push({ pathname: '/log', params: { thingId: thing.id } })} />
          </>
        ) : null}
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

    </PushedScreen>
  );
}

import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { View } from 'react-native';

import { dueText } from '@/domain/labels';
import { groupJobs, listJobs, type Listed } from '@/domain/schedule';
import { DELIVERS, openSystemSettings } from '@/platform/notify';
import { useToday } from '@/state/clock';
import { openNewThing } from '@/state/nav';
import { reminders, useReminderPermission } from '@/state/reminders';
import { useDoc } from '@/state/store';
import { notify } from '@/ui/dialogs';
import { JobRow } from '@/ui/JobRow';
import { Button, Card, Divider, EmptyState, Footnote, LinkText, Notice, RoundButton, SectionLabel, TabScreen } from '@/ui/kit';
import { space, type Tone } from '@/ui/theme';

export default function DueTab() {
  const router = useRouter();
  const doc = useDoc();
  const today = useToday();
  const allowed = useReminderPermission();
  const unit = doc.settings.distanceUnit;
  const listed = listJobs(doc, today);
  const groups = groupJobs(listed);
  const pressing = groups.overdue.length + groups.soon.length;

  const addJob = () => {
    if (doc.things.length === 0) openNewThing(router);
    else router.push('/job-form');
  };

  const turnOn = async () => {
    const result = await reminders.turnOn();
    if (result === 'denied') await notify('Notifications are off for Plainkeep', 'Allow them in the Settings app, under Plainkeep, and reminders will start arriving.');
  };

  const section = (title: string, items: Listed[], tone: Tone | undefined, testID: string) =>
    items.length === 0 ? null : (
      <>
        <SectionLabel testID={testID} tone={tone}>
          {title}
        </SectionLabel>
        <Card>
          {items.map((item, i) => (
            <Fragment key={item.job.id}>
              {i > 0 ? <Divider inset={space.l + 26 + space.m} /> : null}
              <JobRow
                item={item}
                today={today}
                unit={unit}
                onOpen={() => router.push({ pathname: '/job/[id]', params: { id: item.job.id } })}
                onDone={() => router.push({ pathname: '/done', params: { jobId: item.job.id } })}
              />
            </Fragment>
          ))}
        </Card>
      </>
    );

  const action = <RoundButton testID="add-job" icon="add" label="Add a job" onPress={addJob} />;

  if (doc.things.length === 0) {
    return (
      <TabScreen testID="due-screen" title="Due" action={action}>
        <EmptyState
          title="Nothing to keep up yet"
          body="Add your home or a car, then the jobs that come round: a filter, a battery, an oil change."
          action={<Button testID="empty-add-thing" label="Add something to look after" onPress={() => openNewThing(router)} />}
        />
      </TabScreen>
    );
  }

  if (listed.length === 0) {
    const first = doc.things[0];
    return (
      <TabScreen testID="due-screen" title="Due" action={action}>
        <EmptyState
          title="No jobs yet"
          body={`Pick from the usual jobs for ${first.name}, or add one of your own.`}
          action={
            <View style={{ gap: space.s }}>
              <Button testID="empty-suggest" label="See suggested jobs" onPress={() => router.push({ pathname: '/suggestions', params: { thingId: first.id } })} />
              <Button testID="empty-add-job" label="Add my own" kind="plain" onPress={addJob} />
            </View>
          }
        />
      </TabScreen>
    );
  }

  const next = groups.later[0];
  return (
    <TabScreen testID="due-screen" title="Due" action={action}>
      {!doc.settings.reminders ? (
        <Notice testID="reminders-off" icon="bell" tone="blue" action={<LinkText testID="reminders-turn-on" label="Turn on reminders" onPress={turnOn} />}>
          Reminders are off. Turn them on to hear about a job before it falls due.
        </Notice>
      ) : DELIVERS && allowed === 'denied' ? (
        <Notice testID="reminders-blocked" icon="bellOff" tone="amber" action={<LinkText label="Open Settings" onPress={openSystemSettings} />}>
          Notifications are off for Plainkeep in the Settings app, so reminders can’t arrive.
        </Notice>
      ) : null}

      {pressing === 0 && next ? (
        <Footnote style={{ marginTop: space.m }}>
          Nothing needs doing. Next is {next.job.name} ({next.thing.name}), {dueText(next.due, unit, today).replace(/^Due /, '')}.
        </Footnote>
      ) : null}

      {section('Overdue', groups.overdue, 'red', 'section-overdue')}
      {section('Coming up', groups.soon, 'amber', 'section-soon')}
      {section('Not logged yet', groups.unlogged, undefined, 'section-unlogged')}
      {groups.unlogged.length > 0 ? (
        <Footnote>
          When you do one of these, tap its ring. If you know when it was last done, tap the ring and set that day. From then on it counts down by itself.
        </Footnote>
      ) : null}
      {section('Later', groups.later, undefined, 'section-later')}
      {section('Needs an odometer reading', groups.unknown, undefined, 'section-unknown')}
      {section('Paused', groups.paused, undefined, 'section-paused')}
      {section('Finished', groups.finished, undefined, 'section-finished')}
    </TabScreen>
  );
}

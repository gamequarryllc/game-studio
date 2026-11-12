import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { setSettings } from '@/domain/actions';
import { displayClock } from '@/domain/dates';
import { leadText } from '@/domain/labels';
import { FREE_THING_LIMIT } from '@/domain/limits';
import { CURRENCIES } from '@/domain/money';
import { LEAD_CHOICES } from '@/domain/types';
import { success, warning } from '@/platform/haptics';
import { DELIVERS, openSystemSettings } from '@/platform/notify';
import { DEV_TOOLS, pro, usePro } from '@/pro/pro';
import { appVersion, applyRestore, backUp, chooseBackup, eraseEverything, exportLog, loadSample, restoreProblemText } from '@/state/operations';
import { reminders, useReminderPermission } from '@/state/reminders';
import { store, useDoc } from '@/state/store';
import { TimeField } from '@/ui/DateField';
import { choose, confirm, notify } from '@/ui/dialogs';
import { FormRow, Segmented, SwitchRow } from '@/ui/form';
import { Card, Divider, Footnote, IconPlate, Row, SectionLabel, TabScreen } from '@/ui/kit';

export const PRIVACY_URL = 'https://gamequarryllc.github.io/game-studio/apps/privacy/';
export const SUPPORT_URL = 'https://gamequarryllc.github.io/game-studio/apps/support/#plainkeep';

export default function SettingsTab() {
  const router = useRouter();
  const doc = useDoc();
  const proState = usePro();
  const allowed = useReminderPermission();
  const [working, setWorking] = useState(false);
  const s = doc.settings;
  const count = doc.things.length;
  const currency = CURRENCIES.find((k) => k.code === s.currency);
  const blocked = DELIVERS && s.reminders && allowed === 'denied';

  const toggleReminders = async (on: boolean) => {
    if (!on) {
      reminders.turnOff();
      return;
    }
    const result = await reminders.turnOn();
    if (result === 'denied') await notify('Notifications are off for Plainkeep', 'Allow them in the Settings app, under Plainkeep, and reminders will start arriving.');
  };

  const pickLead = async () => {
    const picked = await choose({ title: 'First reminder', choices: LEAD_CHOICES.map((d) => ({ key: String(d), label: leadText(d) })) });
    if (picked) store.update((d, now) => setSettings(d, { leadDays: Number(picked) }, now));
  };

  const pickCurrency = async () => {
    const picked = await choose({ title: 'Currency for costs', choices: CURRENCIES.map((k) => ({ key: k.code, label: `${k.name} (${k.code})` })) });
    if (picked) store.update((d, now) => setSettings(d, { currency: picked }, now));
  };

  const restorePurchase = async () => {
    if (!proState.storeOpen) {
      await notify('Purchases aren’t switched on in this build', 'There is nothing to restore here. In the App Store version this brings back Pro on a new iPhone.');
      return;
    }
    const result = await pro.restore();
    if (result === 'restored') {
      success();
      await notify('Pro is back', 'Thank you. Add as many things as you have.');
    } else if (result === 'nothing') {
      await notify('No purchase found', 'This Apple Account hasn’t bought Plainkeep Pro.');
    } else {
      await notify('The App Store couldn’t be reached', 'Check your connection and try again.');
    }
  };

  const run = async (work: () => Promise<void>, failed: string) => {
    if (working) return;
    setWorking(true);
    try {
      await work();
    } catch {
      await notify(failed, 'Try again in a moment.');
    } finally {
      setWorking(false);
    }
  };

  const restore = () =>
    run(async () => {
      const result = await chooseBackup();
      if (!result.ok) {
        if (!result.cancelled) {
          const text = restoreProblemText(result.problem);
          await notify(text.title, text.message);
        }
        return;
      }
      const d = result.doc;
      const sure = await confirm({
        title: 'Replace what is on this iPhone?',
        message: `The backup has ${d.things.length} ${d.things.length === 1 ? 'thing' : 'things'}, ${d.jobs.length} ${d.jobs.length === 1 ? 'job' : 'jobs'} and ${d.entries.length} log ${d.entries.length === 1 ? 'entry' : 'entries'}. Everything here now is replaced by it.`,
        confirmLabel: 'Replace',
        destructive: count > 0,
      });
      if (!sure) return;
      await applyRestore(d);
      success();
      await notify('Backup restored', 'Everything in it is back.');
    }, 'The backup couldn’t be restored');

  const sample = async (size: 'starter' | 'full') => {
    if (count > 0) {
      const sure = await confirm({ title: 'Replace everything with the sample?', message: 'What is here now will be deleted.', confirmLabel: 'Replace', destructive: true });
      if (!sure) return;
    }
    const loaded = await loadSample(size);
    success();
    await notify('Sample household loaded', `${loaded.things.length} things, ${loaded.jobs.length} jobs.`);
  };

  const erase = async () => {
    const sure = await confirm({
      title: 'Erase everything?',
      message: 'Every thing, job and log entry on this iPhone will be deleted. A backup, if you made one, is not touched.',
      confirmLabel: 'Erase everything',
      destructive: true,
    });
    if (!sure) return;
    warning();
    await eraseEverything();
    router.replace('/welcome');
  };

  return (
    <TabScreen testID="settings-screen" title="Settings">
      <Card>
        <Row
          testID="pro-row"
          leading={<IconPlate name="key" size={36} />}
          title="Plainkeep Pro"
          subtitle={proState.isPro ? 'Unlocked. Look after as many things as you have.' : count > FREE_THING_LIMIT ? `${count} things. Free covers ${FREE_THING_LIMIT}; all of them keep working.` : `${count} of ${FREE_THING_LIMIT} free things used`}
          chevron
          onPress={() => router.push('/pro')}
        />
        <Divider />
        <Row testID="restore-purchase" title="Restore purchase" tint onPress={restorePurchase} />
      </Card>

      <SectionLabel>Reminders</SectionLabel>
      <Card>
        <SwitchRow testID="reminders-switch" label="Reminders" value={s.reminders} onChange={toggleReminders} />
        {s.reminders ? (
          <>
            <Divider />
            <Row testID="lead" title="First reminder" value={leadText(s.leadDays)} chevron onPress={pickLead} />
            <Divider />
            <FormRow label="Time of day" testID="remind-time-row">
              <TimeField testID="remind-time" hour={s.remindHour} minute={s.remindMinute} onChange={(remindHour, remindMinute) => store.update((d, now) => setSettings(d, { remindHour, remindMinute }, now))} />
            </FormRow>
            <Divider />
            <Row testID="coming" title="Upcoming reminders" chevron onPress={() => router.push('/coming')} />
          </>
        ) : null}
        {blocked ? (
          <>
            <Divider />
            <Row testID="open-system-settings" title="Allow notifications in Settings" subtitle="They are switched off for Plainkeep, so nothing can arrive." subtitleTone="amber" tint onPress={openSystemSettings} />
          </>
        ) : null}
      </Card>
      <Footnote>
        {s.reminders
          ? `You get a reminder ${leadText(s.leadDays).toLowerCase()}, again on the day at ${displayClock(s.remindHour, s.remindMinute)}, and twice more if the job slips. A job can have its own timing.`
          : 'With reminders on, you get one before a job is due and one on the day.'}
      </Footnote>

      <SectionLabel>Units</SectionLabel>
      <Card>
        <Segmented
          testID="distance-unit"
          value={s.distanceUnit}
          onChange={(distanceUnit) => store.update((d, now) => setSettings(d, { distanceUnit }, now))}
          options={[
            { key: 'mi', label: 'Miles' },
            { key: 'km', label: 'Kilometers' },
          ]}
        />
        <Divider />
        <Row testID="currency" title="Currency" value={currency ? currency.code : s.currency} chevron onPress={pickCurrency} />
      </Card>
      <Footnote>Readings and costs you have already entered are not converted.</Footnote>

      <SectionLabel>Your data</SectionLabel>
      <Card>
        <Row testID="backup" title="Back up" subtitle="One file with everything, saved wherever you choose" tint onPress={() => run(backUp, 'The backup couldn’t be made')} />
        <Divider />
        <Row testID="restore" title="Restore from a backup" tint onPress={restore} />
        <Divider />
        <Row testID="export-log" title="Export the log" subtitle="A spreadsheet of everything that was done" tint onPress={() => run(exportLog, 'The log couldn’t be exported')} />
        <Divider />
        <Row testID="erase-everything" title="Erase everything" destructive onPress={erase} />
      </Card>
      <Footnote>Plainkeep has no account and no servers. Your log never leaves this iPhone unless you export or back it up yourself.</Footnote>

      <SectionLabel>About</SectionLabel>
      <Card>
        <Row testID="privacy" title="Privacy policy" chevron onPress={() => void Linking.openURL(PRIVACY_URL)} />
        <Divider />
        <Row testID="support" title="Help and support" chevron onPress={() => void Linking.openURL(SUPPORT_URL)} />
        <Divider />
        <Row title="Version" value={appVersion()} />
      </Card>

      {DEV_TOOLS ? (
        <>
          <SectionLabel>Developer</SectionLabel>
          <Card>
            <SwitchRow testID="dev-pretend-pro" label="Pretend Pro is bought" value={proState.pretend} onChange={(on) => pro.setPretend(on)} />
            <Divider />
            <Row testID="dev-sample" title="Load the sample household" subtitle="A home, two vehicles and a mower" tint onPress={() => sample('full')} />
            <Divider />
            <Row testID="dev-sample-starter" title="Load a home and a car" subtitle="Fits the free version" tint onPress={() => sample('starter')} />
          </Card>
          <Footnote>This section is only in test builds and the web preview. It is not in the App Store version.</Footnote>
        </>
      ) : null}
    </TabScreen>
  );
}

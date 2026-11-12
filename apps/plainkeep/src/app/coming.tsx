import { Fragment, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { displayClock, shortYmd, toYmd, weekdayName } from '@/domain/dates';
import type { Planned } from '@/domain/reminders';
import { DELIVERS, openSystemSettings } from '@/platform/notify';
import { currentPlan, useReminderPermission } from '@/state/reminders';
import { useDoc } from '@/state/store';
import { Card, Divider, EmptyState, Footnote, LinkText, Notice, PushedScreen } from '@/ui/kit';
import { NO_ORPHAN, space, type, useTheme } from '@/ui/theme';

// What the iPhone has waiting. It is here so nobody has to take reminders on trust.

export default function Coming() {
  const { c } = useTheme();
  const doc = useDoc();
  const allowed = useReminderPermission();
  const [plan, setPlan] = useState<Planned[]>([]);

  useEffect(() => {
    // Shortly after, so the reminders have had the same change.
    const timer = setTimeout(() => setPlan(currentPlan()), 50);
    return () => clearTimeout(timer);
  }, [doc, allowed]);

  const blocked = DELIVERS && doc.settings.reminders && allowed === 'denied';
  // The next reminder for each job. The ones after it follow by themselves.
  const seen = new Set<string>();
  const next = plan.filter((p) => {
    // A shared reminder is listed when it brings at least one job not already above it.
    const who = p.jobIds ?? [p.jobId ?? p.title];
    if (who.every((id) => seen.has(id))) return false;
    for (const id of who) seen.add(id);
    return true;
  });
  const clock = displayClock(doc.settings.remindHour, doc.settings.remindMinute);

  return (
    <PushedScreen testID="coming-screen">
      {!DELIVERS ? <Notice testID="coming-web-note">This is the web preview: it shows what the iPhone app would have waiting, and delivers nothing itself.</Notice> : null}
      {blocked ? (
        <Notice testID="coming-blocked" icon="bellOff" tone="amber" action={<LinkText label="Open Settings" onPress={openSystemSettings} />}>
          Notifications are off for Plainkeep in the iPhone’s Settings, so nothing can arrive. Allow them there and the reminders appear here.
        </Notice>
      ) : null}
      {next.length === 0 ? (
        blocked ? null : <EmptyState title="Nothing is waiting" body={doc.settings.reminders ? 'Reminders appear here as jobs get near their dates.' : 'Reminders are off. Turn them on in Settings.'} />
      ) : (
        <>
          <Footnote style={{ marginTop: space.l }}>What arrives next, at {clock}. Jobs due at the same time share one reminder. A job gets another on the day it is due, and two more if it slips.</Footnote>
          <Card style={{ marginTop: space.m }}>
            {next.map((p, i) => {
              const ymd = toYmd(new Date(p.fireAt));
              return (
                <Fragment key={p.key}>
                  {i > 0 ? <Divider /> : null}
                  <View testID={`planned-${i}`} style={{ paddingHorizontal: space.l, paddingVertical: 11 }}>
                    <Text style={[type.footnote, type.tabular, { color: c.ink2 }]}>
                      {weekdayName(ymd)}, {shortYmd(ymd, toYmd(new Date()))}
                      {p.kind === 'after' ? ' · if it isn’t done' : ''}
                    </Text>
                    <Text style={[type.body, NO_ORPHAN, { color: c.ink, fontWeight: '600', marginTop: 1 }]}>{p.title}</Text>
                    <Text style={[type.subhead, { color: c.ink2 }]}>{p.body}</Text>
                  </View>
                </Fragment>
              );
            })}
          </Card>
          <Footnote>These are worked out again whenever something is done, added or changed. The iPhone keeps the nearest ones.</Footnote>
        </>
      )}
    </PushedScreen>
  );
}

import { Fragment, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { dayOfMonth, displayClock, monthAbbr, toYmd, weekdayName } from '@/domain/dates';
import type { Planned } from '@/domain/reminders';
import { DELIVERS } from '@/platform/notify';
import { currentPlan } from '@/state/reminders';
import { useDoc } from '@/state/store';
import { Card, Divider, EmptyState, Footnote, Notice, PushedScreen } from '@/ui/kit';
import { NO_ORPHAN, space, type, useTheme } from '@/ui/theme';

// What the iPhone has waiting. It is here so nobody has to take reminders on trust.

export default function Coming() {
  const { c } = useTheme();
  const doc = useDoc();
  const [plan, setPlan] = useState<Planned[]>([]);

  useEffect(() => {
    // Shortly after, so the reminders have had the same change.
    const timer = setTimeout(() => setPlan(currentPlan()), 50);
    return () => clearTimeout(timer);
  }, [doc]);

  return (
    <PushedScreen testID="coming-screen">
      {!DELIVERS ? <Notice testID="coming-web-note">This is the web preview: it shows what the iPhone app would have waiting, and delivers nothing itself.</Notice> : null}
      {plan.length === 0 ? (
        <EmptyState title="Nothing is waiting" body={doc.settings.reminders ? 'Reminders appear here as jobs get near their dates.' : 'Reminders are off. Turn them on in Settings.'} />
      ) : (
        <>
          <Card style={{ marginTop: space.l }}>
            {plan.map((p, i) => {
              const at = new Date(p.fireAt);
              const ymd = toYmd(at);
              return (
                <Fragment key={p.key}>
                  {i > 0 ? <Divider /> : null}
                  <View testID={`planned-${i}`} style={{ paddingHorizontal: space.l, paddingVertical: 11 }}>
                    <Text style={[type.footnote, type.tabular, { color: c.ink2 }]}>
                      {weekdayName(ymd).slice(0, 3)} {monthAbbr(ymd)} {dayOfMonth(ymd)}, {displayClock(at.getHours(), at.getMinutes())}
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

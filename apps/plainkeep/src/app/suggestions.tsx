import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addJob } from '@/domain/actions';
import { distanceText, intervalText } from '@/domain/labels';
import { templateDistance, templatesFor, type Template } from '@/domain/templates';
import type { DistanceUnit } from '@/domain/types';
import { success, tap } from '@/platform/haptics';
import { store, useDoc } from '@/state/store';
import { Icon } from '@/ui/Icon';
import { BarButton, Button, Card, Divider, Footnote } from '@/ui/kit';
import { HAIRLINE, space, type, useTheme } from '@/ui/theme';

function how(t: Template, unit: DistanceUnit): string {
  const d = templateDistance(t, unit);
  const time = t.every ? intervalText(t.every) : null;
  if (d !== null && time) return `Every ${distanceText(d, unit)} or ${time.replace(/^Every /, '')}`;
  if (d !== null) return `Every ${distanceText(d, unit)}`;
  return time ?? 'Once';
}

export default function Suggestions() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ thingId?: string; fresh?: string }>();
  const doc = useDoc();
  const thing = doc.things.find((t) => t.id === params.thingId);
  const unit = doc.settings.distanceUnit;
  const templates = thing ? templatesFor(thing.kind) : [];
  const have = new Set(doc.jobs.filter((j) => j.thingId === thing?.id).map((j) => j.name.toLowerCase()));
  const fresh = params.fresh === '1';
  const [picked, setPicked] = useState<Set<string>>(() => new Set(fresh ? templates.filter((t) => t.common && !have.has(t.name.toLowerCase())).map((t) => t.key) : []));

  const leave = () => {
    if (thing && fresh) router.replace({ pathname: '/thing/[id]', params: { id: thing.id } });
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (!thing) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, padding: space.xxl }}>
        <Stack.Screen options={{ headerLeft: () => <BarButton label="Close" onPress={leave} /> }} />
        <Text style={[type.body, { color: c.ink2 }]}>That is no longer here.</Text>
      </View>
    );
  }

  const toggle = (key: string) => {
    tap();
    setPicked((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const add = () => {
    const chosen = templates.filter((t) => picked.has(t.key) && !have.has(t.name.toLowerCase()));
    store.update((d, now) => {
      let next = d;
      for (const t of chosen) {
        next = addJob(next, { thingId: thing.id, name: t.name, note: '', every: t.every, everyDistance: templateDistance(t, unit), anchor: t.fixed ? 'fixed' : 'done', leadDays: null }, now);
      }
      return next;
    });
    if (chosen.length > 0) success();
    leave();
  };

  const count = templates.filter((t) => picked.has(t.key) && !have.has(t.name.toLowerCase())).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ title: `Jobs for ${thing.name}`, headerLeft: () => <BarButton testID="suggest-skip" label={fresh ? 'Skip' : 'Cancel'} onPress={leave} /> }} />
      <ScrollView testID="suggestions" contentContainerStyle={{ paddingTop: space.m, paddingBottom: space.xl }}>
        <Footnote style={{ marginTop: 0, marginBottom: space.m }}>
          Check the ones that apply. The intervals are the usual ones; your manual has the last word, and each can be changed later.
        </Footnote>
        <Card>
          {templates.map((t, i) => {
            const added = have.has(t.name.toLowerCase());
            const on = picked.has(t.key);
            return (
              <View key={t.key}>
                {i > 0 ? <Divider inset={space.l + 24 + space.m} /> : null}
                <Pressable
                  testID={`suggest-${t.key}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: added || on, disabled: added }}
                  accessibilityLabel={`${t.name}, ${how(t, unit)}`}
                  disabled={added}
                  onPress={() => toggle(t.key)}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 10, minHeight: 56 }, pressed ? { backgroundColor: c.sunk } : null]}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: on || added ? 0 : 2,
                      borderColor: c.ink3,
                      backgroundColor: added ? c.ink3 : on ? c.button : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {on || added ? <Icon name="check" size={14} color={c.onButton} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.body, { color: added ? c.ink2 : c.ink }]} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={[type.footnote, { color: c.ink2 }]} numberOfLines={1}>
                      {added ? 'Already on the list' : how(t, unit)}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </Card>
        <Footnote>New jobs wait under “Not logged yet”. Tap a job’s ring when you do it. Already done it? Tap now and enter the date.</Footnote>
      </ScrollView>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.m, paddingBottom: insets.bottom + space.m, borderTopWidth: HAIRLINE, borderTopColor: c.rule, backgroundColor: c.page }}>
        <Button testID="suggest-add" label={count === 0 ? 'Add none for now' : `Add ${count} ${count === 1 ? 'job' : 'jobs'}`} onPress={add} />
      </View>
    </View>
  );
}

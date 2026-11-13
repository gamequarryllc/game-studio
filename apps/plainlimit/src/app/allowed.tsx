import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ALLOWED_MAX } from '@/domain/settings';
import { tap } from '@/platform/haptics';
import { ALLOWED_ID, SCREEN_TIME_AVAILABLE, pickCount } from '@/platform/screenTime';
import type { CountMode } from '@/domain/types';
import { store, useDoc } from '@/state/store';
import { AppPicker } from '@/ui/AppPicker';
import { BigButton, Card, Lead, Page, Title } from '@/ui/kit';
import { c, display } from '@/ui/theme';

export default function Allowed() {
  const { settings } = useDoc();
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  const full = settings.allowed.length >= ALLOWED_MAX;

  const add = () => {
    store.addAllowed(name);
    setName('');
  };

  // On a real iPhone the apps are ticked in Apple's own list; the app only learns how many.
  if (SCREEN_TIME_AVAILABLE) {
    const picked = pickCount(ALLOWED_ID);
    return (
      <Page top={8}>
        <Title>Always allowed</Title>
        <Lead>These never lock, even when the battery is empty.</Lead>
        <Card style={{ paddingVertical: 16 }}>
          <Text style={styles.body}>
            {picked === 0 ? 'Nothing is allowed through yet. Tick Phone and Messages at least, for emergencies.' : picked === 1 ? '1 app is allowed through.' : `${picked} apps are allowed through.`}
          </Text>
        </Card>
        <BigButton label={picked === 0 ? 'Choose apps' : 'Change the apps'} onPress={() => setPicking(true)} />
        <Text style={styles.note}>{stillCounts(settings.countMode)}</Text>
        <AppPicker
          id={ALLOWED_ID}
          open={picking}
          header="Tick what always opens"
          onClose={() => {
            setPicking(false);
            store.picksChanged();
          }}
        />
      </Page>
    );
  }

  return (
    <Page top={8}>
      <Title>Always allowed</Title>
      <Lead>These never lock, even when the battery is empty.</Lead>
      <Text style={styles.note}>{stillCounts(settings.countMode)}</Text>

      {settings.allowed.length === 0 ? (
        <Card style={{ paddingVertical: 16 }}>
          <Text style={styles.body}>Nothing is allowed through. Add Phone at least, for emergencies.</Text>
        </Card>
      ) : (
        <Card>
          {settings.allowed.map((app, i) => (
            <View key={app} style={[styles.row, i === settings.allowed.length - 1 ? null : styles.rule]}>
              <View style={styles.tile}>
                <Text style={styles.tileText}>{app.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text numberOfLines={1} style={styles.name}>
                {app}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${app}`}
                hitSlop={8}
                onPress={() => {
                  tap();
                  store.removeAllowed(app);
                }}
                style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }, pressed ? { opacity: 0.6 } : null]}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: c.ink3 }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {SCREEN_TIME_AVAILABLE ? null : full ? (
        <Text style={styles.note}>That is the most this list holds. Remove one to add another.</Text>
      ) : (
        <View style={{ gap: 10, marginTop: 6 }}>
          <Text nativeID="add-label" style={styles.fieldLabel}>
            Add an app
          </Text>
          <TextInput
            accessibilityLabelledBy="add-label"
            aria-labelledby="add-label"
            value={name}
            onChangeText={setName}
            onSubmitEditing={add}
            placeholder="Its name"
            placeholderTextColor={c.ink3}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            maxLength={40}
            style={styles.input}
          />
          <BigButton label="Add" onPress={add} />
          <Text style={styles.note}>On an iPhone this opens Apple&apos;s own list of your apps instead of asking for a name.</Text>
        </View>
      )}
    </Page>
  );
}

/** Whether time in an always-allowed app still uses up the battery, which depends on What counts. */
function stillCounts(mode: CountMode): string {
  return mode === 'everything'
    ? 'They still use up the battery: What counts is set to Everything, so time in any app counts. They just never lock.'
    : 'Time in them uses up the battery only if you also ticked them in What counts. Either way they never lock.';
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  tile: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#34383D', alignItems: 'center', justifyContent: 'center' },
  tileText: { fontFamily: display.semi, fontSize: 17, color: '#C3C7CB' },
  name: { flex: 1, fontSize: 16, fontWeight: '500', color: c.ink },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: c.ink3 },
  input: { height: 56, borderRadius: 16, borderWidth: 2, borderColor: c.outline, backgroundColor: c.card, color: c.ink, paddingHorizontal: 16, fontSize: 17 },
});

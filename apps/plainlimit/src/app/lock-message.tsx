import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { emptyCopy } from '@/domain/shield';
import { LOCK_MESSAGE_IDEAS, LOCK_MESSAGE_MAX, isLockMessageIdea } from '@/domain/settings';
import { tap } from '@/platform/haptics';
import { usePro } from '@/pro/pro';
import { store } from '@/state/store';
import { Card, Label, Lead, Page, Title } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// Settings > Do more > Lock message: words on the screen that covers an app
// once the battery is empty (shield.ts). The ready-made messages come first
// and are free; words of one's own come second and are Pro (the owner,
// 2026-11-21: "see the defaults, and then change it if they're Pro"). Up to
// build 116 the text box came first and was free.

export default function LockMessage() {
  const router = useRouter();
  const { settings, day, accent } = useDay();
  const isPro = usePro().isPro;
  // Typed text is kept here and saved as it changes, so the cursor never jumps.
  const [text, setText] = useState(settings.lockMessage ?? '');
  const change = (next: string) => {
    const one = next.replace(/\n/g, ' ').slice(0, LOCK_MESSAGE_MAX);
    setText(one);
    store.setLockMessage(one);
  };
  const preview = emptyCopy({ ...settings, lockMessage: text }, day.topUps);
  // Words of one's own: what is in the box, unless it is one of the ready-made ones.
  const own = isLockMessageIdea(text) ? '' : text;

  return (
    <Page header top={8}>
      <Title>Lock message</Title>
      <Lead>A few words on the screen you see when an app is locked. Something future you will listen to.</Lead>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 8 }}>
        <Label>Pick one</Label>
        <Idea words="No message" chosen={text === ''} accent={accent} onPress={() => change('')} />
        {LOCK_MESSAGE_IDEAS.map((idea) => (
          <Idea key={idea} words={idea} chosen={text === idea} accent={accent} onPress={() => change(idea)} />
        ))}
      </Card>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 10 }}>
        <Label>Or write your own</Label>
        {isPro ? (
          <>
            <TextInput
              testID="lock-message-input"
              accessibilityLabel="Your own message"
              value={own}
              onChangeText={change}
              placeholder="Your own words"
              placeholderTextColor={c.ink3}
              multiline
              maxLength={LOCK_MESSAGE_MAX}
              returnKeyType="done"
              blurOnSubmit
              style={[styles.input, { borderColor: own ? accent : c.outline }]}
            />
            <View style={styles.counter}>
              <Text style={styles.small}>Shows when the battery is empty</Text>
              <Text style={styles.small}>
                {own.length} / {LOCK_MESSAGE_MAX}
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* Typed before this was Pro: it stays, and can be swapped for a ready-made one. */}
            {own ? <Text style={styles.kept}>{`\u201C${own}\u201D`}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Write your own, Pro"
              onPress={() => {
                tap();
                router.push('/pro');
              }}
              style={({ pressed }) => [styles.idea, styles.proRow, pressed ? { opacity: 0.7 } : null]}>
              <Text style={styles.ideaText}>Write your own</Text>
              <Text style={styles.proTag}>Pro</Text>
            </Pressable>
          </>
        )}
      </Card>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 6 }}>
        <Label>The locked app will say</Label>
        <Text style={styles.previewTitle}>{preview.title}</Text>
        <Text testID="lock-message-preview" style={styles.previewLine}>
          {preview.line}
        </Text>
      </Card>
    </Page>
  );
}

function Idea({ words, chosen, accent, onPress }: { words: string; chosen: boolean; accent: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.idea, chosen ? { borderColor: accent } : null, pressed ? { opacity: 0.7 } : null]}>
      <Text style={styles.ideaText}>{words}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 84, borderRadius: 16, borderWidth: 2, backgroundColor: c.ground, color: c.ink, padding: 14, fontSize: 17, lineHeight: 23, textAlignVertical: 'top' },
  counter: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  small: { fontSize: 13, color: c.ink3 },
  idea: { backgroundColor: c.raised, borderRadius: 14, borderWidth: 2, borderColor: c.raised, paddingVertical: 12, paddingHorizontal: 14, minHeight: 48, justifyContent: 'center' },
  ideaText: { flex: 1, fontSize: 15, lineHeight: 20, color: c.ink },
  proRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  proTag: { fontSize: 13, fontWeight: '700', color: c.ink3 },
  kept: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  previewTitle: { fontFamily: display.semi, fontSize: 20, color: c.ink },
  previewLine: { fontSize: 15, lineHeight: 21, color: c.ink2 },
});

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { emptyCopy } from '@/domain/shield';
import { LOCK_MESSAGE_MAX } from '@/domain/settings';
import { tap } from '@/platform/haptics';
import { store } from '@/state/store';
import { Card, Label, Lead, Page, Title } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// Settings > Advanced > Lock message (Pro): the person's own words on the
// screen that covers an app once the battery is empty (shield.ts).

const IDEAS = ['What were you about to do instead?', 'You set this limit for a reason.', 'Text someone you miss.', 'Go outside. The feed will still be there tomorrow.'];

export default function LockMessage() {
  const { settings, day, accent } = useDay();
  // Typed text is kept here and saved as it changes, so the cursor never jumps.
  const [text, setText] = useState(settings.lockMessage ?? '');
  const change = (next: string) => {
    const one = next.replace(/\n/g, ' ').slice(0, LOCK_MESSAGE_MAX);
    setText(one);
    store.setLockMessage(one);
  };
  const preview = emptyCopy({ ...settings, lockMessage: text }, day.topUps);

  return (
    <Page top={8}>
      <Title>Lock message</Title>
      <Lead>Your own words on the screen you see when an app is locked. Something future you will listen to.</Lead>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 10 }}>
        <Label>Your message</Label>
        <TextInput
          testID="lock-message-input"
          accessibilityLabel="Your message"
          value={text}
          onChangeText={change}
          placeholder="Leave empty for no message"
          placeholderTextColor={c.ink3}
          multiline
          maxLength={LOCK_MESSAGE_MAX}
          returnKeyType="done"
          blurOnSubmit
          style={[styles.input, { borderColor: text ? accent : c.outline }]}
        />
        <View style={styles.counter}>
          <Text style={styles.small}>Shows when the battery is empty</Text>
          <Text style={styles.small}>
            {text.length} / {LOCK_MESSAGE_MAX}
          </Text>
        </View>
      </Card>

      <Card style={{ paddingTop: 14, paddingBottom: 16, gap: 8 }}>
        <Label>Or pick one</Label>
        {IDEAS.map((idea) => (
          <Pressable
            key={idea}
            accessibilityRole="button"
            onPress={() => {
              tap();
              change(idea);
            }}
            style={({ pressed }) => [styles.idea, pressed ? { opacity: 0.7 } : null]}>
            <Text style={styles.ideaText}>{idea}</Text>
          </Pressable>
        ))}
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

const styles = StyleSheet.create({
  input: { minHeight: 84, borderRadius: 16, borderWidth: 2, backgroundColor: c.ground, color: c.ink, padding: 14, fontSize: 17, lineHeight: 23, textAlignVertical: 'top' },
  counter: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  small: { fontSize: 13, color: c.ink3 },
  idea: { backgroundColor: c.raised, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  ideaText: { fontSize: 15, lineHeight: 20, color: c.ink },
  previewTitle: { fontFamily: display.semi, fontSize: 20, color: c.ink },
  previewLine: { fontSize: 15, lineHeight: 21, color: c.ink2 },
});

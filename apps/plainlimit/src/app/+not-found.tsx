import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { BigButton } from '@/ui/kit';
import { c, display } from '@/ui/theme';

export default function NotFound() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, padding: 24, justifyContent: 'center', gap: 16 }}>
      <Text accessibilityRole="header" style={{ fontFamily: display.bold, fontSize: 30, lineHeight: 36, color: c.ink }}>
        That page isn&apos;t here
      </Text>
      <BigButton label="Back to Today" onPress={() => router.replace('/')} />
    </View>
  );
}

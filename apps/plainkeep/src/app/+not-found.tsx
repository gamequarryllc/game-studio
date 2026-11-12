import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, EmptyState } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function NotFound() {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: c.page, justifyContent: 'center' }}>
      <EmptyState title="That page isn’t here" body="It may have been deleted, or the link was mistyped." action={<Button label="Back to what’s due" onPress={() => router.replace('/')} />} />
    </View>
  );
}

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, EmptyState } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function NotFound() {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center' }}>
      <EmptyState
        icon="box"
        title="That page isn’t here"
        body="It may have been deleted, or the link was mistyped."
        action={<Button label="Back to my rooms" onPress={() => router.replace('/')} />}
      />
    </View>
  );
}

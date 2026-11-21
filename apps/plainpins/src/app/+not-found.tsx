import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { space, type, useTheme } from '@/ui/theme';

export default function NotFound() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, backgroundColor: c.page }}>
      <Text style={[type.title, { color: c.ink, textAlign: 'center' }]}>That page isn’t on the map</Text>
      <Link href="/" style={[type.body, { color: c.accent, marginTop: space.l }]}>
        Back to the map
      </Link>
    </View>
  );
}

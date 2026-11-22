import { Text, View } from 'react-native';

import { Card, Lead, Page, Title } from '@/ui/kit';
import { c } from '@/ui/theme';
import { TipDemo } from '@/ui/tipDemos/demos';
import { TIPS } from '@/ui/tips';

// Reached from Settings. Advice only: nothing here changes how the battery counts.
// Each card opens with a small looping demo of its tip.

export default function Tips() {
  return (
    <Page header top={8}>
      <Title>Use your phone less</Title>
      <Lead>The battery sets the limit. These make it easier to stay under it.</Lead>
      {TIPS.map((tip, i) => (
        <Card key={tip.title} style={{ paddingVertical: 16, gap: 14 }}>
          <TipDemo name={tip.demo} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ fontSize: 17, lineHeight: 23, fontWeight: '700', color: c.ink3, width: 20 }}>{i + 1}</Text>
            <View style={{ flex: 1, gap: 6 }}>
              <Text accessibilityRole="header" style={{ fontSize: 17, lineHeight: 23, fontWeight: '700', color: c.ink }}>
                {tip.title}
              </Text>
              <Text style={{ fontSize: 15, lineHeight: 21, color: c.ink2 }}>{tip.why}</Text>
              {tip.how ? <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>{tip.how}</Text> : null}
            </View>
          </View>
        </Card>
      ))}
    </Page>
  );
}

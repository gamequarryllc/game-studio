import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setItemLoss } from '@/domain/actions';
import { formatMoney } from '@/domain/money';
import { hasValue, itemTotalCents, plural } from '@/domain/selectors';
import { LOSS_LABELS, LOSS_STATUSES, type Item, type LossStatus } from '@/domain/types';
import { tick } from '@/platform/haptics';
import { store, useDoc } from '@/state/store';
import { Icon } from '@/ui/Icon';
import { BarButton, Card, Chip, Divider, EmptyState, Footnote, SectionLabel, Thumb } from '@/ui/kit';
import { radius, space, type, useTheme } from '@/ui/theme';

// Choosing the items a claim covers: tap to add (with the status picked at the top), tap again to take out.
// After a fire it can be a whole room, so each room can be added at once.

export default function ClaimItemsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const doc = useDoc();
  const [status, setStatus] = useState<LossStatus>('stolen');
  const currency = doc.settings.currency;
  const marked = doc.items.filter((i) => i.loss).length;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/claim');
  };

  const toggle = (item: Item) => {
    tick();
    store.update((d, now) => setItemLoss(d, item.id, item.loss ? null : status, undefined, now));
  };

  const toggleRoom = (items: Item[]) => {
    tick();
    const all = items.every((i) => i.loss);
    store.update((d, now) => items.reduce((acc, i) => (all ? setItemLoss(acc, i.id, null, undefined, now) : i.loss ? acc : setItemLoss(acc, i.id, status, undefined, now)), d));
  };

  const groups = doc.rooms.map((room) => ({ room, items: doc.items.filter((i) => i.roomId === room.id) })).filter((g) => g.items.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <Stack.Screen options={{ title: 'Items in the claim', headerRight: () => <BarButton testID="claim-items-done" label="Done" bold onPress={close} /> }} />
      {groups.length === 0 ? (
        <EmptyState icon="box" title="Nothing to claim yet" body="Items you add to your inventory can be marked for a claim here." />
      ) : (
        <ScrollView testID="claim-items" contentContainerStyle={{ paddingTop: space.m, paddingBottom: insets.bottom + space.huge }}>
          <Text style={[type.footnote, { color: c.ink2, marginHorizontal: space.xl + space.l, marginBottom: space.s }]}>Tap an item to add it as</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.xl }}>
            {LOSS_STATUSES.map((k) => (
              <Chip key={k} testID={`claim-status-${k}`} label={LOSS_LABELS[k]} selected={status === k} onPress={() => setStatus(k)} />
            ))}
          </ScrollView>
          <Footnote>{marked === 0 ? 'Nothing is in the claim yet.' : `${plural(marked, 'item')} in the claim. Tap one again to take it out.`}</Footnote>

          {groups.map(({ room, items }) => {
            const all = items.every((i) => i.loss);
            return (
              <View key={room.id}>
                <SectionLabel
                  trailing={
                    <Text testID={`claim-room-${room.id}`} accessibilityRole="button" onPress={() => toggleRoom(items)} style={[type.footnote, { color: c.green, fontWeight: '600' }]}>
                      {all ? 'Take out all' : `All as ${LOSS_LABELS[status].toLowerCase()}`}
                    </Text>
                  }>
                  {room.name}
                </SectionLabel>
                <Card>
                  {items.map((item, i) => (
                    <View key={item.id}>
                      {i > 0 ? <Divider inset={space.l + 24 + space.m} /> : null}
                      <Pressable
                        testID={`claim-pick-${item.id}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: item.loss !== null }}
                        accessibilityLabel={`${item.name}${item.loss ? `, ${LOSS_LABELS[item.loss]}` : ''}`}
                        onPress={() => toggle(item)}
                        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 9, minHeight: 56 }, pressed ? { backgroundColor: c.sunk } : null]}>
                        <Icon name={item.loss ? 'checkCircle' : 'circle'} size={24} color={item.loss ? c.green : c.ink3} />
                        <Thumb photoId={item.photos[0]?.id} size={40} rounded={radius.s} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.body, { color: c.ink }]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={[type.footnote, { color: item.loss ? c.green : c.ink2, fontWeight: item.loss ? '600' : '400' }]} numberOfLines={1}>
                            {item.loss ? LOSS_LABELS[item.loss] : 'Not in the claim'}
                          </Text>
                        </View>
                        <Text style={[type.body, type.tabular, { color: hasValue(item) ? c.ink2 : c.amber }]}>{hasValue(item) ? formatMoney(itemTotalCents(item), currency, { whole: true }) : 'No value'}</Text>
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

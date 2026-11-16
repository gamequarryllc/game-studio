import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { findClaim, setClaimItem } from '@/domain/actions';
import { formatMoney } from '@/domain/money';
import { claimTitle, hasValue, itemTotalCents, plural } from '@/domain/selectors';
import { LOSS_LABELS, LOSS_STATUSES, type Claim, type Item, type LossStatus } from '@/domain/types';
import { tick } from '@/platform/haptics';
import { store, useDoc } from '@/state/store';
import { Icon } from '@/ui/Icon';
import { BarButton, Card, Chip, Divider, EmptyState, Footnote, SectionLabel, Thumb } from '@/ui/kit';
import { radius, space, type, useTheme } from '@/ui/theme';

// Choosing the items one claim covers: tap to add (with the status picked at the top), tap again to take out.
// After a fire it can be a whole room, so each room can be added at once. An item already in another
// claim says so, and can still be added: the same thing can be damaged in one incident and stolen in another.

export default function ClaimItemsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const doc = useDoc();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<LossStatus>('stolen');
  const currency = doc.settings.currency;
  const claim = findClaim(doc, typeof id === 'string' ? id : null);
  const claimId = claim?.id ?? '';
  const lossOf = new Map((claim?.items ?? []).map((e) => [e.itemId, e.loss]));
  const otherClaims = doc.claims.filter((x) => x.id !== claimId);
  const elsewhere = (item: Item) => otherClaims.find((x) => x.items.some((e) => e.itemId === item.id)) ?? null;
  const marked = doc.items.filter((i) => lossOf.has(i.id)).length;

  const close = () => {
    if (router.canGoBack()) router.back();
    else if (claimId) router.replace({ pathname: '/claim/[id]', params: { id: claimId } });
    else router.replace('/report');
  };

  const toggle = (item: Item) => {
    tick();
    store.update((d) => setClaimItem(d, claimId, item.id, lossOf.has(item.id) ? null : status));
  };

  const toggleRoom = (items: Item[]) => {
    tick();
    const all = items.every((i) => lossOf.has(i.id));
    store.update((d) => items.reduce((acc, i) => (all ? setClaimItem(acc, claimId, i.id, null) : lossOf.has(i.id) ? acc : setClaimItem(acc, claimId, i.id, status)), d));
  };

  const groups = doc.rooms.map((room) => ({ room, items: doc.items.filter((i) => i.roomId === room.id) })).filter((g) => g.items.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <Stack.Screen options={{ title: 'Items in the claim', headerRight: () => <BarButton testID="claim-items-done" label="Done" bold onPress={close} /> }} />
      {!claim ? (
        <EmptyState icon="report" title="This claim has ended" body="Your items are still in your inventory." />
      ) : groups.length === 0 ? (
        <EmptyState icon="box" title="Nothing to claim yet" body="Items you add to your inventory can be marked for a claim here." />
      ) : (
        <ScrollView testID="claim-items" contentContainerStyle={{ paddingTop: space.m, paddingBottom: insets.bottom + space.huge }}>
          {otherClaims.length > 0 ? (
            <Text testID="claim-items-for" style={[type.subhead, { color: c.ink, fontWeight: '600', marginHorizontal: space.xl + space.l, marginBottom: space.s }]} numberOfLines={2}>
              {`For ${claimTitle(claim)}`}
            </Text>
          ) : null}
          <Text style={[type.footnote, { color: c.ink2, marginHorizontal: space.xl + space.l, marginBottom: space.s }]}>Tap an item to add it as</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.xl }}>
            {LOSS_STATUSES.map((k) => (
              <Chip key={k} testID={`claim-status-${k}`} label={LOSS_LABELS[k]} selected={status === k} onPress={() => setStatus(k)} />
            ))}
          </ScrollView>
          <Footnote>{marked === 0 ? 'Nothing is in the claim yet.' : `${plural(marked, 'item')} in the claim. Tap one again to take it out.`}</Footnote>

          {groups.map(({ room, items }) => {
            const all = items.every((i) => lossOf.has(i.id));
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
                      <ItemPick item={item} loss={lossOf.get(item.id) ?? null} elsewhere={elsewhere(item)} currency={currency} onPress={() => toggle(item)} />
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

function ItemPick({ item, loss, elsewhere, currency, onPress }: { item: Item; loss: LossStatus | null; elsewhere: Claim | null; currency: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={`claim-pick-${item.id}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: loss !== null }}
      accessibilityLabel={`${item.name}${loss ? `, ${LOSS_LABELS[loss]}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 9, minHeight: 56 }, pressed ? { backgroundColor: c.sunk } : null]}>
      <Icon name={loss ? 'checkCircle' : 'circle'} size={24} color={loss ? c.green : c.ink3} />
      <Thumb photoId={item.photos[0]?.id} size={40} rounded={radius.s} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, { color: c.ink }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[type.footnote, { color: loss ? c.green : c.ink2, fontWeight: loss ? '600' : '400' }]} numberOfLines={1}>
          {loss ? LOSS_LABELS[loss] : elsewhere ? `In ${claimTitle(elsewhere)}` : 'Not in this claim'}
        </Text>
      </View>
      <Text style={[type.body, type.tabular, { color: hasValue(item) ? c.ink2 : c.amber }]}>{hasValue(item) ? formatMoney(itemTotalCents(item), currency, { whole: true }) : 'No value'}</Text>
    </Pressable>
  );
}

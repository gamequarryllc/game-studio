import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addRoom } from '@/domain/actions';
import { currentPlace, placeName, totalItems } from '@/domain/library';
import { FREE_ITEM_LIMIT, freeItemsLeft } from '@/domain/limits';
import { formatMoney } from '@/domain/money';
import { homeSummary, plural, roomSummaries } from '@/domain/selectors';
import { usePro } from '@/pro/pro';
import { openNewItem } from '@/state/nav';
import { store, useDoc, useLibrary } from '@/state/store';
import { FolderCard } from '@/ui/FolderCard';
import { ask } from '@/ui/dialogs';
import { Button, Card, Divider, RoundButton, Row, SectionLabel, TabScreen } from '@/ui/kit';
import { roomIconName } from '@/ui/Icon';
import { RoomDrawer, type DrawerRoom } from '@/ui/RoomDrawer';
import { space, type, useTheme } from '@/ui/theme';

export default function RoomsTab() {
  const { c } = useTheme();
  const router = useRouter();
  const doc = useDoc();
  const { isPro } = usePro();
  const summary = homeSummary(doc);
  const rooms = roomSummaries(doc);
  const currency = doc.settings.currency;
  const library = useLibrary();
  // The free version counts every item in every place.
  const held = totalItems(library);
  const left = freeItemsLeft(held, isPro);
  const insets = useSafeAreaInsets();
  const [scrollY] = useState(() => new Animated.Value(0));

  // The rooms as the folders in the drawer. A room whose things have no value says so in amber instead of showing "$0".
  const folders: DrawerRoom[] = rooms.map((r) => ({
    id: r.room.id,
    name: r.room.name,
    icon: roomIconName(r.room.icon),
    line: r.count === 0 ? 'Nothing here yet' : r.valued === 0 ? `${plural(r.count, 'item')} · no value yet` : plural(r.count, 'item'),
    lineTone: r.count > 0 && r.valued === 0 ? 'amber' : 'muted',
    value: r.valued === 0 ? undefined : formatMoney(r.totalCents, currency, { whole: true }),
  }));

  const newRoom = async () => {
    const name = await ask({ title: 'New room', placeholder: 'Guest room, shed, storage unit', confirmLabel: 'Add' });
    if (name?.trim()) store.update((d, now) => addRoom(d, name, now).doc);
  };

  const gaps: { key: 'no-photo' | 'no-value' | 'no-serial'; text: string }[] = [];
  const noPhoto = summary.count - summary.withPhoto;
  const noValue = summary.count - summary.withValue;
  if (noPhoto > 0) gaps.push({ key: 'no-photo', text: noPhoto === 1 ? '1 item has no photo' : `${noPhoto} items have no photo` });
  if (noValue > 0) gaps.push({ key: 'no-value', text: noValue === 1 ? '1 item has no value' : `${noValue} items have no value` });
  if (summary.missingSerial > 0) {
    gaps.push({ key: 'no-serial', text: summary.missingSerial === 1 ? '1 item is missing a serial number' : `${summary.missingSerial} items are missing a serial number` });
  }

  return (
    <TabScreen
      testID="rooms-screen"
      title="Rooms"
      scrollY={scrollY}
      action={
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <RoundButton testID="places" icon="cabinets" label="Places" onPress={() => router.push('/places')} />
          <RoundButton testID="add-item" icon="add" label="Add an item" onPress={() => openNewItem(router)} />
        </View>
      }>
      <FolderCard
        plate
        label={placeName(currentPlace(library))}
        summary={summary}
        currency={currency}
        whenEmpty={
          <>
            <Text style={[type.subhead, { color: c.ink2, marginBottom: space.l }]}>
              Start with what would cost most to replace.
            </Text>
            <Button testID="add-first-item" label="Add your first item" icon="add" onPress={() => openNewItem(router)} />
          </>
        }
      />

      <RoomDrawer
        rooms={folders}
        scrollY={scrollY}
        pileAt={insets.top + 12}
        onOpen={(id) => router.push({ pathname: '/room/[id]', params: { id } })}
      />
      <Button testID="add-room" kind="plain" icon="add" label="Add a room" onPress={newRoom} style={{ marginTop: space.m, alignSelf: 'center' }} />

      {gaps.length > 0 ? (
        <>
          <SectionLabel>Worth filling in</SectionLabel>
          <Card>
            {gaps.map((g, index) => (
              <View key={g.key}>
                {index > 0 ? <Divider /> : null}
                <Row testID={`gap-${g.key}`} title={g.text} chevron onPress={() => router.push({ pathname: '/items', params: { filter: g.key } })} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {left !== null ? (
        <Text testID="free-note" style={[type.footnote, { color: c.ink2, textAlign: 'center', marginTop: space.xxl, marginHorizontal: space.xxl }]}>
          {left === 0
            ? `The free version is full at ${FREE_ITEM_LIMIT} items. `
            : `Free version: ${held} of ${FREE_ITEM_LIMIT} items used. `}
          <Text accessibilityRole="link" style={{ color: c.green, fontWeight: '600' }} onPress={() => router.push('/pro')}>
            See Pro
          </Text>
        </Text>
      ) : null}
    </TabScreen>
  );
}

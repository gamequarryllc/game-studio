import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

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
import { Button, RoundButton, TabScreen } from '@/ui/kit';
import { Icon, roomIconName } from '@/ui/Icon';
import { RoomDeck, type DeckRoom } from '@/ui/RoomDeck';
import { TAB_BAR_SPACE, space, type, useTheme } from '@/ui/theme';

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
  // The screen is laid out to fit: the plate, then the drawer in whatever height is left, then one row under it.
  const { height: screen } = useWindowDimensions();
  const compact = screen < 720;
  const [plateBottom, setPlateBottom] = useState<number | null>(null);

  // The rooms as the folders in the drawer. A room whose things have no value says so in amber instead of showing "$0".
  const folders: DeckRoom[] = rooms.map((r) => ({
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

  // Gaps worth filling in, as short as they can be said. Each opens the Items tab with those items listed.
  const gaps: { key: 'no-photo' | 'no-value' | 'no-serial'; text: string; said: string }[] = [];
  const noPhoto = summary.count - summary.withPhoto;
  const noValue = summary.count - summary.withValue;
  if (noPhoto > 0) gaps.push({ key: 'no-photo', text: `${noPhoto} no photo`, said: noPhoto === 1 ? '1 item has no photo' : `${noPhoto} items have no photo` });
  if (noValue > 0) gaps.push({ key: 'no-value', text: `${noValue} no value`, said: noValue === 1 ? '1 item has no value' : `${noValue} items have no value` });
  if (summary.missingSerial > 0) {
    gaps.push({
      key: 'no-serial',
      text: `${summary.missingSerial} no serial`,
      said: summary.missingSerial === 1 ? '1 item is missing a serial number' : `${summary.missingSerial} items are missing a serial number`,
    });
  }

  // What is left for the drawer once the plate, the row under the drawer and the tab bar have their room.
  const under = 44 + (left !== null ? 26 : 0) + space.s;
  const deckHeight = Math.max(192, Math.min(430, screen - (plateBottom ?? (compact ? 300 : 370)) - space.m - under - TAB_BAR_SPACE));

  return (
    <TabScreen
      testID="rooms-screen"
      title="Rooms"
      action={
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <RoundButton testID="places" icon="cabinets" label="Places" onPress={() => router.push('/places')} />
          <RoundButton testID="add-item" icon="add" label="Add an item" onPress={() => openNewItem(router)} />
        </View>
      }>
      {/* The plate is measured so the drawer can take exactly the height that is left. */}
      <View onLayout={(e) => setPlateBottom(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height))}>
        <FolderCard
          plate
          compact={compact}
          footer={
            gaps.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.m }}>
                {gaps.map((g) => (
                  <Pressable
                    key={g.key}
                    testID={`gap-${g.key}`}
                    accessibilityRole="button"
                    accessibilityLabel={g.said}
                    hitSlop={6}
                    onPress={() => router.push({ pathname: '/items', params: { filter: g.key } })}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 5, paddingLeft: 10, paddingRight: 7, borderRadius: 999, backgroundColor: c.amberSoft, opacity: pressed ? 0.7 : 1 })}>
                    <Text style={[type.footnote, type.tabular, { color: c.amber, fontWeight: '600' }]}>{g.text}</Text>
                    <Icon name="chevron" size={10} color={c.amber} />
                  </Pressable>
                ))}
              </View>
            ) : undefined
          }
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
      </View>

      <RoomDeck rooms={folders} height={deckHeight} onOpen={(id) => router.push({ pathname: '/room/[id]', params: { id } })} />
      <Button testID="add-room" kind="plain" icon="add" label="Add a room" onPress={newRoom} style={{ alignSelf: 'center' }} />
      {left !== null ? (
        <Text testID="free-note" style={[type.footnote, { color: c.ink2, textAlign: 'center', marginHorizontal: space.xxl }]} numberOfLines={1}>
          {left === 0 ? `The free version is full at ${FREE_ITEM_LIMIT} items. ` : `Free version: ${held} of ${FREE_ITEM_LIMIT} items used. `}
          <Text accessibilityRole="link" style={{ color: c.green, fontWeight: '600' }} onPress={() => router.push('/pro')}>
            See Pro
          </Text>
        </Text>
      ) : null}
    </TabScreen>
  );
}

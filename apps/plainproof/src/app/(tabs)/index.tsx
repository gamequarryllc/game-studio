import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { addRoom } from '@/domain/actions';
import { currentPlace, placeName, totalItems } from '@/domain/library';
import { FREE_ITEM_LIMIT, freeItemsLeft } from '@/domain/limits';
import { formatMoney } from '@/domain/money';
import { backupState, homeSummary, plural, roomSummaries } from '@/domain/selectors';
import { usePro } from '@/pro/pro';
import { openNewItem } from '@/state/nav';
import { store, useDoc, useLibrary } from '@/state/store';
import { FolderCard } from '@/ui/FolderCard';
import { ask } from '@/ui/dialogs';
import { Button, FittedTabScreen, RoundButton } from '@/ui/kit';
import { Icon, roomIconName } from '@/ui/Icon';
import { RoomDeck, type DeckRoom } from '@/ui/RoomDeck';
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
  // The screen is laid out to fit, with nothing to scroll but the drawer: the plate, then the drawer in the height that is left.
  const [drawerRoom, setDrawerRoom] = useState<number | null>(null);

  // The rooms as the folders in the drawer. A room whose things have no value says so in amber instead of showing "$0".
  const folders: DeckRoom[] = rooms.map((r) => ({
    id: r.room.id,
    name: r.room.name,
    icon: roomIconName(r.room.icon),
    count: r.count,
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

  // The one gap that can undo all the others: the only copy is on a phone that can be lost with the home.
  const backup = backupState(doc);
  const backupDue = backup === 'never' || backup === 'behind';
  const chip = ({ pressed }: { pressed: boolean }) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingVertical: 4,
    paddingLeft: 9,
    paddingRight: 6,
    borderRadius: 999,
    backgroundColor: c.amberSoft,
    opacity: pressed ? 0.7 : 1,
  });

  // Under the drawer: "Add a room", and the free-version line when there is one.
  const under = 44 + (left !== null ? 24 : 0);

  return (
    <FittedTabScreen
      testID="rooms-screen"
      title="Rooms"
      action={
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <RoundButton testID="places" icon="cabinets" label="Places" onPress={() => router.push('/places')} />
          <RoundButton testID="add-item" icon="add" label="Add an item" onPress={() => openNewItem(router)} />
        </View>
      }>
      <FolderCard
        plate
        compact
        label={placeName(currentPlace(library))}
        summary={summary}
        currency={currency}
        footer={
          gaps.length > 0 || backupDue ? (
            // One row, however narrow the phone: it slides sideways sooner than it wraps and pushes the drawer down.
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.m, marginHorizontal: -space.l }} contentContainerStyle={{ gap: 6, paddingHorizontal: space.l }}>
              {backupDue ? (
                <Pressable
                  testID="gap-backup"
                  accessibilityRole="button"
                  accessibilityLabel={backup === 'never' ? 'This inventory has not been backed up' : 'There are changes since the last backup'}
                  hitSlop={6}
                  onPress={() => router.push({ pathname: '/report', params: { show: 'backup', at: String(Date.now()) } })}
                  style={chip}>
                  <Icon name="backup" size={11} color={c.amber} />
                  <Text style={[type.caption, { color: c.amber, fontWeight: '600' }]}>{backup === 'never' ? 'Not backed up' : 'Backup out of date'}</Text>
                  <Icon name="chevron" size={9} color={c.amber} />
                </Pressable>
              ) : null}
              {gaps.map((g) => (
                <Pressable
                  key={g.key}
                  testID={`gap-${g.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={g.said}
                  hitSlop={6}
                  onPress={() => router.push({ pathname: '/items', params: { filter: g.key } })}
                  style={chip}>
                  <Text style={[type.caption, type.tabular, { color: c.amber, fontWeight: '600' }]}>{g.text}</Text>
                  <Icon name="chevron" size={9} color={c.amber} />
                </Pressable>
              ))}
            </ScrollView>
          ) : undefined
        }
        whenEmpty={
          <>
            <Text style={[type.subhead, { color: c.ink2, marginBottom: space.l }]}>Start with what would cost most to replace.</Text>
            <Button testID="add-first-item" label="Add your first item" icon="add" onPress={() => openNewItem(router)} />
          </>
        }
      />

      {/* Whatever height is left belongs to the drawer; the row under it keeps its own. */}
      <View style={{ flex: 1, minHeight: 0 }} onLayout={(e) => setDrawerRoom(Math.floor(e.nativeEvent.layout.height))}>
        {drawerRoom === null ? null : (
          <RoomDeck rooms={folders} room={drawerRoom - under - space.m} onOpen={(id) => router.push({ pathname: '/room/[id]', params: { id } })} />
        )}
        <Button testID="add-room" kind="plain" icon="add" label="Add a room" onPress={newRoom} style={{ alignSelf: 'center' }} />
        {left !== null ? (
          <Text testID="free-note" style={[type.footnote, { color: c.ink2, textAlign: 'center', marginHorizontal: space.xxl }]} numberOfLines={1}>
            {left === 0 ? `The free version is full at ${FREE_ITEM_LIMIT} items. ` : `Free version: ${held} of ${FREE_ITEM_LIMIT} items used. `}
            <Text accessibilityRole="link" style={{ color: c.green, fontWeight: '600' }} onPress={() => router.push('/pro')}>
              See Pro
            </Text>
          </Text>
        ) : null}
      </View>
    </FittedTabScreen>
  );
}

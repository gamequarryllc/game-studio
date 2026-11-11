import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { deleteRoom, moveRoom, renameRoom, setRoomIcon } from '@/domain/actions';
import { formatMoney } from '@/domain/money';
import { findItems, itemSubtitle, itemTotalCents, hasValue, plural, roomSummaries } from '@/domain/selectors';
import { ROOM_ICONS, type RoomIcon } from '@/domain/types';
import { warning } from '@/platform/haptics';
import { openNewItem } from '@/state/nav';
import { dropPhotos } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { ask, choose, confirm } from '@/ui/dialogs';
import { Icon, roomIconName } from '@/ui/Icon';
import { Button, Card, Divider, EmptyState, IconTile, PushedScreen, Row, Thumb } from '@/ui/kit';
import { space, type, useTheme } from '@/ui/theme';

const ICON_LABELS: Record<RoomIcon, string> = {
  sofa: 'Sofa',
  bed: 'Bed',
  kitchen: 'Fridge',
  dining: 'Knife and fork',
  bath: 'Bathtub',
  desk: 'Computer',
  kids: 'Teddy bear',
  laundry: 'Washing machine',
  garage: 'Car',
  storage: 'Storage box',
  outdoor: 'Tree',
  hall: 'Door',
  box: 'Parcel',
};

export default function RoomScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDoc();
  const summary = roomSummaries(doc).find((r) => r.room.id === id);

  if (!summary) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center' }}>
        <EmptyState icon="box" title="This room is gone" body="It was deleted, along with this link to it." action={<Button label="Back to my rooms" onPress={() => router.replace('/')} />} />
      </View>
    );
  }

  const { room } = summary;
  const items = findItems(doc, { roomId: room.id, sort: 'recent' });
  const currency = doc.settings.currency;
  const index = doc.rooms.findIndex((r) => r.id === room.id);

  const rename = async () => {
    const name = await ask({ title: 'Rename room', initial: room.name, confirmLabel: 'Rename' });
    if (name?.trim()) store.update((d) => renameRoom(d, room.id, name));
  };

  const changeIcon = async () => {
    const picked = await choose<RoomIcon>({ title: 'Symbol for this room', choices: ROOM_ICONS.map((k) => ({ key: k, label: ICON_LABELS[k] })) });
    if (picked) store.update((d) => setRoomIcon(d, room.id, picked));
  };

  const remove = async () => {
    let moveTo: string | null = null;
    if (items.length > 0) {
      const others = doc.rooms.filter((r) => r.id !== room.id);
      const picked = await choose({
        title: `${room.name} has ${plural(items.length, 'item')}`,
        message: items.length === 1 ? 'What should happen to it?' : 'What should happen to them?',
        choices: [
          ...others.map((r) => ({ key: r.id, label: `Move to ${r.name}` })),
          { key: '__delete__', label: items.length === 1 ? 'Delete the item too' : `Delete all ${items.length} items too`, destructive: true },
        ],
      });
      if (!picked) return;
      moveTo = picked === '__delete__' ? null : picked;
    }
    const sure = await confirm({
      title: `Delete ${room.name}?`,
      message: items.length === 0 ? undefined : moveTo ? 'Its items will be moved, not deleted.' : `${plural(items.length, 'item')} and ${items.length === 1 ? 'its' : 'their'} photos will be deleted. This can’t be undone.`,
      confirmLabel: 'Delete room',
      destructive: true,
    });
    if (!sure) return;
    const photoIds = moveTo ? [] : items.flatMap((it) => [...it.photos, ...it.receipts].map((p) => p.id));
    warning();
    if (router.canGoBack()) router.back();
    else router.replace('/');
    store.update((d, now) => deleteRoom(d, room.id, moveTo, now));
    void dropPhotos(photoIds);
  };

  const menu = async () => {
    const picked = await choose({
      choices: [
        { key: 'rename', label: 'Rename' },
        { key: 'icon', label: 'Change symbol' },
        ...(index > 0 ? [{ key: 'up', label: 'Move up' }] : []),
        ...(index < doc.rooms.length - 1 ? [{ key: 'down', label: 'Move down' }] : []),
        { key: 'delete', label: 'Delete room', destructive: true },
      ],
    });
    if (picked === 'rename') await rename();
    else if (picked === 'icon') await changeIcon();
    else if (picked === 'up') store.update((d) => moveRoom(d, room.id, -1));
    else if (picked === 'down') store.update((d) => moveRoom(d, room.id, 1));
    else if (picked === 'delete') await remove();
  };

  return (
    <PushedScreen testID="room-screen">
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable testID="room-menu" accessibilityRole="button" accessibilityLabel="Room options" hitSlop={12} onPress={menu} style={{ paddingHorizontal: space.s, paddingVertical: 6 }}>
              <Icon name="more" size={22} color={c.green} />
            </Pressable>
          ),
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.xl, paddingTop: space.s, paddingBottom: space.l }}>
        <IconTile name={roomIconName(room.icon)} size={48} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" testID="room-title" style={[type.title, { color: c.ink }]} numberOfLines={2}>
            {room.name}
          </Text>
          <Text testID="room-summary" style={[type.subhead, type.tabular, { color: c.ink2 }]}>
            {items.length === 0 ? 'Nothing here yet' : `${plural(items.length, 'item')} · ${formatMoney(summary.totalCents, currency, { whole: true })}`}
          </Text>
        </View>
      </View>

      {items.length === 0 ? (
        <EmptyState
          icon={roomIconName(room.icon)}
          title={`Nothing in ${room.name} yet`}
          body="Start with whatever would cost the most to replace."
          action={<Button testID="room-add-first" label="Add an item" icon="add" onPress={() => openNewItem(router, room.id)} />}
        />
      ) : (
        <>
          <Card>
            {items.map((item, i) => (
              <View key={item.id}>
                {i > 0 ? <Divider inset={space.l + 52 + space.m} /> : null}
                <Row
                  testID={`item-${item.name}`}
                  leading={<Thumb photoId={item.photos[0]?.id} size={52} />}
                  title={item.name}
                  subtitle={itemSubtitle(item) || undefined}
                  value={hasValue(item) ? formatMoney(itemTotalCents(item), currency, { whole: true }) : 'No value'}
                  valueTone={hasValue(item) ? 'ink' : 'amber'}
                  chevron
                  onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                />
              </View>
            ))}
          </Card>
          <View style={{ marginHorizontal: space.xl, marginTop: space.xl }}>
            <Button testID="room-add" label={`Add an item to ${room.name}`} icon="add" kind="soft" onPress={() => openNewItem(router, room.id)} />
          </View>
        </>
      )}
    </PushedScreen>
  );
}

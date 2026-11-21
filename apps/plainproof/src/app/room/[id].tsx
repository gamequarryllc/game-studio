import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { addRoomVideo, deleteRoom, moveRoom, removeRoomVideo, renameRoom, setRoomIcon } from '@/domain/actions';
import { displayTime } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { formatMoney } from '@/domain/money';
import { findItems, formatBytes, formatDuration, itemSubtitle, itemTotalCents, hasValue, plural, roomSummaries } from '@/domain/selectors';
import { LIMITS, ROOM_ICONS, type RoomIcon, type Video } from '@/domain/types';
import { importFile } from '@/platform/attachments';
import { success, warning } from '@/platform/haptics';
import { pickVideo, recordVideo } from '@/platform/pickFiles';
import { openNewItem } from '@/state/nav';
import { dropFiles, dropPhotos } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { ask, choose, confirm, notify } from '@/ui/dialogs';
import { Icon, roomIconName } from '@/ui/Icon';
import { pick } from '@/ui/PickSheet';
import { Button, Card, Divider, EmptyState, Footnote, IconTile, PushedScreen, Row, SectionLabel, Thumb } from '@/ui/kit';
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
  const [saving, setSaving] = useState(false);

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

  const videoName = (v: Video) => `${v.id}.${v.ext}`;

  const addVideo = async () => {
    if (room.videos.length >= LIMITS.videosPerRoom) {
      await notify('That’s the most for one room', `Up to ${LIMITS.videosPerRoom} videos a room. Remove one to add another.`);
      return;
    }
    const how =
      Platform.OS === 'web'
        ? 'library'
        : await choose<'camera' | 'library'>({
            title: 'Walk-through video',
            message: 'Film the room slowly, opening cupboards and closets, and say what things are as you go. Up to five minutes.',
            choices: [
              { key: 'camera', label: 'Record a walk-through' },
              { key: 'library', label: 'Choose a video' },
            ],
          });
    if (!how) return;
    try {
      const picked = how === 'camera' ? await recordVideo() : await pickVideo();
      if (picked === 'denied') {
        await notify('The camera is switched off for Plainproof', 'You can allow it in the Settings app, under Plainproof.');
        return;
      }
      if (!picked) return;
      if (picked.bytes !== null && picked.bytes > LIMITS.videoBytes) {
        await notify('That video is too long to keep', `It is ${formatBytes(picked.bytes)}; the most is ${formatBytes(LIMITS.videoBytes)}. Film one room at a time.`);
        return;
      }
      setSaving(true);
      const id = newId();
      const bytes = await importFile(picked.uri, `${id}.${picked.ext}`);
      if (bytes > LIMITS.videoBytes) {
        void dropFiles([`${id}.${picked.ext}`]);
        await notify('That video is too long to keep', `It is ${formatBytes(bytes)}; the most is ${formatBytes(LIMITS.videoBytes)}. Film one room at a time.`);
        return;
      }
      const video: Omit<Video, 'addedAt'> = { id, durationMs: picked.durationMs, bytes, takenAt: picked.takenAt, ext: picked.ext };
      store.update((d, now) => addRoomVideo(d, room.id, { ...video, addedAt: now }));
      success();
    } catch {
      await notify('That video could not be added', 'Check that there is free space on this iPhone, then try again.');
    } finally {
      setSaving(false);
    }
  };

  const removeVideo = async (v: Video, n: number) => {
    const sure = await confirm({ title: `Delete walk-through ${n}?`, message: 'The copy kept in Plainproof is deleted. One in your photo library is not touched.', confirmLabel: 'Delete video', destructive: true });
    if (!sure) return;
    warning();
    store.update((d) => removeRoomVideo(d, room.id, v.id));
    void dropFiles([videoName(v)]);
  };

  const rename = async () => {
    const name = await ask({ title: 'Rename room', initial: room.name, confirmLabel: 'Rename' });
    if (name?.trim()) store.update((d) => renameRoom(d, room.id, name));
  };

  const changeIcon = async () => {
    const picked = await pick<RoomIcon>({ title: 'Symbol for this room', choices: ROOM_ICONS.map((k) => ({ key: k, label: ICON_LABELS[k], icon: roomIconName(k) })), selected: room.icon });
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
    const videoFiles = room.videos.map(videoName);
    warning();
    if (router.canGoBack()) router.back();
    else router.replace('/');
    store.update((d, now) => deleteRoom(d, room.id, moveTo, now));
    void dropPhotos(photoIds);
    void dropFiles(videoFiles);
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

      <SectionLabel>Walk-through video</SectionLabel>
      <Card>
        {room.videos.map((v, i) => (
          <View key={v.id}>
            {i > 0 ? <Divider inset={space.l + 36 + space.m} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Row
                  testID={`room-video-${i}`}
                  leading={
                    <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: c.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="play" size={16} color={c.green} />
                    </View>
                  }
                  title={`Walk-through ${i + 1}`}
                  subtitle={[formatDuration(v.durationMs), formatBytes(v.bytes), v.takenAt ? `recorded ${displayTime(v.takenAt)}` : `added ${displayTime(v.addedAt)}`].filter(Boolean).join(' · ')}
                  onPress={() => router.push({ pathname: '/video', params: { name: videoName(v) } })}
                />
              </View>
              <Pressable testID={`room-video-remove-${i}`} accessibilityRole="button" accessibilityLabel={`Delete walk-through ${i + 1}`} hitSlop={8} onPress={() => void removeVideo(v, i + 1)} style={{ paddingHorizontal: space.l, paddingVertical: space.m }}>
                <Icon name="trash" size={18} color={c.ink3} />
              </Pressable>
            </View>
          </View>
        ))}
        {room.videos.length > 0 ? <Divider /> : null}
        {room.videos.length < LIMITS.videosPerRoom ? (
          <Row testID="room-video-add" title={saving ? 'Adding the video…' : room.videos.length === 0 ? 'Add a walk-through video' : 'Add another video'} subtitle={room.videos.length === 0 ? 'Insurers suggest a slow video of every room' : undefined} tint onPress={() => void addVideo()} />
        ) : null}
      </Card>
      <Footnote>A video shows what a list can miss: the things on shelves and in drawers, and how the room looked before. It is kept in the app, goes in your backups, and goes in a claim package for this room.</Footnote>
    </PushedScreen>
  );
}

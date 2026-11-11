import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { addRoom } from '@/domain/actions';
import { FREE_ITEM_LIMIT, freeItemsLeft } from '@/domain/limits';
import { formatMoney } from '@/domain/money';
import { homeSummary, plural, roomSummaries } from '@/domain/selectors';
import { usePro } from '@/pro/pro';
import { openNewItem } from '@/state/nav';
import { store, useDoc } from '@/state/store';
import { FolderCard } from '@/ui/FolderCard';
import { ask } from '@/ui/dialogs';
import { Button, Card, Divider, IconTile, RoundButton, Row, SectionLabel, TabScreen } from '@/ui/kit';
import { Icon, roomIconName } from '@/ui/Icon';
import { space, type, useTheme } from '@/ui/theme';

export default function RoomsTab() {
  const { c } = useTheme();
  const router = useRouter();
  const doc = useDoc();
  const { isPro } = usePro();
  const summary = homeSummary(doc);
  const rooms = roomSummaries(doc);
  const currency = doc.settings.currency;
  const left = freeItemsLeft(doc, isPro);

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
      action={<RoundButton testID="add-item" icon="add" label="Add an item" onPress={() => openNewItem(router)} />}>
      <FolderCard
        label={doc.profile.homeName || 'Household'}
        summary={summary}
        currency={currency}
        whenEmpty={
          <>
            <Text style={[type.subhead, { color: c.manilaInk2, marginBottom: space.l }]}>
              Start with what would cost most to replace.
            </Text>
            <Button testID="add-first-item" label="Add your first item" icon="add" onPress={() => openNewItem(router)} />
          </>
        }
      />

      <SectionLabel>Rooms</SectionLabel>
      <Card>
        {rooms.map((r, index) => (
          <View key={r.room.id}>
            {index > 0 ? <Divider inset={space.l + 36 + space.m} /> : null}
            <Row
              testID={`room-${r.room.name}`}
              leading={<IconTile name={roomIconName(r.room.icon)} />}
              title={r.room.name}
              subtitle={r.count === 0 ? 'Nothing here yet' : r.valued === 0 ? `${plural(r.count, 'item')} · no value yet` : plural(r.count, 'item')}
              subtitleTone={r.count > 0 && r.valued === 0 ? 'amber' : 'muted'}
              value={r.valued === 0 ? undefined : formatMoney(r.totalCents, currency, { whole: true })}
              valueTone="ink"
              chevron
              onPress={() => router.push({ pathname: '/room/[id]', params: { id: r.room.id } })}
            />
          </View>
        ))}
        {rooms.length > 0 ? <Divider inset={space.l + 36 + space.m} /> : null}
        <Row
          testID="add-room"
          leading={
            <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="add" size={20} color={c.green} />
            </View>
          }
          title="Add a room"
          tint
          onPress={newRoom}
        />
      </Card>

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
            : `Free version: ${doc.items.length} of ${FREE_ITEM_LIMIT} items used. `}
          <Text accessibilityRole="link" style={{ color: c.green, fontWeight: '600' }} onPress={() => router.push('/pro')}>
            See Pro
          </Text>
        </Text>
      ) : null}
    </TabScreen>
  );
}

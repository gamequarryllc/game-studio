import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { addClaim, claimsOf, deleteItem, findClaim, setClaimItem } from '@/domain/actions';
import { displayTime, displayYmd, toYmd } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { newId } from '@/domain/ids';
import { claimTitle, hasValue, itemTotalCents, needsSerial, unitCents } from '@/domain/selectors';
import { CATEGORY_LABELS, CONDITION_LABELS, LIMITS, LOSS_LABELS, type Id, type LossStatus } from '@/domain/types';
import { warning } from '@/platform/haptics';
import { dropPhotos } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { pickLoss } from '@/ui/claim';
import { choose, confirm, notify } from '@/ui/dialogs';
import { LiveTextArea } from '@/ui/form';
import { Icon } from '@/ui/Icon';
import { BarButton, Button, Card, Divider, EmptyState, Notice, PushedScreen, Row, SectionLabel, Thumb } from '@/ui/kit';
import { radius, space, type, useTheme } from '@/ui/theme';

function Fact({ label, value, mono, testID }: { label: string; value: string; mono?: boolean; testID?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.l, paddingHorizontal: space.l, paddingVertical: 11, minHeight: 44, alignItems: 'center' }}>
      <Text style={[type.body, { color: c.ink2 }]}>{label}</Text>
      <Text testID={testID} selectable style={[type.body, mono ? type.tabular : null, { color: c.ink, flex: 1, textAlign: 'right' }]}>
        {value}
      </Text>
    </View>
  );
}

export default function ItemScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDoc();
  const item = doc.items.find((it) => it.id === id);
  const [page, setPage] = useState(0);
  const [today] = useState(() => toYmd(new Date()));

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center' }}>
        <EmptyState icon="box" title="This item is gone" body="It was deleted, along with this link to it." action={<Button label="Back to my rooms" onPress={() => router.replace('/')} />} />
      </View>
    );
  }

  const room = doc.rooms.find((r) => r.id === item.roomId);
  const currency = doc.settings.currency;
  const width = Math.min(windowWidth, 480);
  const photoWidth = width - space.xl * 2;
  const each = unitCents(item);
  const edit = () => router.push({ pathname: '/item-form', params: { id: item.id } });
  const view = (photoId: string) => router.push({ pathname: '/photo', params: { id: photoId } });

  const remove = async () => {
    const sure = await confirm({
      title: `Delete ${item.name}?`,
      message: 'Its photos and receipt go with it. This can’t be undone.',
      confirmLabel: 'Delete item',
      destructive: true,
    });
    if (!sure) return;
    const photoIds = [...item.photos, ...item.receipts].map((p) => p.id);
    warning();
    if (router.canGoBack()) router.back();
    else router.replace('/');
    store.update((d) => deleteItem(d, item.id));
    void dropPhotos(photoIds);
  };

  const facts: { label: string; value: string; mono?: boolean; testID?: string }[] = [];
  if (item.brand) facts.push({ label: 'Brand', value: item.brand });
  if (item.model) facts.push({ label: 'Model', value: item.model });
  if (item.serial) facts.push({ label: 'Serial number', value: item.serial, mono: true, testID: 'fact-serial' });
  if (item.condition) facts.push({ label: 'Condition', value: CONDITION_LABELS[item.condition] });
  if (item.quantity > 1) facts.push({ label: 'How many', value: String(item.quantity), mono: true });
  const purchase: typeof facts = [];
  if (item.purchaseDate) purchase.push({ label: 'Bought', value: displayYmd(item.purchaseDate) });
  if (item.purchasedFrom) purchase.push({ label: 'From', value: item.purchasedFrom });
  if (item.pricePaidCents !== null) purchase.push({ label: 'Price paid', value: formatMoney(item.pricePaidCents, currency), mono: true });
  if (item.warrantyUntil) {
    purchase.push({ label: 'Warranty until', value: `${displayYmd(item.warrantyUntil)}${item.warrantyUntil < today ? ' (ended)' : ''}`, testID: 'fact-warranty' });
  }
  // When it went into the inventory: on a claim, this is the proof it was owned before the loss.
  purchase.push({ label: 'Recorded', value: displayTime(item.createdAt), testID: 'fact-recorded' });

  // The claims this item is in, and the ones it could still go in.
  const inClaims = claimsOf(doc, item.id);
  const notIn = doc.claims.filter((cl) => !inClaims.some((x) => x.claim.id === cl.id));
  const canStartClaim = doc.claims.length < LIMITS.claims;

  const changeLoss = async (claimId: Id, current: LossStatus) => {
    const picked = await pickLoss({ current, name: item.name });
    if (!picked) return;
    store.update((d) => setClaimItem(d, claimId, item.id, picked === 'remove' ? null : picked));
  };
  const setLossNote = (claimId: Id) => (note: string) =>
    store.update((d) => {
      const entry = findClaim(d, claimId)?.items.find((e) => e.itemId === item.id);
      return entry ? setClaimItem(d, claimId, item.id, entry.loss, note) : d;
    });
  const addToClaim = async () => {
    if (notIn.length === 0 && !canStartClaim) {
      await notify('That’s the most claims at once', `Up to ${LIMITS.claims} open claims in one place. End one that is settled to start another.`);
      return;
    }
    // Which claim: asked only when there is a choice to make.
    let target: Id | 'new' | null = 'new';
    if (notIn.length > 0) {
      target = await choose<Id | 'new'>({
        title: `Add ${item.name} to`,
        choices: [...notIn.map((cl) => ({ key: cl.id, label: claimTitle(cl) })), ...(canStartClaim ? [{ key: 'new' as const, label: 'A new claim' }] : [])],
      });
    }
    if (!target) return;
    const picked = await pickLoss({ current: null, name: item.name });
    if (!picked || picked === 'remove') return;
    const claimId = target === 'new' ? newId() : target;
    store.update((d, now) => setClaimItem(target === 'new' ? addClaim(d, claimId, now) : d, claimId, item.id, picked));
  };

  return (
    <PushedScreen testID="item-screen">
      <Stack.Screen options={{ title: '', headerRight: () => <BarButton testID="item-edit" label="Edit" onPress={edit} /> }} />

      {item.photos.length > 0 ? (
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            style={{ width }}>
            {item.photos.map((p, i) => (
              <Pressable key={p.id} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1} of ${item.photos.length}`} onPress={() => view(p.id)} style={{ width, paddingHorizontal: space.xl }}>
                <Thumb photoId={p.id} size={photoWidth} source="full" rounded={radius.l} style={{ height: Math.round(photoWidth * 0.72) }} />
              </Pressable>
            ))}
          </ScrollView>
          {item.photos.length > 1 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.s }}>
              {item.photos.map((p, i) => (
                <View key={p.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === page ? c.ink : c.ink3, opacity: i === page ? 1 : 0.5 }} />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable
          testID="item-add-photo"
          accessibilityRole="button"
          onPress={edit}
          style={{ marginHorizontal: space.xl, height: 132, borderRadius: radius.l, borderWidth: 1, borderStyle: 'dashed', borderColor: c.ink3, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="addPhoto" size={24} color={c.green} />
          <Text style={[type.subhead, { color: c.green, fontWeight: '600' }]}>Add a photo</Text>
          <Text style={[type.footnote, { color: c.ink2 }]}>A photo is the best proof you owned it.</Text>
        </Pressable>
      )}

      <View style={{ paddingHorizontal: space.xl, paddingTop: space.l }}>
        <Text accessibilityRole="header" testID="item-title" style={[type.title, { color: c.ink }]}>
          {item.name}
        </Text>
        <Text style={[type.subhead, { color: c.ink2, marginTop: 2 }]}>
          {[room?.name, item.category ? CATEGORY_LABELS[item.category] : null].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View style={{ paddingHorizontal: space.xl, paddingTop: space.m }}>
        {hasValue(item) ? (
          <>
            <Text testID="item-value" style={[type.figure, type.tabular, { color: c.ink, fontSize: 32, lineHeight: 38 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {formatMoney(itemTotalCents(item), currency, { whole: true })}
            </Text>
            <Text style={[type.footnote, type.tabular, { color: c.ink2, marginTop: 1 }]}>
              {item.quantity > 1 && each !== null ? `${item.quantity} at ${formatMoney(each, currency, { whole: true })} each · ` : ''}
              {item.valueCents !== null ? 'Cost to replace' : 'The price you paid'}
            </Text>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={edit}>
            <Text testID="item-value" style={[type.headline, { color: c.amber }]}>
              No value yet
            </Text>
            <Text style={[type.subhead, { color: c.ink2, marginTop: 2 }]}>Add what it would cost to replace, even roughly.</Text>
          </Pressable>
        )}
      </View>

      {needsSerial(item) ? (
        <Notice icon="warning" tone="amber">
          No serial number yet. It is usually on a label on the back or underside.
        </Notice>
      ) : null}

      {inClaims.map(({ claim, entry }, n) => (
        <View key={claim.id}>
          <SectionLabel
            trailing={
              <Text testID={`item-open-claim-${n}`} accessibilityRole="link" onPress={() => router.push({ pathname: '/claim/[id]', params: { id: claim.id } })} style={[type.footnote, { color: c.green, fontWeight: '600' }]}>
                Open the claim
              </Text>
            }>
            {doc.claims.length === 1 ? 'In the claim' : `In ${claimTitle(claim)}`}
          </SectionLabel>
          <Card>
            <Row testID={`item-loss-${n}`} title="What happened" value={LOSS_LABELS[entry.loss]} valueTone="ink" chevron onPress={() => void changeLoss(claim.id, entry.loss)} />
            <Divider />
            <LiveTextArea
              testID={`item-loss-note-${n}`}
              label="What happened to it"
              stored={entry.note}
              onType={setLossNote(claim.id)}
              placeholder="A line or two for the adjuster: “Taken from the desk”, “Water came up through the base”"
              maxLength={LIMITS.notes}
            />
          </Card>
        </View>
      ))}
      {doc.claims.length > 0 && (notIn.length > 0 || canStartClaim) ? (
        <Card style={{ marginTop: space.l }}>
          <Row
            testID="item-add-to-claim"
            title={inClaims.length > 0 ? 'Add to another claim' : 'Add to a claim'}
            subtitle="Mark it stolen, damaged, destroyed or lost"
            tint
            onPress={() => void addToClaim()}
          />
        </Card>
      ) : null}

      {facts.length > 0 ? (
        <>
          <SectionLabel>Details</SectionLabel>
          <Card>
            {facts.map((f, i) => (
              <View key={f.label}>
                {i > 0 ? <Divider /> : null}
                <Fact {...f} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {purchase.length > 0 ? (
        <>
          <SectionLabel>{purchase.length > 1 ? 'Purchase and record' : 'Record'}</SectionLabel>
          <Card>
            {purchase.map((f, i) => (
              <View key={f.label}>
                {i > 0 ? <Divider /> : null}
                <Fact {...f} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {item.receipts.length > 0 ? (
        <>
          <SectionLabel>{item.receipts.length === 1 ? 'Receipt' : 'Receipts'}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m, paddingHorizontal: space.xl }}>
            {item.receipts.map((p, i) => (
              <Pressable key={p.id} testID={`receipt-${i}`} accessibilityRole="imagebutton" accessibilityLabel={`Receipt ${i + 1}`} onPress={() => view(p.id)}>
                <Thumb photoId={p.id} size={84} rounded={radius.m} placeholder="receipt" />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {item.notes ? (
        <>
          <SectionLabel>Notes</SectionLabel>
          <Card style={{ padding: space.l }}>
            <Text selectable testID="item-notes" style={[type.body, { color: c.ink }]}>
              {item.notes}
            </Text>
          </Card>
        </>
      ) : null}

      <View style={{ marginTop: space.xxl, marginHorizontal: space.xl }}>
        {doc.claims.length === 0 ? <Button testID="item-start-claim" label="Add to a claim" kind="plain" onPress={() => void addToClaim()} /> : null}
        <Button testID="item-delete" label="Delete item" kind="danger" onPress={remove} />
      </View>
    </PushedScreen>
  );
}

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { addClaim, claimedItems, findClaim, removeClaim, updateClaim } from '@/domain/actions';
import { newId } from '@/domain/ids';
import { formatMoney } from '@/domain/money';
import { claimSummary, claimTitle, hasValue, itemTotalCents, lossCountLine, plural } from '@/domain/selectors';
import { LIMITS, LOSS_CAUSES, LOSS_CAUSE_LABELS, LOSS_LABELS, type LossCause } from '@/domain/types';
import { success, warning } from '@/platform/haptics';
import { MAKES_PDF } from '@/platform/exporter';
import { exportSpreadsheet, makeClaimPackage, makeReport } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { DateField } from '@/ui/DateField';
import { confirm, notify } from '@/ui/dialogs';
import { causeIconName } from '@/ui/Icon';
import { pick } from '@/ui/PickSheet';
import { FormRow, LiveTextArea, LiveTextRow, PickRow } from '@/ui/form';
import { Button, Card, Divider, EmptyState, Footnote, Notice, PushedScreen, Row, SectionLabel, Thumb } from '@/ui/kit';
import { radius, space, type, useTheme } from '@/ui/theme';

// One claim after a loss: its details, the items it covers, and what goes to the insurer.
// A place can have several claims open at once; each has its own screen.

export default function ClaimScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const doc = useDoc();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [busy, setBusy] = useState<'package' | 'pdf' | 'csv' | null>(null);
  const claim = findClaim(doc, typeof id === 'string' ? id : null);
  const items = claimedItems(doc, claim?.id);
  const summary = claimSummary(doc, claim);
  const currency = doc.settings.currency;
  const rooms = new Map(doc.rooms.map((r) => [r.id, r.name]));

  // The way in for a first claim: what a claim is, before one is made.
  if (id === 'new') {
    const start = () => {
      const fresh = newId();
      store.update((d, now) => addClaim(d, fresh, now));
      router.replace({ pathname: '/claim/[id]', params: { id: fresh } });
    };
    return (
      <PushedScreen testID="claim-screen">
        <Stack.Screen options={{ title: 'Claim' }} />
        <EmptyState
          icon="report"
          title="Making a claim"
          body="After a fire, a flood or a break-in, mark what was stolen, damaged or destroyed. Plainproof turns it into the schedule of loss your insurer asks for, with each item’s photos, receipts and value. A second loss later gets a claim of its own."
          action={<Button testID="claim-start" label="Start a claim" onPress={start} />}
        />
        <Footnote style={{ textAlign: 'center' }}>Nothing is sent anywhere. You choose who gets the files.</Footnote>
      </PushedScreen>
    );
  }

  if (!claim) {
    return (
      <View testID="claim-gone" style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center' }}>
        <Stack.Screen options={{ title: 'Claim' }} />
        <EmptyState icon="report" title="This claim has ended" body="It was ended, or it belongs to another place. Your items are still in your inventory." action={<Button label="Back to the report" onPress={() => router.replace('/report')} />} />
      </View>
    );
  }

  const claimId = claim.id;
  const set = (patch: Parameters<typeof updateClaim>[2]) => store.update((d, now) => updateClaim(d, claimId, patch, now));
  const openItems = () => router.push({ pathname: '/claim-items', params: { id: claimId } });

  const pickCause = async () => {
    const picked = await pick<LossCause | 'none'>({
      title: 'What caused the loss?',
      choices: [...LOSS_CAUSES.map((k) => ({ key: k, label: LOSS_CAUSE_LABELS[k], icon: causeIconName(k) })), { key: 'none' as const, label: 'Not stated', quiet: true }],
      selected: claim.cause ?? 'none',
    });
    if (picked) set({ cause: picked === 'none' ? null : picked });
  };

  const run = async (kind: NonNullable<typeof busy>, job: () => Promise<void>, failTitle: string) => {
    if (busy) return;
    if (items.length === 0) {
      await notify('No items in the claim yet', 'Add what was lost or damaged first.');
      return;
    }
    setBusy(kind);
    try {
      await job();
      success();
    } catch (e) {
      await notify(failTitle, e instanceof Error && e.name === 'DocError' ? e.message : 'Check that there is free space on this iPhone, then try again.');
    } finally {
      setBusy(null);
    }
  };

  const end = async () => {
    const others = doc.claims.length - 1;
    const sure = await confirm({
      title: 'End this claim?',
      message: `Its details are cleared and ${plural(items.length, 'item')} ${items.length === 1 ? 'is' : 'are'} taken out of it. The items themselves stay in your inventory${others > 0 ? `, and your ${others === 1 ? 'other claim stays' : `${others} other claims stay`} open` : ''}. Make the claim package first if you still need it.`,
      confirmLabel: 'End claim',
      destructive: true,
    });
    if (!sure) return;
    warning();
    if (router.canGoBack()) router.back();
    else router.replace('/report');
    store.update((d) => removeClaim(d, claimId));
  };

  return (
    <PushedScreen testID="claim-screen">
      <Stack.Screen options={{ title: doc.claims.length > 1 ? claimTitle(claim) : 'Claim' }} />

      <View style={{ paddingHorizontal: space.xl }}>
        <Text style={[type.footnote, { color: c.ink2, fontWeight: '600' }]}>Value claimed</Text>
        <Text testID="claim-total" style={[type.figure, type.tabular, { color: c.ink, fontSize: 32, lineHeight: 38 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
          {formatMoney(summary.totalCents, currency, { whole: true })}
        </Text>
        <Text testID="claim-count" style={[type.footnote, { color: c.ink2, marginTop: 1 }]}>
          {summary.count === 0 ? 'No items yet' : `${plural(summary.count, 'item')} · ${lossCountLine(summary.byStatus)}`}
          {doc.policy.deductibleCents !== null ? ` · deductible ${formatMoney(doc.policy.deductibleCents, currency, { whole: true })}` : ''}
        </Text>
      </View>
      {summary.unvalued > 0 ? (
        <Notice icon="warning" tone="amber">
          {summary.unvalued === 1 ? '1 item in the claim has no value. ' : `${summary.unvalued} items in the claim have no value. `}
          Add what each would cost to replace, or the adjuster will have to ask.
        </Notice>
      ) : null}

      <SectionLabel>The claim</SectionLabel>
      <Card>
        <LiveTextRow testID="claim-name" label="Name" stored={claim.name} onType={(t) => set({ name: t })} placeholder="Optional, such as Kitchen fire" maxLength={LIMITS.short} autoCapitalize="sentences" />
        <Divider />
        <LiveTextRow testID="claim-number" label="Claim number" stored={claim.claimNumber} onType={(t) => set({ claimNumber: t })} placeholder="From your insurer" maxLength={LIMITS.short} autoCapitalize="characters" autoCorrect={false} />
        <Divider />
        <FormRow label="Date of loss">
          <DateField testID="claim-date" label="Date of loss" value={claim.lossDate} onChange={(ymd) => set({ lossDate: ymd })} />
        </FormRow>
        <Divider />
        <PickRow testID="claim-cause" label="Cause" value={claim.cause ? LOSS_CAUSE_LABELS[claim.cause] : null} placeholder="Choose" onPress={pickCause} />
        <Divider />
        <LiveTextArea
          testID="claim-description"
          label="What happened"
          stored={claim.description}
          onType={(t) => set({ description: t })}
          placeholder="What happened, in your words: when, where, what you found"
          maxLength={LIMITS.notes}
        />
      </Card>
      <Footnote>Printed at the top of the schedule of loss.</Footnote>

      <SectionLabel
        trailing={
          <Text testID="claim-add-items" accessibilityRole="link" onPress={openItems} style={[type.footnote, { color: c.green, fontWeight: '600' }]}>
            {items.length === 0 ? 'Choose items' : 'Add or remove'}
          </Text>
        }>
        {items.length === 0 ? 'Items in the claim' : `Items in the claim (${items.length})`}
      </SectionLabel>
      {items.length === 0 ? (
        <Card style={{ padding: space.l, gap: space.m }}>
          <Text style={[type.subhead, { color: c.ink2 }]}>Choose what was stolen, damaged, destroyed or lost. You can also add an item from its own screen.</Text>
          <Button testID="claim-choose" label="Choose items" kind="soft" onPress={openItems} />
        </Card>
      ) : (
        <Card>
          {items.map((item, i) => (
            <View key={item.id}>
              {i > 0 ? <Divider inset={space.l + 44 + space.m} /> : null}
              <Row
                testID={`claim-item-${i}`}
                leading={<Thumb photoId={item.photos[0]?.id} size={44} rounded={radius.s} />}
                title={item.name}
                // The missing note before the room: when the line is cut short, the room is what goes.
                subtitle={[item.loss ? LOSS_LABELS[item.loss] : null, item.lossNote ? null : 'no note', rooms.get(item.roomId) ?? null].filter(Boolean).join(' · ')}
                value={hasValue(item) ? formatMoney(itemTotalCents(item), currency, { whole: true }) : 'No value'}
                valueTone={hasValue(item) ? 'ink' : 'amber'}
                chevron
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              />
            </View>
          ))}
        </Card>
      )}

      <SectionLabel>For your insurer</SectionLabel>
      <View style={{ marginHorizontal: space.xl, gap: space.s }}>
        <Button testID="claim-package" label="Make the claim package" icon="box" busy={busy === 'package'} onPress={() => run('package', () => makeClaimPackage(claimId), 'The claim package could not be made')} />
        <Button
          testID="claim-pdf"
          label={MAKES_PDF ? 'Schedule of loss (PDF)' : 'Open the schedule of loss'}
          icon="report"
          kind="soft"
          busy={busy === 'pdf'}
          onPress={() => run('pdf', () => makeReport({ claimId, includePhotos: true, includeReceipts: true, includeAllPhotos: true }), 'The schedule could not be made')}
        />
        <Button testID="claim-csv" label="Claim spreadsheet" icon="table" kind="soft" busy={busy === 'csv'} onPress={() => run('csv', () => exportSpreadsheet(claimId), 'The spreadsheet could not be made')} />
      </View>
      <Footnote>
        The package is one .zip: the schedule of loss, the spreadsheet, every photo and receipt of the claimed items in a folder each, the walk-through videos of their rooms, and your policy. Send it to the adjuster, or save it to Files.
      </Footnote>

      <Card style={{ marginTop: space.xxl }}>
        <Row testID="claim-end" title="End the claim" destructive onPress={end} />
      </Card>
      <Footnote>When the claim is settled. Your items stay, and so do any other claims.</Footnote>
    </PushedScreen>
  );
}

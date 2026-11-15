import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { claimedItems, closeClaim, openClaim, updateClaim } from '@/domain/actions';
import { formatMoney } from '@/domain/money';
import { claimSummary, hasValue, itemTotalCents, lossCountLine, plural } from '@/domain/selectors';
import { LIMITS, LOSS_CAUSES, LOSS_CAUSE_LABELS, LOSS_LABELS, type LossCause } from '@/domain/types';
import { success, warning } from '@/platform/haptics';
import { MAKES_PDF } from '@/platform/exporter';
import { exportSpreadsheet, makeClaimPackage, makeReport } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { DateField } from '@/ui/DateField';
import { choose, confirm, notify } from '@/ui/dialogs';
import { FormRow, LiveTextArea, LiveTextRow, PickRow } from '@/ui/form';
import { Button, Card, Divider, EmptyState, Footnote, Notice, PushedScreen, Row, SectionLabel, Thumb } from '@/ui/kit';
import { radius, space, type, useTheme } from '@/ui/theme';

// A claim after a loss: its details, the items it covers, and what goes to the insurer.

export default function ClaimScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const doc = useDoc();
  const [busy, setBusy] = useState<'package' | 'pdf' | 'csv' | null>(null);
  const claim = doc.claim;
  const items = claimedItems(doc);
  const summary = claimSummary(doc);
  const currency = doc.settings.currency;
  const rooms = new Map(doc.rooms.map((r) => [r.id, r.name]));

  if (!claim) {
    return (
      <PushedScreen testID="claim-screen">
        <Stack.Screen options={{ title: 'Claim' }} />
        <EmptyState
          icon="report"
          title="Making a claim"
          body="After a fire, a flood or a break-in, mark what was stolen, damaged or destroyed. Plainproof turns it into the schedule of loss your insurer asks for, with each item’s photos, receipts and value."
          action={<Button testID="claim-start" label="Start a claim" onPress={() => store.update((d, now) => openClaim(d, now))} />}
        />
        <Footnote style={{ textAlign: 'center' }}>Nothing is sent anywhere. You choose who gets the files.</Footnote>
      </PushedScreen>
    );
  }

  const set = (patch: Parameters<typeof updateClaim>[1]) => store.update((d, now) => updateClaim(d, patch, now));

  const pickCause = async () => {
    const picked = await choose<LossCause | 'none'>({
      title: 'What caused the loss?',
      choices: [...LOSS_CAUSES.map((k) => ({ key: k, label: LOSS_CAUSE_LABELS[k] })), { key: 'none' as const, label: 'Not stated' }],
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
    const sure = await confirm({
      title: 'End this claim?',
      message: `The claim details are cleared and ${plural(items.length, 'item')} ${items.length === 1 ? 'is' : 'are'} unmarked. The items themselves stay in your inventory. Make the claim package first if you still need it.`,
      confirmLabel: 'End claim',
      destructive: true,
    });
    if (!sure) return;
    warning();
    store.update((d, now) => closeClaim(d, now));
  };

  return (
    <PushedScreen testID="claim-screen">
      <Stack.Screen options={{ title: 'Claim' }} />

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
          <Text testID="claim-add-items" accessibilityRole="link" onPress={() => router.push('/claim-items')} style={[type.footnote, { color: c.green, fontWeight: '600' }]}>
            {items.length === 0 ? 'Choose items' : 'Add or remove'}
          </Text>
        }>
        {items.length === 0 ? 'Items in the claim' : `Items in the claim (${items.length})`}
      </SectionLabel>
      {items.length === 0 ? (
        <Card style={{ padding: space.l, gap: space.m }}>
          <Text style={[type.subhead, { color: c.ink2 }]}>Choose what was stolen, damaged, destroyed or lost. You can also add an item from its own screen.</Text>
          <Button testID="claim-choose" label="Choose items" kind="soft" onPress={() => router.push('/claim-items')} />
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
                subtitle={`${item.loss ? LOSS_LABELS[item.loss] : ''} · ${rooms.get(item.roomId) ?? ''}${item.lossNote ? '' : ' · no note'}`}
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
        <Button testID="claim-package" label="Make the claim package" icon="box" busy={busy === 'package'} onPress={() => run('package', makeClaimPackage, 'The claim package could not be made')} />
        <Button
          testID="claim-pdf"
          label={MAKES_PDF ? 'Schedule of loss (PDF)' : 'Open the schedule of loss'}
          icon="report"
          kind="soft"
          busy={busy === 'pdf'}
          onPress={() => run('pdf', () => makeReport({ scope: 'claim', includePhotos: true, includeReceipts: true, includeAllPhotos: true }), 'The schedule could not be made')}
        />
        <Button testID="claim-csv" label="Claim spreadsheet" icon="table" kind="soft" busy={busy === 'csv'} onPress={() => run('csv', () => exportSpreadsheet('claim'), 'The spreadsheet could not be made')} />
      </View>
      <Footnote>
        The package is one .zip: the schedule of loss, the spreadsheet, every photo and receipt of the claimed items in a folder each, the walk-through videos of their rooms, and your policy. Send it to the adjuster, or save it to Files.
      </Footnote>

      <Card style={{ marginTop: space.xxl }}>
        <Row testID="claim-end" title="End the claim" destructive onPress={end} />
      </Card>
      <Footnote>When the claim is settled. Your items stay; only the claim marks go.</Footnote>
    </PushedScreen>
  );
}

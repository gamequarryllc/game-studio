import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { updateProfile } from '@/domain/actions';
import { displayTime, relativeDay } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { reportTitle } from '@/domain/report';
import { homeSummary, plural, roomSummaries } from '@/domain/selectors';
import { LIMITS, type Profile } from '@/domain/types';
import { success } from '@/platform/haptics';
import { MAKES_PDF } from '@/platform/exporter';
import { backUp, exportSpreadsheet, makeReport, restoreFromBackup } from '@/state/operations';
import { PLACE_KIND_LABELS, currentPlace, mapDocs, placeName, totalItems } from '@/domain/library';
import { store, useDoc, useLibrary } from '@/state/store';
import { confirm, notify } from '@/ui/dialogs';
import { FormRow, TextRow } from '@/ui/form';
import { Button, Card, Divider, Footnote, Notice, Row, SectionLabel, TabScreen } from '@/ui/kit';
import { display, space, type, useTheme } from '@/ui/theme';

/** The first page of the report in miniature, with the real figures on it. */
function Sheet() {
  const { c, dark } = useTheme();
  const doc = useDoc();
  const summary = homeSummary(doc);
  const rooms = roomSummaries(doc).filter((r) => r.count > 0);
  const currency = doc.settings.currency;
  const [today] = useState(() => Date.now());
  const paper = dark ? '#ECE7DB' : '#FFFFFF';
  const ink = '#1C1B18';
  const soft = '#6B675E';
  const rule = '#D8D2C4';
  const green = '#1E5B48';
  return (
    <View testID="report-sheet" style={[styles.sheet, { backgroundColor: paper, shadowColor: '#000', borderColor: dark ? 'transparent' : c.rule }]} accessible accessibilityLabel="Preview of the report’s first page">
      <Text style={[styles.sheetKicker, { color: green }]}>Home inventory</Text>
      <Text style={{ fontFamily: display.semibold, fontSize: 21, lineHeight: 25, color: ink }} numberOfLines={1}>
        {reportTitle(doc)}
      </Text>
      <Text style={{ fontSize: 10, lineHeight: 14, color: soft, marginTop: 1 }}>
        {doc.profile.ownerName ? `Prepared for ${doc.profile.ownerName} · ` : ''}
        {displayTime(today)}
      </Text>
      <View style={[styles.sheetTotals, { borderColor: green }]}>
        <View style={{ flex: 1.3 }}>
          <Text style={[styles.sheetLabel, { color: soft }]}>Total value</Text>
          <Text style={[type.tabular, { fontFamily: display.medium, fontSize: 17, lineHeight: 21, color: ink }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(summary.totalCents, currency)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sheetLabel, { color: soft }]}>Items</Text>
          <Text style={[type.tabular, { fontFamily: display.medium, fontSize: 17, lineHeight: 21, color: ink }]}>{summary.count}</Text>
        </View>
        <View style={{ flex: 0.8 }}>
          <Text style={[styles.sheetLabel, { color: soft }]}>Rooms</Text>
          <Text style={[type.tabular, { fontFamily: display.medium, fontSize: 17, lineHeight: 21, color: ink }]}>{rooms.length}</Text>
        </View>
      </View>
      {rooms.slice(0, 4).map((r) => (
        <View key={r.room.id} style={[styles.sheetRow, { borderBottomColor: rule }]}>
          <Text style={{ flex: 1, fontSize: 11, lineHeight: 15, color: ink }} numberOfLines={1}>
            {r.room.name}
          </Text>
          <Text style={[type.tabular, { fontSize: 11, lineHeight: 15, color: soft, width: 46, textAlign: 'right' }]}>{r.count}</Text>
          <Text style={[type.tabular, { fontSize: 11, lineHeight: 15, color: ink, width: 84, textAlign: 'right' }]}>{formatMoney(r.totalCents, currency)}</Text>
        </View>
      ))}
      {rooms.length === 0 ? <Text style={{ fontSize: 11, lineHeight: 15, color: soft, marginTop: 8 }}>Rooms and their totals are listed here once you add something.</Text> : null}
      {rooms.length > 4 ? <Text style={{ fontSize: 10, lineHeight: 14, color: soft, marginTop: 5 }}>and {plural(rooms.length - 4, 'more room')}, then every item with its photo</Text> : null}
    </View>
  );
}

/**
 * A line of the report's heading. What is typed is kept here as typed; the saved copy is tidied (trimmed) on every
 * key, and showing that copy back would swallow each space the moment it was typed.
 */
function HeadingRow({ stored, onType, ...row }: { stored: string; onType: (text: string) => void } & Omit<ComponentProps<typeof TextRow>, 'value' | 'onChangeText'>) {
  const [typed, setTyped] = useState(stored);
  const [seen, setSeen] = useState(stored);
  // The saved value changed from outside (another place was opened, a backup was restored): show that instead.
  if (stored !== seen) {
    setSeen(stored);
    if (stored !== typed.trim()) setTyped(stored);
  }
  return (
    <TextRow
      {...row}
      value={typed}
      onChangeText={(text) => {
        setTyped(text);
        onType(text);
      }}
    />
  );
}

export default function ReportTab() {
  const { c } = useTheme();
  const doc = useDoc();
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [busy, setBusy] = useState<'report' | 'csv' | 'backup' | 'restore' | null>(null);
  const [now] = useState(() => Date.now());
  const count = doc.items.length;
  // A restore replaces every place, so it is weighed against everything held, not only this place.
  const library = useLibrary();
  const router = useRouter();
  const held = totalItems(library);

  const place = currentPlace(library);
  const several = library.places.length > 1;
  // The name, address, insurer and policy belong to the open place. The owner's name is the same on every place's report.
  const setProfile = (patch: Partial<Profile>) => store.update((d) => updateProfile(d, patch));
  const setOwner = (ownerName: string) => store.updateLibrary((lib) => mapDocs(lib, (d) => updateProfile(d, { ownerName })));

  const run = async (kind: NonNullable<typeof busy>, job: () => Promise<void>, failTitle: string, failBody: string) => {
    if (busy) return;
    setBusy(kind);
    try {
      await job();
    } catch (e) {
      const message = e instanceof Error && e.name === 'DocError' ? e.message : failBody;
      await notify(failTitle, message);
    } finally {
      setBusy(null);
    }
  };

  const report = () =>
    run('report', () => makeReport({ includePhotos, includeReceipts }).then(success), 'The report could not be made', 'Try again. If it keeps happening, try it without photos.');

  const csv = () => run('csv', exportSpreadsheet, 'The spreadsheet could not be made', 'Try again in a moment.');

  const backup = () =>
    run(
      'backup',
      async () => {
        const result = await backUp();
        success();
        if (result.missing > 0) {
          await notify('Backup made, with a gap', `${plural(result.missing, 'photo')} could not be found on this iPhone and ${result.missing === 1 ? 'is' : 'are'} not in the backup.`);
        }
      },
      'The backup could not be made',
      'Check that there is free space on this iPhone, then try again.',
    );

  const restore = () =>
    run(
      'restore',
      async () => {
        const outcome = await restoreFromBackup((found) =>
          confirm({
            title: 'Replace what’s on this iPhone?',
            message:
              `The backup holds ${plural(found.items, 'item')} in ${plural(found.rooms, 'room')}${found.places > 1 ? ` across ${found.places} places` : ''}. ` +
              (held > 0 ? `It will replace the ${plural(held, 'item')} here now.` : 'This inventory is empty, so nothing is lost.'),
            confirmLabel: 'Replace',
            destructive: held > 0,
          }),
        );
        if (outcome.kind === 'restored') {
          success();
          await notify(
            'Backup restored',
            `${plural(outcome.items, 'item')} in ${plural(outcome.rooms, 'room')}${outcome.places > 1 ? ` across ${outcome.places} places` : ''}, with ${plural(outcome.photos, 'photo')}.`,
          );
        }
      },
      'That backup could not be restored',
      'The file may be damaged. Nothing on this iPhone was changed.',
    );

  const lastBackup = doc.meta.lastBackupAt;
  // Arriving from the "Not backed up" note on the Rooms tab brings the backup section into view.
  const params = useLocalSearchParams<{ show?: string; at?: string }>();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (params.show !== 'backup') return;
    const timer = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 250);
    return () => clearTimeout(timer);
  }, [params.show, params.at]);
  const switchColors = { trackColor: { true: c.green, false: c.sunk }, ...(Platform.OS === 'web' ? { activeThumbColor: '#fff' } : {}) };

  return (
    <TabScreen testID="report-screen" title="Report" scroller={scroller}>
      <Sheet />
      {library.places.length > 1 ? (
        // An insurer covers one address on one policy, so each place makes its own report. Say which one this is.
        <Text testID="report-place" style={[type.footnote, { color: c.ink2, textAlign: 'center', marginHorizontal: space.xxl, marginTop: space.m }]}>
          {`This report is for ${placeName(currentPlace(library))} only. Each place has its own. `}
          <Text testID="report-change-place" accessibilityRole="link" style={{ color: c.green, fontWeight: '600' }} onPress={() => router.push('/places')}>
            Change place
          </Text>
        </Text>
      ) : null}
      <View style={{ marginHorizontal: space.xl, marginTop: space.xl, gap: space.s }}>
        <Button testID="make-report" label={MAKES_PDF ? 'Create the PDF report' : 'Open the report'} icon="report" busy={busy === 'report'} onPress={report} />
        <Button testID="make-csv" label="Export a spreadsheet" icon="table" kind="soft" busy={busy === 'csv'} onPress={csv} />
      </View>
      {MAKES_PDF ? (
        <Footnote>The report opens in the share sheet, so you can save it to Files, print it or send it to your insurer.</Footnote>
      ) : (
        <Notice icon="phone">In this web preview the report opens in a new tab and files download. On iPhone it becomes a PDF in the share sheet.</Notice>
      )}

      <SectionLabel>In the report</SectionLabel>
      <Card>
        <FormRow label="A photo of each item">
          <Switch testID="opt-photos" accessibilityLabel="A photo of each item" value={includePhotos} onValueChange={setIncludePhotos} {...switchColors} />
        </FormRow>
        <Divider />
        <FormRow label="Receipts, at the end">
          <Switch testID="opt-receipts" accessibilityLabel="Receipts, at the end" value={includeReceipts} onValueChange={setIncludeReceipts} {...switchColors} />
        </FormRow>
      </Card>

      <SectionLabel>{place.kind === 'home' ? 'This home' : 'This place'}</SectionLabel>
      <Card>
        <HeadingRow key={`name-${place.id}`} testID="profile-home" label="Name" stored={doc.profile.homeName} onType={(t) => setProfile({ homeName: t })} placeholder={PLACE_KIND_LABELS[place.kind]} maxLength={LIMITS.short} autoCapitalize="words" />
        <Divider />
        <HeadingRow key={`address-${place.id}`} testID="profile-address" label="Address" stored={doc.profile.address} onType={(t) => setProfile({ address: t })} placeholder="Optional" maxLength={LIMITS.address} autoCapitalize="words" textContentType="fullStreetAddress" />
        <Divider />
        <HeadingRow key={`insurer-${place.id}`} testID="profile-insurer" label="Insurer" stored={doc.profile.insurer} onType={(t) => setProfile({ insurer: t })} placeholder="Optional" maxLength={LIMITS.short} autoCapitalize="words" />
        <Divider />
        <HeadingRow key={`policy-${place.id}`} testID="profile-policy" label="Policy number" stored={doc.profile.policyNumber} onType={(t) => setProfile({ policyNumber: t })} placeholder="Optional" maxLength={LIMITS.short} autoCapitalize="characters" autoCorrect={false} />
      </Card>
      <Footnote>{several ? `Printed at the top of the report for ${placeName(place)}. Each place keeps its own.` : 'Printed at the top of the report.'}</Footnote>

      <SectionLabel>You</SectionLabel>
      <Card>
        <HeadingRow testID="profile-owner" label="Your name" stored={doc.profile.ownerName} onType={setOwner} placeholder="Optional" maxLength={LIMITS.short} autoCapitalize="words" textContentType="name" />
      </Card>
      <Footnote>{several ? 'Printed on every place’s report. Like everything else, it is kept only on this iPhone.' : 'Printed on the report. Like everything else, it is kept only on this iPhone.'}</Footnote>

      <SectionLabel>Backup</SectionLabel>
      <Card style={{ padding: space.l }}>
        <Text style={[type.subhead, { color: c.ink }]}>
          This inventory lives on this iPhone and nowhere else. Keep a copy somewhere the phone isn’t, so losing one doesn’t mean losing both.
        </Text>
        <Text testID="last-backup" style={[type.footnote, { color: lastBackup ? c.ink2 : c.amber, marginTop: space.s, fontWeight: lastBackup ? '400' : '600' }]}>
          {lastBackup ? `Last backed up ${relativeDay(lastBackup, Math.max(now, lastBackup))}.` : count > 0 ? 'Not backed up yet.' : 'Nothing to back up yet.'}
        </Text>
        <Button testID="backup-now" label="Back up now" icon="backup" kind="soft" busy={busy === 'backup'} onPress={backup} style={{ marginTop: space.l }} />
      </Card>
      <Card style={{ marginTop: space.m }}>
        <Row testID="restore" title="Restore from a backup" tint onPress={restore} />
      </Card>
      <Footnote>A backup is one file with every item and photo in it. Save it to iCloud Drive, a computer, or email it to yourself.</Footnote>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  sheet: {
    marginHorizontal: space.xxl + space.s,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sheetKicker: { fontSize: 8, lineHeight: 11, letterSpacing: 1.3, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  sheetLabel: { fontSize: 7.5, lineHeight: 10, letterSpacing: 0.7, textTransform: 'uppercase' },
  sheetTotals: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 2, paddingHorizontal: 9, paddingVertical: 7, marginTop: 10, marginBottom: 4 },
  sheetRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
});

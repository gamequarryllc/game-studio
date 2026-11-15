import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { addPolicyDocuments, removePolicyDocument, updatePolicy, updateProfile } from '@/domain/actions';
import { ASK_ABOUT_CENTS, OFTEN_LIMITED, coverage } from '@/domain/coverage';
import { displayTime } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { formatMoney } from '@/domain/money';
import { formatBytes, plural, unitCents } from '@/domain/selectors';
import { CATEGORIES, CATEGORY_LABELS, LIMITS, type Attachment, type Category } from '@/domain/types';
import { importFile, importPageImage, previewAttachment } from '@/platform/attachments';
import { success, warning } from '@/platform/haptics';
import { pickPdfs } from '@/platform/pickFiles';
import { pickFromLibrary, takePhoto } from '@/platform/pickImages';
import { dropFiles } from '@/state/operations';
import { store, useDoc } from '@/state/store';
import { choose, confirm, notify } from '@/ui/dialogs';
import { LiveTextRow, MoneyRow } from '@/ui/form';
import { Icon } from '@/ui/Icon';
import { Button, Card, Divider, Footnote, Notice, PushedScreen, Row, SectionLabel } from '@/ui/kit';
import { space, type, useTheme } from '@/ui/theme';

// The place's insurance policy: the document itself, the limits from it, and a
// check of the inventory against those limits.

export default function PolicyScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const doc = useDoc();
  const [adding, setAdding] = useState(false);
  const currency = doc.settings.currency;
  const policy = doc.policy;
  const cover = coverage(doc);
  const money = (cents: number) => formatMoney(cents, currency, { whole: true });

  // The kinds with a special limit row: the ones policies often limit, any the person has set, and any added just now.
  const [extra, setExtra] = useState<Category[]>([]);
  const limitKinds = CATEGORIES.filter((k) => OFTEN_LIMITED.includes(k) || policy.categoryLimits[k] !== undefined || extra.includes(k));
  const otherKinds = CATEGORIES.filter((k) => !limitKinds.includes(k));

  const setLimit = (category: Category, cents: number | null) =>
    store.update((d) => {
      const limits = { ...d.policy.categoryLimits };
      if (cents === null) delete limits[category];
      else limits[category] = cents;
      return updatePolicy(d, { categoryLimits: limits });
    });

  const addKind = async () => {
    const picked = await choose<Category>({ title: 'A special limit for', choices: otherKinds.map((k) => ({ key: k, label: CATEGORY_LABELS[k] })) });
    if (picked) setExtra((e) => [...e, picked]);
  };

  const addDocuments = async () => {
    const room = LIMITS.policyDocuments - policy.documents.length;
    if (room <= 0) {
      await notify('That’s the most this place can keep', `Up to ${LIMITS.policyDocuments} documents. Remove one to add another.`);
      return;
    }
    const how = await choose<'pdf' | 'camera' | 'library'>({
      title: 'Add your policy',
      message: 'The policy, its declarations page, or any letter from your insurer.',
      choices: [
        { key: 'pdf', label: 'Choose a PDF' },
        ...(Platform.OS === 'web' ? [] : [{ key: 'camera' as const, label: 'Photograph the pages' }]),
        { key: 'library', label: 'Choose photos of the pages' },
      ],
    });
    if (!how) return;
    setAdding(true);
    try {
      const added: Attachment[] = [];
      if (how === 'pdf') {
        for (const f of (await pickPdfs()).slice(0, room)) {
          const id = newId();
          const bytes = await importFile(f.uri, `${id}.pdf`);
          added.push({ id, name: f.name.replace(/\.pdf$/i, ''), kind: 'pdf', bytes, addedAt: Date.now() });
        }
      } else {
        const picked = how === 'camera' ? await takePhoto() : await pickFromLibrary(room);
        if (picked === 'denied') {
          await notify('The camera is switched off for Plainproof', 'You can allow it in the Settings app, under Plainproof.');
          return;
        }
        let page = policy.documents.filter((d) => d.kind === 'image').length;
        for (const image of picked.slice(0, room)) {
          const id = newId();
          page += 1;
          const bytes = await importPageImage(image, `${id}.jpg`);
          added.push({ id, name: `Policy page ${page}`, kind: 'image', bytes, addedAt: Date.now() });
        }
      }
      if (added.length > 0) {
        store.update((d) => addPolicyDocuments(d, added));
        success();
      }
    } catch {
      await notify('That document could not be added', 'Try again, or try another copy of it.');
    } finally {
      setAdding(false);
    }
  };

  const open = async (a: Attachment) => {
    try {
      await previewAttachment(`${a.id}.${a.kind === 'pdf' ? 'pdf' : 'jpg'}`, a.name);
    } catch {
      await notify('This document is missing', 'Its file is not on this iPhone. It may not have been in the backup it came from.');
    }
  };

  const remove = async (a: Attachment) => {
    const sure = await confirm({ title: `Remove “${a.name}”?`, message: 'The copy kept in Plainproof is deleted.', confirmLabel: 'Remove', destructive: true });
    if (!sure) return;
    warning();
    store.update((d) => removePolicyDocument(d, a.id));
    void dropFiles([`${a.id}.${a.kind === 'pdf' ? 'pdf' : 'jpg'}`]);
  };

  const share = cover.share ?? 0;
  const barTone = cover.state === 'over' ? c.red : cover.state === 'close' ? c.amber : c.green;

  return (
    <PushedScreen testID="policy-screen">
      <Stack.Screen options={{ title: 'Policy and coverage' }} />

      <SectionLabel>The policy</SectionLabel>
      <Card>
        {policy.documents.map((a, i) => (
          <View key={a.id}>
            {i > 0 ? <Divider inset={space.l + 36 + space.m} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Row
                  testID={`policy-doc-${i}`}
                  leading={
                    <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: c.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={a.kind === 'pdf' ? 'report' : 'photo'} size={18} color={c.green} />
                    </View>
                  }
                  title={a.name}
                  subtitle={`${a.kind === 'pdf' ? 'PDF' : 'Photo'} · ${formatBytes(a.bytes)} · ${displayTime(a.addedAt)}`}
                  onPress={() => void open(a)}
                />
              </View>
              <Pressable testID={`policy-doc-remove-${i}`} accessibilityRole="button" accessibilityLabel={`Remove ${a.name}`} hitSlop={8} onPress={() => void remove(a)} style={{ paddingHorizontal: space.l, paddingVertical: space.m }}>
                <Icon name="trash" size={18} color={c.ink3} />
              </Pressable>
            </View>
          </View>
        ))}
        {policy.documents.length > 0 ? <Divider /> : null}
        <Row testID="policy-add" title={policy.documents.length === 0 ? 'Add your policy' : 'Add another page or document'} subtitle={policy.documents.length === 0 ? 'A PDF, or photos of the pages' : undefined} tint onPress={() => void addDocuments()} />
      </Card>
      <Footnote>{adding ? 'Adding…' : 'Kept here with your inventory, so the policy is with you after a loss. It goes in your backups and in a claim package.'}</Footnote>

      <SectionLabel>From the policy</SectionLabel>
      <Card>
        <LiveTextRow testID="policy-insurer" label="Insurer" stored={doc.profile.insurer} onType={(t) => store.update((d) => updateProfile(d, { insurer: t }))} placeholder="Optional" maxLength={LIMITS.short} autoCapitalize="words" />
        <Divider />
        <LiveTextRow
          testID="policy-number"
          label="Policy number"
          stored={doc.profile.policyNumber}
          onType={(t) => store.update((d) => updateProfile(d, { policyNumber: t }))}
          placeholder="Optional"
          maxLength={LIMITS.short}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Divider />
        <MoneyRow testID="policy-limit" label="Contents limit" cents={policy.contentsLimitCents} onChange={(cents) => store.update((d) => updatePolicy(d, { contentsLimitCents: cents }))} currency={currency} placeholder="Personal property" />
        <Divider />
        <MoneyRow testID="policy-deductible" label="Deductible" cents={policy.deductibleCents} onChange={(cents) => store.update((d) => updatePolicy(d, { deductibleCents: cents }))} currency={currency} placeholder="Optional" />
      </Card>
      <Footnote>The contents limit is the most the policy pays for your belongings (“personal property”, often Coverage C). It is on the declarations page.</Footnote>

      <SectionLabel>Special limits</SectionLabel>
      <Card>
        {limitKinds.map((k, i) => (
          <View key={k}>
            {i > 0 ? <Divider /> : null}
            <MoneyRow testID={`policy-limit-${k}`} label={CATEGORY_LABELS[k]} cents={policy.categoryLimits[k] ?? null} onChange={(cents) => setLimit(k, cents)} currency={currency} placeholder="None stated" />
          </View>
        ))}
        {otherKinds.length > 0 ? (
          <>
            <Divider />
            <Row testID="policy-limit-add" title="Another kind of thing" tint onPress={() => void addKind()} />
          </>
        ) : null}
      </Card>
      <Footnote>Many policies pay only up to a set amount for jewelry, art, instruments or sports gear, most of all after a theft, unless each piece is listed on the policy. Look for “special limits” or “sub-limits”.</Footnote>

      <SectionLabel>Coverage check</SectionLabel>
      <Card style={{ padding: space.l, gap: space.s }}>
        <Text testID="coverage-line" style={[type.body, { color: c.ink }]}>
          {cover.state === 'unknown'
            ? `Your things are worth ${money(cover.totalCents)}. Add the contents limit above to compare.`
            : cover.state === 'over'
              ? `Your things are worth ${money(cover.totalCents)}, more than the ${money(cover.limitCents ?? 0)} the policy covers.`
              : `Your things are worth ${money(cover.totalCents)}, ${Math.round(share * 100)}% of the ${money(cover.limitCents ?? 0)} the policy covers.`}
        </Text>
        {cover.state !== 'unknown' ? (
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(share * 100)) }} style={{ height: 8, borderRadius: 4, backgroundColor: c.sunk, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, Math.max(2, share * 100))}%`, height: 8, backgroundColor: barTone }} />
          </View>
        ) : null}
        {cover.state === 'over' || cover.state === 'close' ? (
          <Text style={[type.footnote, { color: c.amber, fontWeight: '600' }]}>
            {cover.state === 'over' ? 'Ask your insurer about raising the limit: a total loss would not be paid in full.' : 'Close to the limit. Worth a look at renewal, or after buying something big.'}
          </Text>
        ) : null}
      </Card>

      {cover.byCategory.length > 0 ? (
        <Card style={{ marginTop: space.m }}>
          {cover.byCategory.map((k, i) => (
            <View key={k.category}>
              {i > 0 ? <Divider /> : null}
              <Row
                testID={`coverage-${k.category}`}
                title={CATEGORY_LABELS[k.category]}
                subtitle={k.limitCents !== null ? `${plural(k.count, 'item')} · limit ${money(k.limitCents)}${k.over ? ', over it' : ''}` : plural(k.count, 'item')}
                subtitleTone={k.over ? 'amber' : 'muted'}
                value={money(k.totalCents)}
                valueTone={k.over ? 'amber' : 'ink'}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {cover.toSchedule.length > 0 ? (
        <>
          <SectionLabel>Worth asking about</SectionLabel>
          <Card>
            {cover.toSchedule.map((item, i) => (
              <View key={item.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  testID={`schedule-${i}`}
                  title={item.name}
                  subtitle={item.category ? CATEGORY_LABELS[item.category] : undefined}
                  value={money(unitCents(item) ?? 0)}
                  valueTone="ink"
                  chevron
                  onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                />
              </View>
            ))}
          </Card>
          <Footnote>
            {`Each of these is worth its kind’s special limit or more on its own (${money(ASK_ABOUT_CENTS)} where no limit is typed in, for kinds policies often limit). Insurers can list such pieces on the policy by name, a “scheduled item” or “rider”, so they are covered in full.`}
          </Footnote>
        </>
      ) : null}

      <Notice icon="info">This compares your own figures with the limits you typed in. It is not advice: your insurer can say what your policy covers.</Notice>

      {policy.documents.length === 0 ? (
        <View style={{ marginHorizontal: space.xl, marginTop: space.xl }}>
          <Button testID="policy-add-bottom" label="Add your policy" icon="report" kind="soft" busy={adding} onPress={() => void addDocuments()} />
        </View>
      ) : null}
    </PushedScreen>
  );
}

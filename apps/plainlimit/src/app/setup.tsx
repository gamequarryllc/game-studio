import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cellWords } from '@/domain/battery';
import { clockLabel, durationLabel } from '@/domain/day';
import { toneAt } from '@/domain/tone';
import { askToNotify } from '@/platform/notices';
import { ALLOWED_ID, COUNTED_ID, SCREEN_TIME_AVAILABLE, askPermission, permission, pickCount } from '@/platform/screenTime';
import { store, useDoc } from '@/state/store';
import { AppPicker } from '@/ui/AppPicker';
import { Battery } from '@/ui/Battery';
import { ALLOWED_EXPLAINED, EVERYTHING_ROWS, TICKED_ROWS } from '@/ui/countWords';
import { BigButton, Card, Choice, StepButton } from '@/ui/kit';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

// The first launch, one question at a time. On a phone, Screen Time access
// comes before anything that opens Apple's list of apps, which needs it.
// Everything here can be changed later in Settings.

const FULL = toneAt(0);

type Step = 'welcome' | 'goal' | 'recharge' | 'access' | 'notify' | 'counts' | 'allowed' | 'widget' | 'done';

const STEPS: Step[] = SCREEN_TIME_AVAILABLE
  ? ['welcome', 'goal', 'recharge', 'access', 'notify', 'counts', 'allowed', 'widget', 'done']
  : ['welcome', 'goal', 'recharge', 'counts', 'allowed', 'widget', 'done'];

export default function Setup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, accent } = useDay();
  const { settings: saved } = useDoc();
  const [at, setAt] = useState(0);
  const [access, setAccess] = useState(() => (SCREEN_TIME_AVAILABLE ? permission() : 'unknown'));
  const [asked, setAsked] = useState(false);
  const [picking, setPicking] = useState<typeof COUNTED_ID | typeof ALLOWED_ID | null>(null);
  const [busy, setBusy] = useState(false);
  const [, redraw] = useState(0);

  const step = STEPS[at];
  const next = () => setAt((i) => Math.min(STEPS.length - 1, i + 1));
  const approved = access === 'approved';
  const canPick = SCREEN_TIME_AVAILABLE && approved;
  const ticked = settings.countMode !== 'everything';
  const countedPicks = pickCount(COUNTED_ID);
  const allowedCount = SCREEN_TIME_AVAILABLE ? pickCount(ALLOWED_ID) : saved.allowed.length;

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    if (approved) await store.turnOnScreenTime();
    store.finishSetup();
    setBusy(false);
    router.replace('/');
  };

  const allow = async () => {
    if (busy) return;
    setBusy(true);
    const answer = await askPermission();
    setBusy(false);
    setAccess(answer);
    setAsked(true);
    if (answer === 'approved') next();
  };

  let body: ReactNode = null;
  let primary: { label: string; onPress: () => void } = { label: 'Next', onPress: next };
  let secondary: { label: string; onPress: () => void } | null = null;

  if (step === 'welcome') {
    body = (
      <>
        <View style={[styles.hero, { backgroundColor: FULL.bg }]}>
          <Battery cells={6} tone={FULL} height={84} decorative />
        </View>
        <Heading>Your screen time is a battery</Heading>
        <Point n="1">You get one battery a day, in six cells.</Point>
        <Point n="2">The apps you choose use it up while you use them.</Point>
        <Point n="3">When it runs out, those apps lock. Solve a few sums to earn a little more.</Point>
        <Point n="4">It recharges every morning.</Point>
      </>
    );
    primary = { label: 'Set it up', onPress: next };
  }

  if (step === 'goal') {
    body = (
      <>
        <Heading>How much a day?</Heading>
        <Lead>Your daily goal. Starting a little under what you use now works well. You can change it any time the battery isn&apos;t empty.</Lead>
        <Card style={{ paddingVertical: 18, gap: 10 }}>
          <View style={styles.stepper}>
            <StepButton sign="−" label="Less time" size={52} onPress={() => store.stepGoal(-1)} />
            <Text accessibilityLabel={`Daily goal, ${durationLabel(settings.goalMinutes)}`} style={[styles.big, { color: accent }]}>
              {durationLabel(settings.goalMinutes)}
            </Text>
            <StepButton sign="+" label="More time" size={52} onPress={() => store.stepGoal(1)} />
          </View>
          <Text style={styles.note}>Six cells of {cellWords(settings.goalMinutes)} each</Text>
        </Card>
      </>
    );
  }

  if (step === 'recharge') {
    body = (
      <>
        <Heading>When does it recharge?</Heading>
        <Lead>A full battery arrives at this time every day. Pick when your day starts.</Lead>
        <Card style={{ paddingVertical: 18 }}>
          <View style={styles.stepper}>
            <StepButton sign="−" label="Recharge earlier" size={52} onPress={() => store.stepRecharge(-1)} />
            <Text accessibilityLabel={`Recharges at ${clockLabel(settings.rechargeMinute)}`} style={[styles.big, { fontSize: 44, lineHeight: 48, color: accent }]}>
              {clockLabel(settings.rechargeMinute)}
            </Text>
            <StepButton sign="+" label="Recharge later" size={52} onPress={() => store.stepRecharge(1)} />
          </View>
        </Card>
      </>
    );
  }

  if (step === 'access') {
    body = (
      <>
        <Heading>Allow Screen Time</Heading>
        <Lead>Apple asks you to allow this. Plainlimit is told when a cell&apos;s worth of time has been used, and never what you did in an app.</Lead>
        {approved ? <Text style={styles.ok}>Allowed.</Text> : null}
        {asked && !approved ? (
          <Text style={styles.note}>
            It wasn&apos;t allowed, so Plainlimit can&apos;t count yet. Try again, or skip and allow it later in Settings. If no question appears, open the Settings app, then Screen Time.
          </Text>
        ) : null}
      </>
    );
    primary = approved ? { label: 'Next', onPress: next } : { label: busy ? 'One moment…' : asked ? 'Try again' : 'Allow Screen Time', onPress: () => void allow() };
    if (asked && !approved) secondary = { label: 'Skip for now', onPress: next };
  }

  if (step === 'notify') {
    body = (
      <>
        <Heading>One notification you&apos;ll want</Heading>
        <Lead>
          When the battery is empty, &ldquo;I need more time&rdquo; sends a notification that opens the sums. Apple doesn&apos;t let a lock screen open an app any other way. The only
          other one is a heads-up when the battery is nearly out.
        </Lead>
      </>
    );
    primary = {
      label: 'Allow notifications',
      onPress: () => {
        void askToNotify().then(next);
      },
    };
    secondary = { label: 'Not now', onPress: next };
  }

  if (step === 'counts') {
    body = (
      <>
        <Heading>What counts?</Heading>
        <Lead>Which apps use up the battery, and which lock when it&apos;s empty.</Lead>
        <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
          <Choice title="Everything" rows={EVERYTHING_ROWS} chosen={!ticked} accent={accent} onPress={() => store.setCountMode('everything')} />
          <Choice title="Only what I tick" rows={TICKED_ROWS} chosen={ticked} accent={accent} onPress={() => store.setCountMode('timeWasters')} />
        </View>
        {ticked && canPick ? (
          <View style={{ gap: 10, marginTop: 4 }}>
            <Text style={styles.body}>{countedPicks === 0 ? 'Nothing is ticked yet, so nothing would drain the battery.' : `${countedPicks} ticked.`}</Text>
            <BigButton quiet label={countedPicks === 0 ? 'Choose apps' : 'Change the apps'} onPress={() => setPicking(COUNTED_ID)} />
            <Text style={styles.note}>For the usual time-wasters, tick Social, Games and Entertainment.</Text>
          </View>
        ) : null}
        {ticked && SCREEN_TIME_AVAILABLE && !approved ? <Text style={styles.note}>You can tick apps once Screen Time is allowed, in Settings.</Text> : null}
      </>
    );
  }

  if (step === 'allowed') {
    body = (
      <>
        <Heading>What always opens?</Heading>
        <Lead>Always-allowed apps never lock. Tick Phone, Messages and Maps at least, for calls, texts and directions.</Lead>
        {canPick ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.body}>{allowedCount === 0 ? 'Nothing is allowed through yet.' : allowedCount === 1 ? '1 app is allowed through.' : `${allowedCount} apps are allowed through.`}</Text>
            <BigButton quiet label={allowedCount === 0 ? 'Choose apps' : 'Change the apps'} onPress={() => setPicking(ALLOWED_ID)} />
          </View>
        ) : !SCREEN_TIME_AVAILABLE ? (
          <Text style={styles.body}>{saved.allowed.join(', ')} are allowed. You can change them in Settings.</Text>
        ) : null}
        <Text style={styles.note}>{ALLOWED_EXPLAINED}</Text>
      </>
    );
  }

  if (step === 'widget') {
    body = (
      <>
        <Heading>Put it on your home screen</Heading>
        <Lead>The widget shows the battery without opening the app.</Lead>
        <Point n="1">Touch and hold an empty spot on your home screen.</Point>
        <Point n="2">Tap Edit, then Add Widget.</Point>
        <Point n="3">Search for Plainlimit and pick a size.</Point>
      </>
    );
  }

  if (step === 'done') {
    body = (
      <>
        <Heading>You&apos;re set</Heading>
        <Card>
          <Row label="Daily goal" value={durationLabel(settings.goalMinutes)} />
          <Row label="Recharges at" value={clockLabel(settings.rechargeMinute)} />
          <Row label="What counts" value={ticked ? 'Only what I tick' : 'Everything'} />
          <Row label="Always allowed" value={allowedCount === 1 ? '1 app' : `${allowedCount} apps`} last />
        </Card>
        <Lead>
          {!SCREEN_TIME_AVAILABLE
            ? 'In this preview the battery runs on pretend use, from Settings.'
            : approved
              ? 'Counting starts now, from zero. Everything here can be changed in Settings.'
              : 'Allow Screen Time in Settings when you are ready, and counting starts then.'}
        </Lead>
      </>
    );
    primary = { label: busy ? 'One moment…' : approved ? 'Start counting' : 'Go to Today', onPress: () => void finish() };
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        {at > 0 && step !== 'done' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => setAt((i) => Math.max(0, i - 1))} style={styles.back}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <View accessible accessibilityLabel={`Step ${at + 1} of ${STEPS.length}`} style={styles.dots}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, i <= at ? { backgroundColor: accent } : null]} />
          ))}
        </View>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.body_} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 16 }]}>
        <BigButton label={primary.label} onPress={primary.onPress} />
        {secondary ? <BigButton quiet label={secondary.label} onPress={secondary.onPress} /> : null}
      </View>
      <AppPicker
        id={picking ?? COUNTED_ID}
        open={picking !== null}
        header={picking === ALLOWED_ID ? 'Tick what always opens' : 'Tick what drains your battery'}
        onClose={() => {
          setPicking(null);
          store.picksChanged();
          redraw((n) => n + 1);
        }}
      />
    </View>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return <Text style={styles.lead}>{children}</Text>;
}

function Point({ n, children }: { n: string; children: string }) {
  return (
    <View style={styles.point}>
      <Text style={styles.pointN}>{n}</Text>
      <Text style={styles.pointText}>{children}</Text>
    </View>
  );
}

function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last ? null : styles.rowRule]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 32, paddingVertical: 26, paddingHorizontal: 22, marginBottom: 8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  back: { minWidth: 56, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 16, fontWeight: '600', color: c.ink2 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.raised },
  body_: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 24, gap: 14 },
  heading: { fontFamily: display.bold, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: c.ink },
  lead: { fontSize: 16, lineHeight: 23, color: c.ink2 },
  body: { fontSize: 15, lineHeight: 21, color: c.ink2 },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
  ok: { fontSize: 16, fontWeight: '600', color: c.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  big: { fontFamily: display.bold, fontSize: 60, lineHeight: 64, letterSpacing: -2.2, color: c.ink },
  point: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  pointN: { fontFamily: display.bold, fontSize: 16, lineHeight: 23, color: c.ink3, width: 14 },
  pointText: { flex: 1, fontSize: 17, lineHeight: 24, color: c.ink },
  foot: { paddingHorizontal: 20, paddingTop: 10, gap: 10, borderTopWidth: 1, borderTopColor: c.rule, backgroundColor: c.ground },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: c.rule },
  rowLabel: { fontSize: 16, color: c.ink2 },
  rowValue: { fontSize: 16, fontWeight: '600', color: c.ink },
});

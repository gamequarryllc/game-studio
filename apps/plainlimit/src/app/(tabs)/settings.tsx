import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ASK_ID, askShownOn, openShort } from '@/domain/askFirst';
import { CELLS, cellWords } from '@/domain/battery';
import { clockLabel, clockLabelOf, dayWord, durationLabel } from '@/domain/day';
import { chosenGoal, goalFree } from '@/domain/goal';
import { askFirstFor, sumLevelFor } from '@/domain/pro';
import { topUpPlan, type SumLevel } from '@/domain/puzzle';
import { passActive } from '@/domain/record';
import { batteryEnd, chosenRecharge } from '@/domain/recharge';
import type { EmptyLevel } from '@/domain/types';
import { EXPECTED_PRICE } from '@/pro/config';
import { pro, usePro } from '@/pro/pro';
import { COUNTED_ID, DEV_TOOLS, MOCK_PHONE, SCREEN_TIME_AVAILABLE, essentialsCount, essentialsJoining, essentialsMode, isOn, pickCount } from '@/platform/screenTime';
import { settingsLocked, store, useDoc } from '@/state/store';
import { tap } from '@/platform/haptics';
import { Icon, type IconName } from '@/ui/icons';
import { BigButton, Card, Chevron, IconTile, Label, LinkRow, Page, ProBadge, StepButton, Title, tiles, type RowIcon } from '@/ui/kit';
import { essentialsValue, joinsShort } from '@/ui/countWords';
import { TIPS } from '@/ui/tips';
import { ScreenTimeCard, TestBuildTools } from '@/ui/ScreenTimeCard';
import { c, display } from '@/ui/theme';
import { useDay } from '@/ui/useDay';

export default function Settings() {
  // Drawn afresh each time: it asks the phone things as it draws (is counting
  // on, are the settings locked), which the React Compiler would otherwise keep
  // from the first drawing (the goal's buttons never looked closed at a limit).
  'use no memo';
  const router = useRouter();
  const { settings, day, accent, now } = useDay();
  const first = topUpPlan(0);
  // Read the picks again whenever this tab comes back into view: a tab out of
  // view is not redrawn, and after a change on the Essentials screen the row
  // kept the old number (build 86 said "11 count" for a list of 95).
  // Read only then, not on every tap of a stepper: asking the phone how many
  // are picked takes a moment, and the screen caught on each tap (build 127).
  const [countedValue, setCountedValue] = useState(essentialsNow);
  const [essentialTiles, setEssentialTiles] = useState(essentialTilesNow);
  // New essentials wait for the next recharge (domain/essentials.ts); the row says how many do.
  const [joining, setJoining] = useState(joiningNow);
  // Second thought is on only with apps picked, as on its own screen's switch; the phone is asked the same way.
  const [askPicked, setAskPicked] = useState(askPickedNow);
  useFocusEffect(
    useCallback(() => {
      setCountedValue(essentialsNow());
      setEssentialTiles(essentialTilesNow());
      setJoining(joiningNow());
      setAskPicked(askPickedNow());
    }, []),
  );
  // Pretend use is for trying the app without real screen time; once that is on, it would only confuse.
  const pretend = DEV_TOOLS && !isOn();
  // On a narrow phone the goal's figures give the two round buttons room.
  const narrow = Math.min(useWindowDimensions().width, 480) < 360;
  // An empty battery locks these (the Screen Time card says why); they look it, instead of ignoring taps.
  const locked = settingsLocked();
  const proState = usePro();
  const isPro = proState.isPro;
  const proValue = isPro ? 'Unlocked' : (proState.price ?? (proState.storeOpen ? 'See what it adds' : EXPECTED_PRICE));
  // A higher goal starts at the next recharge; today keeps its own (goal.ts). The stepper shows the one chosen.
  const chosen = chosenGoal(settings);
  const waiting = chosen !== settings.goalMinutes;
  // When the next battery starts: the recharge, or a little later when a new recharge time is waiting (recharge.ts).
  const nextBattery = batteryEnd(day, settings);
  const recharge = clockLabelOf(nextBattery);
  // A waiting goal names its day as well as its time: tomorrow, or today in the small hours before the recharge.
  const startDay = dayWord(nextBattery, now);
  const starts = `${startDay === 'today' || startDay === 'tomorrow' ? startDay : `on ${startDay}`} at ${recharge}`;
  // On setup's own day every change starts at once (goal.ts); the note says so, and what happens after.
  const doc = useDoc();
  const firstDay = goalFree(doc);
  // While an emergency pass runs, more time starts today too (goal.ts); a note says until when.
  const passUntil = !firstDay && passActive(doc.record, now) ? doc.record?.passUntil ?? null : null;
  // The extras, each a tile that says where it stands (the owner's pick of "Tiles", 2026-11-22).
  const ask = askFirstFor(settings, isPro);
  const extras: readonly { icon: RowIcon; label: string; value: string; to: '/ask-first' | '/lock-message' | '/sums' | '/recharge' | '/pro?show=recharge'; pro?: boolean }[] = [
    // Second thought is Pro: without it the tile says Off and its screen shows what it does, and where to get it.
    { icon: { name: 'secondThought', bg: tiles.purple }, label: 'Second thought', value: askShownOn(ask, askPicked, SCREEN_TIME_AVAILABLE || MOCK_PHONE) ? `On, ${openShort(ask)}` : 'Off', to: '/ask-first', pro: !isPro },
    { icon: { name: 'lockMessage', bg: tiles.teal }, label: 'Lock message', value: settings.lockMessage ? 'On' : 'Off', to: '/lock-message' },
    // Easy and hard sums are Pro; normal ones are free, and the tile says which are in use.
    { icon: { name: 'sums', bg: tiles.pink }, label: 'Sums', value: SUM_LEVEL_NAME[sumLevelFor(settings, isPro)], to: '/sums', pro: !isPro },
    // Choosing the recharge time is Pro: without it the tile shows the time and opens what Pro adds.
    { icon: { name: 'recharge', bg: tiles.orange }, label: 'Recharge time', value: clockLabel(chosenRecharge(settings)), to: isPro ? '/recharge' : '/pro?show=recharge', pro: !isPro },
  ];

  return (
    <Page top={24} bottom={24}>
      <Title>Settings</Title>

      {/* Only when it has something to say: counting is off, or the battery is empty and these are locked. */}
      <ScreenTimeCard />

      <Card style={{ paddingTop: 16, paddingBottom: 18, gap: 10 }}>
        <Label>Daily goal</Label>
        <View style={styles.stepper}>
          <StepButton sign="−" label="Less time" size={narrow ? 46 : 52} disabled={!store.canStepGoal(-1)} onPress={() => store.stepGoal(-1)} />
          <Text accessibilityLabel={`Daily goal, ${durationLabel(chosen)}${waiting ? `, starts ${starts}` : ''}`} style={[styles.goal, { color: accent }, narrow ? { fontSize: 50, lineHeight: 54, letterSpacing: -1.6 } : null]}>
            {durationLabel(chosen)}
          </Text>
          <StepButton sign="+" label="More time" size={narrow ? 46 : 52} disabled={!store.canStepGoal(1)} onPress={() => store.stepGoal(1)} />
        </View>
        {waiting ? (
          // A higher goal waits for the next battery (goal.ts). Two days side by side, each a small battery: today
          // with the goal it keeps, lit, and the day the new goal starts, in outline, with its time. Up to build 138
          // a strip read "Today 3:30 -> From 6:00 AM 4:00": it never said which day (the owner asked whether it was
          // clear, and picked "Two days" from three mock-ups, 2026-11-22).
          <View style={{ gap: 10 }} accessible accessibilityLabel={`Today stays at ${durationLabel(settings.goalMinutes)}. ${durationLabel(chosen)} starts ${starts}.`}>
            <Text style={[styles.cellNote, { textAlign: 'center' }]}>{startDay === 'today' ? `Starts at ${recharge}. This battery keeps its goal.` : `Starts ${startDay === 'tomorrow' ? 'tomorrow' : `on ${startDay}`}. Today keeps its goal.`}</Text>
            <View style={styles.days}>
              <DayTile name={startDay === 'today' ? 'Now' : 'Today'} goal={durationLabel(settings.goalMinutes)} line={startDay === 'today' ? `until ${recharge}` : 'now'} accent={accent} on />
              <Text style={styles.daysArrow}>→</Text>
              <DayTile name={startDay} goal={durationLabel(chosen)} line={`from ${recharge}`} accent={accent} />
            </View>
          </View>
        ) : (
          // The battery's six cells, and how long each lasts at this goal.
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={styles.cells}>
              {Array.from({ length: CELLS }, (_, i) => (
                <View key={i} style={[styles.cell, { backgroundColor: accent }]} />
              ))}
            </View>
            <Text style={styles.cellNote}>6 cells of {cellWords(chosen)}</Text>
          </View>
        )}
        {firstDay ? (
          <View style={styles.firstDay}>
            <Text style={styles.firstDayTitle}>Your first day: changes start now</Text>
            <Text style={styles.firstDayLine}>From tomorrow, more time waits for the {recharge} recharge. Less time always starts right away.</Text>
          </View>
        ) : null}
        {passUntil ? (
          <View style={styles.firstDay}>
            <Text style={styles.firstDayTitle}>Emergency pass: more time starts today</Text>
            <Text style={styles.firstDayLine}>Until {clockLabelOf(new Date(passUntil))}. After that, more time waits for the {recharge} recharge again.</Text>
          </View>
        ) : null}
      </Card>

      {/* What an empty battery does: three pictures to tap, and one line on the chosen one. */}
      <Card style={{ paddingTop: 14, paddingBottom: 14, gap: 10 }}>
        <Label>When the battery is empty</Label>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
          {EMPTY_CHOICES.map(({ level, title, icon }) => {
            const chosen = settings.emptyLevel === level;
            return (
              <Pressable
                key={level}
                accessibilityRole="radio"
                accessibilityLabel={`${title}, ${emptyLine(level, first.minutes)}`}
                accessibilityState={{ checked: chosen, disabled: locked }}
                aria-checked={chosen}
                disabled={locked}
                onPress={() => {
                  tap();
                  store.setEmptyLevel(level);
                }}
                style={({ pressed }) => [styles.mode, chosen ? { borderColor: accent, borderWidth: 2, backgroundColor: 'rgba(244,245,242,0.06)' } : null, locked ? { opacity: 0.6 } : null, pressed ? { opacity: 0.8 } : null]}>
                <View style={[styles.modeDot, chosen ? { backgroundColor: accent } : null]}>
                  <Icon name={icon} size={23} color={chosen ? c.onTone : c.ink2} />
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.modeName, chosen ? { color: c.ink } : null]}>
                  {title}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.modeLine}>{emptyLine(settings.emptyLevel, first.minutes)}</Text>
      </Card>

      {/* Essentials: example tiles (the phone never says which apps were picked), and how many there are.
          No more tiles than there are essentials: build 134 said "2 apps" beside three. */}
      <Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Essentials, ${countedValue}${joining > 0 ? `, ${joinsShort(joining, startDay, recharge)}` : ''}`}
          onPress={() => {
            tap();
            router.push('/what-counts');
          }}
          style={({ pressed }) => [styles.essentials, pressed ? { opacity: 0.7 } : null]}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.rowLabel}>Essentials</Text>
            <Text numberOfLines={1} style={styles.proLine}>
              {countedValue}, {joining > 0 ? joinsShort(joining, startDay, recharge) : 'always free'}
            </Text>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ flexDirection: 'row', gap: 5 }}>
            {ESSENTIAL_TILES.slice(0, essentialTiles).map((icon) => (
              <IconTile key={icon.name} icon={icon} size={30} />
            ))}
          </View>
          <Chevron />
        </Pressable>
      </Card>

      {/* The extras, in the open: four picture tiles, two by two, each with its state under its name.
          They had a page of their own, "Advanced", which hid them (the owner, 2026-11-22). */}
      <Card style={{ paddingTop: 14, paddingBottom: 14, gap: 10 }}>
        <Label>Do more</Label>
        <View style={styles.extras}>
          {extras.map(({ icon, label, value, to, pro: needsPro }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${value}${needsPro ? ', Pro' : ''}`}
              onPress={() => {
                tap();
                router.push(to);
              }}
              style={({ pressed }) => [styles.extra, pressed ? { opacity: 0.7 } : null]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <IconTile icon={icon} size={38} />
                {needsPro ? <ProBadge /> : null}
              </View>
              <View style={{ gap: 1 }}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.extraName}>
                  {label}
                </Text>
                <Text numberOfLines={1} style={styles.extraValue}>
                  {value}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <LinkRow icon={{ name: 'widget', bg: tiles.blue }} label="Add the widget" onPress={() => router.push('/widget')} />
        <LinkRow icon={{ name: 'tips', bg: tiles.yellow }} label="Use your phone less" value={`${TIPS.length} tips`} onPress={() => router.push('/tips')} last />
      </Card>

      {/* Pro has its own gold row, last: seen, never in the way. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Plainlimit Pro, ${proValue}`}
        onPress={() => {
          tap();
          router.push('/pro');
        }}
        style={({ pressed }) => [styles.pro, pressed ? { opacity: 0.8 } : null]}>
        <IconTile icon={{ name: 'pro', bg: '#F2C656', fg: c.onPaper }} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.rowLabel}>Plainlimit Pro</Text>
          <Text style={styles.proLine}>{isPro ? 'Thank you' : 'Pay once, yours for good'}</Text>
        </View>
        <Text style={styles.proValue}>{proValue}</Text>
        <Chevron />
      </Pressable>

      {DEV_TOOLS ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          <Label>Developer: Pro</Label>
          {/* A phone that has bought Pro can try the free app, and one that hasn't can try Pro. */}
          {proState.owned ? (
            <>
              <Text style={styles.note}>{proState.pretendFree ? 'Pro is bought, but the app is acting as the free version.' : 'Pro is bought.'} None of this is in the App Store version.</Text>
              <BigButton quiet label={proState.pretendFree ? 'Back to Pro' : 'Act as the free version'} onPress={() => pro.setPretendFree(!proState.pretendFree)} />
            </>
          ) : (
            <>
              <Text style={styles.note}>{proState.pretend ? 'Pretending Pro is bought.' : 'Pro is not bought.'} None of this is in the App Store version.</Text>
              <BigButton quiet label={proState.pretend ? 'Stop pretending Pro' : 'Pretend Pro is bought'} onPress={() => pro.setPretend(!proState.pretend)} />
            </>
          )}
        </View>
      ) : null}

      {pretend ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          <Label>Developer</Label>
          <Text style={styles.note}>
            Pretend use, for trying the app without real screen time. {durationLabel(day.usedMinutes)} used so far. None of this is in the App Store version.
          </Text>
          <BigButton quiet label="Use 10 more minutes" onPress={() => store.pretendUse(10)} />
          <BigButton quiet label="Use 30 more minutes" onPress={() => store.pretendUse(30)} />
          <BigButton quiet label="Recharge now" onPress={() => store.rechargeNow()} />
          <BigButton quiet label="Fill the last week" onPress={() => store.pretendWeek()} />
          <BigButton quiet label="See the warning screen" onPress={() => router.push('/screens/warning')} />
          <BigButton quiet label="See the empty screen" onPress={() => router.push('/screens/empty')} />
        </View>
      ) : null}

      <TestBuildTools />
    </Page>
  );
}

/** The colour of "not yet": the name of the day a waiting goal starts. */
const STARTS = '#F2C656';

/**
 * One day of the two shown while a higher goal waits: its name, its goal, a
 * small battery (lit for the day that is running, in outline for the one to
 * come) and a line on when.
 */
function DayTile({ name, goal, line, accent, on = false }: { name: string; goal: string; line: string; accent: string; on?: boolean }) {
  return (
    <View style={[styles.dayTile, on ? { borderWidth: 2, borderColor: accent } : null]}>
      <Text numberOfLines={1} style={[styles.dayName, on ? null : { color: STARTS }]}>
        {name}
      </Text>
      <Text numberOfLines={1} style={[styles.dayGoal, on ? null : { color: accent }]}>
        {goal}
      </Text>
      <View style={styles.dayCells}>
        {Array.from({ length: CELLS }, (_, i) => (
          <View key={i} style={[styles.dayCell, on ? { backgroundColor: accent } : { borderWidth: 1.5, borderColor: accent, opacity: 0.75 }]} />
        ))}
      </View>
      <Text numberOfLines={1} style={styles.dayLine}>
        {line}
      </Text>
    </View>
  );
}

/** The three things an empty battery can do, each with its picture. */
const EMPTY_CHOICES: readonly { level: EmptyLevel; title: string; icon: IconName }[] = [
  { level: 'warn', title: 'Warn', icon: 'warn' },
  { level: 'work', title: 'Work for it', icon: 'sums' },
  { level: 'locked', title: 'Locked', icon: 'lock' },
];

/** One line on what a choice does. */
function emptyLine(level: EmptyLevel, minutes: number): string {
  if (level === 'warn') return 'Red screen, then tap through';
  if (level === 'work') return `Solve sums to get ${minutes} more minutes`;
  return 'Counted apps stay locked until it recharges';
}

/** The Essentials row's value: how many are picked, as the phone has it now. */
function essentialsNow(): string {
  const picked = SCREEN_TIME_AVAILABLE || MOCK_PHONE ? pickCount(COUNTED_ID) : -1;
  return essentialsValue(picked, essentialsMode() ? essentialsCount() : null);
}

/** How many apps Second thought has picked, as the phone has it now. */
function askPickedNow(): number {
  return SCREEN_TIME_AVAILABLE || MOCK_PHONE ? pickCount(ASK_ID) : 0;
}

/** The sums' level in a word, for its tile. */
const SUM_LEVEL_NAME: Record<SumLevel, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

/** How many new essentials wait for the next recharge, as the phone has it now. */
function joiningNow(): number {
  return essentialsJoining()?.count ?? 0;
}

/** The Essentials row's example tiles, in the order they are shown. */
const ESSENTIAL_TILES: RowIcon[] = [
  { name: 'phone', bg: '#34C759' },
  { name: 'message', bg: '#34C759' },
  { name: 'map', bg: '#3B82F6' },
];

/** How many example tiles the Essentials row shows: one for each essential, three at most (all three where the number isn't known). */
function essentialTilesNow(): number {
  if (!(SCREEN_TIME_AVAILABLE || MOCK_PHONE) || !essentialsMode()) return ESSENTIAL_TILES.length;
  return Math.min(ESSENTIAL_TILES.length, essentialsCount());
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goal: { fontFamily: display.bold, fontSize: 64, lineHeight: 66, letterSpacing: -2.4, color: c.ink },
  cells: { flexDirection: 'row', gap: 6 },
  cell: { width: 30, height: 13, borderRadius: 5 },
  cellNote: { fontSize: 14, lineHeight: 19, color: c.ink3 },
  days: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  daysArrow: { alignSelf: 'center', fontSize: 18, color: c.ink3 },
  dayTile: { flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: c.rule, backgroundColor: c.ground, paddingTop: 11, paddingBottom: 11, paddingHorizontal: 12 },
  dayName: { fontSize: 11.5, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: c.ink },
  dayGoal: { fontFamily: display.bold, fontSize: 30, lineHeight: 34, letterSpacing: -0.8, color: c.ink, marginTop: 3 },
  dayCells: { flexDirection: 'row', gap: 3, marginTop: 7 },
  dayCell: { flex: 1, height: 9, borderRadius: 3 },
  dayLine: { fontSize: 12, lineHeight: 16, color: c.ink3, marginTop: 7 },
  firstDay: { gap: 3, marginTop: 4, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(244,245,242,0.07)' },
  firstDayTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.ink },
  firstDayLine: { fontSize: 14, lineHeight: 19, color: c.ink3 },
  mode: { flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: c.rule, backgroundColor: c.ground, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4, alignItems: 'center', gap: 7 },
  modeDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' },
  modeName: { fontSize: 14.5, lineHeight: 18, fontWeight: '600', color: c.ink2 },
  modeLine: { fontSize: 14, lineHeight: 19, color: c.ink3, textAlign: 'center' },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Two to a row: each takes half, less half the gap between them.
  extra: { flexGrow: 1, flexBasis: '45%', minHeight: 104, borderRadius: 16, borderWidth: 1.5, borderColor: c.rule, backgroundColor: c.ground, padding: 12, gap: 10, justifyContent: 'space-between' },
  extraName: { fontSize: 16, lineHeight: 20, fontWeight: '600', color: c.ink },
  extraValue: { fontSize: 14, lineHeight: 18, color: c.ink3 },
  essentials: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { fontSize: 16, fontWeight: '500', color: c.ink },
  note: { fontSize: 14, lineHeight: 20, color: c.ink3 },
  pro: { minHeight: 64, borderRadius: 22, borderWidth: 1, borderColor: '#5B4A1C', backgroundColor: '#1F1C13', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  proLine: { fontSize: 13.5, lineHeight: 18, color: c.ink3 },
  proValue: { fontFamily: display.semi, fontSize: 16, color: '#F2C656' },
});

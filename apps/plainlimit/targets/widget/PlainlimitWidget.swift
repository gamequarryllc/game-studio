import SwiftUI
import WidgetKit

// The battery on the home screen and the lock screen.
//
// It draws from three things in the App Group's shared settings:
//   plainlimit_plan                              written by the app: the goal, the recharge time, and when counting began
//   events_plday_eventDidReachThreshold_<name>   written by the monitor extension each time a
//                                                checkpoint is reached (milliseconds since 1970)
//   plainlimit_guard                             written by the app at each registration: reports
//                                                between `opens` and `closes` count from `from`
//   plainlimit_record                            written by the app: whether Pro is held, and the streak,
//                                                passes, perfect weeks and this week for the large widget (pro.ts)
// A checkpoint counts for today when it was reached after the last recharge.
// The same rules live in the app's src/domain/ (battery.ts, day.ts, checkpoints.ts, tone.ts);
// src/domain/__tests__/monitorPlan.test.ts checks the two stay in step.

let appGroup = "group.com.gamequarry.plainlimit"
let activityName = "plday"
let cellCount = 6
let slackMinutes = 2.0
/// checkpoints.ts: PACE_SLACK_MINUTES and GUARD_MS.
let paceSlackMinutes = 20.0
let guardMs = 600_000.0

struct BatteryState {
  var isSetUp: Bool
  var cells: Int
  var rechargeMinute: Int
  /// The daily goal, for the large widget's "left today" (0 when not known).
  var goalMinutes: Double = 0
}

/// "1 h 45 min", "2 h", "35 min".
func durationLabel(minutes: Double) -> String {
  let total = max(0, Int(minutes.rounded()))
  let hours = total / 60
  let rest = total % 60
  if hours == 0 { return "\(rest) min" }
  if rest == 0 { return "\(hours) h" }
  return "\(hours) h \(rest) min"
}

/// The widget's look, Glow (the owner's pick on 2026-11-20): a near-black ground lit from
/// behind the battery, with the cells and the word shining in the day's colour.
struct Tone {
  /// Lit cells, the word, and the light behind the battery.
  let glow: Color
  /// The battery's outline and nub: white, or the glow once empty so the empty battery reads red.
  let outline: Color
  /// Used cells.
  let track: Color
  let isEmpty: Bool
}

extension Color {
  init(hex: UInt32, opacity: Double = 1) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: opacity
    )
  }
}

// GLOWS-BEGIN (glowForCells in src/domain/tone.ts; index = cells left)
let toneGlows: [UInt32] = [0xFF4943, 0xFFAF00, 0xFADC00, 0x5CDF81, 0x59E783, 0x55EE84, 0x51F585]
// GLOWS-END

/// The app's light ink, for words on the dark ground.
let paper = Color(hex: 0xF4F5F2)
/// The week row's colours, as in the app's week chart: green under the goal, coral ran out.
let underGoal = Color(hex: toneGlows[cellCount])
let ranOut = Color(hex: 0xFF7B6B)

func tone(forCells cells: Int) -> Tone {
  let index = min(max(cells, 0), cellCount)
  let glow = Color(hex: toneGlows[index])
  return Tone(
    glow: glow, outline: index == 0 ? glow : paper.opacity(0.88), track: Color.white.opacity(0.16),
    isEmpty: index == 0)
}

/// The ground: near black, lit in the day's colour from behind the battery.
struct GlowGround: View {
  let glow: Color
  let centre: UnitPoint
  let radius: CGFloat

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color(hex: 0x151B18), Color(hex: 0x090C0B)], startPoint: .top, endPoint: .bottom)
      RadialGradient(
        colors: [glow.opacity(0.30), glow.opacity(0)], center: centre, startRadius: 0, endRadius: radius)
      ContainerRelativeShape().strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
    }
  }
}

func word(forCells cells: Int) -> String {
  if cells <= 0 { return "Empty" }
  if cells == 1 { return "Nearly out" }
  if cells == 2 { return "Getting low" }
  if cells == 3 { return "Half gone" }
  return "Plenty left"
}

func rechargeToday(now: Date, rechargeMinute: Int, calendar: Calendar) -> Date {
  let minute = min(max(rechargeMinute, 0), 24 * 60 - 1)
  return calendar.date(bySettingHour: minute / 60, minute: minute % 60, second: 0, of: now) ?? now
}

/// The most recent recharge: the start of the "day" the battery is draining through.
func periodStart(now: Date, rechargeMinute: Int, calendar: Calendar = .current) -> Date {
  let today = rechargeToday(now: now, rechargeMinute: rechargeMinute, calendar: calendar)
  if today <= now { return today }
  let yesterday = calendar.date(byAdding: .day, value: -1, to: now) ?? now
  return rechargeToday(now: yesterday, rechargeMinute: rechargeMinute, calendar: calendar)
}

func nextRecharge(now: Date, rechargeMinute: Int, calendar: Calendar = .current) -> Date {
  let today = rechargeToday(now: now, rechargeMinute: rechargeMinute, calendar: calendar)
  if today > now { return today }
  let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) ?? now
  return rechargeToday(now: tomorrow, rechargeMinute: rechargeMinute, calendar: calendar)
}

func readState(now: Date) -> BatteryState {
  guard let defaults = UserDefaults(suiteName: appGroup),
    let plan = defaults.dictionary(forKey: "plainlimit_plan"),
    let recharge = (plan["rechargeMinute"] as? NSNumber)?.intValue,
    let goal = (plan["goalMinutes"] as? NSNumber)?.doubleValue,
    goal > 0
  else {
    return BatteryState(isSetUp: false, cells: cellCount, rechargeMinute: 360)
  }

  // Today's count began at the last recharge, or when counting was turned on if that was later.
  let countFrom = (plan["countFrom"] as? NSNumber)?.doubleValue ?? 0
  let start = max(periodStart(now: now, rechargeMinute: recharge).timeIntervalSince1970 * 1000, countFrom)

  // A checkpoint arriving while the guard is open (the few minutes after the
  // day was last registered, when iOS sends false reports) is judged as if
  // the count began at the guard's start; any other from the day's start. The
  // app works the guard out and saves it at each registration, so the widget,
  // the app and the phone's locks all use the same numbers (checkpoints.ts, Guard).
  let guardRecord = defaults.dictionary(forKey: "plainlimit_guard")
  let guardFrom = (guardRecord?["from"] as? NSNumber)?.doubleValue ?? 0
  let guardOpens = (guardRecord?["opens"] as? NSNumber)?.doubleValue ?? 0
  let guardCloses = (guardRecord?["closes"] as? NSNumber)?.doubleValue ?? 0
  func judgedFrom(_ arrivedAt: Double) -> Double {
    guard guardRecord != nil, arrivedAt >= guardOpens, arrivedAt <= guardCloses else { return start }
    return max(start, guardFrom)
  }

  // Checkpoints carry the round they were registered in (checkpoints.ts,
  // roundName). Just after the ticked apps change, the old round stands until
  // the phone has reported anything for the new one, or for a minute at most.
  let round = plan["round"] as? String ?? ""
  let roundBefore = plan["roundBefore"] as? String ?? ""
  let picksAt = (plan["picksChangedAt"] as? NSNumber)?.doubleValue ?? 0
  func stored(_ name: String, _ inRound: String) -> Double {
    let key = inRound.isEmpty ? name : "\(name)~\(inRound)"
    return defaults.double(forKey: "events_\(activityName)_eventDidReachThreshold_\(key)")
  }
  let names = ["empty"] + (1..<cellCount).map { "cell-\($0)" }
  let anyNew = names.contains { stored($0, round) > 0 }
  let nowMs = now.timeIntervalSince1970 * 1000
  let counting = (picksAt >= start && !anyNew && nowMs - picksAt < 60_000) ? roundBefore : round

  // Every checkpoint the phone reports (the cells and the minute ones), for
  // pacing: a report for M minutes cannot come sooner than M - L minutes after
  // an earlier one for L, less twenty for a slow phone (checkpoints.ts,
  // keepsPace). Reports in the minutes after a registration are left out:
  // the phone re-reports the day then, with fresh times.
  let registeredAt = (plan["registeredAt"] as? NSNumber)?.doubleValue ?? 0
  let marks: [(at: Double, minutes: Double)] = (plan["marks"] as? [[String: Any]] ?? []).compactMap { (mark: [String: Any]) -> (at: Double, minutes: Double)? in
    guard let activity = mark["activity"] as? String, let name = mark["name"] as? String,
      let minutes = (mark["minutes"] as? NSNumber)?.doubleValue
    else { return nil }
    let key = counting.isEmpty ? name : "\(name)~\(counting)"
    let at = defaults.double(forKey: "events_\(activity)_eventDidReachThreshold_\(key)")
    let reReported = registeredAt > 0 && at >= registeredAt && at <= registeredAt + guardMs
    return at >= start && !reReported ? (at, minutes) : nil
  }
  func keepsPace(_ at: Double, _ minutes: Double) -> Bool {
    marks.allSatisfy { mark in
      mark.at >= at || mark.minutes >= minutes || at >= mark.at + (minutes - mark.minutes - paceSlackMinutes) * 60_000
    }
  }

  // A checkpoint for N minutes of use cannot honestly arrive sooner than N minutes
  // into the day, nor faster than the clock after an earlier one. iOS has been
  // seen to deliver them early, and in bursts for nothing; those are ignored.
  func reached(_ name: String, afterMinutes minutes: Double) -> Bool {
    let at = stored(name, counting)
    return at >= start && at >= judgedFrom(at) + max(0, minutes - slackMinutes) * 60_000 && keepsPace(at, minutes)
  }

  var cells = cellCount
  if reached("empty", afterMinutes: goal) {
    cells = 0
  } else {
    for emptied in stride(from: cellCount - 1, through: 1, by: -1)
    where reached("cell-\(emptied)", afterMinutes: goal * Double(emptied) / Double(cellCount)) {
      cells = cellCount - emptied
      break
    }
  }
  return BatteryState(isSetUp: true, cells: cells, rechargeMinute: recharge, goalMinutes: goal)
}

func clockLabel(rechargeMinute: Int) -> String {
  let date = rechargeToday(now: Date(), rechargeMinute: rechargeMinute, calendar: .current)
  let formatter = DateFormatter()
  formatter.dateStyle = .none
  formatter.timeStyle = .short
  return formatter.string(from: date)
}

/// The large widget's extras (Pro). `week` is Monday to Sunday, one letter a day:
/// u under the goal, r ran out, p partly counted, n not counted, f still to come.
struct RecordInfo {
  var pro: Bool
  var streak: Int
  var passes: Int
  var perfect: Int
  var week: String
}

func readRecord() -> RecordInfo {
  let none = RecordInfo(pro: false, streak: 0, passes: 0, perfect: 0, week: "fffffff")
  guard let defaults = UserDefaults(suiteName: appGroup),
    let text = defaults.string(forKey: "plainlimit_record"),
    let data = text.data(using: .utf8),
    let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  else { return none }
  return RecordInfo(
    pro: object["pro"] as? Bool ?? false,
    streak: (object["streak"] as? NSNumber)?.intValue ?? 0,
    passes: (object["passes"] as? NSNumber)?.intValue ?? 0,
    perfect: (object["perfect"] as? NSNumber)?.intValue ?? 0,
    week: object["week"] as? String ?? none.week)
}

struct BatteryEntry: TimelineEntry {
  let date: Date
  let state: BatteryState
  var record: RecordInfo = readRecord()
}

struct BatteryProvider: TimelineProvider {
  func placeholder(in context: Context) -> BatteryEntry {
    BatteryEntry(
      date: Date(), state: BatteryState(isSetUp: true, cells: 4, rechargeMinute: 360, goalMinutes: 180),
      record: RecordInfo(pro: true, streak: 12, passes: 2, perfect: 3, week: "uururff"))
  }

  func getSnapshot(in context: Context, completion: @escaping (BatteryEntry) -> Void) {
    if context.isPreview {
      completion(placeholder(in: context))
      return
    }
    let now = Date()
    completion(BatteryEntry(date: now, state: readState(now: now)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<BatteryEntry>) -> Void) {
    let now = Date()
    let state = readState(now: now)
    // For the test build's Settings: when the widget last drew, and what it drew.
    if let shared = UserDefaults(suiteName: appGroup) {
      shared.set((now.timeIntervalSince1970 * 1000).rounded(), forKey: "plainlimit_widget_drew")
      shared.set(state.isSetUp ? state.cells : -1, forKey: "plainlimit_widget_cells")
    }
    var entries = [BatteryEntry(date: now, state: state)]
    guard state.isSetUp else {
      // Not set up yet: look again in a while in case the app has been opened since.
      completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
      return
    }
    // The battery is full again at the recharge time, whether or not anything wakes the widget.
    let recharge = nextRecharge(now: now, rechargeMinute: state.rechargeMinute)
    entries.append(
      BatteryEntry(
        date: recharge,
        state: BatteryState(isSetUp: true, cells: cellCount, rechargeMinute: state.rechargeMinute, goalMinutes: state.goalMinutes)))
    // The monitor extension asks for a redraw at every checkpoint, and the app does whenever
    // it is opened. This is the fallback for when neither happens: a look every quarter of an
    // hour. iOS grants a widget only so many of these a day, so some will come later than asked.
    let fallback = min(recharge.addingTimeInterval(60), now.addingTimeInterval(15 * 60))
    completion(Timeline(entries: entries, policy: .after(fallback)))
  }
}

struct BatteryShape: View {
  let cells: Int
  let ink: Color
  let track: Color
  /// The outline and nub; the same as the cells when not given (the lock screen).
  var outline: Color? = nil
  /// Lit cells shine in their own colour; the outline too when `outlineGlows`.
  var glows = false
  var outlineGlows = false

  var body: some View {
    GeometryReader { geometry in
      let height = geometry.size.height
      let nub = height * 0.11
      let edge = outline ?? ink
      let blur = height * 0.07
      HStack(spacing: height * 0.05) {
        HStack(spacing: height * 0.07) {
          // A used cell is an outlined empty slot; only charge is solid (Battery.tsx).
          ForEach(0..<cellCount, id: \.self) { index in
            if index < cells {
              RoundedRectangle(cornerRadius: height * 0.09, style: .continuous)
                .fill(ink)
                .shadow(color: glows ? ink.opacity(0.9) : .clear, radius: glows ? blur : 0)
            } else {
              RoundedRectangle(cornerRadius: height * 0.09, style: .continuous)
                .strokeBorder(track, lineWidth: max(1, height * 0.035))
            }
          }
        }
        .padding(height * 0.15)
        .overlay(
          RoundedRectangle(cornerRadius: height * 0.24, style: .continuous)
            .strokeBorder(edge, lineWidth: max(2, height * 0.075))
            .shadow(color: outlineGlows ? edge.opacity(0.9) : .clear, radius: outlineGlows ? blur : 0)
        )
        RoundedRectangle(cornerRadius: nub * 0.4, style: .continuous)
          .fill(edge)
          .frame(width: nub, height: height * 0.36)
          .shadow(color: outlineGlows ? edge.opacity(0.9) : .clear, radius: outlineGlows ? blur : 0)
      }
    }
  }
}

struct BatteryWidgetView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var renderingMode
  let entry: BatteryEntry

  /// The glow only in full colour; a tinted or clear Home Screen draws the widget in one colour.
  private var shines: Bool { renderingMode == .fullColor }

  var body: some View {
    let state = entry.state
    let colours = tone(forCells: state.cells)
    Group {
      switch family {
      case .accessoryRectangular:
        lockScreen(state)
      case .systemMedium:
        medium(state, colours)
      case .systemLarge:
        large(state, colours, entry.record)
      default:
        small(state, colours)
      }
    }
    .containerBackground(for: .widget) {
      GlowGround(glow: colours.glow, centre: glowCentre, radius: glowRadius)
    }
  }

  /// Behind the battery: at the top of the small and large widgets, on the left of the medium.
  private var glowCentre: UnitPoint {
    switch family {
    case .systemMedium: return UnitPoint(x: 0.3, y: 0.5)
    case .systemLarge: return UnitPoint(x: 0.3, y: 0.14)
    default: return UnitPoint(x: 0.5, y: 0.28)
    }
  }

  private var glowRadius: CGFloat {
    switch family {
    case .systemMedium: return 130
    case .systemLarge: return 150
    default: return 90
    }
  }

  private func battery(_ state: BatteryState, _ colours: Tone) -> BatteryShape {
    BatteryShape(
      cells: state.cells, ink: colours.glow, track: colours.track, outline: colours.outline,
      glows: shines, outlineGlows: shines && colours.isEmpty)
  }

  /// The word ("Plenty left"), lit in the day's colour.
  private func wordLabel(_ state: BatteryState, _ colours: Tone, size: CGFloat) -> some View {
    Text(word(forCells: state.cells))
      .font(.system(size: size, weight: .bold, design: .rounded))
      .foregroundStyle(colours.glow)
      .shadow(color: shines ? colours.glow.opacity(0.45) : .clear, radius: 9)
  }

  @ViewBuilder
  private func small(_ state: BatteryState, _ colours: Tone) -> some View {
    if state.isSetUp {
      VStack(alignment: .leading, spacing: 10) {
        battery(state, colours)
          .frame(height: 52)
        Spacer(minLength: 0)
        wordLabel(state, colours, size: 22)
          .minimumScaleFactor(0.7)
          .lineLimit(1)
        Text("Recharges \(clockLabel(rechargeMinute: state.rechargeMinute))")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(paper.opacity(0.62))
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(spoken(state))
    } else {
      setUpPrompt
    }
  }

  @ViewBuilder
  private func medium(_ state: BatteryState, _ colours: Tone) -> some View {
    if state.isSetUp {
      HStack(alignment: .center, spacing: 18) {
        battery(state, colours)
          .frame(height: 78)
        VStack(alignment: .leading, spacing: 6) {
          wordLabel(state, colours, size: 26)
            .minimumScaleFactor(0.6)
            .lineLimit(2)
          Text("Recharges \(clockLabel(rechargeMinute: state.rechargeMinute))")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(paper.opacity(0.62))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        .frame(width: 118, alignment: .leading)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(spoken(state))
    } else {
      setUpPrompt
    }
  }

  /// Half the Home Screen: the battery, then the streak, passes and week (Pro).
  /// Without Pro the extras are replaced by one line saying what Pro adds; the battery stays.
  @ViewBuilder
  private func large(_ state: BatteryState, _ colours: Tone, _ record: RecordInfo) -> some View {
    if state.isSetUp {
      VStack(alignment: .leading, spacing: 14) {
        HStack(alignment: .center, spacing: 16) {
          battery(state, colours)
            .frame(width: 150, height: 64)
          VStack(alignment: .leading, spacing: 4) {
            wordLabel(state, colours, size: 24)
              .minimumScaleFactor(0.6)
              .lineLimit(1)
            Text("Recharges \(clockLabel(rechargeMinute: state.rechargeMinute))")
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(paper.opacity(0.62))
              .lineLimit(1)
          }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken(state))
        if record.pro {
          HStack(spacing: 8) {
            tile("\(record.streak)", "day streak", colours)
            tile("\(record.passes)", record.passes == 1 ? "pass saved" : "passes saved", colours)
            tile("\(record.perfect)", record.perfect == 1 ? "perfect week" : "perfect weeks", colours)
          }
          leftToday(state, colours)
          weekRow(record.week, colours)
        } else {
          Spacer(minLength: 0)
          VStack(alignment: .leading, spacing: 6) {
            Text("PRO")
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(colours.glow)
              .padding(.horizontal, 7)
              .padding(.vertical, 2)
              .overlay(Capsule().strokeBorder(colours.glow.opacity(0.7), lineWidth: 1))
            Text("Your streak, passes and week, at a glance")
              .font(.system(size: 20, weight: .bold, design: .rounded))
              .foregroundStyle(paper)
              .minimumScaleFactor(0.7)
            Text("Tap to see Plainlimit Pro. The small and medium widgets stay free.")
              .font(.system(size: 13, weight: .medium))
              .foregroundStyle(paper.opacity(0.62))
          }
          .widgetURL(URL(string: "plainlimit://pro?show=widget"))
        }
      }
    } else {
      setUpPrompt
    }
  }

  /// The middle of the large widget: how much of today's goal is left. The
  /// battery only knows whole cells, so it is "up to" that much.
  private func leftToday(_ state: BatteryState, _ colours: Tone) -> some View {
    let left = state.goalMinutes * Double(state.cells) / Double(cellCount)
    let empty = state.cells <= 0 || state.goalMinutes <= 0
    return VStack(alignment: .leading, spacing: 4) {
      Text(empty ? "Nothing left today" : "Up to \(durationLabel(minutes: left)) left")
        .font(.system(size: 28, weight: .bold, design: .rounded))
        .foregroundStyle(paper)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Text(
        empty
          ? "Back at \(clockLabel(rechargeMinute: state.rechargeMinute))"
          : "of your \(durationLabel(minutes: state.goalMinutes)) day"
      )
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(paper.opacity(0.62))
      .lineLimit(1)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding(.horizontal, 14)
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.07)))
    .accessibilityElement(children: .combine)
  }

  private func tile(_ figure: String, _ label: String, _ colours: Tone) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(figure)
        .font(.system(size: 26, weight: .bold, design: .rounded))
        .foregroundStyle(paper)
      Text(label)
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(paper.opacity(0.62))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(10)
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.07)))
    .accessibilityElement(children: .combine)
  }

  /// This week, Monday to Sunday: a solid dot under the goal, a ringed dot ran out, faint not counted or to come.
  private func weekRow(_ week: String, _ colours: Tone) -> some View {
    let letters = Array(week.padding(toLength: 7, withPad: "f", startingAt: 0))
    let names = ["M", "T", "W", "T", "F", "S", "S"]
    return HStack(spacing: 0) {
      ForEach(0..<7, id: \.self) { index in
        VStack(spacing: 6) {
          dot(letters[index], colours)
          Text(names[index])
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(paper.opacity(0.6))
        }
        .frame(maxWidth: .infinity)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("This week: " + letters.map { spokenDay($0) }.joined(separator: ", "))
  }

  @ViewBuilder
  private func dot(_ letter: Character, _ colours: Tone) -> some View {
    switch letter {
    case "u":
      Circle().fill(underGoal).frame(width: 22, height: 22)
    case "p":
      Circle().fill(underGoal.opacity(0.5)).frame(width: 22, height: 22)
    case "r":
      Circle().strokeBorder(ranOut, lineWidth: 3).frame(width: 22, height: 22)
    default:
      Circle().strokeBorder(Color.white.opacity(0.22), lineWidth: 1.5).frame(width: 22, height: 22)
    }
  }

  private func spokenDay(_ letter: Character) -> String {
    switch letter {
    case "u": return "under the goal"
    case "p": return "partly counted"
    case "r": return "ran out"
    case "n": return "not counted"
    default: return "to come"
    }
  }

  @ViewBuilder
  private func lockScreen(_ state: BatteryState) -> some View {
    if state.isSetUp {
      VStack(alignment: .leading, spacing: 4) {
        BatteryShape(cells: state.cells, ink: .primary, track: Color.primary.opacity(0.25))
          .frame(height: 26)
        Text(word(forCells: state.cells))
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .lineLimit(1)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(spoken(state))
    } else {
      Text("Open Plainlimit to set up")
        .font(.system(size: 13, weight: .semibold))
    }
  }

  private var setUpPrompt: some View {
    VStack(alignment: .leading, spacing: 8) {
      BatteryShape(
        cells: cellCount, ink: underGoal, track: Color.white.opacity(0.16), outline: paper.opacity(0.88),
        glows: shines)
        .frame(height: 40)
      Spacer(minLength: 0)
      Text("Open Plainlimit to set up")
        .font(.system(size: 15, weight: .semibold, design: .rounded))
        .foregroundStyle(paper)
    }
  }

  private func spoken(_ state: BatteryState) -> String {
    "Screen time battery. \(word(forCells: state.cells)). \(state.cells) of \(cellCount) cells left. "
      + "Recharges at \(clockLabel(rechargeMinute: state.rechargeMinute))."
  }
}

struct PlainlimitBatteryWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PlainlimitBattery", provider: BatteryProvider()) { entry in
      BatteryWidgetView(entry: entry)
    }
    .configurationDisplayName("Battery")
    .description("Your screen time for the day, as a battery. The large size adds your streak, passes and week with Pro.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
  }
}

@main
struct PlainlimitWidgets: WidgetBundle {
  var body: some Widget {
    PlainlimitBatteryWidget()
  }
}

import SwiftUI
import WidgetKit

// The battery on the home screen and the lock screen.
//
// It draws from two things in the App Group's shared settings:
//   plainlimit_plan                              written by the app: the goal and the recharge time
//   events_plday_eventDidReachThreshold_<name>   written by the monitor extension each time a
//                                                checkpoint is reached (milliseconds since 1970)
// A checkpoint counts for today when it was reached after the last recharge.
// The same rules live in the app's src/domain/ (battery.ts, day.ts, checkpoints.ts, tone.ts);
// src/domain/__tests__/widget.test.ts checks the two stay in step.

let appGroup = "group.com.gamequarry.plainlimit"
let activityName = "plday"
let cellCount = 6
let slackMinutes = 2.0

struct BatteryState {
  var isSetUp: Bool
  var cells: Int
  var rechargeMinute: Int
}

struct Tone {
  let background: Color
  let ink: Color
  let track: Color
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

// TONES-BEGIN (generated from src/domain/tone.ts; index = cells left)
let toneBackgrounds: [UInt32] = [0xA50008, 0xF79200, 0x9CC349, 0x50B76C, 0x4DBE6D, 0x4AC56E, 0x46CC70]
// TONES-END

func tone(forCells cells: Int) -> Tone {
  let index = min(max(cells, 0), cellCount)
  if index == 0 {
    return Tone(
      background: Color(hex: toneBackgrounds[0]), ink: .white, track: Color.white.opacity(0.30))
  }
  let ink = Color(hex: 0x10120F)
  return Tone(background: Color(hex: toneBackgrounds[index]), ink: ink, track: ink.opacity(0.22))
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

  let start = periodStart(now: now, rechargeMinute: recharge).timeIntervalSince1970 * 1000

  // A checkpoint for N minutes of use cannot honestly arrive sooner than N minutes
  // into the day. iOS has been seen to deliver them early; those are ignored.
  func reached(_ name: String, afterMinutes minutes: Double) -> Bool {
    let at = defaults.double(forKey: "events_\(activityName)_eventDidReachThreshold_\(name)")
    return at >= start + max(0, minutes - slackMinutes) * 60_000
  }

  var cells = cellCount
  if reached("empty", afterMinutes: goal) {
    cells = 0
  } else {
    for emptied in stride(from: cellCount - 1, through: 1, by: -1)
    where reached("c\(emptied)", afterMinutes: goal * Double(emptied) / Double(cellCount)) {
      cells = cellCount - emptied
      break
    }
  }
  return BatteryState(isSetUp: true, cells: cells, rechargeMinute: recharge)
}

func clockLabel(rechargeMinute: Int) -> String {
  let date = rechargeToday(now: Date(), rechargeMinute: rechargeMinute, calendar: .current)
  let formatter = DateFormatter()
  formatter.dateStyle = .none
  formatter.timeStyle = .short
  return formatter.string(from: date)
}

struct BatteryEntry: TimelineEntry {
  let date: Date
  let state: BatteryState
}

struct BatteryProvider: TimelineProvider {
  func placeholder(in context: Context) -> BatteryEntry {
    BatteryEntry(date: Date(), state: BatteryState(isSetUp: true, cells: 4, rechargeMinute: 360))
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
        state: BatteryState(isSetUp: true, cells: cellCount, rechargeMinute: state.rechargeMinute)))
    // The monitor extension asks for a redraw at every checkpoint. This is the fallback
    // for when that does not happen: an hourly look, well inside the widget's daily allowance.
    let fallback = min(recharge.addingTimeInterval(60), now.addingTimeInterval(60 * 60))
    completion(Timeline(entries: entries, policy: .after(fallback)))
  }
}

struct BatteryShape: View {
  let cells: Int
  let ink: Color
  let track: Color

  var body: some View {
    GeometryReader { geometry in
      let height = geometry.size.height
      let nub = height * 0.11
      HStack(spacing: height * 0.05) {
        HStack(spacing: height * 0.07) {
          ForEach(0..<cellCount, id: \.self) { index in
            RoundedRectangle(cornerRadius: height * 0.09, style: .continuous)
              .fill(index < cells ? ink : track)
          }
        }
        .padding(height * 0.15)
        .overlay(
          RoundedRectangle(cornerRadius: height * 0.24, style: .continuous)
            .strokeBorder(ink, lineWidth: max(2, height * 0.075))
        )
        RoundedRectangle(cornerRadius: nub * 0.4, style: .continuous)
          .fill(ink)
          .frame(width: nub, height: height * 0.36)
      }
    }
  }
}

struct BatteryWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: BatteryEntry

  var body: some View {
    let state = entry.state
    let colours = tone(forCells: state.cells)
    Group {
      switch family {
      case .accessoryRectangular:
        lockScreen(state)
      case .systemMedium:
        medium(state, colours)
      default:
        small(state, colours)
      }
    }
    .containerBackground(for: .widget) {
      state.isSetUp ? colours.background : Color(hex: 0x0E1011)
    }
  }

  @ViewBuilder
  private func small(_ state: BatteryState, _ colours: Tone) -> some View {
    if state.isSetUp {
      VStack(alignment: .leading, spacing: 10) {
        BatteryShape(cells: state.cells, ink: colours.ink, track: colours.track)
          .frame(height: 52)
        Spacer(minLength: 0)
        Text(word(forCells: state.cells))
          .font(.system(size: 22, weight: .bold, design: .rounded))
          .foregroundStyle(colours.ink)
          .minimumScaleFactor(0.7)
          .lineLimit(1)
        Text("Recharges \(clockLabel(rechargeMinute: state.rechargeMinute))")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(colours.ink.opacity(0.75))
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
        BatteryShape(cells: state.cells, ink: colours.ink, track: colours.track)
          .frame(height: 78)
        VStack(alignment: .leading, spacing: 6) {
          Text(word(forCells: state.cells))
            .font(.system(size: 26, weight: .bold, design: .rounded))
            .foregroundStyle(colours.ink)
            .minimumScaleFactor(0.6)
            .lineLimit(2)
          Text("Recharges \(clockLabel(rechargeMinute: state.rechargeMinute))")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(colours.ink.opacity(0.75))
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
      BatteryShape(cells: cellCount, ink: Color(hex: 0x46CC70), track: Color.white.opacity(0.2))
        .frame(height: 40)
      Spacer(minLength: 0)
      Text("Open Plainlimit to set up")
        .font(.system(size: 15, weight: .semibold, design: .rounded))
        .foregroundStyle(.white)
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
    .description("Your screen time for the day, as a battery.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
  }
}

@main
struct PlainlimitWidgets: WidgetBundle {
  var body: some Widget {
    PlainlimitBatteryWidget()
  }
}

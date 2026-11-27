import CoreText
import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI

// The pictures the app asks for, all as Apple's Screen Time counts:
//   TopApps  the "what used it" list: the apps that used the most time since the
//            battery last recharged.
//   BatteryApps
//            the same list when essentials are chosen: they use no battery,
//            so they are left out of it (see `Essentials`).
//   Total    the day's figure: every minute the counted apps have been used
//            since the recharge, to the minute, added up app by app. The app
//            itself only learns use in steps, so this is the exact number the
//            person sees.
//   Setup4, Setup6, Setup8, Setup12
//            for setup's "How much a day?", in one picture: today's figure,
//            the daily average over the seven days before today, and those
//            seven days as bars on an hour scale of 4, 6, 8 or 12 hours, each
//            with its time, and a goal to try about 15% under the average.
//            The app picks the scale, lays its labels in the gaps and draws
//            the goal's line over the chart itself. These were three pictures
//            (Total, Average, Week), each read from the phone on its own: on
//            a fresh install the average came first and the rest took about a
//            minute (the owner, build 138). One picture is one reading.
//   FirstApps for Second thought: the apps opened first after picking up the
//            phone over the last seven days, as Screen Time's "First Used
//            After Pickup", so the person sees which apps to pick.
//
// The phone runs this in a sealed box: it may draw, and nothing else. The app
// shows the picture and never learns what is in it.

struct AppUse: Identifiable {
  let id: String
  let token: ApplicationToken?
  let name: String
  let seconds: TimeInterval
}

struct UsageSummary {
  let apps: [AppUse]
  let more: Int
  /// Essentials are chosen, and could not be left out of the list: it says so.
  let essentialsToo: Bool
}

/// The App Group the app and its extensions share (app.json).
private let appGroup = "group.com.gamequarry.plainlimit"

/// The essentials in force today. They use no battery, so "what used it"
/// leaves them out (the owner, build 166: Messages, an essential, stood in the
/// list and looked counted). Apple's report can be asked for every app or for
/// a list, never "every app but these", so this box reads the essentials
/// itself, from where the app saves them for the phone: the shared store, the
/// library's "familyActivitySelectionIds", id "plkeep". It may read there and
/// nothing more; it still cannot save or send anything.
/// Empty when none are chosen, and when the phone would not let this box read
/// them: then nothing can be left out.
struct Essentials {
  var apps: Set<ApplicationToken> = []
  var categories: Set<ActivityCategoryToken> = []

  var empty: Bool { return apps.isEmpty && categories.isEmpty }

  static func now() -> Essentials {
    var out = Essentials()
    guard let shared = UserDefaults(suiteName: appGroup),
      let saved = shared.dictionary(forKey: "familyActivitySelectionIds"),
      let text = saved["plkeep"] as? String,
      let data = Data(base64Encoded: text),
      let picked = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
    else { return out }
    out.apps = picked.applicationTokens
    out.categories = picked.categoryTokens
    return out
  }
}

extension DeviceActivityReport.Context {
  static let topApps = Self("TopApps")
  static let batteryApps = Self("BatteryApps")
  static let total = Self("Total")
  static let setup4 = Self("Setup4")
  static let setup6 = Self("Setup6")
  static let setup8 = Self("Setup8")
  static let setup12 = Self("Setup12")
  static let firstApps = Self("FirstApps")
  static let whole = Self("Whole")
}

private let ink = Color(red: 244 / 255, green: 245 / 255, blue: 242 / 255)
/// The app's second ink (src/ui/theme.ts, c.ink2), for a figure that is not the main one.
private let ink2 = Color(red: 214 / 255, green: 217 / 255, blue: 220 / 255)
private let quiet = Color(red: 169 / 255, green: 174 / 255, blue: 179 / 255)
private let rule = Color(red: 37 / 255, green: 40 / 255, blue: 44 / 255)
private let ground = Color(red: 14 / 255, green: 16 / 255, blue: 17 / 255)
/// The app's card colour (src/ui/theme.ts, c.card), for a report drawn inside a card.
private let cardGround = Color(red: 23 / 255, green: 25 / 255, blue: 28 / 255)
private let green = Color(red: 74 / 255, green: 198 / 255, blue: 111 / 255)

/// The app's display face, shipped inside this extension (the build copies it
/// in). If it cannot be loaded the phone's own bold face is used instead.
private let displayFace: String? = {
  guard let url = Bundle.main.url(forResource: "SpaceGrotesk_700Bold", withExtension: "ttf") else { return nil }
  CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
  return "SpaceGrotesk-Bold"
}()

/// "1:23", the way the app writes a length of time.
func clockWords(_ seconds: TimeInterval) -> String {
  let minutes = max(0, Int(seconds / 60))
  return "\(minutes / 60):" + String(format: "%02d", minutes % 60)
}

/// Whole minutes, cut down like the total above the list, so a list row never
/// says more than the total (it said "1 min" under a total of 0:00).
func durationWords(_ seconds: TimeInterval) -> String {
  let minutes = max(0, Int(seconds / 60))
  if minutes == 0 { return "Under 1 min" }
  if minutes < 60 { return "\(minutes) min" }
  let hours = minutes / 60
  let rest = minutes % 60
  return rest == 0 ? "\(hours) h" : "\(hours) h \(rest) min"
}

struct TopAppsReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context
  /// The app's word that essentials are chosen (it asks for "BatteryApps"
  /// then, "TopApps" otherwise): they are left out of the list.
  let lessEssentials: Bool
  let content: (UsageSummary) -> TopAppsView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async
    -> UsageSummary {
    var seconds: [String: TimeInterval] = [:]
    var tokens: [String: ApplicationToken] = [:]
    var names: [String: String] = [:]
    let kept = lessEssentials ? Essentials.now() : Essentials()

    for await device in data {
      for await segment in device.activitySegments {
        for await category in segment.categories {
          if let whole = category.category.token, kept.categories.contains(whole) { continue }
          for await app in category.applications {
            if let one = app.application.token, kept.apps.contains(one) { continue }
            let key =
              app.application.bundleIdentifier ?? app.application.localizedDisplayName ?? "unknown"
            seconds[key, default: 0] += app.totalActivityDuration
            if let token = app.application.token { tokens[key] = token }
            if let name = app.application.localizedDisplayName { names[key] = name }
          }
        }
      }
    }

    // Under half a minute is a glance, not use.
    let all =
      seconds
      .filter { $0.value >= 30 }
      .map { AppUse(id: $0.key, token: tokens[$0.key], name: names[$0.key] ?? "An app", seconds: $0.value) }
      .sorted { $0.seconds > $1.seconds }
    let top = Array(all.prefix(5))
    return UsageSummary(apps: top, more: max(0, all.count - top.count), essentialsToo: lessEssentials && kept.empty)
  }
}

struct TopAppsView: View {
  let summary: UsageSummary

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if summary.essentialsToo {
        // Only when the essentials could not be read here, so every app is in the list.
        Text("Every app is listed, your essentials too. Essentials don't use the battery.")
          .font(.system(size: 14))
          .foregroundStyle(quiet)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.bottom, 6)
      }
      if summary.apps.isEmpty {
        Text("Nothing has used any time yet.")
          .font(.system(size: 16))
          .foregroundStyle(quiet)
          .padding(.vertical, 14)
      } else {
        ForEach(Array(summary.apps.enumerated()), id: \.element.id) { index, app in
          HStack(spacing: 12) {
            if let token = app.token {
              Label(token)
                .labelStyle(.titleAndIcon)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(ink)
                .lineLimit(1)
            } else {
              Text(app.name)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(ink)
                .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(durationWords(app.seconds))
              .font(.system(size: 17, weight: .semibold, design: .rounded))
              .foregroundStyle(quiet)
              .monospacedDigit()
          }
          .frame(height: 52)
          if index < summary.apps.count - 1 {
            Rectangle().fill(rule).frame(height: 1)
          }
        }
        if summary.more > 0 {
          Text(summary.more == 1 ? "and 1 more app" : "and \(summary.more) more apps")
            .font(.system(size: 14))
            .foregroundStyle(quiet)
            .padding(.top, 10)
        }
      }
      // Right under the rows: the box is sized for five, and its spare room
      // falls at the end of the page, not between the list and its note.
      Text("Drawn by the phone's Screen Time. This list never reaches Plainlimit. The battery hears of it every few minutes, so it can be a cell behind.")
        .font(.system(size: 13))
        .foregroundStyle(quiet)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 12)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .ignoresSafeArea()
    .background(ground)
  }
}

struct TotalReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context = .total
  let content: (TimeInterval) -> TotalView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async
    -> TimeInterval {
    // Added up app by app, the same way as the list. A segment's own total is
    // all screen-on time, including time in no app at all (build 48 showed it:
    // 3:10 against 1:50 of app use), and it ignores which apps are ticked.
    // Websites are left out: their time is already inside the browser's.
    var seconds: TimeInterval = 0
    for await device in data {
      for await segment in device.activitySegments {
        for await category in segment.categories {
          for await app in category.applications {
            seconds += app.totalActivityDuration
          }
        }
      }
    }
    return seconds
  }
}

/// The iPhone's whole day, for setup's last screen: every app's time added up,
/// as the phone's own Screen Time counts it. The app asks with no selection,
/// so no app is left out; Plainlimit's own count stands inside this figure's
/// box as the part of it that counts. Added up app by app, as in TotalReport.
struct WholeReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context = .whole
  let content: (TimeInterval) -> WholeView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async
    -> TimeInterval {
    var seconds: TimeInterval = 0
    for await device in data {
      for await segment in device.activitySegments {
        for await category in segment.categories {
          for await app in category.applications {
            seconds += app.totalActivityDuration
          }
        }
      }
    }
    return seconds
  }
}

/// The seven days before today, oldest first, drawn against a scale of `hours`.
struct WeekUse {
  let days: [TimeInterval]
  let letters: [String]
  let hours: Int
}

// The chart's layout. The app lays the goal line over the chart and copies
// these numbers to put it at the right height (src/ui/UsageReport.tsx, WEEK):
// the room over the bars for their times, the room under them for the day
// letters, the column for the hour scale, and the column on the right for the
// goal to try.
private let weekTop: CGFloat = 20
private let weekBottom: CGFloat = 22
private let weekAxis: CGFloat = 30
private let weekRight: CGFloat = 44

// Setup's one picture, top to bottom (src/ui/UsageReport.tsx, SETUP, keeps
// the same numbers): room for the app's labels, the two figures side by side,
// room for the app's "Last 7 days", then the chart.
private let setupFigureTop: CGFloat = 20
private let setupFigureHeight: CGFloat = 52
private let setupFigureGap: CGFloat = 12
private let setupChartTop: CGFloat = 112
private let setupChartHeight: CGFloat = 150

private let sevenDays: TimeInterval = 7 * 24 * 3600

/// What setup's picture shows: today so far, and the seven days before it.
struct SetupUse {
  let today: TimeInterval
  let week: WeekUse
}

struct SetupReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context
  /// The top of the chart's scale, in hours. The app picks the scale from the
  /// goal, so its line falls inside the chart; this report is never told the
  /// goal (the phone keeps it sealed off from anything but the window and the apps).
  let hours: Int
  let content: (SetupUse) -> SetupView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async
    -> SetupUse {
    // The window runs from seven days before today's recharge to the next
    // recharge: its first seven days are the bars, and what comes after is today.
    var window: DateInterval?
    var hourly: [(start: Date, seconds: TimeInterval)] = []
    for await device in data {
      if case .hourly(during: let interval) = device.segmentInterval { window = interval }
      for await segment in device.activitySegments {
        // Added up app by app: a segment's own total is all screen-on time and
        // ignores which apps are ticked (see TotalReport).
        var seconds: TimeInterval = 0
        for await category in segment.categories {
          for await app in category.applications {
            seconds += app.totalActivityDuration
          }
        }
        hourly.append((segment.dateInterval.start, seconds))
      }
    }
    let start = window?.start ?? hourly.map { $0.start }.min() ?? Date().addingTimeInterval(-sevenDays)
    var days = [TimeInterval](repeating: 0, count: 7)
    var today: TimeInterval = 0
    for hour in hourly {
      let day = Int((hour.start.timeIntervalSince(start) / 86400).rounded(.down))
      if day >= 0 && day < 7 {
        days[day] += hour.seconds
      } else if day >= 7 {
        today += hour.seconds
      }
    }
    let letter = DateFormatter()
    letter.dateFormat = "EEEEE"
    let letters = (0..<7).map { letter.string(from: start.addingTimeInterval(Double($0) * 86400 + 43200)) }
    return SetupUse(today: today, week: WeekUse(days: days, letters: letters, hours: hours))
  }
}

/// A goal to try: about 15% under the daily average shown above the chart,
/// to the stepper's 15 minutes and never under its least, 30 minutes
/// (src/domain/settings.ts, GOAL_STEP and GOAL_MIN). Nil when there is no use
/// to go by, or when it would not come out under the average. Drawn here
/// because only this report sees the use; the app never learns it, so it can
/// show the suggestion but not start the stepper on it (the owner, build 123).
func suggestedGoal(_ days: [TimeInterval]) -> TimeInterval? {
  let average = days.reduce(0, +) / 7
  let step: TimeInterval = 15 * 60
  let tried = max(2 * step, (average * 0.85 / step).rounded() * step)
  return tried < average ? tried : nil
}

/// Seven bars on an hour scale, each with its time over it and its day under it. Fills the frame it is given.
struct WeekBarsView: View {
  let use: WeekUse

  private var top: TimeInterval { TimeInterval(use.hours) * 3600 }
  private var step: Int { use.hours <= 4 ? 1 : (use.hours >= 12 ? 3 : 2) }

  /// How far down the chart a length of time stands; past the top of the scale it stays at the top.
  private func height(of seconds: TimeInterval, plot: CGFloat) -> CGFloat {
    weekTop + plot - plot * CGFloat(min(seconds, top) / top)
  }

  var body: some View {
    GeometryReader { geo in
      let plot = max(1, geo.size.height - weekTop - weekBottom)
      let end = geo.size.width - weekRight
      let slot = (end - weekAxis) / 7
      let width = min(24, slot * 0.6)
      ZStack(alignment: .topLeading) {
        ForEach(Array(stride(from: step, through: use.hours, by: step)), id: \.self) { hour in
          let at = height(of: TimeInterval(hour) * 3600, plot: plot)
          Path { line in
            line.move(to: CGPoint(x: weekAxis, y: at))
            line.addLine(to: CGPoint(x: end, y: at))
          }
          .stroke(rule, lineWidth: 1)
          Text("\(hour)h")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(quiet)
            .position(x: 12, y: at)
        }
        Path { line in
          line.move(to: CGPoint(x: weekAxis, y: weekTop + plot))
          line.addLine(to: CGPoint(x: end, y: weekTop + plot))
        }
        .stroke(quiet.opacity(0.5), lineWidth: 1)
        ForEach(0..<7, id: \.self) { day in
          let x = weekAxis + slot * (CGFloat(day) + 0.5)
          let barTop = height(of: use.days[day], plot: plot)
          RoundedRectangle(cornerRadius: 6)
            .fill(green)
            .frame(width: width, height: max(3, weekTop + plot - barTop))
            .position(x: x, y: (barTop + weekTop + plot) / 2)
          Text(clockWords(use.days[day]))
            .font(.system(size: 11, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(ink)
            .fixedSize()
            .position(x: x, y: barTop - 9)
          Text(use.letters[day])
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(quiet)
            .position(x: x, y: weekTop + plot + 13)
        }
        // The goal to try: a green line ending in a tag with its time, in
        // the column on the right. The app's own dashed goal line, with its
        // time at the left end, stops at that column, so as the stepper
        // reaches the goal to try the two lines meet and the dashes run into
        // the tag. Past the top of the scale the tag waits at the top.
        if let tried = suggestedGoal(use.days) {
          let at = height(of: tried, plot: plot)
          Path { line in
            line.move(to: CGPoint(x: weekAxis, y: at))
            line.addLine(to: CGPoint(x: end, y: at))
          }
          .stroke(green, lineWidth: 2)
          VStack(spacing: 0) {
            Text("Try")
            Text(tried > top ? "\(clockWords(tried))\u{2191}" : clockWords(tried))
          }
          .font(.system(size: 11, weight: .bold))
          .monospacedDigit()
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          .foregroundStyle(green)
          .frame(width: weekRight - 4, height: 32)
          .background(RoundedRectangle(cornerRadius: 9).fill(ground))
          .overlay(RoundedRectangle(cornerRadius: 9).stroke(green, lineWidth: 1.5))
          .position(x: end + weekRight / 2 + 1, y: min(max(16, at), geo.size.height - 16))
        }
      }
      .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
    }
  }
}

/// A length of time in the app's display face, as tall as the app's box for a figure, kept to the left.
struct FigureText: View {
  let seconds: TimeInterval

  var body: some View {
    HStack(spacing: 0) {
      Text(clockWords(seconds))
        .font(displayFace.map { Font.custom($0, size: 48) } ?? .system(size: 48, weight: .bold))
        .tracking(-1.6)
        .foregroundStyle(ink)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Spacer(minLength: 0)
    }
    .frame(height: 52, alignment: .leading)
  }
}

/// Setup's picture: today's figure and the daily average side by side, then
/// the chart, each where the app has left room for it. Everything keeps to the
/// top left of whatever size iOS gives this view (see TotalView and
/// FirstAppsView for what happens otherwise).
struct SetupView: View {
  let use: SetupUse

  private var average: TimeInterval { use.week.days.reduce(0, +) / 7 }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: setupFigureGap) {
        FigureText(seconds: use.today)
          .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        FigureText(seconds: average)
          .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
      }
      .frame(height: setupFigureHeight)
      .padding(.top, setupFigureTop)
      WeekBarsView(use: use.week)
        .frame(height: setupChartHeight)
        .padding(.top, setupChartTop - setupFigureTop - setupFigureHeight)
      Spacer(minLength: 0)
    }
    .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity, alignment: .topLeading)
    .background(ground)
    .ignoresSafeArea()
  }
}

/// An app and how many times it was the first one opened after a pickup.
struct PickupApp: Identifiable {
  let id: String
  let token: ApplicationToken?
  let name: String
  let pickups: Int
}

struct FirstAppsReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context = .firstApps
  let content: ([PickupApp]) -> FirstAppsView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async
    -> [PickupApp] {
    // numberOfPickups: the pickups made straight to this app, the figure
    // behind Screen Time's "First Used After Pickup". No apps are named in
    // the filter, so every app is counted, essentials too.
    var pickups: [String: Int] = [:]
    var tokens: [String: ApplicationToken] = [:]
    var names: [String: String] = [:]
    for await device in data {
      for await segment in device.activitySegments {
        for await category in segment.categories {
          for await app in category.applications where app.numberOfPickups > 0 {
            let key =
              app.application.bundleIdentifier ?? app.application.localizedDisplayName ?? "unknown"
            pickups[key, default: 0] += app.numberOfPickups
            if let token = app.application.token { tokens[key] = token }
            if let name = app.application.localizedDisplayName { names[key] = name }
          }
        }
      }
    }
    return Array(
      pickups
        .map { PickupApp(id: $0.key, token: tokens[$0.key], name: names[$0.key] ?? "An app", pickups: $0.value) }
        .sorted { $0.pickups > $1.pickups }
        .prefix(4))
  }
}

struct FirstAppsView: View {
  let apps: [PickupApp]

  private var most: Int { max(1, apps.first?.pickups ?? 1) }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if apps.isEmpty {
        Text("No pickups counted in the last 7 days yet.")
          .font(.system(size: 15))
          .foregroundStyle(quiet)
          .padding(.vertical, 12)
      } else {
        ForEach(Array(apps.enumerated()), id: \.element.id) { index, app in
          VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 10) {
              if let token = app.token {
                Label(token)
                  .labelStyle(.titleAndIcon)
                  .font(.system(size: 16, weight: .medium))
                  .foregroundStyle(ink)
                  .lineLimit(1)
              } else {
                Text(app.name)
                  .font(.system(size: 16, weight: .medium))
                  .foregroundStyle(ink)
                  .lineLimit(1)
              }
              Spacer(minLength: 8)
              Text("\(app.pickups)")
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundStyle(quiet)
                .monospacedDigit()
            }
            // As long as the count, against the first app's.
            Capsule()
              .fill(green)
              .frame(maxWidth: .infinity)
              .frame(height: 5)
              .scaleEffect(x: CGFloat(app.pickups) / CGFloat(most), y: 1, anchor: .leading)
          }
          .frame(height: 56)
          if index < apps.count - 1 {
            Rectangle().fill(rule).frame(height: 1)
          }
        }
      }
      Spacer(minLength: 0)
    }
    // The rows keep to the top of whatever height iOS gives this view. With no
    // least height, the frame was never shorter than its rows: when iOS first
    // laid the view out shorter than them, the whole list was centred on it and
    // drawn too high, over the words above its box, until the next layout (the
    // owner's phone, build 137: the first app's name under "You open these first").
    .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity, alignment: .topLeading)
    .background(cardGround)
    .ignoresSafeArea()
  }
}

struct TotalView: View {
  let seconds: TimeInterval

  // The figure keeps to the top 52 points, the height of the app's box for it,
  // whatever size iOS first gives this view. Centred in the whole view, it was
  // drawn half below the box when iOS laid the view out taller than the box
  // before the box had its size (the owner's phone, build 75: "2:06" with its
  // top half cut off, right a moment later).
  var body: some View {
    FigureText(seconds: seconds)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .background(ground)
      // This process lays the view out in its own window and can give it a top
      // inset, which drew the figure about 30 points low and cut it in half
      // (build 86, "2:45", now and then). No inset here, so it keeps to the top.
      .ignoresSafeArea()
  }
}

/// The iPhone's whole day as a small figure, kept to the top right of whatever
/// size iOS gives this view (see TotalView): the app's box for it is 32 points
/// high, at the right end of a row.
struct WholeView: View {
  let seconds: TimeInterval

  var body: some View {
    HStack(spacing: 0) {
      Spacer(minLength: 0)
      Text(clockWords(seconds))
        .font(displayFace.map { Font.custom($0, size: 28) } ?? .system(size: 28, weight: .bold))
        .tracking(-0.6)
        .foregroundStyle(ink2)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
    .frame(height: 32, alignment: .trailing)
    .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity, alignment: .topTrailing)
    .background(ground)
    .ignoresSafeArea()
  }
}

@main
struct PlainlimitReport: DeviceActivityReportExtension {
  var body: some DeviceActivityReportScene {
    TopAppsReport(context: .topApps, lessEssentials: false) { summary in
      TopAppsView(summary: summary)
    }
    TopAppsReport(context: .batteryApps, lessEssentials: true) { summary in
      TopAppsView(summary: summary)
    }
    TotalReport { seconds in
      TotalView(seconds: seconds)
    }
    SetupReport(context: .setup4, hours: 4) { use in
      SetupView(use: use)
    }
    SetupReport(context: .setup6, hours: 6) { use in
      SetupView(use: use)
    }
    SetupReport(context: .setup8, hours: 8) { use in
      SetupView(use: use)
    }
    SetupReport(context: .setup12, hours: 12) { use in
      SetupView(use: use)
    }
    FirstAppsReport { apps in
      FirstAppsView(apps: apps)
    }
    WholeReport { seconds in
      WholeView(seconds: seconds)
    }
  }
}

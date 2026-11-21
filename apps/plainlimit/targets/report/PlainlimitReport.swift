import CoreText
import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI

// Two pictures for Today, both as Apple's Screen Time counts:
//   TopApps  the "what used it" list: the apps that used the most time since the
//            battery last recharged.
//   Average  for setup: the counted apps' use over the seven days before
//            today, a day on average, to help pick a goal.
//   Total    the day's figure: every minute the counted apps have been used
//            since the recharge, to the minute, added up app by app. The app
//            itself only learns use in steps, so this is the exact number the
//            person sees.
//   Week4, Week6, Week8, Week12
//            for setup: the seven days before today as seven bars on an hour
//            scale of 4, 6, 8 or 12 hours, each with its time. The app picks
//            the scale and draws the goal's line over the chart itself.
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
}

extension DeviceActivityReport.Context {
  static let topApps = Self("TopApps")
  static let total = Self("Total")
  static let average = Self("Average")
  static let week4 = Self("Week4")
  static let week6 = Self("Week6")
  static let week8 = Self("Week8")
  static let week12 = Self("Week12")
}

private let ink = Color(red: 244 / 255, green: 245 / 255, blue: 242 / 255)
private let quiet = Color(red: 169 / 255, green: 174 / 255, blue: 179 / 255)
private let rule = Color(red: 37 / 255, green: 40 / 255, blue: 44 / 255)
private let ground = Color(red: 14 / 255, green: 16 / 255, blue: 17 / 255)
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
  let context: DeviceActivityReport.Context = .topApps
  let content: (UsageSummary) -> TopAppsView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async
    -> UsageSummary {
    var seconds: [String: TimeInterval] = [:]
    var tokens: [String: ApplicationToken] = [:]
    var names: [String: String] = [:]

    for await device in data {
      for await segment in device.activitySegments {
        for await category in segment.categories {
          for await app in category.applications {
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
    return UsageSummary(apps: top, more: max(0, all.count - top.count))
  }
}

struct TopAppsView: View {
  let summary: UsageSummary

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
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
      Text("Drawn by the phone's Screen Time, which Plainlimit never sees. The battery hears of it every few minutes, so it can be a cell behind.")
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

struct AverageReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context = .average
  let content: (TimeInterval) -> TotalView

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
    // The app asks for the seven days before today.
    return seconds / 7
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
// letters, and the column for the hour scale.
private let weekTop: CGFloat = 20
private let weekBottom: CGFloat = 22
private let weekAxis: CGFloat = 30

private let sevenDays: TimeInterval = 7 * 24 * 3600

struct WeekReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context
  /// The top of the scale, in hours. The app picks the scale from the goal, so
  /// its line falls inside the chart; this report is never told the goal (the
  /// phone keeps it sealed off from anything but the window and the apps).
  let hours: Int
  let content: (WeekUse) -> WeekBarsView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async
    -> WeekUse {
    // The days are counted back from the window's end, the battery's recharge.
    var window: DateInterval?
    var hourly: [(start: Date, seconds: TimeInterval)] = []
    for await device in data {
      if case .hourly(during: let interval) = device.segmentInterval { window = interval }
      for await segment in device.activitySegments {
        var seconds: TimeInterval = 0
        for await category in segment.categories {
          for await app in category.applications {
            seconds += app.totalActivityDuration
          }
        }
        hourly.append((segment.dateInterval.start, seconds))
      }
    }
    let end = window?.end ?? hourly.map { $0.start.addingTimeInterval(3600) }.max() ?? Date()
    let start = end.addingTimeInterval(-sevenDays)
    var days = [TimeInterval](repeating: 0, count: 7)
    for hour in hourly {
      let day = Int((hour.start.timeIntervalSince(start) / 86400).rounded(.down))
      if day >= 0 && day < 7 { days[day] += hour.seconds }
    }
    let letter = DateFormatter()
    letter.dateFormat = "EEEEE"
    let letters = (0..<7).map { letter.string(from: start.addingTimeInterval(Double($0) * 86400 + 43200)) }
    return WeekUse(days: days, letters: letters, hours: hours)
  }
}

/// Seven bars on an hour scale, each with its time over it and its day under it.
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
      let slot = (geo.size.width - weekAxis) / 7
      let width = min(24, slot * 0.6)
      ZStack(alignment: .topLeading) {
        ForEach(Array(stride(from: step, through: use.hours, by: step)), id: \.self) { hour in
          let at = height(of: TimeInterval(hour) * 3600, plot: plot)
          Path { line in
            line.move(to: CGPoint(x: weekAxis, y: at))
            line.addLine(to: CGPoint(x: geo.size.width, y: at))
          }
          .stroke(rule, lineWidth: 1)
          Text("\(hour)h")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(quiet)
            .position(x: 12, y: at)
        }
        Path { line in
          line.move(to: CGPoint(x: weekAxis, y: weekTop + plot))
          line.addLine(to: CGPoint(x: geo.size.width, y: weekTop + plot))
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
      }
      .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(ground)
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
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(ground)
    // This process lays the view out in its own window and can give it a top
    // inset, which drew the figure about 30 points low and cut it in half
    // (build 86, "2:45", now and then). No inset here, so it keeps to the top.
    .ignoresSafeArea()
  }
}

@main
struct PlainlimitReport: DeviceActivityReportExtension {
  var body: some DeviceActivityReportScene {
    TopAppsReport { summary in
      TopAppsView(summary: summary)
    }
    TotalReport { seconds in
      TotalView(seconds: seconds)
    }
    AverageReport { seconds in
      TotalView(seconds: seconds)
    }
    WeekReport(context: .week4, hours: 4) { use in
      WeekBarsView(use: use)
    }
    WeekReport(context: .week6, hours: 6) { use in
      WeekBarsView(use: use)
    }
    WeekReport(context: .week8, hours: 8) { use in
      WeekBarsView(use: use)
    }
    WeekReport(context: .week12, hours: 12) { use in
      WeekBarsView(use: use)
    }
  }
}

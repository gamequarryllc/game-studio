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
//   Week     for setup: the seven days before today as seven bars, against a
//            line at the goal, so you see which days would have locked.
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
}

extension DeviceActivityReport.Context {
  static let topApps = Self("TopApps")
  static let total = Self("Total")
  static let average = Self("Average")
  static let week = Self("Week")
  static let firstApps = Self("FirstApps")
}

private let ink = Color(red: 244 / 255, green: 245 / 255, blue: 242 / 255)
private let quiet = Color(red: 169 / 255, green: 174 / 255, blue: 179 / 255)
private let rule = Color(red: 37 / 255, green: 40 / 255, blue: 44 / 255)
private let ground = Color(red: 14 / 255, green: 16 / 255, blue: 17 / 255)
/// The app's card colour (src/ui/theme.ts, c.card), for a report drawn inside a card.
private let cardGround = Color(red: 23 / 255, green: 25 / 255, blue: 28 / 255)
private let green = Color(red: 74 / 255, green: 198 / 255, blue: 111 / 255)
private let coral = Color(red: 255 / 255, green: 123 / 255, blue: 107 / 255)

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

/// The seven days before today, oldest first, and the goal if the app passed it.
struct WeekUse {
  let days: [TimeInterval]
  let letters: [String]
  let goal: TimeInterval?
}

private let sevenDays: TimeInterval = 7 * 24 * 3600

struct WeekReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context = .week
  let content: (WeekUse) -> WeekBarsView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async
    -> WeekUse {
    // The app can hand this sealed box nothing but the window it asks about,
    // so the goal rides on the window's length: it starts one second earlier
    // for each minute of the goal (src/platform/screenTime.ts, weekWindow).
    // The days are counted back from the window's end, the battery's
    // recharge, so the extra seconds fall outside them.
    var window: DateInterval?
    var hours: [(start: Date, seconds: TimeInterval)] = []
    for await device in data {
      if case .hourly(during: let interval) = device.segmentInterval { window = interval }
      for await segment in device.activitySegments {
        var seconds: TimeInterval = 0
        for await category in segment.categories {
          for await app in category.applications {
            seconds += app.totalActivityDuration
          }
        }
        hours.append((segment.dateInterval.start, seconds))
      }
    }
    let end = window?.end ?? hours.map { $0.start.addingTimeInterval(3600) }.max() ?? Date()
    let start = end.addingTimeInterval(-sevenDays)
    var days = [TimeInterval](repeating: 0, count: 7)
    for hour in hours {
      let day = Int((hour.start.timeIntervalSince(start) / 86400).rounded(.down))
      if day >= 0 && day < 7 { days[day] += hour.seconds }
    }
    var goal: TimeInterval?
    if let window {
      let minutes = (window.duration - sevenDays).rounded()
      if minutes >= 30 && minutes <= 720 { goal = minutes * 60 }
    }
    let letter = DateFormatter()
    letter.dateFormat = "EEEEE"
    let letters = (0..<7).map { letter.string(from: start.addingTimeInterval(Double($0) * 86400 + 43200)) }
    return WeekUse(days: days, letters: letters, goal: goal)
  }
}

struct WeekBarsView: View {
  let use: WeekUse

  private var top: TimeInterval { max(3600, max(use.days.max() ?? 0, use.goal ?? 0) * 1.15) }
  private var over: Int { use.goal.map { goal in use.days.filter { $0 > goal }.count } ?? 0 }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 8) {
        Text("LAST 7 DAYS")
          .font(.system(size: 13, weight: .bold))
          .tracking(1)
          .foregroundStyle(quiet)
        Spacer(minLength: 8)
        if use.goal != nil {
          if over > 0 {
            Label(over == 1 ? "1 day would lock" : "\(over) days would lock", systemImage: "lock.fill")
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(coral)
          } else {
            Text("No day would lock")
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(green)
          }
        }
      }
      GeometryReader { geo in
        // The bars stand on a line 22 points above the bottom; the day letters go under it.
        let tall = max(1, geo.size.height - 22)
        ZStack(alignment: .topLeading) {
          HStack(alignment: .bottom, spacing: 8) {
            ForEach(0..<7, id: \.self) { day in
              VStack(spacing: 6) {
                Spacer(minLength: 0)
                RoundedRectangle(cornerRadius: 6)
                  .fill(use.goal.map { use.days[day] > $0 ? coral : green } ?? green)
                  .frame(width: 26, height: max(4, tall * CGFloat(use.days[day] / top)))
                Text(use.letters[day])
                  .font(.system(size: 13, weight: .semibold))
                  .foregroundStyle(quiet)
                  .frame(height: 16)
              }
              .frame(maxWidth: .infinity)
            }
          }
          if let goal = use.goal {
            let y = tall - tall * CGFloat(goal / top)
            Path { line in
              line.move(to: CGPoint(x: 0, y: y))
              line.addLine(to: CGPoint(x: geo.size.width, y: y))
            }
            .stroke(ink, style: StrokeStyle(lineWidth: 2, dash: [6, 5]))
            Text(clockWords(goal))
              .font(displayFace.map { Font.custom($0, size: 14) } ?? .system(size: 14, weight: .bold))
              .foregroundStyle(ground)
              .padding(.horizontal, 7)
              .padding(.vertical, 2)
              .background(Capsule().fill(ink))
              .position(x: geo.size.width - 24, y: y)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
    WeekReport { use in
      WeekBarsView(use: use)
    }
    FirstAppsReport { apps in
      FirstAppsView(apps: apps)
    }
  }
}
